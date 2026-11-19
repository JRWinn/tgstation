---
id: TRA-05
title: Word that an older crate has come or is still waiting wipes out the head's newer order in hand, so the Captain's no to the newer one is never read and those it was for are never ordered for again
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1261, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1272, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1242, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1382, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1574
fix: Keep the Quartermaster's order number on the head's order from its Noted line, put the order number in every word about crates, and clear the order in hand only when the word is about that order
---

## What is wrong

The Head of Personnel has one order in hand at a time (`brain.requisition`). It knows nothing that ties a message about crates to that order: not the Quartermaster's book number (it reads "Noted, order 3" and throws the number away) and not the crate numbers (those arrive later). So it takes every message about crates as being about the order in hand:

- "Your order has come in: crate #N ..." sets `brain.requisition = null`, whichever order the crate came on.
- "Still waiting at cargo: crate #N from your order ..." also sets `brain.requisition = null` while an order is asked, on the reasoning in the comment, "A crate that is waiting is an order that has come in". That is only true of the order the crate belongs to.

The head's next order is often in hand while an older crate is still about. A crate waits five minutes in the bay before cargo reminds anyone (`CREW_NPC_HELD_OVERDUE`), and a janitor is often slower than that, held at a staff meeting or at the counter. A lost crate is ordered again by the Quartermaster as a new order of its own, which docks later still. Meanwhile any of the head's staff can come up short and the head sends a second order.

When the old word wipes the new order, the head forgets that order was ever sent. The Quartermaster still has it. What follows depends on how the Quartermaster's order ends:

- It comes in: the "has come in" message still sends someone (`sendFor` does not need the order in hand). No harm beyond the cue the LLM is given being false meanwhile.
- The Captain says no, or the Quartermaster cannot order it: "The Captain has said no to order 4" is read only `if (isCargo(job) && sentOrder && sentOrder.askedAt !== null)`. With `sentOrder` null it is dropped. The asks it was for stay `ordered: true, told: false` for good, and `noteAsk` refuses to note anything more from those people (the stuck state HEAD-02 describes, reached another way).
- The head sends a newer order for others: the Quartermaster's same-order check (`takeOrder`) finds the forgotten one open with the same crate from the same head and answers "Noted, order 4 already", so the head believes its new order is in hand when it is the forgotten one, for other people.

Concrete case, with the Quartermaster: at 12:00 order 3 (one crate for Jan) docks as crate #12 and the head sends Jan for it. Jan is called into the 12:00 staff meeting first. At the meeting Mo says it is short; the head sends order 4 for Mo at 13:30 and is told "Noted, order 4". The budget, 400 credits lighter after order 3, makes order 4 more than half of what is free, so the Quartermaster asks the Captain. At 17:10 cargo's reminder about #12 reaches the head: "Still waiting at cargo: crate #12 from your order." The head sends the next janitor for #12 and sets `requisition = null`. At 17:40 the Captain answers no. The Quartermaster sends "The Captain has said no to order 4: 1 Janitorial Supplies Crate. It will not be ordered." The head drops it. Mo's ask stays ordered and untold, and at every meeting after Mo reports it is short and the head notes nothing.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1257`, in `readsMessage`:

    if (isCargo(job) && ARRIVED_WORDS.test(text)) {
      for (const crate of cratesIn(text)) {
        sendFor(brain, crate.number, crate.kind);
      }
      brain.requisition = null;
      return;
    }

and at line 1266:

    if (isCargo(job) && STILL_WAITING_WORDS.test(text)) {
      for (const number of numbersIn(text)) {
        sendFor(brain, number);
      }
      // A crate that is waiting is an order that has come in, whether or not word of that ever
      // reached it. The order is done with: it is not asked for again as one that never came.
      if (sentOrder && sentOrder.askedAt !== null) {
        brain.requisition = null;
      }
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1242`, the refusal, read only with an order in hand:

    if (isCargo(job) && sentOrder && sentOrder.askedAt !== null) {
      if (NOTED_WORDS.test(text)) {
        sentOrder.heardBack = true;
        return;
      }
      if (REFUSED_WORDS.test(text) || CANNOT_ORDER_WORDS.test(text)) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1382` and `:1574`, the two lines that carry no order number:

    `Your order has come in: ${itemised}. Send someone to the Cargo Lobby counter with the number to collect ${several ? 'each one' : 'it'}.`
    `Still waiting at cargo: ${waiting[1]} from your order. Send someone to the Cargo Lobby counter with the number, please.`

## How it was found

Read from the code, the head's reader and the Quartermaster's lines. Not seen in a round. The simulator's `qm` and `qmlost` scenarios have only one order from the head at a time, so they cannot show it.

## How to fix it

1. On the head's order, keep the Quartermaster's number: in `readsMessage`, when `NOTED_WORDS` matches, store `sentOrder.n = Number(match[1])`.
2. In `quartermaster.ts`, begin every word to an orderer about an order with its number, in a form the head can read: "Order 3 has come in: crate #12 (...)", "Still waiting at cargo, order 3: crate #12 ...", "Lost at cargo, order 3: ...". `noteDocked` and the `WAITING_TOLD_WORDS` branch both have the order to hand. Keep the words the head already matches (`order has come in`, `still waiting at cargo`) so older lines still read.
3. In `head.ts`, clear `brain.requisition` only when the number in the message is the order in hand's (`sentOrder.n`). When no number is given (a technician with no Quartermaster aboard, whose order has none), keep today's rule.
4. Better still, keep a list of the orders the head has sent (`brain.sentOrders`, each with its number and the people it was for) instead of one slot, so that a refusal for any of them puts the right asks back to not ordered.

## How to test the fix

- Type check from `tgui/`.
- Simulator: a `qm` variant with a Captain who answers no to the second order, in which the first crate waits five minutes before anyone collects it. Pass if, after the no, the second asker's need is noted again at the next meeting and ordered.
- In the next round's `pda.log`, after any "The Captain has said no to order N" sent to the Head of Personnel, look for the asker being ordered for again within two meetings.
