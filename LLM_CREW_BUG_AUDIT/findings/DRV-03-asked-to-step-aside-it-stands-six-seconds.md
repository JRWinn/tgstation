---
id: DRV-03
title: Asked to step aside, a body stands still for six seconds or more first, because being asked counts as being talked to
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:68, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:764, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:788, code/modules/llm_crew/crew_npc_doors.dm:865
fix: Leave step_aside out of the talk hold and the pause after saying (add it to STAYS), and have tool_step_aside end the server's talk hold
---

## What is wrong

`LLM_CREW_PLAN_SECURE_AREAS.md:20` says "Asked to step aside, an NPC moves there and then". It does not. The asking is speech said to the NPC, so `shouldWake` in `brain.ts` sets `lastSpokenToAt`. The driver then treats the step aside like any other step that takes the body away: it holds it for `TALK_PAUSE_MS` (6 seconds) after the last thing said to it, for as long as the LLM is working on a reply (`brain.wake`, `brain.status !== 'idle'`), up to `TALK_HOLD_MAX_MS` (15 seconds), and then for `AFTER_SAYING_MS` (2.5 seconds) after its own "sorry". Each time the asker says it again, the six seconds start again.

One concrete case: a janitor is scrubbing the floor of the Cargo Bay. A technician hauling a crate says "Excuse me, Jan, could you step aside, please? I need to get this past you." `asideOverhears` sets `asideAsked`; `shouldWake` sets `lastSpokenToAt`. On every update for the next six seconds `nextStep` returns the aside step and `drive` returns null at the talk hold. The janitor goes on standing in the way. The step is sent at six seconds and the walk takes about two more.

This is the cause of the simulator failure the change log reports as unexplained, `LLM_CREW_CHANGELOG.md:527`: "The one that failed, `aside` ("asked to step aside ... 8s after being asked"), failed 1 run in 4 on this code and 2 in 4 on a clean copy of the last commit, so it is not from this work." Eight seconds is the six of `TALK_PAUSE_MS` and the two the simulator gives the step. The runs that pass are, most likely, the ones where the hold is skipped by the fault in DRV-04 (not checked by running the simulator: reviewers were told not to).

There is a second hold on the server that the simulator does not play. When the window queues the NPC for a reply it sends `hold` (`stopToTalk`), and `stand_still` halts the body's movement for `CREW_NPC_TALK_HOLD` (4 seconds), again when the LLM call starts, and for 2.5 seconds after it speaks. A `step_aside` walk started in that time does not move until the hold runs out.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:68`, the steps that do not count as going anywhere. `step_aside` is not among them:

    const STAYS = new Set([
      'clean',
      'message',
      'search',
      'find_supplies',
      'grenade',
      'note',
      'word_passed',
    ]);

`driver.ts:764` and on, in `drive`:

      const leaves = !!step.act && !STAYS.has(step.act.tool);
      ...
      if (leaves && now - brain.lastSayAt < AFTER_SAYING_MS) {
        return null;
      }
      const talking =
        now - brain.lastSpokenToAt < TALK_PAUSE_MS ||
        brain.wake ||
        brain.status !== 'idle';
      // A door someone is holding open for it will not stay open while the room finishes talking.
      const doorWaiting = brain.doorHeld || brain.doorHeldOut;
      if (leaves && talking && !doorWaiting) {
        brain.heldSince ||= now;
        if (now - brain.heldSince < TALK_HOLD_MAX_MS) {
          return null;
        }

`brain.ts:972`, in `shouldWake`, for speech said to this NPC:

          brain.lastSpokenToAt = Date.now();

`code/modules/llm_crew/crew_npc_doors.dm:14`, `stand_still`, and `:865`, `tool_step_aside`, which starts a walk and does nothing about `talk_hold_until`.

## How it was found

Read from the code, then shown with a throwaway script (outside the repo) that imports the real `driver.ts` and the fixture brain: a janitor with `asideAsked` just set and `lastSpokenToAt` set to the same moment, driven once a second with the clock moved by hand:

    +0s nothing
    +1s nothing
    +2s nothing
    +3s nothing
    +4s nothing
    +5s nothing
    +6s took stepping-aside

The simulator failure is quoted from the change log, which also puts the same failure down to chance at `LLM_CREW_CHANGELOG.md:351` and `:895`. The simulator was not run.

Seen in round logs, by setting the time a line with "step aside" was said (`game.log`, "was told by its brain to say") against the time the body it was said to took the step (`crew_brain.log`, the `ROUTINE (no LLM)` record "has asked you to step aside"):

- `data/logs/2026/11/18/round-14.28.06`: said at 20:32:56.5 to Payton Shafer, step taken at 20:33:04.4, 7.8 seconds later. Said at 20:35:13.0 to Sunshine Pritchard, step taken at 20:35:19.7, 6.8 seconds later.
- `data/logs/2026/11/18/round-15.09.26`: said at 21:31:37.3 to Sawyer Smith, step taken at 21:31:47.7, 10.4 seconds later.

In an older round, `round-10.46.15`, two steps were taken 0.3 seconds after the asking (16:54:02.0 and 16:54:41.4), which is what the plan asks for. Whether that was older code or the stale hold of DRV-04 was not run down.

## How to fix it

1. In `driver.ts`, add `'step_aside'` to `STAYS`. A step of up to three tiles inside the same room is "what the body does without going anywhere". That takes it out of the talk hold and the pause after saying, for both the aside step and the step clear of a doorway (`STEP_INSIDE_KEY`), and out of the count of failed walks at an open door in `noteResult` (`openDoorTries`), where it never belonged.
2. Check the one other use of `STAYS`: `noteResult` at "A walk that came to nothing with a door standing open". With step 1 a failed step aside no longer counts as a try at the door, which is right.
3. On the server, in `tool_step_aside` (`crew_npc_doors.dm:865`), before `start_walk`, end the talk hold: set `talk_hold_until = 0` and `REMOVE_TRAIT(body, TRAIT_AI_MOVEMENT_HALTED, CREW_NPC_TALK_TRAIT)`. `keep_still` already returns quietly when the time is up. The body still says its "sorry" from where it steps to.
4. Leave the hold as it is for the leaving step (`leavingStep`): there the plan is that it says it is going and then goes.

## How to test the fix

- `bun tools/llm_crew/sim.ts quiet aside`, four times, then with a chatty LLM. The check "asked to step aside, it does, within a few seconds" (sim.ts:1428) should pass every time, at about 2 to 3 seconds after being asked.
- Type check from `tgui/`, and the server compile to a side copy.
- In a round: stand in a technician's way with a crate, or ask a janitor to step aside yourself, and time it. In `crew_brain.log` the `ROUTINE (no LLM)` line "has asked you to step aside" should come within a second or two of the speech.
