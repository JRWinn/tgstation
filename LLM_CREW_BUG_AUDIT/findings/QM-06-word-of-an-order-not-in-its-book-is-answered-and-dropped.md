---
id: QM-06
title: Word that an order has come in is answered I have that even when the order is not in the Quartermaster's book, so the crate numbers reach nobody
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1531, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1371, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:792
fix: Say I have that to has-come-in word only when noteDocked found the order, so the technician falls back to sending the numbers to whoever ordered, and read the book before taking new orders after the window is reopened
---

## What is wrong

A technician tells the Quartermaster "Ada, order 3 has come in: crate #12 (Janitorial Supplies Crate)." The line does not say whom the order was for: the Quartermaster is meant to look that up in its book. In `overhears`, the Quartermaster first answers "Ada... Sam, I have that." (`heardIt()`) and only then calls `noteDocked`. If `noteDocked` finds no order 3 in `ledger.orders`, it returns and does nothing. The technician has heard "I have that", so it marks the word passed (`word_passed`), the server drops the notice, and the technician's fall-back PDA to whoever ordered is never sent. The head is never given the crate number, nobody comes for the crate, and only the reminder rounds of `check_held` will ever bring it up again (to the Quartermaster, who will again know nothing of it).

How the Quartermaster comes to have no order 3 in its head:

- **The window was closed and opened again** (the owner's own note: a full tgui build during a round reloads the Crew Brain window and wipes memory) at a moment when the order book was not readable: no sheet yet, the last sheet full (`order_book_lines` returns null when there is no room left on the last sheet), or no pen. `syncTasks` reads the book only while `ledger.orders` is empty; by the time the book is readable again a new order has been taken, so the book is never read, and `ledger.next` started again from 1.
- **Orders it took before it had any paper.** At the start of the shift its book is in its head (`toWrite`). A window reopened then loses them, but the technicians it gave them to still have them, and report them.

In the first case it is worse than silence: the new orders reuse the old numbers. "Order 1 has come in" from the technician who had the old order 1 is taken as the new order 1. `noteDocked` marks the new order docked with the old order's crates and sends the new orderer the wrong crate number, and when the new order's own crate comes, `noteDocked` sees order 1 already `docked` and drops it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1531`, in `overhears`:

    const docked = heard.match(DOCKED_WORDS);
    if (docked) {
      heardIt();
      noteDocked(brain, speaker, Number(docked[1]), docked[2]);
      return;
    }

`quartermaster.ts:1370`, `noteDocked`:

    const order = ledger.orders.find((it) => it.n === n);
    if (!order || order.state === 'docked') {
      return;
    }

`quartermaster.ts:792`, in `syncTasks`, the book read only into an empty head:

    if (!ledger.read && brain.book) {
      if (ledger.orders.length === 0 && brain.book.length > 0) {
        ledger.orders = readBook(brain.book, brain.now, brain.name);
        ledger.next = Math.max(0, ...ledger.orders.map((order) => order.n)) + 1;
      }
      ledger.read = true;
    }

`code/modules/llm_crew/crew_npc_quartermaster.dm:133`, why the book can be null while the sheets are on the body:

    if(!is_quartermaster() || isnull(sheet_to_write_on()) || isnull(pen_on_body()))
    	return null

## How it was found

Read from the code. Not run, not seen in a round. It needs the window to be reopened mid-round, so it is not common; it is written up because the cost is a crate nobody is told of, and the first part of the fix is two lines.

## How to fix it

1. Make `noteDocked` return TRUE when it knew the order (including the `docked` already case, which is the same word heard twice) and FALSE when it did not. In `overhears`, call `heardIt()` only when it returns TRUE. Unanswered twice, the technician's `tellQuartermaster` falls back to the PDA and sends whoever ordered "Your order has come in: ..." itself, which is right.
2. Do the same in `readsMessage` for the PDA form: nothing to answer there, but nothing is lost either, since the technician sent its PDA to the Quartermaster only for the Quartermaster's own order.
3. Send the server the sheets' lines whether or not there is room to write: split `order_book_lines` into "what is written" (any sheet on the body) and "can write" (a sheet with room and a pen), and send both. `brain.book` is then never null while the book is on the body, and the read at the top of `syncTasks` always happens first.
4. When the book is read after orders were taken (step 3 should make this rare), merge instead of skipping: renumber the orders in the head from `max(book numbers) + 1`, rewrite their "Order N. From" lines in `toWrite`, and keep the book's orders.

## How to test the fix

In `tools/llm_crew/book.ts`: a Quartermaster with an empty ledger hears "Ada, order 3 has come in: crate #12 (Janitorial Supplies Crate)." from a technician; there must be no "I have that" in `toTell`. A second case: the book has orders 1 and 2, `brain.book` is null at the first `syncTasks`, an order is taken, then the book is readable: the new order is numbered 3. Type check and lint.
