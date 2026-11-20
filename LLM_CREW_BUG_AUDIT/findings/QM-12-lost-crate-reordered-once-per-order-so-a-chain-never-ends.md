---
id: QM-12
title: A lost crate is meant to be ordered again once, but each reorder is a new order with its own once, so crates that keep being lost are bought again and again
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 3181e9e3cbd
found_by: Opus 5.5
checked_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1320, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1337
fix: Mark the reorder itself as reordered in crateLost, and in readBook mark order N from a Lost line that says Ordered again as order N, so a lost reorder is told and written but not bought again
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

1. In `crateLost`, set `again.reordered = true` next to `order.reordered = true`, so the reorder is the last one cargo makes by itself. Its loss then takes the `else if (order)` branch: written in the book as lost with no reorder, and the orderer told "It will have to be ordered again".
2. Make it survive the book being read back, with no new line in the book: in `readBook`, when a "Lost:" line ends "Ordered again as order N.", keep N in a set, and set `reordered = true` on order N when its "From" line is read (the Lost line is written just before the reorder's From line, see the two `toWrite.push` calls in `crateLost`, so N is in the set by then). Do not change `BOOK.taken`: its From line is what `readBook` parses as a new order.
3. Since a head NPC does not act on "It will have to be ordered again" (HEAD-02), the second loss also needs telling the Captain or the head in words it acts on; that is HEAD-02's fix, not this one.

A side point, not this fault: `reordered` is per order, not per crate. An order of two crates that loses one, then later the other, has only the first bought again. If the owner wants "each lost crate once", key the mark by crate number instead (a `reorderedCrates` list on the order).

## How to test the fix

In `tools/llm_crew/book.ts`, driving `QUARTERMASTER.overhears` as the file already drives `readsMessage`: a Quartermaster whose book has order 3 docked as crate #12; a technician's line "Ada, crate #12 for Hop Kins is lost: nobody can get to it." makes order 4. Mark order 4 docked as crate #13; the same line for #13 must make no order 5, and `ledger.toWrite` must get "Order 4. Lost: crate #13." with no "Ordered again". Then a read-back case: `readBook` of the book with "Order 3. Lost: crate #12. Ordered again as order 4." followed by order 4's From line must give order 4 `reordered: true`. Type check and lint.

## Check

Read `crateLost` (`quartermaster.ts:1308`), `newOrder` (`:263`), `readBook` (`:296`, the Lost line at `:361`) and the `LOST_TOLD_WORDS` branch of `overhears` (`:1550`). The quotes are what the code says today. Ran a throwaway bun script (in the scratchpad, not the repo) that made a Quartermaster with order 3 docked as #12 and fed `QUARTERMASTER.overhears` three lost lines in turn, each for the crate of the last reorder. It printed `3:docked:R 4:new`, then `4:docked:R 5:new`, then `5:docked:R 6:new`: each loss bought another. `reordered` is set nowhere else (grep). The plans say cargo reorders "once by itself, since it is the order the head already gave" (`LLM_CREW_PLAN_SECURE_AREAS.md` section 5 and its decisions table, "Cargo, once"), so a chain of reorders with no word from the head goes against what the owner decided. Nothing in the change log changes it. Severity stays medium: it needs a loss that happens again and again, which is not most rounds, but each time it spends the budget. The fix in step 2 was changed: the original proposed a new "Reorder of order 3" wording in the From line, which `readBook`'s From parser would have to learn; the Lost line already carries the link.
