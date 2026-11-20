---
id: JOBS-02
title: A crate errand still on the go half an hour after the head sent for it is thrown away mid-haul or after unpacking, so the head is never told and the empty crate is never taken back
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 9f42272152a, 07fa697a1f8
found_by: Opus 5.5
checked_by: Opus 5.5
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

(Checker's note: the window is narrower than this suggests. A task still at the counter is open between tries, so if the crate is not out by the 30th minute the task is dropped there, which is CARGO-13 and MEM-11. This finding is the errand whose crate comes out in the last few minutes before the 30th, so that the haul, unpacking, message or walk back crosses it.)

The wait to get there is not unusual. CARGO-13 shows the collector can stand at the counter, leave for two minutes (`TRY_AGAIN_DS`) and come back over and over when no technician is at the counter, and the errand only starts once the head has read cargo's arrival message, which may itself sit while the body finishes a meeting. Once the crate is finally out, the haul, the unpacking, the message and the walk back take two to four more minutes.

One concrete case: the Head of Personnel sends the janitor for crate #12 at minute 10. The technicians are busy unloading and away from the counter. The janitor waits, leaves, comes back, and the crate is finally put out at minute 38. At minute 40, halfway to the Custodial Closet, the task is 30 minutes old and open, and is dropped. The haul finishes and the crate is tipped out. The janitor goes back to mopping. The head is never told. The empty crate stays in the closet for the rest of the round.

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

## Check

Confirmed. Read `syncTasks` (`tasks.ts:137-156`, `GIVE_UP_DS = 18000` at line 47, the filter at 154), `addTask` (`createdAt: brain.now`, line 101, never moved after), all of `jobs/pickups.ts` (`readPickup`, `syncPickups`, `planPickups`, `pickupsAfterActing`), `noteResult` in `driver.ts:943-984` (all three `afterActing` calls look the task up by id in `brain.tasks`, so a dropped task gives `undefined`), and the head side (`head.ts:337` and `1279-1287`, the only places an entry leaves `brain.pickups`; the cue at `head.ts:1029`). `take_back` is sent only from `planPickups` for an `unpacked` task (grep of the window). The quotes are today's code.

The case does not survive as first written: a crate handed over at minute 38 of a task made at minute 10 is 28 minutes old, not past 30. Corrected to the drop at minute 40, mid-haul, and a note added on how narrow the window is: before the crate is out the task is open between tries, so anything not out by the 30th minute is dropped at the counter instead (CARGO-13). Severity medium kept: the case is not common, but when it comes the head's cue is stuck for the rest of the round and the empty crate is never taken back.

Effort: kept small. The change is a few lines in `types.ts`, `tasks.ts` and `pickups.ts`, window only. The `keepUntil` fix works: the haul result then finds the task, `unpacked` is set, and the tail has its own half hour. Better still, set it in `planPickups` when it returns the `collect_crate` act as well as in `syncPickups`, since `syncPickups` and `planPickups` see the same `out` and either order works. Build it with MEM-11's `openSince` if that is taken, so the filter is changed once. Nothing was run; not seen in a round.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 9f42272152a.

- JOBS-02: part done. A crate errand sets Task.keepUntil to half an hour on, both when the crate is first seen put out (syncPickups) and when collect_crate works (pickupsAfterActing). Nothing reads it yet. Look in jobs/pickups.ts (KEEP_HAULING_DS). Left: tasks.ts, syncTasks give-up filter: keep a task while `brain.now < (task.keepUntil ?? task.createdAt + GIVE_UP_DS) || task.state === 'blocked'`. Build it with MEM-11. sim.ts: a pickup scenario where the head's message is 29 minutes old when the crate is put out, checking for the haul, an 'is unpacked in' message and a take_back.

Round two (branch crew-bug-fixes-medium): 07fa697a1f8. This finishes the parts left above, apart from any step that waits on the owner.
