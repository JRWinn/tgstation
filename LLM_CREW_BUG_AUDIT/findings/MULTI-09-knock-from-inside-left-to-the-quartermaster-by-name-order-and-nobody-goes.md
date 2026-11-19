---
id: MULTI-09
title: A knock from inside a cargo room is left to whoever in cargo has the first name in the alphabet, the Quartermaster included, so with the Quartermaster in sight neither technician goes
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1419, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:886, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:84
fix: In the name-order tie-break count only technicians who are on their feet and not busy (isTechnician, not down, not cuffed, not hauling), not the Quartermaster
---

## What is wrong

When someone knocks at a door of one of cargo's rooms and the code cannot say whose call it is, `doorWanted` settles which technician goes by name: the one whose name sorts first among "those at the post" in sight goes, and the others leave it. The test for "those at the post" is `isCargo(seen.job)`, and `isCargo` is `/cargo|quartermaster/`. So the Quartermaster counts. But the Quartermaster does not answer knocks at cargo's doors: its own knock handling (`quartermaster.ts`) is only for its office door while it is in its office. If the Quartermaster is in sight and its name sorts before both technicians', each technician leaves the knock to it, and nobody opens the door.

The same test also counts a technician who is in sight but cannot go: down, in cuffs, or hauling a crate off the shuttle.

This path is taken for a knock from inside a room when the knocker is not on the department's list (a janitor that walked back into a room it had been let out of, the case the comment cites, or anyone seen inside the post), before the Quartermaster has divided the work (`roomsKeeper` is unset until its first supply meeting, or always if it never holds one).

One concrete case:

1. Technicians Sam Reed and Maria Vance. Quartermaster Ada Lowe, who has come into the Cargo Bay to give Sam an order face to face. No division of work yet.
2. A janitor who was let out of the Warehouse earlier walked back in while its door stood open and is now shut in. It knocks from inside. Both technicians get `knockAt` with `inside: true`.
3. `stillInside` has nobody (it was let out), and nobody is seen inside the Warehouse from the bay. `!inside && brain.closedRooms.includes("Warehouse") && mine(undefined)`.
4. `mine(undefined)` for Sam: is there anyone in view with `isCargo(job)` and a name before "Sam Reed"? "Ada Lowe": yes. FALSE. For Maria: "Ada Lowe" again. FALSE.
5. Ada's `syncTasks`: the knock is not at her office door. Nothing.
6. Nobody goes. The knock stands for `DOOR_ASK_DS`, then lapses. The janitor has knocked once (`outAsks.knocked`) and goes on to PDA messages.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1413`, in `doorWanted`:

    const mine = (by?: string) =>
      roomsKeeper(brain)
        ? doorIsMine(brain, knock.at, false)
        : by
          ? by === brain.name ||
            !brain.peopleInView.some((seen) => seen.name === by)
          : !brain.peopleInView.some(
              (seen) => isCargo(seen.job) && seen.name < brain.name,
            );

`cargo.ts:84`:

    export function isCargo(title: string): boolean {
      return /cargo|quartermaster/i.test(title);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:886`, the Quartermaster's only knock:

    // A knock at its office door, while it is in there: one of its technicians has word for it.
    const knock = brain.knockAt;
    const atDoor =
      !!knock &&
      !!brain.office &&
      knock.room === brain.office &&
      brain.location === brain.office &&

## How it was found

Read from the code. Not seen in a round. CARGO-12 is the related fault of a workmate who is down or in cuffs counting as about; this one is the Quartermaster, who is never going to go, counting as the one whose turn it is.

## How to fix it

1. In `mine(undefined)`, use `isTechnician(seen.job)` (supply.ts) in place of `isCargo`, and skip anyone `down` or `cuffed` in `peopleInView`.
2. Optionally skip a technician whose `doing` the window cannot see; if that is not to hand, a short stagger (the `stagger` helper in guarding.ts) for the later names, so that the second technician goes if the first has not within a few seconds, does the same job.

## How to test the fix

- Simulator: two technicians and a Quartermaster in the bay, the Quartermaster's name sorting first; send a knock from inside the Warehouse. One technician must go to the door.
- Type check.
