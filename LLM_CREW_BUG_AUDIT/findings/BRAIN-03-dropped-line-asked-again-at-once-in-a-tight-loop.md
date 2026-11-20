---
id: BRAIN-03
title: A line dropped before the model is asked is asked for again at once, in a loop that uses up the body's tool calls
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 1608bc590d4, 9bacb4260c4
found_by: Fable 5.2
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1277, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:796, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:228, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:686
fix: Make letInStep's sayIf test only the door it waits at, and when think drops a line for its sayIf hold the driver off a few seconds and clear the mustSay fields
---

## What is wrong

A step that is something to say can carry `sayIf`: a test of whether the line still needs saying. `think` checks it before it calls the model, and if it is false and there is nothing else to report, it drops the line and goes back to idle without a call.

Nothing records that this happened. On the very next state update `drive` finds the same step is still the next one and asks for the line again. `think` drops it again. Each pass also sends the server a `hold` tool call (`stopToTalk`, from `ingest`), and the server answers every tool call with a fresh state update (`ui_act` returns TRUE), which is the next pass. So it goes round as fast as the window and the server can talk: about 15 milliseconds a turn.

The only thing that would space the passes out is the driver's backoff (`fail(brain, step.key)` is called for a say step). But `inBackoff` returns FALSE for every key while `brain.doorHeld` is true, and the one `sayIf` a janitor has is `() => !brain.doorHeld`. So for that step the loop always runs with no backoff.

What stops it is the server's own limit of 8 tool calls in 10 seconds. The ninth `hold` is refused with "You are trying to do too many things at once. Slow down.", that event lands in `brain.pending`, and with something pending `think` makes a real call. By then the body's tool calls for the rest of that 10 seconds are all being thrown away by the server, the ones that matter among them (see BRAIN-04: the next line it "said" was never spoken).

It also writes one ROUTINE record to the brain log each turn, against the owner's limit of 40 log records in 10 seconds for the whole crew.

There is a slower second loop behind the fast one. Once something is pending (the "Slow down" event, or any other), `think` does call the model, finds the line `dropped` after the reply (`brain.ts:1364`), says nothing, and goes idle; the next `drive` asks for the line again, with no backoff while `doorHeld` holds. So while the door hold lasts it makes one wasted model call after another (round-21.49.53: an LLM call at 04:15:15.844, the same say step again at 04:15:17.200, another LLM call at 04:15:21.047). The loop needs someone in view (`stopToTalk` sends no `hold` with nobody there) and ends when `door_held` runs out, so it is a burst of up to about 15 seconds, not for good. That is why this is medium and not high.

One concrete case, from a round:

1. A janitor shut in the Cargo Bay is let out: two technicians open the door and hold it. `door_held` is true for 15 seconds (`CREW_NPC_DOOR_HELD`), and stays true after it has walked out into the Cargo Lobby: walking into a new room clears `let_out_until` (`crew_npc_senses.dm:244`) but not `door_held_until`. So in the lobby `doorHeld` is true, `doorHeldOut` false, and `doorHeldFor` null (`brain.ts:686`, a door held to let it out is no way in).
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

Do 3 and 1; they are the fix (about ten lines in two files). 2, 4 and 5 are further guards and can wait.

