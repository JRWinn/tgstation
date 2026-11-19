---
id: QM-11
title: An order a technician says did not go through is given out again every two minutes with no limit, and whoever ordered is never told
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:640, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1919
fix: Count the failures on the order, tell whoever ordered after the second, and after the third hold it and tell the Captain, instead of giving it out again
---

## What is wrong

When a technician cannot place an order it says "Ada, order 3 did not go through. The console would not take it." The Quartermaster puts the order back to `new` with `retryAt` two minutes ahead, writes "Order 3. Could not be placed." in its book, and when the two minutes are up clears it and gives it out again, to whichever technician is free. Nothing counts how often this has happened, and nobody outside cargo hears of it.

If whatever stops the console goes on (the console has no power or is broken, which SUP-01 and RT-04 say the technician does not check before it walks there; the nearest console is a request-only one; the order needs access the technician lacks), the order goes round for the rest of the round: given, walked to the console, refused, said, written, two minutes, given again. Each lap costs a technician a walk and the Quartermaster a walk to the bay, writes another line on a sheet that only holds about thirty, and holds up any meeting (`syncMeeting` is held while an order is given and not yet taken). The head was told "Noted, order 3 ... I will send you the crate numbers when it comes in" and is told nothing more. Its own fall-back (`ORDER_OVERDUE_DS`, ten minutes) sends the order again, and gets "Noted, order 3 already ... It is in hand."

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580`, in `overhears`:

    const failed = heard.match(NOT_PLACED_WORDS);
    if (failed) {
      const order = ledger.orders.find((it) => it.n === Number(failed[1]));
      if (order && order.state === 'given') {
        order.state = 'new';
        order.givenTo = null;
        order.pick = null;
        order.shortTold = false;
        order.retryAt = brain.now + PLACE_AGAIN_DS;
        ledger.toWrite.push(BOOK.failed(order));
      }
      return;
    }

`quartermaster.ts:640`, in `clearOrders`, which clears it again once `retryAt` has passed:

    if (order.state !== 'new' || brain.now < order.retryAt) {
      continue;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1919`, the technician's side:

    } else {
      brain.givenOrder = null;
      brain.toTell.push({
        to: given.by,
        line: `${firstName(given.by)}, order ${given.n} ${NOT_PLACED}. The console would not take it.`,

## How it was found

Read from the code. Not run, not seen in a round. How often a console refuses an NPC is for the cargo reviewers (SUP-01, RT-04, GAP-20); this finding is only that the Quartermaster has no end to it.

## How to fix it

1. Add `failures?: number` to `LedgerOrder` (`types.ts`). In the branch above, add one.
2. After the second failure, tell whoever ordered by PDA (not for its own order): "Order 3 could not be placed: the console would not take it. I am trying again." Once only.
3. After the third, do not set it back to `new`. Set a held state (reuse `asking` with `waitingTold`, or add `held`), write "Order 3. Could not be placed three times: held." in the book, tell whoever ordered, and name it in the report to the Captain after the next staff meeting the way `supplyReport` names orders waiting on the Captain. Read the new book line in `readBook`.
4. Let a later "go ahead with order 3" from the Captain, or the orderer sending it again, put it back to `new` with the count cleared.
5. The technician's line could carry why (the server's words for the failure) so the Quartermaster can say it; that is the cargo side and optional.

## How to test the fix

In `tools/llm_crew/book.ts`: an order given to Cora; Cora says "Ada, order 3 did not go through. The console would not take it." three times, with the order given again between; after the second the orderer has a PDA in `toTell`, after the third the order is not given again and the book has the held line. Type check and lint. In a round, grep `game.log` for "did not go through" more than twice for one order number.
