---
id: TRA-05
title: Word that an older crate has come or is still waiting wipes out the head's newer order in hand, so the Captain's no to the newer one is never read, and once HEAD-08 is fixed those it was for are never ordered for again
kind: bug
severity: low
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1261, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1272, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1242, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1382, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1574
fix: Together with HEAD-08, keep the Quartermaster's order number on the head's order from its Noted line, put the order number in every word about crates, and clear the order in hand only when the word is about that order
---

## What is wrong

The Head of Personnel has one order in hand at a time (`brain.requisition`). It knows nothing that ties a message about crates to that order: not the Quartermaster's book number (it reads "Noted, order 3" and throws the number away) and not the crate numbers (those arrive later). So it takes every message about crates as being about the order in hand:

- "Your order has come in: crate #N ..." sets `brain.requisition = null`, whichever order the crate came on.
- "Still waiting at cargo: crate #N from your order ..." also sets `brain.requisition = null` while an order is asked, on the reasoning in the comment, "A crate that is waiting is an order that has come in". That is only true of the order the crate belongs to.

The head's next order is often in hand while an older crate is still about. A crate waits five minutes in the bay before cargo reminds anyone (`CREW_NPC_HELD_OVERDUE`), and a janitor is often slower than that, held at a staff meeting or at the counter. A lost crate is ordered again by the Quartermaster as a new order of its own, which docks later still. Meanwhile any of the head's staff can come up short and the head sends a second order.

When the old word wipes the new order, the head forgets that order was ever sent. The Quartermaster still has it. What follows depends on how the Quartermaster's order ends:

- It comes in: the "has come in" message still sends someone (`sendFor` does not need the order in hand). No harm beyond the cue the LLM is given being false meanwhile.
- The Captain says no, or the Quartermaster cannot order it: "The Captain has said no to order 4" is read only `if (isCargo(job) && sentOrder && sentOrder.askedAt !== null)`. With `sentOrder` null it is dropped. The asks it was for stay `ordered: true, told: false`, and `noteAsk` refuses to note anything more from those people. **Today that does not last:** the word that wiped the order was about a crate not yet unpacked, and when that crate is unpacked the head tells every ask that is ordered and not told (HEAD-08's fault), so those people are told and take from the old crate. They stay stuck only if that crate is never unpacked (HEAD-02). Once HEAD-08 is fixed so that only the asks on that crate are told, they stay stuck for good.
- The head sends a newer order for others: the Quartermaster's same-order check (`takeOrder`) finds the forgotten one open with the same crate from the same head and answers "Noted, order 4 already", so the head believes its new order is in hand when it is the forgotten one, for other people.

Concrete case, with the Quartermaster: at 12:00 order 3 (one crate for Jan) docks as crate #12 and the head sends Jan for it. Jan is called into the 12:00 staff meeting first. At the meeting Mo says it is short; the head sends order 4 for Mo at 13:30 and is told "Noted, order 4". The budget, 400 credits lighter after order 3, makes order 4 more than half of what is free, so the Quartermaster asks the Captain. At 17:10 cargo's reminder about #12 reaches the head: "Still waiting at cargo: crate #12 from your order." The head sends the next janitor for #12 and sets `requisition = null`. At 17:40 the Captain answers no. The Quartermaster sends "The Captain has said no to order 4: 1 Janitorial Supplies Crate. It will not be ordered." The head drops it. Mo's ask is left ordered and untold. With the code as it is, the next janitor unpacks #12 and the head tells Mo "what you asked for has come" (HEAD-08), so Mo is served from #12 and the dropped no does no harm. With HEAD-08 fixed, nobody tells Mo, and at every meeting after Mo reports it is short and the head notes nothing.

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
4. Do this in the same change as HEAD-08: fixing HEAD-08 alone is what turns this from harmless into a stuck asker.
5. Better still, keep a list of the orders the head has sent (`brain.sentOrders`, each with its number and the people it was for) instead of one slot, so that a refusal for any of them puts the right asks back to not ordered.

## How to test the fix

- Type check from `tgui/`.
- Simulator: a `qm` variant with a Captain who answers no to the second order, in which the first crate waits five minutes before anyone collects it. Pass if, after the no, the second asker's need is noted again at the next meeting and ordered.
- In the next round's `pda.log`, after any "The Captain has said no to order N" sent to the Head of Personnel, look for the asker being ordered for again within two meetings.

## Check

Checked by Opus 5.5. Confirmed as a fault in the code, with severity lowered to low: the harm the write-up gives does not happen with today's code.

- The quotes are the code today: `jobs/head.ts:1241-1275` (`readsMessage`: the refusal read only with an order in hand, `requisition = null` on `ARRIVED_WORDS` whatever the crate, and on `STILL_WAITING_WORDS` while an order is asked), and `jobs/quartermaster.ts:1382` and `:1574`, neither of which names the order. `REFUSED_WORDS` in `jobs/supply.ts:75` does carry the number, but the head never keeps the number from "Noted, order N".
- With `requisition` null the refusal falls through every later branch. It does match `NEED_WORDS` ("Supplies" in the crate's name) but `noteAsk` drops it because the Quartermaster is not one of the head's staff (`head.ts:219`). So the no is lost, as the write-up says.
- What the write-up missed: a wipe needs word about a crate that is still to be unpacked ("has come in" or "still waiting"). The unpacking branch (`head.ts:1279-1303`) then sets `told` on every ask that is `ordered && !told`, whichever order it was on. So Mo is told when #12 is unpacked, before or after the Captain's no, and is served from #12. The asks stay stuck only when that crate is lost too, which is HEAD-02 (confirmed). The other two outcomes in the list (a crate that comes is still sent for; "Noted, order 4 already" for a newer order, after which a no is read against the newer order and its asks are cleared) do no lasting harm either.
- `LLM_CREW_PLAN_QUARTERMASTER.md:156` records that "still waiting at cargo" closing the order was a fix on purpose, for the order the crate belongs to. It did not weigh a newer order in hand, so the fault stands.

So today this is a log and cue that are wrong for a while (low). It becomes the medium fault described the moment HEAD-08 is fixed, so the fix should go in with HEAD-08. Effort medium stands (head.ts and quartermaster.ts). Read from the code only; nothing was run.
