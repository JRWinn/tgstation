---
id: TRA-08
title: Someone who asks while an order is on its way gets a crate of their own ordered, though the crate coming holds enough for them, and is then served from the first crate anyway
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:241, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:635, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1257, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1288
fix: Count an order in hand as good for count times PER_CRATE people and put a later asker on it while there is room, ordering afresh only for those it cannot cover
---

## What is wrong

The Head of Personnel works out the number of crates from the number of people short: one crate for every `PER_CRATE` of them (three today; two per TRA-01). An order for one janitor is one crate, which holds enough for more than one.

While that order is on its way, a second janitor runs short and tells the head. The head notes the ask, but `syncTasks` makes no new order while one is in hand (`!brain.requisition`). The moment word comes that the first order has come in, `brain.requisition` is cleared, and on the next state update a new order is made for the second janitor alone: `orderFor` takes every ask not yet ordered. One more crate is bought, and under the Quartermaster's half rule it is likely to be put to the Captain, since the first one has just come off the budget.

Then the first crate is unpacked, and the head tells everyone ordered for and not yet told that their things have come (HEAD-08), the second janitor among them. The second janitor goes to the closet and takes the second tool out of the first crate. When the second crate comes, nobody is waiting on it: `sendFor` sends whichever janitor's turn it is, who hauls it to the closet and unpacks it for nobody.

So the second need is met twice and paid for twice. The fault is not that the second janitor is told (it is right that it should be served by the first crate, which has room) but that the head orders for it at all.

Concrete case, with the Quartermaster: at the 2-minute meeting Jan is short. One crate, order 1. At 4:30 Mo's space cleaner runs dry; Mo tells the head; the ask is noted. At 7:00 the head is told order 1 has come in as crate #12 and sends Jan for it; `requisition` is null; at 7:01 the head sends "I need to order a crate of janitorial supplies for my staff, please." for Mo, order 2. The budget has 1,000 credits less 400; 400 is more than half of 600, so the Captain is asked. At 9:00 Jan unpacks #12; the head tells Mo "what you asked for has come"; Mo takes the space cleaner. At 13:00 crate #13 comes in, and the janitor whose turn it is carries it to the closet and unpacks it there.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:241`, `orderFor`: an order is only ever for asks not yet ordered, and never looks at what is on its way:

    const waiting = brain.asks.filter((ask) => !ask.ordered);
    ...
        count: Math.min(CRATES_MAX, Math.ceil(people.length / PER_CRATE)),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:635`, in `syncTasks`, the new order made as soon as the old one is cleared:

    if (
      !brain.requisition &&
      !brain.meeting &&
      waiting.length > 0 &&
      !meetingSoon &&
      (brain.metOnce || brain.now - oldest > BATCH_DS)
    ) {
      brain.requisition = orderFor(brain);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1257`, the old one cleared on word that it has come:

    if (isCargo(job) && ARRIVED_WORDS.test(text)) {
      for (const crate of cratesIn(text)) {
        sendFor(brain, crate.number, crate.kind);
      }
      brain.requisition = null;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1288`, and on unpacking, every ordered ask told, whatever crate it was ordered on (HEAD-08).

## How it was found

Read from the code. Not seen in a round. HEAD-08 is the unpacking half of this; this is the ordering half, and fixing HEAD-08 alone (telling only the asks whose crate it was) would leave the second janitor waiting for crate #13 with crate #12's spare tool lying in the closet.

## How to fix it

1. Give each line of the order in hand the number of people it can serve: `count * PER_CRATE` (or the per-crate number from TRA-01's fix).
2. In `noteAsk`, if an order is in hand (sent or not yet come) with a line for this person's kind of supply that has room (`line.people.length < line.count * PER_CRATE`), add the person to `line.people` and mark the ask `ordered: true`. They wait on that crate, and are told when it is unpacked.
3. Keep that order's lines after word that it has come in, until its crates are unpacked, so that someone who asks between the crate docking and its unpacking is put on it too, not ordered for afresh. One way: move the lines to `brain.pickups` (which already holds the crate number and room) with the people they cover.
4. With HEAD-08's fix (asks tied to the crate they were ordered on), step 2 is what puts the second janitor on crate #12.

## How to test the fix

- Type check from `tgui/`.
- Simulator: a `qm` variant in which a second janitor runs out two minutes after the first order goes in. Pass if only one order is sent, and both janitors are told when crate #4521 is unpacked.
- In the next round's `pda.log`, count the head's "I need to order" lines against the crates unpacked with nobody short at the time.
