---
id: MEM-11
title: Work blocked for over thirty minutes never lapses while blocked, and is dropped the instant it can go on again
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: a1ef28d2779, f2c1d5d51db
found_by: Opus 5.5
checked_by: Opus 5.5
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

1. Add `openSince?: number` and `blockedSince?: number` to `Task` (`types.ts`). Note that `blockTask(task, blockedOn)` takes no brain and no time, and has eight callers in five job files; do not change its signature. Keep both fields in the `syncTasks` filter instead, which runs every sync with `brain.now` to hand: for a blocked task, `task.blockedSince ??= brain.now` and `task.openSince = brain.now`; for an open one, `task.blockedSince = undefined`. A task unblocked by its job then has `openSince` from the last sync it was blocked in, a second or so ago.
2. In the same filter, give up on open work by `brain.now - (task.openSince ?? task.createdAt) < GIVE_UP_DS`.
3. Give blocked work a limit of its own, longer, say an hour (`BLOCKED_GIVE_UP_DS`, from `blockedSince`), so a told-of mess nobody let it in to does not sit in every prompt all round. Whether whoever asked should be sent word when a told task is given up this way ("I could not get into the Cargo Bay about the mess") is a question for the owner; it was not checked whether the janitor already sends such word when nobody lets it in.
4. Leave done tasks as they are.

## How to test the fix

- A table of cases for `syncTasks` with a fake job: a task made at t=0, blocked at t=100, unblocked at t=24000; it is still on the list after that `syncTasks`. A task blocked from t=0 is gone after the blocked limit.
- With the real janitor (no fake job needed): `janitor()` from `tools/llm_crew/fixtures.ts`, `know` the Library, `addTask` a told `clean` there, set `blockedPlaces = ['Library']`, `at(b, 3100, ...)` (blocked `NO_WAY_IN`), `at(b, 27000, ...)` (still there), then `blockedPlaces = []` and `at(b, 27100, ...)`: today the task is gone; after the fix it is open and on the list. A told task made at t=3000 and never blocked must still go at t=21000+, as now.
- `bun tools/llm_crew/sim.ts quiet` on the janitor scenarios with a locked room.
- Type check from `tgui/`.

## Check

Checked by Opus 5.5. Read `syncTasks`, `blockTask` and `addTask` (`tasks.ts`; `GIVE_UP_DS = 18000`, game deciseconds, 30 minutes), the janitor's `syncTasks` (`jobs/janitor.ts`: the `via` branch and the `NO_WAY_IN` branch both call `blockTask(task, null)` as soon as the way is open) and `meets` (clears `letInAsks` when cargo staff turn up). The job syncs run first and the filter last, as the finding says. A told task is not made again: the janitor only adds tasks for `brain.messPlaces`, what the body has seen, and a mess behind a locked door was never seen. Searched the change log and plans for `GIVE_UP_DS`, "forgotten business" and blocked tasks: nothing.

Ran a throwaway script (scratchpad, bun, `fixtures.ts` `janitor()` and `at()`, which calls `syncTasks`): a told `clean` task in the Library with `blockedPlaces = ['Library']` was blocked "you could not find a way in" at t=3100 and still kept at t=27000; with `blockedPlaces` emptied, the next `at()` left it open and off the list. Confidence raised to sure.

One precision: what matters is the task's age from when it was made, not how long it was blocked. A task made 31 minutes ago and blocked for only the last five is dropped the same way when it is unblocked. Medium stands: told work silently lost in a case that needs a long wait, but locked rooms are common. Effort small: the filter and two fields, in `tasks.ts` and `types.ts`.

## Fix so far

Round A1 (a-brain, owner's answer A to MEM-11): built in f2c1d5d51db. When the give-up filter in `syncTasks` (`tasks.ts`) drops work someone asked for (blocked an hour, or open past its time), whoever asked is sent word once: "<first>, I could not get to the mess in the Bar." (worded for the kind in `givenUpWhat`), face to face if in view, else by PDA (`tellGivenUp`). Table: `tools/llm_crew/brain5-givenup.ts`. Not played.
