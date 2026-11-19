---
id: TRA-02
title: A head who asks again at the counter is ordered a second crate though cargo is already holding one for it, and the head cannot hear a spoken word that its crate is in
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1859, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2059, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:646, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1177, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1257
fix: At the counter, answer a head's order with the number of any crate already held for it in a fixed line and offer no order for that kind, and have the head read that line, and an overheard has-come-in, the same as the PDA message
---

## What is wrong

The one place where a lost "your order has come in" could mend is the counter: the head comes back, face to face, and the technician is standing beside the crate's record. Instead the technician orders the same thing again, and the head could not take in the answer if one were given.

How the head comes back to the counter with an order that has in fact come in:

- With no Quartermaster aboard, or after the Quartermaster did not answer (`viaCounter`, see `QM_SILENT`), the head asks a technician at the counter and waits for a PDA with the manifest number. `syncTasks` in `head.ts` asks again when nothing has been heard for `ORDER_OVERDUE_DS` (10 minutes): it sets `order.askedAt = null`, and `requisitionStep` takes it to the counter again, with the same words.
- The PDA with the number is the thing that goes missing. Test rounds lose PDA messaging about 26 minutes in (memory: "Station power fails early"; HOLE-06). The technician's `message` to the head comes back "would not send", the server keeps it eight minutes and then drops it, and the notice owed is struck off on the first try (`tool_message`). The crate sits in the bay, held for the head.

What happens at the counter the second time:

1. `offers` in `cargo.ts` offers the `order` tool to anyone who is a head, if the console is free (`!brain.orderPending`) and nobody is at the door or collecting. It does not look at `brain.heldCrates`. Nor does `agrees` or `fills`.
2. The LLM is told, in `cues`, "You are holding for collection: crate #12 for Hal Pott", and told the same head is asking it to order a crate of janitorial supplies. It is free to take the order, and the plain fallback for a dead model (`hears`) takes it with no LLM at all.
3. A second crate is bought. The head hears nothing more by PDA about that one either.

And if the technician's LLM does say "Hal, I already have crate 12 for you", nothing comes of it. The head reads the crate number only out of PDA messages (`readsMessage`: `ARRIVED_WORDS`, `STILL_WAITING_WORDS`). Its `overhears` reads reports, meeting orders and needs, and takes any word from cargo as `heardBack`, nothing else. Nobody is sent for crate #12.

Concrete case, no Quartermaster (or a Quartermaster whose "Noted" never came): at 24:00 the head asks Cora at the counter for a crate of janitorial supplies. Cora places it; the shuttle docks at 27:30 with crate #12. Cora's PDA "Your order has come in: crate #12 ..." will not send. At 34:00 (`askedAt` + 10 minutes) the head is back at the counter: "Cora, I need to order a crate of janitorial supplies for my staff, please." Cora's console is free. The order is taken and crate #13 bought. Nobody is ever sent for either; at the 10-minute meeting the janitors, still short, say so again, and the head cannot order again because its requisition is still open.

With a Quartermaster in the chain it can be three crates: the Quartermaster had the first PDA order in its book (only its "Noted" reply was lost), so it also gives that order to a technician once one is free.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873`, in `offers`, the whole test for whether an order is offered:

    if (
      !askers.some((person) => !!person.command || isHead(person.job)) ||
      brain.orderable.length === 0 ||
      brain.orderPending ||
      // Someone at the door wants the door. Offered an order as well, the LLM sometimes takes it.
      doorWanted(brain) ||
      // Likewise someone come to collect a crate: "I am here for crate 12" is not an order for one.
      (!!brain.pickupAsked && brain.now - brain.pickupAsked.at < PICKUP_ASK_DS)
    ) {
      return [];
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2344`, `hears`, the dead-model fallback, which orders on the same test.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:646`, the second asking:

    if (
      order?.askedAt !== null &&
      order?.askedAt !== undefined &&
      brain.now - order.askedAt > ORDER_OVERDUE_DS
    ) {
      order.askedAt = null;
      order.heardBack = false;
      order.startedAt = brain.now;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1177`, `overhears`: nothing reads a crate number out of speech:

    const order = brain.requisition;
    if (order && order.askedAt !== null && isCargo(jobOf(brain, speaker))) {
      order.heardBack = true;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1257`, the only reader of the number, in `readsMessage`:

    if (isCargo(job) && ARRIVED_WORDS.test(text)) {
      for (const crate of cratesIn(text)) {
        sendFor(brain, crate.number, crate.kind);
      }
      brain.requisition = null;
      return;
    }

## How it was found

Read from the code, both sides of the counter. Not seen in a round. HOLE-06 covers PDAs going quiet as a whole; HEAD-05 covers the Quartermaster getting the same order twice when an unsent PDA goes late. This is the counter's own part: it has what it needs to mend the chain and does the opposite.

## How to fix it

1. In `cargo.ts`, add a helper `heldFor(brain, name)` that returns the held crates (`brain.heldCrates`) whose `for` is that name, not `out` and not `takenBy`.
2. In `overhears`, where a head is heard ordering at the counter (the block that sends heads to the Quartermaster), first check `heldFor(brain, speaker)`. If there are any, and `takeOrder(...)` gives this technician the asking, push a fixed `toTell`, said word for word: "Hal, your order has come in: crate #12 (Janitorial Supplies Crate). Send someone to the Cargo Lobby counter with the number to collect it." The same words as the PDA (`arrived` in `plan` for the `ORDER` task), so one reader serves both.
3. In `offers` and `hears`, return no `order` option while `heldFor(brain, asker)` holds a crate of a kind the asker is now asking for (`itemsAskedFor` on what was heard). A head asking for a different kind is still served.
4. In `head.ts` `overhears`, read a line from a cargo speaker said to it (`said_to === 'me'`) with `ARRIVED_WORDS` or `STILL_WAITING_WORDS` exactly as `readsMessage` does: `sendFor` each crate and clear the requisition. Share the body of that branch as one function so the two cannot drift.
5. Keep the second asking itself: it is the right mend when the order really failed (CARGO-01). The fix only stops it buying what is already there.

## How to test the fix

- Type check from `tgui/`.
- Simulator: in the no-Quartermaster `crew` story, make the fake server answer the technician's "Your order has come in" PDA with `ok` false. Pass if, when the head comes back to the counter ten minutes later, no second order is placed, the technician says the has-come-in line, and the head sends a janitor for crate #4521 within a minute.
- In the next round's `game.log`, grep "order" tool results for two orders placed for the same head with a held crate for it between them; there should be none.