1. `brain.ts`, the early return in `think`: before `return`, hold the driver off so the step is not taken again on the next update. `brain.driveAfter = Math.max(brain.driveAfter, Date.now() + 2500);` does it, because `drive` tests `now < brain.driveAfter` (`driver.ts:754`) before it gets to a say step. Also clear `mustSayNeeds`, `mustSayIf` and `mustSayExact` there, as the main path does. Do the same where the main path finds the line `dropped` (`brain.ts:1364`) and nobody spoke, or the slow loop of wasted model calls goes on. Note that `driveAfter` does not cover the `owed` emergency say at `driver.ts:682-698`, which is taken before that test; none of the three `sayIf` plans is an emergency today, but 2 covers it if one becomes one.
2. `driver.ts`: a line whose `sayIf` is false now is not work that is ready. In `nextStep`, where `ready.push({ task, plan, key })` is, skip a plan that has `say` and a `sayIf` that returns false, the way one in backoff is skipped (`continue`), so the body goes on to its next piece of work and does not stop to find words nobody needs. Do the same test in `drive` before `speak(owed.plan.say, ...)`. Do not simply return null from `drive`: with a plan that keeps offering the line, that would leave the body standing for as long as `sayIf` stays false. The three plans that carry a `sayIf` today are `letInStep` in `jobs/janitor.ts`, the challenge in `jobs/guarding.ts:598` and the asking at the counter in `jobs/pickups.ts:219`. Read each to see that something else becomes ready once the line is not needed.
3. `jobs/janitor.ts`, `letInStep`: `sayIf: () => !brain.doorHeld` is true of any held door, the one that let it out of the room behind it included. It should be the test the top of the same function uses: `() => !(brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door)`. When that is false at plan time the top branch of `letInStep` (line 633) already returns the walk through, so the say step is only offered when the line is wanted; the test then matters only for the seconds the model takes. In the round's case (`doorHeldFor` null) it is true and the janitor asks at once, which is right: nobody is holding the bay door for it.
4. As a backstop, make `stopToTalk` cheap: keep `brain.lastHoldAt` and send no second `hold` within about 3 seconds of the last (the server's hold lasts 4, `CREW_NPC_TALK_HOLD`). A `hold` should never be what uses up a body's eight calls.
5. Server, optional and for whoever does BRAIN-04: do not count `CREW_TOOL_HOLD` in `tool_call_allowed`. It moves nothing and is only ever sent by code. Do this only after 1 and 3: today the refusal of the ninth call is the one thing that ends the fast loop, and without it the loop would run for the whole door hold, hundreds of passes and a flood of ROUTINE records.

Keep: a line whose `sayIf` turns false while the model is thinking is still dropped (the `dropped` test later in `think`). Each such drop costs one model call; with 1 applied there too it cannot come straight round again.

## How to test the fix

- The simulator does not answer a tool call with a fresh update the way the server does (`code/modules/tgui/tgui.dm:400`): it calls `ingest` once a simulated second (`sim.ts:1371`). So the fast loop cannot show there, only the slow one. Its door hold does match the server's (`sim.ts:512` clears `letOutUntil` on a move, not `doorHeldUntil`).
- A small script is the surest test: import `brain.ts` with `fetch` stubbed, give `setAct` a handler that calls `ingest` again (on a timer of 0) after every `tool_call`, as the server does, and feed one janitor in the Cargo Lobby with `door_held` true, `door_held_out` false, a technician in view, a Cargo Bay mess task with `via`, and its knock and message already done. Count `hold` calls in one real second: today it is more than 8; after the fix at most 1, and the say goes out.
- Simulator: `tools/llm_crew/sim.ts quiet office` and `quiet nested` have a janitor let in and out of a locked room. Add a count of `hold` tool calls per body per 10 simulated seconds to the sim's `setAct` handler and fail the run if any body passes 8, and a count of LLM calls whose say was dropped.
- Type check from `tgui/`.
- Next round: `grep -c "too many things" crew_brain.log` should be 0, and no two ROUTINE records for one NPC should share a second with the same text.

## Check

Confirmed, by Opus 5.5, from the code and the round log. Nothing was run.

- The quotes are what the code says today: `think`'s early return (`brain.ts:1277-1287`), the queue and `stopToTalk` in `ingest` (`brain.ts:778-783`, `796`), the say step in `drive` (`driver.ts:805-811`, with no `driveAfter` set on that path, unlike `driver.ts:832`), `inBackoff` (`driver.ts:235`), `letInStep`'s `sayIf` (`jobs/janitor.ts:686`), `on_act_message` (`tgui.dm:400`) and `tool_call_allowed` (`crew_npc_tools.dm:116-126`).
- Each pass is fed by the server: `ui_act` returns TRUE for `tool_call` (`crew_brain_link.dm:218-220`), so `update_uis` sends fresh data and `index.tsx:95-98` runs `ingest` again. `tool_hold` (`crew_npc_doors.dm:36`) emits no event, so `pending` stays empty and `think` takes the early return each time. Only the ninth call's refusal (`action_result`, line 125) puts something in `pending`.
- Why `doorHeld` was still true in the lobby: `door_opened_for` sets `door_held_until` and, for a let-out, `let_out_until` (`crew_npc_doors.dm:810-816`); arriving in a new room clears only `let_out_until` (`crew_npc_senses.dm:244`). `brain.ts:686` sets `doorHeldFor` to null for a let-out. So `letInStep`'s top test fails and its `sayIf` is false: exactly the step in the log.
- Round log `data/logs/2026/11/18/round-21.49.53/crew_brain.log` lines 731-738: eight npc4 ROUTINE records between 04:15:14.324 and 04:15:14.420, all the same say step; line 739, 04:15:15.844, is an LLM call whose report is `[22:15:14] You are trying to do too many things at once. Slow down.` `game.log` line 704 has Arielle letting Manuel out at 04:15:02.500. After it, line 742 (04:15:17.200) is the same say step again and 744 (04:15:21.047) another LLM call: the slower loop, now in the write-up.
- Not in `LLM_CREW_CHANGELOG.md` or the plans (searched `sayIf`, `mustSayIf`, "too many things", "Slow down", `stopToTalk`, `doorHeld`, "no longer needs").
- Severity lowered to medium: the loop needs a person in view and a door hold on the body, and ends when the hold does (15 seconds, plus any extensions) or at the ninth call. It costs a few seconds of dropped tool calls and some wasted model calls; the work goes on afterwards.
- The fix was reordered: 3 (one line) removes this cause, 1 stops any other `sayIf` from looping; 1 now also covers the `dropped` path, which the first version said could not loop and does, slowly. Fix 5 got a warning: without the call limit nothing ends the fast loop. The sim test was mended: the sim ingests once a second, not after each tool call, so it cannot show the fast loop.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 1608bc590d4.

- BRAIN-03: part done. - **BRAIN-03 (part): a line its work no longer needs is not asked for again at once.** `think` holds the driver off 2.5 s when it drops such a line (`holdDriverAfterDrop`, `DROPPED_LINE_PAUSE_MS` in `brain.ts`), before the call and after it, and clears the line's state. Left: jobs/janitor.ts, letInStep: change `sayIf: () => !brain.doorHeld` to `sayIf: () => !(brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door)`, the same test as the top of the function (finding step 3). Optional steps 2, 4 and 5 are in driver.ts and on the server.

Round two (branch crew-bug-fixes-medium): 9bacb4260c4. This finishes the parts left above, apart from any step that waits on the owner.
