---
id: JOBS-06
title: One step aside that finds nowhere to go puts every later ask to step aside off for 20 seconds to 2 minutes, and a busy body asked meanwhile has its own work sent again
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:21, tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:61, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:279, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1012
fix: Key the aside step by the asking (ASIDE_STEP_KEY plus asked.at) so each new ask gets a try, and only let dropToMove break into busy work when that aside step is not in back-off
---

## What is wrong

Every step aside, for whoever asks and wherever the body stands, has the same key: `ASIDE_STEP_KEY = 'stepping-aside'` (`asideStep` returns it as `key`). When a step aside fails, `noteResult` puts that key in back-off (`fail(brain, last.key)`): 20 seconds the first time, 40 the second, up to two minutes, and only a success clears it.

A step aside fails in exactly the places people need to get past: `tool_step_aside` answers "There is nowhere here to step aside to." when no free tile in reach is in the same room and clear of doors (a doorway, a one-tile corridor, a maintenance tunnel), or the walk to the spot fails.

Two things follow.

1. **The next ask is not heard.** A new ask sets a fresh `asideAsked` (`done: false`), but `nextStep` checks `inBackoff(brain, aside.key)` with the same key and skips it. So for the next 20 seconds or more the body does not move for anyone, even after it has walked on into an open room where stepping aside would work. The ask runs out after `ASIDE_STANDS_MS` (20 seconds), which is no longer than the first back-off, so the ask is often dropped unanswered.
2. **A busy body has its own step sent again.** `drive` lets the driver break into busy work whenever an ask is waiting: `dropToMove = busy && !!brain.asideAsked && !brain.asideAsked.done`. It does not look at whether the aside step can be given. With it in back-off, `nextStep` returns the body's ordinary next step instead, and the driver issues it on top of the walk or haul already under way. Each drive tick until `asideAsked` runs out repeats this, because `done` is only set when the aside step itself is issued (`noteDone`). A walk sent over a walk is failed by the server (CORE-01), and that failure then puts the body's own task step into back-off as well.

One concrete case: a janitor mopping a one-tile maintenance corridor. A technician hauling a crate behind it says "Jan, step aside, please." `step_aside` fails: nowhere in reach. The key goes into back-off for 20 seconds. The janitor finishes and walks on into the Cargo Bay. Ten seconds later a second technician, pulling a crate across the bay, finds the janitor in its way and asks "Jan, could you move?". `asideAsked` is set; the aside step is in back-off; the janitor, walking to its next mess, is "busy", so `dropToMove` lets the driver in, and the driver sends the janitor's own `go_to` again, which the server fails as a walk over a walk. The janitor neither steps aside nor carries on cleanly; the technician's haul is blocked until the ask lapses.

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

## How to test the fix

- Add a failing `step_aside` to the simulator's stand-in server (it has none, see SIM-04): fail the first, then ask again 10 seconds later from somewhere with room. The second ask must be answered with a `step_aside` within the usual few seconds.
- In the same scenario, with the body walking when the second ask comes, the driver must send `step_aside` and nothing else.
- In a round, grep `game.log` for "nowhere here to step aside" and look for the next ask of the same body within two minutes.
