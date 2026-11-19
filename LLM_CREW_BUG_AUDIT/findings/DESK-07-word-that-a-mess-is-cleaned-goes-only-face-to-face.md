---
id: DESK-07
title: Word that a mess someone called the janitor to is cleaned up is only ever said face to face, so a caller by PDA who is not there is never told
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:410, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:486, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:152, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:933
fix: When a told mess task is done and the caller is not in view, send the sayDone line by PDA once, as orders.ts does for a report, and mark it reported
---

## What is wrong

When a janitor finishes a mess it was told of, the caller is owed word (`task.askedBy`, not `task.reported`). The only way that word goes out is `wordOwed`, which picks done tasks "whose askers are in view", and the driver says it aloud. A finished task is kept for `KEEP_DONE_DS` (6000 ds, ten minutes) and then dropped. So a caller who sent the call by PDA and is somewhere else is never told, and does not know the call is done.

The janitor's other word to a caller does go by PDA: that a mess is beyond it (janitor.ts:455), and that it has no soap or rag (janitor.ts:824). Only "it is done" does not. The look-and-report order in `jobs/orders.ts` does fall back to PDA when the person who gave it is not there (orders.ts:153); this does not.

Concrete case: the Captain, on the Bridge, sends the janitor "There is vomit in the Bar, could you clean it up?" The janitor goes, cleans, stands in the Bar five seconds, and `syncTasks` finishes the task. The Captain is not in view. Ten minutes later the task is dropped. The Captain never hears that the Bar is clean.

For a cargo technician who called by PDA this matters less: cargo watches the rooms it keeps (`work_area_messes`) and its own task closes when the mess is gone. The human Captain, and any head, has no such view.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:410`:

    export function wordOwed(brain: NpcBrain): Task[] {
      const inView = new Set(brain.peopleInView.map((person) => person.name));
      return brain.tasks.filter(
        (task) =>
          task.state === 'done' &&
          !task.reported &&
          !!task.askedBy &&
          inView.has(task.askedBy),
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:486`, the only sender, aloud:

    const owed = wordOwed(brain)[0];
    if (owed?.askedBy) {
      ...
      const say = `${owed.askedBy.split(' ')[0]}, ${job.sayDone?.(owed) ?? 'that is done'}.`;

`tasks.ts:152`, the drop:

    const owedWord = task.askedBy && !task.reported;
    return owedWord && brain.now - (task.doneAt ?? 0) < KEEP_DONE_DS;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:933`:

    sayDone: (task) =>
      task.kind === CLEAN ? `the mess in the ${task.place} is cleaned up` : null,

## How it was found

Read from the code. Not seen in a round. Not checked: whether a task record keeps whether the call came by PDA or aloud (it does not today; `readsMessage` and `workInWords` both make the same kind of task).

## How to fix it

1. Note on the task how the call came: in `readsMessage` set `task.byPda = true` on the task it makes or takes.
2. In the driver, next to the aloud `wordOwed` step, add: a done task with `byPda`, `askedBy`, not `reported`, and the asker not in view, and a PDA to hand, gives a `message` step to `askedBy` with the `sayDone` line ("Captain, the mess in the Bar is cleaned up."), keyed so it is sent once.
3. In the job's `afterActing`, or in the driver's result handling, mark the task `reported` once that message has gone, sent or not, as `pickupsAfterActing` does for "is unpacked in".
4. Keep it to calls that came by PDA: someone who said it aloud in passing is told aloud when next seen, as now.
5. Check the line is not read as a mess call by a janitor it might be sent to: "is cleaned up" has no mess word, but "mess" is in it. Another janitor never calls (syncTasks turns a janitor's call into its own), so a janitor should not be sent this. Cargo's `readsMessage` ignores it.

## How to test the fix

- Simulator: the Captain calls a janitor by PDA to a mess in another room; the janitor cleans it; the Captain is not in view. One PDA message "..., the mess in the X is cleaned up." must be sent, and only one.
- Type check from `tgui/`.
- Next round: `pda.log` should show the line after each call the Captain sends by PDA.
