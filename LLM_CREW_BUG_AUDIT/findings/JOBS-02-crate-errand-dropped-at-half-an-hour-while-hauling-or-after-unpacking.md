---
id: JOBS-02
title: A crate errand still on the go half an hour after the head sent for it is thrown away mid-haul or after unpacking, so the head is never told and the empty crate is never taken back
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:154, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:111, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:298, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:964
fix: Give a Task a keepUntil that the give-up rule in syncTasks honours, and have pickups push it on when the crate is put out, when collect_crate succeeds and when the empty is being taken back
---

## What is wrong

See also: MEM-11 (the same 30-minute rule in `syncTasks`, for a task dropped the moment it is unblocked after a long block; its `openSince` fix and this one's `keepUntil` touch the same filter and are best built together, but neither alone mends the other's case).

See also: CARGO-13. That finding covers the errand being dropped by the 30-minute rule while the body is still waiting at the counter. This one is the same rule striking later, once the crate is in the body's hands, which leaves more broken behind it.

`syncTasks` throws away every task that is not blocked once it is 30 minutes old (`GIVE_UP_DS = 18000` deciseconds), counted from `createdAt`. A crate errand's `createdAt` is the moment the head's PDA message was read in `readPickup`. Nothing in `pickups.ts` ever moves it on, and after the crate is out the task is always `open`: `syncPickups` unblocks it on every update (`blockTask(task, null)`) until it is unpacked, and after that it skips the task (`continue`), leaving it open.

So if the errand reaches the haul, the unpacking, the PDA message or the walk back with the empty after the 30th minute, the task is filtered out of `brain.tasks` in the middle of it:

1. **Mid-haul.** The `collect_crate` errand is running on the server. Its result comes back to `noteResult`, which looks the task up by id (`brain.tasks.find((task) => task.id === last.task)`), finds nothing, and passes `undefined` to `pickupsAfterActing`. That returns at once (`task?.kind !== COLLECT`), so `task.unpacked`, `brain.suppliesSentAt` and `brain.suppliesAt` are never set.
2. **After unpacking.** The task is gone before `planPickups` gives the `message` step. The head never gets "Crate #12 is unpacked in the Custodial Closet". In `head.ts` the entry stays in `brain.pickups` for good, so the head's cues say "Cargo is holding crates of yours for collection, and you have sent for them" for the rest of the round (`head.ts:1028`), and the staff who asked for the supplies are never sent "what you asked for has come" (`head.ts:1290` onward only runs on that message).
3. **The empty crate.** The server has set `crate_to_return` in `crate_collected` (`crew_npc_held.dm:419`). The only thing in the window that ever sends `take_back` is `planPickups` for a task that is `unpacked`. With the task gone, nobody does: the empty crate stays in the room where it was tipped out, and cargo never gets it back to send on the shuttle.

The wait to get there is not unusual. CARGO-13 shows the collector can stand at the counter, leave for two minutes (`TRY_AGAIN_DS`) and come back over and over when no technician is at the counter, and the errand only starts once the head has read cargo's arrival message, which may itself sit while the body finishes a meeting. Once the crate is finally out, the haul, the unpacking, the message and the walk back take two to four more minutes.

One concrete case: the Head of Personnel sends the janitor for crate #12 at minute 10. The technicians are busy unloading and away from the counter. The janitor waits, leaves, comes back, and is finally handed the crate at minute 38. At minute 38.5, halfway to the Custodial Closet, the task is more than 30 minutes old and open, and is dropped. The haul finishes and the crate is tipped out. The janitor goes back to mopping. The head is never told. The empty crate stays in the closet for the rest of the round.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:148`, in `syncTasks`:

    brain.tasks = brain.tasks.filter((task) => {
      if (task.state === 'done') {
        ...
      }
      return brain.now - task.createdAt < GIVE_UP_DS || task.state === 'blocked';
    });

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:111`, in `syncPickups`: an unpacked task is left open and its age is never touched:

    if (task.unpacked) {
      ...
      continue;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:304`, in `pickupsAfterActing`:

    if (task?.kind !== COLLECT) {
      return;
    }
    if (act.tool === 'collect_crate' && ok) {
      task.unpacked = true;

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:964`: the task handed to the job is found by id, after the filter may have removed it.

## How it was found

Read from the code: `tasks.ts` `syncTasks` and `addTask`, all of `pickups.ts`, `noteResult` in `driver.ts`, `crate_collected` and `tool_take_back` in the server, and the unpacked handling in `head.ts`. Not seen in a round.

## How to fix it

1. In `types.ts`, add an optional `keepUntil?: number` (server time, deciseconds) to `Task`.
2. In `syncTasks` (`tasks.ts`), keep a task while `brain.now < (task.keepUntil ?? task.createdAt + GIVE_UP_DS)` or it is blocked. Nothing else changes for tasks that do not set it.
3. In `pickups.ts`:
   - in `syncPickups`, when `crateOf(brain, task)?.out` is first seen, set `task.keepUntil = brain.now + GIVE_UP` (a local 18000, or export the constant from `tasks.ts`);
   - in `pickupsAfterActing`, on `collect_crate` with `ok`, set `task.keepUntil = brain.now + GIVE_UP`. The tail (message, walk back) then has a full half hour of its own, and the take-back cannot be left without a task.
   Do not touch `createdAt`: it is the tie-breaker in `workInOrder`, and moving it would reorder the errands.
4. For the case that still runs out (a take-back that fails for half an hour), CARGO-13's step 5 applies: a dropped task with `askedBy` should be told to the asker. Keep it to that finding.

## How to test the fix

- Simulator: a `pickup` scenario with the clock jumped so the head's message is 29 minutes old when the crate is put out. The collector must haul it, message the head with "is unpacked in", and send `take_back`.
- Type check. In a round, grep `game.log` for `take_back` after every "is unpacked in" PDA line in `pda.log`, and for crates left standing in the Custodial Closet at round end.
