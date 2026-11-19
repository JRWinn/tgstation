---
id: MEM-09
title: The second person to ask for the same work is never told it is done, and an order merged into an old task reports to the first asker
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:90, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:410, tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:51
fix: Keep a list of everyone waiting on a task, not one askedBy, and owe each of them word when it is done, the latest superior first
---

## What is wrong

A task has one `askedBy`. When the same work is asked for again by someone else, `addTask` finds the open task and keeps the first asker:

    existing.askedBy ??= task.askedBy;

Everything that tells someone the work is done goes by that one name: `wordOwed` (the driver's "X, that is done." step and the "You have finished what X asked for" line in `describeWork`), the look order's report (`reportLine`, and the PDA report to `task.askedBy` in `planOrders`), the janitor's "I cannot shift the mess" word, `choice.ts` ("X is waiting on it").

Concrete cases:

1. A technician sends the janitor a PDA call to a mess in the Bar (`askedBy: Donna`). Before it gets there, the Captain stops it in the hallway: "Tolly, clean up the Bar, now." `takeToldWork` raises the task to `emergency` and leaves `askedBy` as Donna. The janitor tells the Captain it is on it, cleans the Bar, and is owed word to Donna only. The Captain, who gave the order and may be standing in the Bar, is never told it is done.
2. The Head of Personnel orders the janitor to look at the Kitchen and report back. A minute later the Captain gives it the same order. It is the same task (`findTask(LOOK, { place: 'Kitchen' })`): the report goes to the Head of Personnel, by name, and `task.from` stays where the first order was given (`noteOrdered`: `task.from ??= brain.location`), so it walks back there to report, not to the Captain.
3. If the first look had already been made (`task.found` set) and not yet reported, the second order is answered with the findings of the first look, however old.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:90`, in `addTask`:

    if (existing) {
      if (URGENCY_ORDER[task.urgency] < URGENCY_ORDER[existing.urgency]) {
        existing.urgency = task.urgency;
      }
      existing.askedBy ??= task.askedBy;

`tasks.ts:410`, `wordOwed`, by the one name:

    !!task.askedBy &&
    inView.has(task.askedBy),

`jobs/orders.ts:51`, `noteOrdered`: `task.from ??= brain.location;`

## How it was found

Read from the code. Not run, not seen in a round log.

## How to fix it

1. Add `waiting?: string[]` to `Task` in `types.ts`: everyone who asked for it or told the NPC of it. In `addTask`, push the new asker if not there already. Keep `askedBy` as "who it answers to about this": set it to the new asker when the new ask comes from a superior (it is the urgency that rises to `emergency`), otherwise leave it.
2. `wordOwed`: a done task is owed to each name in `waiting` not yet told. Keep `reported` per name (`toldDone?: string[]`), and drop the task once every name is told or `KEEP_DONE_DS` is up.
3. `afterSaying`: mark told only the names in view.
4. For a look order given again: when the new ask is from someone else, clear `found` and set `from` to where it is now, so it looks again and reports to the one who asked last. Whoever asked first is told too, through step 2.
5. Keep the driver's "X, that is done." line as it is; it is said once for each person owed.

## How to test the fix

- A table of cases for `addTask` and `wordOwed`: a PDA call from Donna then an order from the Captain for the same room; after `finishTask`, `wordOwed` with both in view gives both names.
- `bun tools/llm_crew/sim.ts quiet` on the janitor and order scenarios.
- Type check from `tgui/`.
