---
id: QM-12
title: A lost crate is meant to be ordered again once, but each reorder is a new order with its own once, so crates that keep being lost are bought again and again
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1320, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1337
fix: Carry the reorder mark onto the new order (again.reordered = true, or a reorderOf link) so a reorder that is lost in turn is told and written but not bought a third time
---

## What is wrong

The plan and the change log say: "A lost crate it has ordered again, once." `crateLost` does that by marking the order the lost crate came from, `order.reordered = true`, and making a new order (`again`) for the same crates. But `again` is made by `newOrder`, which starts with `reordered` unset. When the crate that comes in on `again` is lost too, `crateLost` finds `again` as the order, sees it has not been reordered, and orders it again. And so on, for as long as crates go on being lost.

Lost here is the server's word (`crew_npc_crate_lost` in `crew_npc_held.dm:53`): destroyed, off the station, emptied, or "nobody can get to it" after `CREW_NPC_LOST_AFTER` failed trips. A cause that goes on (a crate square nobody can reach, the shuttle being sent off with a full crate aboard as in SUP-05, someone emptying crates in the bay) loses every crate the same way. Each time cargo pays again (400 to 640 credits for these crates, more for several), the head who ordered is sent "Lost at cargo ... I am having it ordered again, as order N", and the book fills with Lost and From lines.

Concrete case: the Head of Personnel orders a Janitorial Supplies Crate (order 3). It comes in as crate #12 and is put on a square nobody can reach; after the set number of failed trips it is written off as "nobody can get to it". A technician tells the Quartermaster; `crateLost` makes order 4. Crate #13 comes in on order 4, goes to the same square, and is lost the same way. `crateLost` now finds order 4, whose `reordered` is unset, and makes order 5. Every round of this is another 400 credits.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1316`, in `crateLost`:

    const order = ledger.orders.find((it) =>
      it.crates?.some((crate) => numbers.includes(crate.number)),
    );
    let again: LedgerOrder | null = null;
    if (order && !order.reordered) {
      ...
      again = newOrder(
        ledger.next++,
        order.from,
        order.fromJob,
        items,
        costOf(brain, items),
      );
      again.own = order.own;
      // Whoever cleared the order cleared this much of it already.
      again.approved = order.approved;
      order.reordered = true;

`quartermaster.ts:263`, `newOrder`, which leaves `reordered` unset on the new order.

The same holds when the book is read back: `readBook` marks the order on a "Lost:" line as reordered, and the new order's own "From" line gives it none.

## How it was found

Read from the code. Not run, not seen in a round.

## How to fix it

1. In `crateLost`, set `again.reordered = true` as well, so the reorder is the last. Its loss then takes the `else if (order)` branch: written in the book as lost with no reorder, and the orderer told "It will have to be ordered again".
2. Better, so that it survives the book being read back: add `reorderOf?: number` to `LedgerOrder`, set it on `again`, write it in the book's From line for a reorder ("Order 4. Reorder of order 3. From ..."), read it in `readBook`, and treat an order with `reorderOf` as already reordered.
3. Since a head NPC does not act on "It will have to be ordered again" (HEAD-02), the second loss also needs telling the Captain or the head in words it acts on; that is HEAD-02's fix, not this one.

## How to test the fix

In `tools/llm_crew/book.ts`: an order docked as crate #12; a technician says it is lost; order 4 is made. Order 4 docks as crate #13; a technician says that is lost; no order 5 may be made, and the book gets "Order 4. Lost: crate #13." with no "Ordered again". Type check and lint.
