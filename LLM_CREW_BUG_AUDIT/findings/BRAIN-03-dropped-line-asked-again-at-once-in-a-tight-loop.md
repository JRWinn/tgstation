---
id: BRAIN-03
title: A line dropped before the model is asked is asked for again at once, in a loop that uses up the body's tool calls
kind: bug
severity: high
effort: small
confidence: sure
status: found
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1277, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:796, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:228, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:686
fix: When think drops a line because its sayIf is false, hold the driver off for a few seconds, and do not ask for a line whose sayIf is already false
---

## What is wrong

A step that is something to say can carry `sayIf`: a test of whether the line still needs saying. `think` checks it before it calls the model, and if it is false and there is nothing else to report, it drops the line and goes back to idle without a call.

Nothing records that this happened. On the very next state update `drive` finds the same step is still the next one and asks for the line again. `think` drops it again. Each pass also sends the server a `hold` tool call (`stopToTalk`, from `ingest`), and the server answers every tool call with a fresh state update (`ui_act` returns TRUE), which is the next pass. So it goes round as fast as the window and the server can talk: about 15 milliseconds a turn.

The only thing that would space the passes out is the driver's backoff (`fail(brain, step.key)` is called for a say step). But `inBackoff` returns FALSE for every key while `brain.doorHeld` is true, and the one `sayIf` a janitor has is `() => !brain.doorHeld`. So for that step the loop always runs with no backoff.

What stops it is the server's own limit of 8 tool calls in 10 seconds. The ninth `hold` is refused with "You are trying to do too many things at once. Slow down.", that event lands in `brain.pending`, and with something pending `think` makes a real call. By then the body's tool calls for the rest of that 10 seconds are all being thrown away by the server, the ones that matter among them (see BRAIN-04: the next line it "said" was never spoken).

It also writes one ROUTINE record to the brain log each turn, against the owner's limit of 40 log records in 10 seconds for the whole crew.

One concrete case, from a round:

