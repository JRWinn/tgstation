---
id: JOBS-06
title: One step aside that finds nowhere to go puts every later ask to step aside off for 20 seconds to 2 minutes, and a busy body asked meanwhile has its own work sent again
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 945864664d3
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:21, tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:61, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:279, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1012
fix: Key the aside step by the asking (ASIDE_STEP_KEY plus asked.at) so each new ask gets a try, and only let dropToMove break into busy work when that aside step is not in back-off
---

## What is wrong

Every step aside, for whoever asks and wherever the body stands, has the same key: `ASIDE_STEP_KEY = 'stepping-aside'` (`asideStep` returns it as `key`). When a step aside fails, `noteResult` puts that key in back-off (`fail(brain, last.key)`): 20 seconds the first time, 40 the second, up to two minutes, and only a success clears it.

A step aside fails in exactly the places people need to get past: `tool_step_aside` answers "There is nowhere here to step aside to." when no free tile in reach is in the same room and clear of doors (a doorway, a one-tile corridor, a maintenance tunnel), or the walk to the spot fails.

Two things follow.

1. **The next ask is not heard.** A new ask sets a fresh `asideAsked` (`done: false`), but `nextStep` checks `inBackoff(brain, aside.key)` with the same key and skips it. So for the next 20 seconds or more the body does not move for anyone, even after it has walked on into an open room where stepping aside would work. The ask runs out after `ASIDE_STANDS_MS` (20 seconds), which is no longer than the first back-off, so the ask is often dropped unanswered.
2. **A busy body has its own step sent again.** `drive` lets the driver break into busy work whenever an ask is waiting: `dropToMove = busy && !!brain.asideAsked && !brain.asideAsked.done`. It does not look at whether the aside step can be given. With it in back-off, `nextStep` returns the body's ordinary next step instead, and the driver issues it on top of the walk or haul already under way. Each drive tick until `asideAsked` runs out repeats this, because `done` is only set when the aside step itself is issued (`noteDone`). (Checker: a step that leaves the spot is first held while the body is being talked to, up to `TALK_HOLD_MAX_MS`, 15 seconds; after that it is sent again every `SETTLE_MS`, 2.5 seconds, until the ask lapses.) What that does depends on the step. The same `go_to` the body is already walking sets the walk target to the turf it already holds, and `set_blackboard_key` does nothing with an unchanged value (`code/datums/ai/_ai_controller.dm:783`): the walk goes on, and only its clock is restarted. A different walk (the body was on an idle `explore` and now has work, or its next task is in another room) is the CORE-01 case: the body goes on to the old spot and the new walk is failed, which puts that step into back-off and may write the room into `blocked_places`. A step on the spot (`clean` while `doing` is cleaning) is sent again over itself.

