---
id: KNB-08
title: A door held open into an outer room is not gone through - the held door wipes every back-off, and work where the janitor stands wins - so it asks at the same door again and again
kind: bug
severity: high
effort: medium
confidence: likely
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:546, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:235, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:678, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:633
fix: Put first the ready step that walks through the held door, whatever room its task is for, and stop a held door from clearing the back-off of work in the room the body is already in
---

## What is wrong

A janitor with two calls inside cargo, one in the room it stands in and one in a room reached through another, has the same door opened for it over and over and never gets to the second call. In `data/logs/2026/11/19/round-20.43.32` one janitor had 18 doors opened for it in twelve minutes (02:48:22 to 03:00:59), six of them "opened Deliveries to let Jean-Luc Willey into Cargo Bay" in answer to the same message, "I am at the Deliveries door of the Cargo Bay about the mess in the Mining Office. Could you let me in, please?", sent at 02:50:39, 02:54:36, 02:58:43 and 03:00:52. It never sent one word from a door of the Mining Office. A technician spent the whole time walking to that door.

This is the fault behind three items the older entries left open:

- 2026-11-18 13:30, "Not built": "(8) A janitor does not yet finish all its calls inside a department before leaving it."
- 2026-11-18 13:30, "Known and not fixed": "(11) A janitor went back to a room seven seconds after a clean failed there. Cause not found."
- 2026-11-18 13:30: "A call to the Bitrunning Den, asked for at the Cargo Bay door, was refused ... Not run down." (The same nesting: a call to a room reached through the bay.)

**The cause, in three lines of the driver.**

1. When a door is held for the body, every back-off is dropped: `brain.failures.clear()` on the `door_held` event (`brain.ts`), and `inBackoff` answers "no" for everything while `brain.doorHeld` is set (`driver.ts`). The reason given is right for the walk through the door. It is wrong for everything else, and in particular for a clean that just failed in the room the body is standing in.
2. Work is ordered with "whatever can be done right where the NPC stands" ahead of a call elsewhere (`isRightHere` in `workInOrder`, `tasks.ts`). So with the back-off gone, the failed job underfoot is first again.
3. The driver has a line meant to stop exactly this: "A door being held open for it will not stay open. Whatever it was let in for comes first." But it looks for a task whose **place** is the held room. For a room inside another the held door is the outer room's (`doorHeldFor` is "Cargo Bay") and the task's place is the inner one ("Mining Office"). Nothing matches, and nothing is moved to the front.

Step by step, the case in the log. The janitor is in the Delivery Office, called there and to the Mining Office, which is reached through the Cargo Bay:

1. Its clean in the Delivery Office comes to nothing. `noteResult` calls `fail(brain, jobKey(cleaned.id))`: the Delivery Office job is left for 20 seconds.
2. The Mining Office is next. `letInStep` has it stand at "the door of the Cargo Bay" (`doorFor`), knock, and send the message above.
3. The technician opens Deliveries "to let it into Cargo Bay". The server sends `door_held`.
4. `brain.failures.clear()`. The Delivery Office job is ready again, it is right here, and it sorts first. `through` is -1 because no task has `place === 'Cargo Bay'`.
5. The driver sends `clean`. The door shuts 15 to 30 seconds later with the janitor still scrubbing in the Delivery Office.
6. The clean fails again. Back to step 1, with the technician called to the same door.

