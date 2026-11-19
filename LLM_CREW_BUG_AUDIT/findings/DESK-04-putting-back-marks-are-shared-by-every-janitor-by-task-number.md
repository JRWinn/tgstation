---
id: DESK-04
title: The note that a janitor is putting its mop and bucket back is kept by task number for every janitor at once, so one janitor's note steers another
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:127, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:157, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:239, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:99
fix: Keep the putting-back note on the task itself, as task.puttingBack, instead of in a module-wide Set of task ids
---

## What is wrong

`puttingBack` is one `Set<number>` for the whole window, holding task ids. Task ids are not unique across crew: every brain starts at `nextTaskId: 1` and counts up on its own. So janitor A's task 12 and janitor B's task 12 are the same entry.

`changeForScrubbing` reads the set to decide whether to put both the mop and the bucket back (hands were full when it began) or only to pick up the rag (a hand is free). With two janitors whose task numbers meet:

1. Janitor A, hands full with a mop and a bucket, is called to a cobweb. Its task is number 12. `puttingBack.add(12)`.
2. Janitor B, holding only a mop with the other hand free, is called to a cobweb. Its task also happens to be number 12. In `changeForScrubbing`, `holding.length >= 2` is false and `inTheWay.length === 0` is false, so the set is left alone, and `puttingBack.has(12)` is TRUE from A.
3. B walks back to the Custodial Closet to put its mop down, though it had a hand free and only needed to take the rag up.
4. When B's hands are empty, `puttingBack.delete(12)` also wipes A's note. A, halfway through, has a free hand by then and only picks the rag up, which is harmless here, but the two are steering each other.

Entries are also never removed when a task is finished or dropped part way, so the set only grows over a round (by small numbers, a few a round).

The window reloading (a rebuild, a closed window) clears it, as it clears the brains.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:127`:

    /** The mess jobs for which a janitor has begun putting its mop and bucket back, by the task's id: see changeForScrubbing. */
    const puttingBack = new Set<number>();

`janitor.ts:157`, in `changeForScrubbing`:

    if (brain.holding.length >= 2 && inTheWay.length > 0) {
      puttingBack.add(task.id);
    } else if (inTheWay.length === 0) {
      puttingBack.delete(task.id);
    }
    if (inTheWay.length > 0 && puttingBack.has(task.id)) {

`brain.ts:239`, each brain's own count:

    nextTaskId: 1,

`tasks.ts:99`, in `addTask`:

    id: brain.nextTaskId++,

## How it was found

Read from the code. It needs two janitors with the same task number both on a scrubbing call at once, which is not common. Not seen in a round.

## How to fix it

1. Add an optional `puttingBack?: boolean` to `Task` in `types.ts`, next to `wantsScrub`.
2. In `changeForScrubbing`, set and clear `task.puttingBack` in place of `puttingBack.add` and `puttingBack.delete`, and test `task.puttingBack` in place of `puttingBack.has(task.id)`.
3. In `afterActing` (janitor.ts:909), set `task.puttingBack = false` in place of `puttingBack.delete(task.id)`.
4. Remove the module-level `puttingBack`.

## How to test the fix

- Type check from `tgui/`.
- Simulator: two janitors, one holding a mop and a bucket and one holding only a mop, both called to a cobweb with task numbers made equal. The one with a free hand must pick up its rag where it stands.
