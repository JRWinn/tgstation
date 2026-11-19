---
id: MEM-11
title: Work blocked for over thirty minutes never lapses while blocked, and is dropped the instant it can go on again
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:148, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:484, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:887
fix: Count a task's age for giving up from when it last became open, not from when it was made, and give blocked work a limit of its own
---

## What is wrong

See also: JOBS-02, CARGO-13 (the same 30-minute rule in `syncTasks`, striking a crate errand that is open and still going; JOBS-02's `keepUntil` and this finding's `openSince` are two different changes, and neither alone mends the other's case, but they touch the same filter and are best built together).

`syncTasks` gives up on any task older than 30 minutes (`GIVE_UP_DS`, from `task.createdAt`), unless it is blocked:

    return brain.now - task.createdAt < GIVE_UP_DS || task.state === 'blocked';

So a blocked task is kept for ever, however stale. And the age is from when the task was made, not from when it was last blocked. The filter runs **after** the jobs' `syncTasks` in the same call. So a task that was blocked for more than 30 minutes and is then unblocked by its job is removed in that very call, the moment it could at last go on. Told-of work is not made again by the job (only work the body sees for itself is), so it is gone.

Concrete case, the janitor called to a locked room (every step is existing code):

1. A technician's PDA call sends the janitor to a mess in the Cargo Bay: a `clean` task, `source: 'told'`, `via: 'Cargo Lobby'`, `askedBy` the technician.
2. It goes to the lobby, knocks and asks. Nobody comes for a minute (`LET_IN_WAIT_DS` 600): `blockTask(task, NOT_LET_IN)` in `jobs/janitor.ts`. The task is blocked, so it never lapses: it sits in every prompt's work list ("cannot go on yet: clean up the mess in Cargo Bay (Donna told you of it) ...").
3. Forty minutes later a cargo technician comes into view. `JANITOR.meets` deletes `brain.letInAsks` for the door (it is older than `ASK_AGAIN_AFTER_DS`), "the one reason to ask again". Or someone holds the door for it (`brain.doorHeld`).
4. In the next `syncTasks`, the janitor's sync finds `givenUp` false and calls `blockTask(task, null)`: the task is open.
5. The filter at the end of `syncTasks`: open, made 40 minutes ago. Dropped.
6. The janitor does not ask again or go in. A door held open for it is walked past.

The same holds for a told-of clean task blocked `NO_WAY_IN` (a room in `blockedPlaces`): the day the way is clear it is gone. Other blocked kinds (the QM's paper, a technician's order on the shuttle, mail waiting) are made again by their jobs each sync while they hold, so for them it only loses what was kept on the task (`unheard`, `passedOn`, `knockedAt` and the like on cargo's word-to-the-head tasks).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:148`, the end of `syncTasks` (quoted above), with:

    /** How long (deciseconds) a task may sit before it is given up on as forgotten business. */
    const GIVE_UP_DS = 18000;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:484`, in its `syncTasks`:

    const givenUp =
      !!asks &&
      hasAsked(brain, task, asks) &&
      brain.now - asks.at > LET_IN_WAIT_DS &&
      !brain.doorHeld;
    blockTask(task, givenUp ? NOT_LET_IN : null);

`jobs/janitor.ts:887`, `meets`, which clears the asks when cargo staff turn up.

## How it was found

Read from the code. The order of `syncTasks` (jobs first, filter last) and the janitor's unblocking were traced by hand. Not run: a 40-minute wait was not simulated. Not seen in a round log. Not listed in the change log or plans.

## How to fix it

1. Add `openSince?: number` to `Task` (`types.ts`). In `addTask` set it to `brain.now`. In `blockTask`, when the state goes from `blocked` to `open`, set `openSince = brain.now`.
2. In the `syncTasks` filter, give up on open work by `brain.now - (task.openSince ?? task.createdAt) < GIVE_UP_DS`.
3. Give blocked work a limit of its own, longer, say an hour (`BLOCKED_GIVE_UP_DS`), so a told-of mess nobody let it in to does not sit in every prompt all round. Whether whoever asked should be sent word when a told task is given up this way ("I could not get into the Cargo Bay about the mess") is a question for the owner; it was not checked whether the janitor already sends such word when nobody lets it in.
4. Leave done tasks as they are.

## How to test the fix

- A table of cases for `syncTasks` with a fake job: a task made at t=0, blocked at t=100, unblocked at t=24000; it is still on the list after that `syncTasks`. A task blocked from t=0 is gone after the blocked limit.
- `bun tools/llm_crew/sim.ts quiet` on the janitor scenarios with a locked room.
- Type check from `tgui/`.
