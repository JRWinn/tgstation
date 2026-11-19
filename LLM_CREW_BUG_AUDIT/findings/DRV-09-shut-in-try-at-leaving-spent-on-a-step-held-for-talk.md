---
id: DRV-09
title: Shut in, its next try at leaving is spent on a walk the talk hold then stops, so it waits another 20 seconds, or two minutes if it was let in, before it really tries
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:773, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:788, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:797
fix: Set tryLeavingAt only once the walk is really issued, after the pause after saying and the talk hold, not where the gate is checked
---

## What is wrong

A body that is shut in tries the way out only now and then: every 20 seconds (`TRY_LEAVING_MS`), or every two minutes if it was let in and is waiting at the door it came in by (`TRY_LEAVING_LET_IN_MS`). `drive` checks the gate and, if it is open, sets the next time at once. Two more holds come after that in `drive`: it does not leave within 2.5 seconds of saying something (`AFTER_SAYING_MS`), and it holds still while someone is talking to it or it is waiting on the LLM (the talk hold). Either returns null without the walk being sent. The try has been used up all the same, and the next one is 20 seconds or two minutes off.

A shut-in body is very often talking: it has just asked someone to let it out, and they are answering. So the try very often falls on a moment when it cannot be made.

One concrete case: a janitor let into a back room (`wantsOut`) is shut in and standing at the door. It has another mess on its list, elsewhere, so the step `nextStep` gives after the asking is the `go_to` for that mess, which counts as walking out. It says "Maria, could you let me out, please?" and Maria answers "One moment." On the next update with the gate open: `tryLeavingAt` is set two minutes ahead, then `talking` is true (Maria spoke under six seconds ago) and `drive` returns null. Maria opens a different door of the room, one the janitor cannot see from where it stands, and walks off. `wayOutOpen` needs a door the body can see standing open, so nothing bypasses the gate, and the janitor does not try the way out for two minutes.

This is the same mistake as DRV-01 (a try counted where it is asked for, not where it is made), in another place.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:773`, in `drive`, the gate, which sets the next time before the step is known to go:

      if (walksOut && brain.shutIn && !wayOutOpen(brain)) {
        if (now < brain.tryLeavingAt) {
          return null;
        }
        ...
        brain.tryLeavingAt =
          now + (brain.wantsOut ? TRY_LEAVING_LET_IN_MS : TRY_LEAVING_MS);
      }

`driver.ts:788` and `driver.ts:797`, the two holds after it:

      if (leaves && now - brain.lastSayAt < AFTER_SAYING_MS) {
        return null;
      }
      ...
      if (leaves && talking && !doorWaiting) {
        brain.heldSince ||= now;
        if (now - brain.heldSince < TALK_HOLD_MAX_MS) {
          return null;
        }

## How it was found

Read from the code. Not run, and not looked for in a round log.

## How to fix it

1. In `drive`, keep the check where it is (`if (now < brain.tryLeavingAt) return null`) but only note that this step is a try: `const leavingTry = walksOut && brain.shutIn && !wayOutOpen(brain);`.
2. Move the line that sets `brain.tryLeavingAt` down to just after `issue(step.act)` has returned a tool name (beside `noteDone`), inside `if (leavingTry)`.
3. Nothing else reads `tryLeavingAt` but `ingest` (which sets it when the body is newly shut in, and clears it when a door is held), so nothing else changes.

## How to test the fix

- Type check from `tgui/`.
- A table test with the fixture brain: shut in, `wantsOut`, a routine `go_to` elsewhere ready, `lastSpokenToAt` just now. `drive` returns null and `tryLeavingAt` must be unchanged; seven seconds later `drive` sends the `go_to` and `tryLeavingAt` is then two minutes ahead.