Item (11) is step 4 seen from outside: a held door (any door, for any reason) makes a job that failed seven seconds ago ready again.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:545`, in `nextStep`:

      // A door being held open for it will not stay open. Whatever it was let in for comes first.
      const through = brain.doorHeld
        ? ready.findIndex(({ task }) => task.place === brain.doorHeldFor)
        : -1;
      if (through > 0) {
        ready.unshift(...ready.splice(through, 1));
      }

`driver.ts:233`, in `inBackoff`:

      // Likewise while someone is holding a door for it: that will not last, and a walk that failed
      // a moment before the door opened says nothing about one made now.
      if (brain.doorHeld) {
        return false;
      }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:677`:

          // A door is being held open for it: whatever it had given up on is worth trying this instant.
          if (event.details.door_held) {
            brain.failures.clear();
            brain.tryLeavingAt = 0;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:629`, where the plan for the inner room does know which door is the one (and `jobs/arrests.ts:583` does the same for an officer):

      const door = doorFor(brain, place);
      ...
      if (brain.doorHeld && !brain.doorHeldOut && brain.doorHeldFor === door) {
        return {
          ready: true,
          step: `The door into the ${door} is being held open for you, and you are going through...`,
          act: { tool: 'go_to', place: door },
        };

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:364`, the ordering:

            Number(isRightHere(brain, b)) - Number(isRightHere(brain, a)) ||

## How it was found

The loop was seen in the round log named above (the 18 "opened ... to let" lines and the four identical messages). The cause was read from the code. **Not seen:** that the janitor's clean in the Delivery Office was what failed each time. `game.log` has no line for a clean that fails, so step 1 is worked out from the code and from the fact that the Delivery Office call was never closed and the janitor never left the room on a door held into the bay. No script was run.

## How to fix it

1. In `nextStep` (`driver.ts`), make `through` look for the step that goes through the held door, not for a task by its room:

        const through = brain.doorHeld
          ? ready.findIndex(
              ({ task, plan }) =>
                task.place === brain.doorHeldFor ||
                (plan.act?.tool === 'go_to' && plan.act.place === brain.doorHeldFor),
            )
          : -1;

   The plan for a nested room already returns `go_to` the held room (janitor.ts and arrests.ts above), so this needs nothing from either job.
2. Keep that step first even when it is `ready[0]` already and a choice between routine jobs would otherwise be put to the LLM: the `choosable` call comes after and only sees what is at the front. Check with a routine task in the list.
   Step 1 on its own stops the loop in the log: the walk through the held door is a `go_to`, and walks are not held back while the door is held. Steps 3 and 4 are for item (11), the wider fault, and can be a second change.
3. In `inBackoff`, lift the back-off for a held door only for steps that leave the room: pass the step's action in, and return `false` early only when `act` is a `go_to`, `go_to_door` or `explore`. A `clean`, `pick_up` or `search` in the room it stands in keeps its back-off. Both calls in the ready loop of `nextStep` need the action, the `jobKey(task.id)` one included (today it is called with the key alone), and so do the other callers of `inBackoff` in `driver.ts` (reflex, aside, leaving, door held out): give the new argument a default that keeps today's answer for them.
4. In `brain.ts`, replace `brain.failures.clear()` on `door_held` with deleting only the keys of walks (`go_to`, `go_to_door`) and of jobs whose task is not in `brain.location`. `jobKey` records for the room underfoot stay.
5. Not part of this fix, and the owner's to decide: item (8) proper. A janitor let out of the Delivery Office at 03:00:17 asked to be let straight back in at 03:00:25, because the call stands "while the mess is there" (15:00 entry, 4). Question for the owner: when a janitor has tried a room and what is left will not come off, should the call be closed on its side until it holds something else, as "I cannot shift it" already does for a mess that is beyond it?

What must keep working: a janitor let into a room for its mess goes in at once (the direct case, `task.place === doorHeldFor`); an officer let into a room after someone goes in at once (`arrests.ts`); a body let out goes out (`doorHeldOut` is handled before any of this).

## How to test the fix

- Type check and lint, from `tgui/`.
- Simulator: `nested` is the scenario with a room inside a room. Add to it, or beside it, a janitor that holds a second call in the outer-but-one room it is standing in, with `clean` there made to fail (`sim.ts` can fail a tool by hand, as `qmstuck` does for `unload`). The check: after the door of the outer room is opened once, the janitor is in the outer room within ten seconds, and the door is not opened a second time for the same message.
- A round: count "to let X into Cargo Bay" lines for one janitor between two of its own messages. More than one for one message is this fault.

## Check

Checked by Opus 5.5, 2026-11-19. Confirmed.

- The quotes are what the code says today: `inBackoff` returns `false` for every key while `brain.doorHeld` (`driver.ts:235`); `door_held` clears `brain.failures` (`brain.ts:678`); `through` matches `task.place === brain.doorHeldFor` only (`driver.ts:546`); `letInStep` returns `go_to` the outer room, `doorFor(brain, place)`, when that door is held (`janitor.ts:633`); `isRightHere` ranks ahead of urgency (`tasks.ts:364`).
- Traced the order with the door held. The Mining Office task stops being an asked wait (its plan is now ready, a `go_to`), so the asked-wait rule no longer puts it first. Both calls are `asked`, so `isCalledFor` ties. `isRightHere` then puts the Delivery Office clean first whenever its plan is ready, and no back-off can hold it while the door is held. `through` finds no ready task placed in the Cargo Bay: the Cargo Bay call had been dropped at 02:49:06 ("I have done what I can in the Cargo Bay"), and what was left there (a cobweb) was beyond its mop, so any Cargo Bay task it kept as its own was blocked and not in `ready`. Nothing moves the walk forward.
- Why the janitor was at the door at all, if the Delivery Office clean was ready: something held it back. A failed clean (`fail(brain, jobKey(...))`, `driver.ts:1019`) is the one cause in the code that a held door undoes, so step 1 of the case is the likely one. Not proved: no log line records a failed clean. Confidence `likely` stands.
- Read `data/logs/2026/11/19/round-20.43.32/game.log`: the four identical messages (02:50:39, 02:54:36, 02:58:43, 03:00:52) are each followed within seconds by "opened Deliveries to let ... into Cargo Bay", and the janitor says it is scrubbing the Delivery Office straight after (02:50:43, "I'll finish scrubbing this Delivery Office oil"). It never asks at a Mining Office door.
- No later change log entry touches `doorHeldFor`, `through` or the back-off on a held door. Items (8) and (11) of the 13:30 entry are still open.
- Severity high stands: a janitor loops for good, and calls to nested cargo rooms come in most rounds on MetaStation. Effort raised to medium: step 1 is a few lines, but steps 3 and 4 change `inBackoff`'s callers and `brain.ts` as well.
- No script was run.
