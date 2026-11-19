---
id: ASYNC-03
title: Which janitor is putting its mop back is kept by task number alone, and every janitor numbers its tasks from 1
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:127, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:157, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:239, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198
fix: Key puttingBack by brain id and task id (or keep it on the brain), and clear it in stopSession
---

## What is wrong

`puttingBack` is one `Set<number>` at the top of `janitor.ts`, shared by every janitor in the window. It holds task ids. But task ids are numbered per crew member: every brain starts at `nextTaskId: 1`. So janitor A's task 4 and janitor B's task 4 are the same entry.

`changeForScrubbing` puts a task in the set when the janitor has both hands full and must take its mop and bucket back before it can pick up soap or a rag, and takes it out only when that janitor holds no mop or bucket. In between, the set says "this one has begun putting its gear back" for whoever else has a task with that number.

Concrete case: two janitors, Ann and Bob, both told of a mess that wants scrubbing, and both happen to have it as task 4.

1. Ann holds a mop and a bucket. `brain.holding.length >= 2 && inTheWay.length > 0`: `puttingBack.add(4)`. Ann walks back to the closet.
2. Bob holds a mop in one hand and has the other free, with a rag in his bag. All he needs is to take the rag out. In `changeForScrubbing` for Bob: `holding.length` is 1, so nothing is added; `inTheWay` is `['mop']`, so nothing is deleted; `puttingBack.has(4)` is TRUE because of Ann.
3. Bob is sent back to the closet with his mop and puts it down there, then takes up the rag. He has given up his mop for nothing, and walked to the closet and back.

The set is also not cleared when the window closes (`stopSession` clears `expected.ts` and `rounds.ts` only), so an entry from an earlier sitting can catch a new brain's task of the same number in the same way.

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

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:239`, each brain numbers its own tasks:

        nextTaskId: 1,

`brain.ts:198`, `stopSession`, which does not clear it.

## How it was found

Read from the code. Not seen in a round. It needs two janitors with scrub jobs of the same number at once, which the task numbering makes likely when both are told of the same messes in the same order.

## How to fix it

1. Key the set by brain and task: `puttingBack` becomes `Set<string>` holding `` `${brain.id}:${task.id}` ``, at the `add`, `delete` and `has` in `changeForScrubbing` and the `delete` in `JANITOR.afterActing` (`janitor.ts:909`). Better still, keep it on the task itself (`task.puttingBack = true`), which goes when the task goes and needs no clearing. `Task` in `types.ts` takes optional fields already (`wantsScrub`, `cleanedSome`).
2. If it stays module-level, export a `clearPuttingBack()` and call it from `stopSession` beside `clearExpected()`.

## How to test the fix

- Simulator: two janitors, both given the same two scrub messes in the same order, one holding mop and bucket and one holding a mop with a rag stowed. The second must take the rag out where it stands (a `pick_up` of the rag), not walk to the closet.
- Type check from `tgui/`.
