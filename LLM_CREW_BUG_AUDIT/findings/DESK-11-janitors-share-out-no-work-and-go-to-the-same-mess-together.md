---
id: DESK-11
title: Janitors share out no work, so two that have seen the same messes go to the same room in the same order, and neither leaves a room to another already in it
kind: gap
severity: low
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:401, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:347, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:555
fix: Leave a routine mess task alone for a while when another janitor is seen in that room, or is seen cleaning there, and let the order of rooms differ by janitor
---

## What is wrong

Every janitor keeps its own list from what its own body has seen (`syncTasks`: one routine CLEAN task per room in `mess_places`). Nothing in `jobs/janitor.ts` looks at whether another janitor is already at a room. The order of the list is the same rule for everyone (`workInOrder`: right here, urgency, ready, not maintenance, oldest first), so two janitors who walked the same hallways at the start of a round, as they do (both explore from the Custodial Closet, both go to the same supply rooms and the same cargo counter), hold the same rooms in the same order and set off for the same one.

The model is asked which of several routine jobs comes first (`choosable` in the driver), which may split them, but is not told another janitor is in that room, and with a slow or dead model the code's own order is taken, which is the same for both.

Concrete case: two janitors come out of the Custodial Closet with mops. Both remember dirt in the Starboard Primary Hallway (seen on the way to the closet) and oil in the Bar. Both go to the Starboard Primary Hallway. One starts on the nearest dirt, the other on the next; when that is done, both walk to the Bar. Half of every walk is wasted, and a player sees two janitors trailing each other round the station.

A cargo call goes to one janitor only, and a mess another janitor only spoke of is not taken as a call (`syncTasks`, first loop), so the duplicate is in routine work, not in calls.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:401`, in `syncTasks`:

    const messy = new Set(brain.messPlaces);
    for (const name of messy) {
      if (!findTask(brain, CLEAN, { place: name })) {
        addTask(brain, {
          kind: CLEAN,
          place: name,
          urgency: 'routine',
          source: 'noticed',
        });
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:347`, the order, the same for every janitor:

    .sort(
      (a, b) =>
        ...
        Number(isRightHere(brain, b)) - Number(isRightHere(brain, a)) ||
        URGENCY_ORDER[a.task.urgency] - URGENCY_ORDER[b.task.urgency] ||
        Number(b.plan.ready) - Number(a.plan.ready) ||
        Number(isBackwater(a.task)) - Number(isBackwater(b.task)) ||
        a.task.createdAt - b.task.createdAt,
    );

## How it was found

Read from the code. Not looked for in a round log; how often two janitors pick the same room was not measured, hence `likely`.

## How to fix it

Senses only: a janitor may go by what it sees, which is other janitors and where they stand (`peopleInView` has `job` and `place`).

1. In `syncTasks`, for a routine (noticed) CLEAN task whose room has another janitor in view standing in it (`person.place === task.place` and `isJanitor(person.job)`), and the room is not the one it stands in, block it a short while ("another janitor is seeing to it") and note the time, as `letInAsks` notes asks. Unblock after a few minutes, or when the room is still in `messPlaces` once that janitor has gone.
2. In the same room as another janitor, it goes on cleaning: two in one room each take the nearest mess, which the server already spreads.
3. Optionally, a small per-janitor tie-break in `workInOrder` (for example by name) so two lists do not run in lock step.
4. Owner question: should janitors divide the station between them, the way the Quartermaster divides cargo's work? That is a bigger change and a design choice.

## How to test the fix

- Simulator: two janitors with the same remembered messes in two rooms. With one in view in the first room, the other must go to the second.
- Type check from `tgui/`.