One concrete case: a janitor mopping a one-tile maintenance corridor. A technician hauling a crate behind it says "Jan, step aside, please." `step_aside` fails: nowhere in reach. The key goes into back-off for 20 seconds. The janitor finishes and walks on into the Cargo Bay. Ten seconds later a second technician, pulling a crate across the bay, finds the janitor in its way and asks "Jan, could you move?". `asideAsked` is set; the aside step is in back-off; the janitor, walking to its next mess, is "busy", so `dropToMove` lets the driver in, and the driver sends the janitor's own `go_to` again. (Checker: if that is the same walk it was already on, the server leaves the walk as it is, so the harm here is only that the janitor does not step aside; it is the CORE-01 failure only when the step sent is a walk somewhere else.) The janitor does not step aside; the technician's haul is blocked until the janitor walks off or the ask lapses.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:21` and `:61`:

    export const ASIDE_STEP_KEY = 'stepping-aside';
    ...
    return {
      key: ASIDE_STEP_KEY,
      text: `${asked.by} has asked you to step aside: ...`,
      act: { tool: 'step_aside', person: asked.handle },
    };

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:279`, in `nextStep`:

    const aside = asideStep(brain);
    if (aside && !inBackoff(brain, aside.key)) {
      return aside;
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733`, in `drive`:

    const dropToMove = busy && !!brain.asideAsked && !brain.asideAsked.done;
    if (
      !brain.awake ||
      (busy && !dropFor && !dropToLeave && !dropToMove) ||

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1012`, in `noteResult`, a failed step:

    } else {
      fail(brain, last.key);

`code/modules/llm_crew/crew_npc_doors.dm:890`, in `tool_step_aside`:

    if(isnull(best))
        action_result(CREW_TOOL_STEP_ASIDE, FALSE, "There is nowhere here to step aside to.")

## How it was found

Read from the code: `aside.ts`, `nextStep`, `drive`, `noteDone`, `noteResult` and `fail` in `driver.ts`, and `tool_step_aside` on the server. The first half (the later ask skipped) follows directly from the shared key. The second half (the busy body's step sent again) rests on CORE-01's account of a walk sent over a walk, which I did not re-check; hence `likely`. Not seen in a round. The simulator's stand-in server never fails `step_aside` (SIM-04), so no scenario has ever run this.

## How to fix it

1. In `asideStep`, give each asking its own key: `key: \`${ASIDE_STEP_KEY}:${asked.at}\``. Keep the bare `ASIDE_STEP_KEY` as the prefix and change the test in `noteDone` to `step.key.startsWith(ASIDE_STEP_KEY)`. A failure then holds back only the asking it answered, which has `done: true` already.
2. In `drive`, work out the aside step before the busy test and only break in for it when it can be given: `const aside = asideStep(brain); const dropToMove = busy && !!aside && !inBackoff(brain, aside.key);`.
3. Optionally, on a failed step aside, say sorry and that there is no room, as a plain line through `brain.toTell`, so the asker knows to go round. That is a line of speech, not a judgement, and keeps a dead model from leaving the asker waiting.

Checker's notes: `ASIDE_STEP_KEY` is used only in `aside.ts` and in `noteDone` (`driver.ts:877`), so step 1 touches nothing else. Each failed asking leaves one entry in `brain.failures` that nothing removes; that is a handful of entries a round and can be left, or struck when `asideAsked` is replaced. Step 2 should call `asideStep` (which also drops an ask older than `ASIDE_STANDS_MS`) rather than read `brain.asideAsked` directly, as written.

## How to test the fix

- Add a failing `step_aside` to the simulator's stand-in server (it has none, see SIM-04): fail the first, then ask again 10 seconds later from somewhere with room. The second ask must be answered with a `step_aside` within the usual few seconds.
- In the same scenario, with the body walking when the second ask comes, the driver must send `step_aside` and nothing else.
- In a round, grep `game.log` for "nowhere here to step aside" and look for the next ask of the same body within two minutes.

## Check

Checked by Opus 5.5. The quotes match the code (`jobs/aside.ts:21` and the step at `:61`, `nextStep` near `driver.ts:279`, `dropToMove` at `driver.ts:733`, `noteResult`'s `fail(brain, last.key)`, `crew_npc_doors.dm:891` for "There is nowhere here to step aside to."). The step's key is the bare `ASIDE_STEP_KEY` for every asking, `fail` puts it in back-off for 20 seconds and more, only a success clears it, and a fresh `asideAsked` does not change the key. Ran a throwaway script with bun against the real `driver.ts` and the fixture brain: with `stepping-aside` failed once (held 20 seconds) and a fresh ask from Donna, `nextStep` gave `explore`, not `step_aside`. Half 1 is certain.

Half 2 is real but narrower than written: `dropToMove` does let the driver in with the aside step held back, and the ordinary step is sent over the busy one; but when that is the same `go_to` already under way, the server's `set_blackboard_key` returns early on the unchanged target (`code/datums/ai/_ai_controller.dm:783`) and the walk goes on. CORE-01's failure follows only when the step sent is a different walk. The body is also held up to 15 seconds first while it is being talked to (`TALK_HOLD_MAX_MS` in `drive`). The write-up is mended to say so. Nothing in the change log or plans touches the aside key. Confirmed; confidence raised to sure for half 1, which carries the finding. Severity medium and effort small stand (two small edits, both in the window).