1. A janitor shut in the Cargo Bay is let out: two technicians open the door and hold it. `door_held` is true for 15 seconds (`CREW_NPC_DOOR_HELD`), and stays true after it has walked out into the Cargo Lobby.
2. It still has a mess to clean in the bay, so it goes to the bay's door (`go_to_door`) and its next step is `letInStep`'s say: "Arielle, I am at the door about the mess in the Cargo Bay. Could you let me in, please?" with `sayIf: () => !brain.doorHeld`.
3. `brain.doorHeld` is still true from being let out, so `sayIf` is false. `drive` asks for the line, `think` drops it, `drive` asks again: eight times in 96 milliseconds.
4. The server refuses the ninth tool call. For the next 10 seconds every tool call from that janitor is dropped.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1277`, in `think`:

    if (brain.mustSay !== null && brain.mustSayIf && !brain.mustSayIf()) {
      brain.mustSay = null;
      if (brain.pending.length === 0 && brain.pendingSpeakers.size === 0) {
        brain.wake = false;
        brain.status = 'idle';
        running = false;
        notify();
        pump();
        return;
      }
    }

`brain.ts:778` and `brain.ts:796`, in `ingest` and `stopToTalk`: every time a brain is queued a tool call goes out.

    if (brain.wake && brain.awake && brain.status === 'idle') {
      brain.status = 'queued';
      queue.push(brain.id);
      stopToTalk(brain);
      changed = true;
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805`, in `drive`: the line is asked for without looking at `sayIf`.

    if (step.say) {
      // Asked once; if nothing comes of it, it is left a while before being asked again.
      fail(brain, step.key);
      speak(step.say, step.needs, step.sayIf, step.exact);

`driver.ts:228`, in `inBackoff`: why that `fail` does nothing here.

    if (brain.doorHeld) {
      return false;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:686`, in `letInStep`:

    sayIf: () => !brain.doorHeld,

`code/modules/tgui/tgui.dm:400`, why each tool call brings the next update:

    if(src_object.ui_act(act_type, payload, src, state))
        SStgui.update_uis(src_object)

`code/modules/llm_crew/crew_npc_tools.dm:116`, `tool_call_allowed`, the limit it runs into (`CREW_NPC_TOOL_CALL_LIMIT` 8 in `CREW_NPC_TOOL_WINDOW` 10 seconds).

## How it was found

Seen in a round log: `data/logs/2026/11/18/round-21.49.53/crew_brain.log`, npc4 (Manuel Sheets, Janitor), lines 731 to 739. Eight records with the same step between 04:15:14.324 and 04:15:14.420:

    04:15:14.324 ROUTINE (no LLM) in Cargo Lobby, holding damp rag: Arielle Durstine called you to clean up a mess in the Cargo Bay, which is locked to you. You are st... => say("Arielle, I am at the door about the mess in the Cargo Bay. Could you let me in, please?")
    04:15:14.340 (the same)
    04:15:14.355 (the same)
    04:15:14.370 (the same)
    04:15:14.385 (the same)
    04:15:14.406 (the same)
    04:15:14.419 (the same)
    04:15:14.420 (the same)

and the next record, 04:15:15.844, is an LLM call whose whole report is:

    [22:15:14] You are trying to do too many things at once. Slow down.

`game.log` of the same round has the door being held from 04:15:02.500 ("opened Cargo Bay to let ... (Manuel Sheets) out of Cargo Bay"), which with 15 seconds of hold covers 04:15:14. The same event text turns up once each in `round-17.48.05` and `round-20.48.14`. Those two were not traced.

The mechanism was then read from the code. It was not run in a script: setting up a janitor at a locked door by hand is long, and the log shows it.

Not in `LLM_CREW_CHANGELOG.md` or the plans (searched "too many things", `sayIf`, `mustSayIf`, "Slow down").

## How to fix it

Three small changes. The first stops the loop whatever causes it, the second removes the cause, the third is the janitor's own fault.

1. `brain.ts`, the early return in `think`: before `return`, hold the driver off so the step is not taken again on the next update. `brain.driveAfter = Math.max(brain.driveAfter, Date.now() + 2500);` does it, because `drive` tests `now < brain.driveAfter` before it gets to a say step. Also clear `mustSayNeeds`, `mustSayIf` and `mustSayExact` there, as the main path does.
2. `driver.ts`: a line whose `sayIf` is false now is not work that is ready. In `nextStep`, where `ready.push({ task, plan, key })` is, skip a plan that has `say` and a `sayIf` that returns false, the way one in backoff is skipped (`continue`), so the body goes on to its next piece of work and does not stop to find words nobody needs. Do the same test in `drive` before `speak(owed.plan.say, ...)`. Do not simply return null from `drive`: with a plan that keeps offering the line, that would leave the body standing for as long as `sayIf` stays false. The three plans that carry a `sayIf` today are `letInStep` in `jobs/janitor.ts`, the challenge in `jobs/guarding.ts:598` and the asking at the counter in `jobs/pickups.ts:219`. Read each to see that something else becomes ready once the line is not needed.
3. `jobs/janitor.ts`, `letInStep`: `sayIf: () => !brain.doorHeld` is true of any held door, the one that let it out of the room behind it included. It should be the test the top of the same function uses: `() => !(brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door)`. Better still, do not offer the say step at all while that is false, and return `{ ready: false, wait: true, ... }` so the body stands at the door.
4. As a backstop, make `stopToTalk` cheap: keep `brain.lastHoldAt` and send no second `hold` within about 3 seconds of the last (the server's hold lasts 4, `CREW_NPC_TALK_HOLD`). A `hold` should never be what uses up a body's eight calls.
5. Server, optional and for whoever does BRAIN-04: do not count `CREW_TOOL_HOLD` in `tool_call_allowed`. It moves nothing and is only ever sent by code.

Keep: a line whose `sayIf` turns false while the model is thinking is still dropped (the `dropped` test later in `think`). That path makes one call and cannot loop.

## How to test the fix

- Simulator: `tools/llm_crew/sim.ts quiet office` and `quiet nested` are the scenarios with a janitor let in and out of a locked room. Add a count of `hold` tool calls per body per 10 simulated seconds to the sim's `setAct` handler and fail the run if any body passes 8. Today's code should fail that in `nested` if the door hold outlasts the walk out; if it does not, shorten the walk.
- Type check from `tgui/`.
- Next round: `grep -c "too many things" crew_brain.log` should be 0, and no two ROUTINE records for one NPC should share a second with the same text.
