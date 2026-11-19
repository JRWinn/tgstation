---
id: LOGB-04
title: The Quartermaster answers one knock at its office door again and again for a minute, walking out and back each time
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1700, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:886, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:148
fix: Clear brain.knockAt in syncTasks as soon as the Quartermaster is out of its office after a knock, not only in afterActing where the task it looks for has already been thrown away
---

## What is wrong

See also: LOGA-04

This is the change log's "The Quartermaster answered one knock five times (23:14:00 to 23:14:38), walking out and back each time", left alone in the 16:50 entry with no cause. It is in five of the afternoon's rounds.

A technician with word for the Quartermaster knocks at its office door. The knock is kept as `brain.knockAt` for a minute (`KNOCK_STANDS_DS`). While it is fresh and the Quartermaster is in its office, `syncTasks` adds a `qm_knock` task, whose step is `go_to` the Cargo Bay. The knock is meant to be cleared in `afterActing`, when that walk's result comes back:

    if (task?.kind === KNOCK) {
      brain.knockAt = null;

But the task is gone by then. As soon as a state update shows the Quartermaster in the Cargo Bay, `syncTasks` sees it is no longer at its door and finishes the task, and the general `syncTasks` in `tasks.ts` drops every finished task that nobody is owed word of, in the same pass. The walk to the next room is a few tiles, so the state update showing it arrived comes in before, or with, the walk's `action_result`. `noteResult` then looks the task up by id, finds nothing, and `task?.kind === KNOCK` is false. `knockAt` is never cleared.

So for the rest of that minute, every time the Quartermaster goes back to its office, the same knock adds a new `qm_knock` task, and out it goes again. The technician has long since said its word and been heard.

The case, `data/logs/2026/11/18/round-17.06.14`, Dalton Jenner (Quartermaster), Rylie Tanner (technician), from `crew_brain.log`:

- 23:13:56 Rylie: "You are at the door of the Quartermaster's Office ... You are knocking." => `knock()`. The only knock Rylie makes in this minute: its next steps are `unload`, `collect_mail`, `message`, `recycle`, `send_shuttle`.
- 23:13:56 Dalton: "Someone is knocking at the door of your office ..." => `go_to("Cargo Bay")`.
- 23:13:59 Rylie tells it order 1 has come in; 23:14:00 Dalton: "Rylie, I have that."; 23:14:02 PDA to the head; 23:14:05 the order book.
- 23:14:08 Dalton: back to its office. 23:14:12: "Someone is knocking at the door of your office" => `go_to("Cargo Bay")`.
- 23:14:16 back; 23:14:22 the knock again; 23:14:27 back; 23:14:31 the knock again; 23:14:35 back; 23:14:38 the knock again.

Five answers to one knock in 42 seconds. The same step, "Someone is knocking at the door of your office", is in `crew_brain.log` 5 times in round-14.28.06, 4 in round-15.52.18 and 9 in round-17.48.05.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:886`, in `syncTasks`:

    const knock = brain.knockAt;
    const atDoor =
      !!knock &&
      !!brain.office &&
      knock.room === brain.office &&
      brain.location === brain.office &&
      brain.now - knock.at < KNOCK_STANDS_DS;
    const answer = findTask(brain, KNOCK);
    if (atDoor && !answer) {
      addTask(brain, { kind: KNOCK, urgency: 'asked', source: 'own' });
    } else if (!atDoor && answer) {
      finishTask(brain, answer);
    }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:148`, in the same pass:

    brain.tasks = brain.tasks.filter((task) => {
      if (task.state === 'done') {
        // A finished task is only kept while someone has yet to hear of it.
        const owedWord = task.askedBy && !task.reported;
        return owedWord && brain.now - (task.doneAt ?? 0) < KEEP_DONE_DS;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1700`, in `afterActing`, the only place the knock is cleared:

    if (task?.kind === KNOCK) {
      brain.knockAt = null;
      if (ok) {
        ledger.cameOutAt = brain.now;
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:964`, where `afterActing` is given the task: `brain.tasks.find((task) => task.id === last.task)`.

## How it was found

Seen in round logs, as quoted, then the cause read in the current code, which is unchanged at each place quoted. That the state update comes before the result is inferred from the loop itself: if the result had found the task, `knockAt` would have been cleared and there would have been one answer. Not seen in the simulator.

The same trap waits for any job whose `afterActing` needs a task of its own that `syncTasks` finishes when the body arrives (`source: 'own'`, no `askedBy`). I did not go through every job for it.

## How to fix it

1. In `quartermaster.ts` `syncTasks`, in the `else if (!atDoor && answer)` branch: if the Quartermaster is out of its office (`brain.location !== brain.office`) and the knock was for its office, set `brain.knockAt = null` and `ledger.cameOutAt = brain.now` before `finishTask`. That is the moment the knock is answered, whatever order the server's messages come in.
2. Keep the `afterActing` branch for the case where the result comes first.
3. Wider, and optional: in `noteResult` (`driver.ts`), keep the task the step was for on `brain.lastAct` itself (the object, not only its id), so `afterActing` gets it even after `syncTasks` has dropped it. That closes the trap for every job at once.

## How to test the fix

- A simulator scenario: a technician with word knocks once at the Quartermaster's office. Want exactly one `go_to` to the Cargo Bay from the Quartermaster in the next minute. The simulator sends state and results in its own order: check it sends the arrival state before the walk's result, or the test will pass without the fix.
- Type check.
- Next round, `crew_brain.log`: "Someone is knocking at the door of your office" once per technician `knock()` step.
