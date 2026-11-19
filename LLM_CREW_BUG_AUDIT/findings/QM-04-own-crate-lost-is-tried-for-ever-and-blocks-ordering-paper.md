---
id: QM-04
title: A crate the Quartermaster ordered for itself that is lost before it opens it is tried for the rest of the round, keeps it out of its office, and stops it ever ordering paper again
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:861, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1692, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:442, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1308, code/modules/llm_crew/crew_npc_quartermaster.dm:364
fix: Mark an own order's crate as done with when it is reported lost or when open_own_crate answers no_such_crate, so the unpack task ends and orderForItself is free again
---

## What is wrong

When the Quartermaster can find no paper it orders a Bureaucracy Crate for itself (`orderForItself`). When a technician says it has come in, the order is marked `docked` with its crate numbers, and `syncTasks` gives it an `UNPACK` task for as long as the order is `own`, `docked`, not `unpacked`, and has crates. Only a successful `open_own_crate` sets `unpacked`.

If that crate is lost first (destroyed, sent back on the shuttle, emptied by someone, or nobody can reach it: `crew_npc_crate_lost` in `crew_npc_held.dm:53`), the server takes it off the held list. A technician then tells the Quartermaster "Ada, crate #12 for Ada Finch is lost: it is no longer aboard the station." `crateLost` reorders it once and writes "Lost" in the book, but leaves the first order as it was: `docked`, not `unpacked`, crates set. So:

1. The `UNPACK` task stays. Its plan is always ready: `open_own_crate` with number 12. The server answers "Cargo is not holding a crate by that number for you." with `no_such_crate`, and `afterActing` does nothing with a failed `open_own_crate`. The driver backs the step off and tries it again, for the rest of the round.
2. `UNPACK` is in the list of tasks that count as busy, so the `OFFICE` task is never added: the Quartermaster no longer goes back to its office between errands. Technicians with word for it go to the office door, knock, wait, and fall back to the PDA (`tellQuartermaster` in `cargo.ts`), which loses the word in the case CARGO-02 describes.
3. `orderForItself` will not order while any own order is `docked && !unpacked`. When the reordered crate has come and been opened and later the Quartermaster runs out of paper again, it never orders more. Its book stays unwritten (`toWrite` grows) for the rest of the round.

The same holds if the crate is lost without anyone telling it: the task loops on `no_such_crate` just the same.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:861`, in `syncTasks`:

    const toOpen =
      !!order.own &&
      order.state === 'docked' &&
      !order.unpacked &&
      (order.crates?.length ?? 0) > 0;

`quartermaster.ts:1692`, in `afterActing`, the only place `unpacked` is set:

    if (task?.kind === UNPACK && act.tool === 'open_own_crate' && ok) {

`quartermaster.ts:442`, in `orderForItself`:

    ledger.orders.some(
      (order) =>
        order.own &&
        (isOpen(order) || (order.state === 'docked' && !order.unpacked)),
    )

`quartermaster.ts:1320`, in `crateLost`, which reorders and leaves the old order as it was:

    if (order && !order.reordered) {
      ...
      order.reordered = true;

`code/modules/llm_crew/crew_npc_quartermaster.dm:364`, the server's answer:

    if(!is_quartermaster() || isnull(entry) || entry.for_name != body.real_name)
    	action_result(CREW_TOOL_OPEN_CRATE, FALSE, "Cargo is not holding a crate by that number for you.", list("no_such_crate" = TRUE))

and `crew_npc_held.dm:83`, where a lost crate is taken off the held list:

    GLOB.crew_npc_held_crates -= entry
    GLOB.crew_npc_lost_crates += entry

## How it was found

Read from the code on both sides, not run and not seen in a round. It needs a station with no paper to be had (so the crate is ordered at all) and the crate to be lost before the Quartermaster opens it, so it is not common; SUP-05 (the shuttle sent off with a full crate aboard) and SUP-10 (a technician tidying the open crate shut) are two ways it can come about.

## How to fix it

1. In `crateLost`, when the order found is `own`, set `order.unpacked = true` (it can never be opened now). Do this whether or not it is reordered.
2. In `afterActing`, when `act.tool === 'open_own_crate'` fails and the result's details carry `no_such_crate`, set `unpacked = true` on the order too, and leave `paperRetryAt` at 0 so `get_paper` is tried again at once (someone may have collected the crate's paper for it). `afterActing` receives `ok` but not the details today: pass the event's `details` through from `driver.ts` the way other jobs read `no_paper`, or read it from `brain.lastResult` if that is kept.
3. Nothing else changes: the reorder made in `crateLost` goes through as now.

## How to test the fix

In `tools/llm_crew/book.ts`: a Quartermaster with an own order docked as crate #12, then `overhears` a technician say "Ada, crate #12 for Ada Finch is lost: it has been destroyed."; there must be no `qm_unpack` task for that order afterwards, and after the reorder is docked and unpacked, a failed `get_paper` must add a new own order. Type check and lint. In a round, grep `game.log` for repeated "open_own_crate" lines for the same number.
