---
id: QM-09
title: A Captain who says no to the Quartermaster's own crate of paper is asked about a new one every five minutes for the rest of the round
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:438, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1673
fix: In orderForItself, do not order again a crate the Captain has refused, or not for a long while, and say so in the cues
---

## What is wrong

When the Quartermaster can find no paper, `afterActing` for a failed `get_paper` sets `paperRetryAt` five minutes ahead and calls `orderForItself` with the Bureaucracy Crate. `orderForItself` holds back only while one of its own orders is open or come in and not opened. A refused order is neither (`isOpen` is false for `refused`). So:

1. The Bureaucracy Crate costs 640 credits. With under 1,280 credits free it is more than half the budget, so it is a big purchase, and `clearOrders` asks the Captain: "Captain, order 4: I want 1 Bureaucracy Crate: 640 credits of 1,100 in the budget. Yes or no?"
2. The Captain answers "No." The order is refused.
3. Five minutes later the `PAPER` task is unblocked, `get_paper` fails again (nothing has changed), and `orderForItself` makes order 5 for the same crate. The Captain is asked again, and if they do not answer, asked a second time three minutes after.
4. The same every five minutes, while the budget stays under 1,280 and no paper turns up.

Each new order also takes a number and a line in the book (in the Quartermaster's head, since it has no paper).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:442`, in `orderForItself`:

    if (
      ledger.orders.some(
        (order) =>
          order.own &&
          (isOpen(order) || (order.state === 'docked' && !order.unpacked)),
      )
    ) {
      return;
    }

`quartermaster.ts:1673`, in `afterActing`:

    if (act.tool === 'get_paper' && !ok) {
      ledger.paperRetryAt = brain.now + PAPER_AGAIN_DS;
      const crate = brain.orderable.find((kind) => PAPER_CRATE.test(kind));
      if (crate) {
        orderForItself(brain, crate);
      }
    }

`quartermaster.ts:369`, `isOpen`, which counts a refused order as done with:

    return order.state !== 'docked' && order.state !== 'refused';

## How it was found

Read from the code. Not run, not seen in a round. It needs a station with no paper to be found and a low budget, so it is not common.

## How to fix it

1. In `orderForItself`, also return when an own order for the same crate was refused within, say, the last 20 minutes (keep the refusal time on the order: `refusedAt`, set in `readAnswer`). Or never order it again after a refusal: that is a question for the owner (does a no stand for the shift?).
2. Add a cue while that holds: "The Captain has refused your order for paper. You keep your order book in your head." so the model does not promise a book it will not have.
3. Leave `get_paper` itself trying every five minutes: someone may fill a paper bin.

## How to test the fix

In `tools/llm_crew/book.ts`: a Quartermaster with a budget of 1,000 and `get_paper` failing; the Captain answers "No."; after six minutes of `syncTasks` and another failed `get_paper`, there must be no new own order and no new question to the Captain in `toTell`.
