---
id: DRV-08
title: Having stepped aside, the body takes no step of any kind for 15 seconds, so a second ask to move, an order, being told to leave and a door held for it all wait
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1001, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:754, tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:23
fix: Keep the body off its own routine work for ASIDE_HOLD_MS with a hold of its own, not by putting driveAfter forward, so that anything ahead of routine work still goes at once
---

## What is wrong

After a `step_aside` that went well, `noteResult` puts `brain.driveAfter` 15 seconds ahead (`ASIDE_HOLD_MS`). The comment says why: going straight back to what it was doing would put it straight back in the way. But `driveAfter` is not a hold on going back to work. In `drive` it stops every step `nextStep` gives, whatever it is (only the emergency answer and the quick tell at the very top of `drive` come before it). So for 15 seconds the body also does not:

- step aside again when asked again (a new `asideAsked`, by the same hauler or someone else): `asideStep` offers it and `drive` returns null;
- go when someone it answers to tells it to leave the room (`leavingStep`, both the "Yes, sir" line and the walk);
- go through a door that is being held open to let it out (`doorHeldOut`), which the code itself says "will not be held for long" (the server holds a door `CREW_NPC_DOOR_HELD`, 15 seconds);
- start on an order from the Captain or a head (an emergency task with an act), or answer the fire doors, or anything else the driver puts ahead of routine work.

The same 15 seconds follow a step clear of a doorway at a meeting (`STEP_INSIDE_KEY` also sends `step_aside`), where nobody asked it to keep away from anyone.

One concrete case: the Captain is pushing a crate down the hallway and says "Jan, step aside". The janitor steps a tile or two. The Captain then says "Jan, go and clean the Bar, someone was sick in there." The order is read and goes on the list as an emergency task with a `go_to` ready. For the next 15 seconds after the step, every update gives `nextStep` = the walk to the Bar, and `drive` returns null at `now < brain.driveAfter`. The janitor stands where it stepped to, with the Captain watching, and sets off up to 15 seconds later. (With DRV-03 on top, the step itself came six seconds after the asking.)

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1001`, in `noteResult`:

        // Having stepped out of someone's way, it stays there a little while. Going straight back to
        // what it was doing would put it straight back in the way.
        if (last.act.tool === 'step_aside') {
          brain.driveAfter = Math.max(brain.driveAfter, Date.now() + ASIDE_HOLD_MS);
        }

`driver.ts:754`, in `drive`, after `nextStep` has picked the step, whatever it is:

      if (now < brain.driveAfter) {
        return null;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:23`:

    export const ASIDE_HOLD_MS = 15000;

## How it was found

Read from the code. Not run, and not looked for in a round log.

## How to fix it

1. Add `asideUntil: number` to `NpcBrain` (`types.ts`, the new-brain block in `ingest` in `brain.ts`, and `makeBrain` in `tools/llm_crew/fixtures.ts`).
2. In `noteResult`, for a `step_aside` that went well, set `brain.asideUntil = Date.now() + ASIDE_HOLD_MS` instead of moving `driveAfter`. Keep the ordinary breath that `noteResult` already adds at its end.
3. In `nextStep`, in the loop over the task list, skip routine tasks (`task.urgency === 'routine'`) while `Date.now() < brain.asideUntil`, and offer no idle step either. Everything above the task list (aside, leaving, door held, shut in, tells, owed word) and the emergency and asked tasks go on as before.
4. A step clear of a doorway (`STEP_INSIDE_KEY`) is for waiting where it is: set `asideUntil` only when the step was `ASIDE_STEP_KEY`, which `lastAct.key` says.

## How to test the fix

- Type check from `tgui/`.
- A table test with the fixture brain: a step aside that has just gone well, then within 15 seconds (a) a new `asideAsked`, (b) an emergency task with a `go_to` ready, (c) `doorHeldOut` true: `drive` must take each at once. With only routine work, `drive` must take nothing for 15 seconds.
- `bun tools/llm_crew/sim.ts quiet aside`: still passes.
