---
id: QM-07
title: An order a technician has said it has is waited on with no time limit, so any word that does not come back leaves that technician busy and the money spoken for until the round ends
kind: gap
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:674, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:214, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:346, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:941
fix: Give a taken order a deadline past the server's six-minute shuttle limit, after which the Quartermaster asks the technician face to face whether it has come in, and failing an answer puts it back to be given again and tells whoever ordered
---

## What is wrong

See also: CARGO-01, CARGO-02 and CARGO-03, which each describe one way the word back is lost, and HOLE-08 for the dead and silent in general. Each of those proposes mending its own path. This is the Quartermaster's side, where one safety net would catch all of them and the cases below that none of them covers.

Once a technician has said "Order 3, right away.", the order is `given` with `taken` set, and nothing in `quartermaster.ts` looks at the time again. The only ways out of `given` are the words "order 3 has come in:" (`noteDocked`) and "order 3 did not go through" (`NOT_PLACED_WORDS`). Until one of them is heard:

- `freeTechnicians` leaves that technician out. With one technician no order is ever given out again; with two, a second such order ends ordering for the round.
- `moneyFree` counts the order's cost as spent, so later orders are held for money or put to the Captain that would not be.
- `giveStep` for that order answers "waiting to hear that they have it" (`wait: true`) or nothing, and the head who ordered hears nothing more: no "held up", no "not coming".

Ways the word never comes, besides the three findings above:

1. **The technician dies, is knocked out, or is put in the brig after saying "right away" and before placing it.** Its window has the order, its body cannot act. Nobody else is given it.
2. **The window is closed and opened again** before the technician has set off to place it (it was waiting for an order already on the go to come in first: `brain.orderPending` in the `GIVEN` plan, `cargo.ts:999`, or had not yet got to the step). A walk to the console already begun is not lost: the server carries the errand through and keeps `order_via` and `order_ref`. Every crew member's memory goes. The Quartermaster reads its book back, and `readBook` sets `taken = true` for every "Given to" line, on the stated reasoning "Written down as given, it was given. Whoever has it will say when it comes in." The technician's `brain.givenOrder` is gone and the server has no record (an order not yet placed sets nothing on the controller), so nobody will ever say anything about it.
3. **A human player in the technician's job** who did say something the code took as "right away" (for instance by typing the words), places it, and never says "has come in".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:674`, `freeTechnicians`:

    const busy = new Set(
      ledger.orders
        .filter((order) => order.state === 'given')
        .map((order) => order.givenTo),
    );

`quartermaster.ts:214`, `moneyFree`:

    const spoken = ledger.orders
      .filter((order) => order.state === 'cleared' || order.state === 'given')
      .reduce((total, order) => total + order.cost, 0);

`quartermaster.ts:346`, in `readBook`:

    } else if (given) {
      order.state = 'given';
      order.givenTo = given[1];
      order.givenAt = now;
      // Written down as given, it was given. Whoever has it will say when it comes in.
      order.taken = true;

`quartermaster.ts:800`, the only timer on a given order, which stops once `taken` is set:

    if (
      order.state === 'given' &&
      !order.taken &&
      order.givenAt !== null &&
      brain.now - order.givenAt > TAKEN_WAIT_DS
    ) {

The server's own limit on a shuttle run is `CREW_NPC_SUPPLY_TIMEOUT`, 6 minutes (`code/modules/llm_crew/_defines.dm:54`), after which it gives the order up on its side (CARGO-01).

## How it was found

Read from the code. Not run, not seen in a round.

## How to fix it

1. Add `TAKEN_STANDS_DS`, about 12000 (20 minutes: the six-minute shuttle limit, a walk, a meeting, and room to spare). Keep `givenAt` as the time it was given, and add `checkedAt?: number` and `checks?: number` to `LedgerOrder`.
2. In `syncTasks`, when an order is `given` and `taken` and `brain.now - (order.checkedAt ?? order.givenAt) > TAKEN_STANDS_DS`, give the Quartermaster a task (say `qm_check`, item the order number) to walk up to `givenTo` and ask, word for word: "Sam, has order 3 come in?". Face to face, as every word between them is.
3. On the technician's side (`cargo.ts` `overhears`), answer that line from what it knows, in fixed words the Quartermaster reads: if `brain.givenOrder?.n` is 3 and not placed, "Order 3, right away." again and place it; if placed and still pending, "Order 3 is on its way."; if it has no such order, "Order 3 did not go through." (which the Quartermaster already reads: it puts the order back to `new` and gives it again).
4. With no answer in a minute, or the technician `down`, `cuffed`, or not to be found at the post after the usual wait, count a check. After two, treat it as "did not go through": back to `new`, `givenTo` cleared, a line in the book, and the orderer told by PDA that it is being placed again. That frees the technician and the money.
5. In `readBook`, keep `taken = true` but set `checkedAt` to `now - TAKEN_STANDS_DS + 1800`, so an order read back from the book is checked three minutes after the window opens, not twenty.
6. Whether a check should also go to the Captain as "held up at cargo" after the second failure is a question for the owner.

## How to test the fix

In `tools/llm_crew/book.ts`: an order `given` and `taken` twenty minutes ago with no word; the Quartermaster must have a check task, and after the technician answers "Order 3 did not go through." the order must be `new`. A second case: the book is read back with a "Given to" line; the check comes three minutes in. In `tools/llm_crew/sim.ts`, kill the technician just after it says "right away": the order must end up given to the other technician. In a round, grep `game.log` for "has order" lines from the Quartermaster.
