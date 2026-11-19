---
id: DRV-04
title: The start of a talk hold is kept from an earlier conversation, so a body spoken to later walks off at once
kind: bug
severity: low
effort: small
confidence: sure
status: found
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:797
fix: Clear heldSince whenever drive returns without reaching the hold, or count the hold from lastSpokenToAt
---

## What is wrong

A body that someone is talking to holds still for a moment before it walks away, and never for more than 15 seconds in one go. The 15 seconds are counted from `brain.heldSince`. That is set the first time a step is held, and it is only set back to 0 on an update where `drive` gets as far as the hold code with a step that is not held. `drive` has many ways out before that point: the body is busy (`walking`, `doing`, `lastAct`), a line is waiting to be said (`mustSay`, `sayingNow`), it is held by the arm, the breath is not over, it is shut in and not due to try, or it has only just spoken. If the conversation ends while `drive` is leaving by one of those, `heldSince` keeps its old value. The next time anyone speaks to the body, even minutes later, `now - heldSince` is already over 15 seconds and the body is not held at all: it turns and walks off the moment it is spoken to, which is the very thing the hold was written to stop ("walking off mid-sentence is what a machine would do").

One concrete case: the Captain says hello to a janitor in a hallway; its next step is a walk, so it is held and `heldSince` is set. A second later its work calls for a line ("Zim, that is done"), so `drive` returns at `brain.mustSay !== null`. The line is said, the LLM leads the Captain somewhere, and the body is walking for half a minute. The Captain then asks it a question. `heldSince` is 31 seconds old, so the hold is over before it starts and the body sets off on its next walk in the same update.

This is, most likely, also why the simulator's `aside` scenario passes some runs and fails others (see DRV-03): with a stale `heldSince` the six-second hold is skipped.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:797`, in `drive`:

      if (leaves && talking && !doorWaiting) {
        brain.heldSince ||= now;
        if (now - brain.heldSince < TALK_HOLD_MAX_MS) {
          return null;
        }
      } else {
        brain.heldSince = 0;
      }

The ways out above it that leave `heldSince` as it was, for example `driver.ts:734`:

      if (
        !brain.awake ||
        (busy && !dropFor && !dropToLeave && !dropToMove) ||
        // Someone has it by the arm. It goes where it is taken.
        brain.inHand ||
        // It has something to say first, and is still finding the words.
        brain.mustSay !== null ||
        brain.sayingNow
      ) {
        return null;
      }

Nothing else in the window code writes `heldSince` (searched `jobs/`, `brain.ts`, `tasks.ts`).

## How it was found

Read from the code, then shown with a throwaway script (outside the repo) on the real `driver.ts` with the fixture brain and the clock moved by hand:

    spoken to, +0s: held heldSince set: true
    +1s, a line waiting: nothing
    spoken to again 31s later: walked off at once (none:{"tool":"explore"})

Not seen in a round.

## How to fix it

Either of these. The first is the smaller change.

1. Make the hold forget itself when the talk it was for is over: at the top of `drive`, after `const now`, add `if (brain.heldSince && now - brain.heldSince > TALK_HOLD_MAX_MS + TALK_PAUSE_MS) brain.heldSince = 0;`. A hold that began more than 21 seconds ago is about some other conversation.
2. Or drop `heldSince` and count from what is already kept: hold while `now - brain.lastSpokenToAt < TALK_PAUSE_MS`, and for the "LLM is still working on it" part hold while `now - startOfThisWake < TALK_HOLD_MAX_MS`, where the start is stamped in `ingest` when `brain.wake` goes from false to true.

Keep the rule that a room full of talk cannot hold a body for more than 15 seconds running: after a hold has run its full length, the next one should not start until the body has taken a step.

## How to test the fix

A table test with the fixture brain, as in the script above: held at 0s, `mustSay` set for a second, busy for 30 seconds, spoken to again, and `drive` must return null for the next few seconds. Then run `bun tools/llm_crew/sim.ts quiet aside` a few times: once DRV-03 is in as well it should pass every run, and with only this fix it should fail every run, which shows the two faults for what they are.
