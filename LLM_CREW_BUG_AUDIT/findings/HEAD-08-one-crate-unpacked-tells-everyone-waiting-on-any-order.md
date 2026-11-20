---
id: HEAD-08
title: Word that one crate is unpacked tells everyone the head has ordered for that their things have come, including those whose order has not arrived
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1279, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:316, tgui/packages/tgui/interfaces/CrewBrain/types.ts:1381
fix: Record on each ask the order and crate numbers it is waiting on, and on word that crate N is unpacked tell only the asks whose crate that was
---

## What is wrong

When one of its staff sends "Crate #12 is unpacked in the Custodial Closet", the head marks every ask that is ordered and not yet told as told, and sends each asker but the sender "what you asked for has come. It is in the Custodial Closet." It does not look at which order or which crate each ask was for. The asks carry nothing that would let it: `{ who, what, at, ordered, told }`.

Two orders can be out at once. The requisition is cleared as soon as cargo says an order "has come in", well before the crate is collected and unpacked, so the next meeting's needs make a new order while the first crate is still on its way to the closet.

Concrete case: Ann needs supplies at the 2-minute meeting. Her order comes in as crate #12 at about minute 9, and Carl is sent for it. At the 12-minute meeting Bob says he needs supplies too; the head orders again. At minute 14 Carl sends "Crate #12 is unpacked in the Custodial Closet." The head tells Ann and Bob both that what they asked for has come. Bob's order is not even at the station. Bob goes to the closet (`supplyStep`: "your PDA says what you asked for has come"), finds whatever Ann has left, and sets `suppliesSentAt`, so he does not ask again for `SUPPLIES_WAIT_DS`. When Bob's own crate does come in and is unpacked, there is no untold ask left, so nobody is told.

`sendFor` has the same blindness: "those who asked for what is in it first" is every ordered, untold ask, of whatever order, so the asker of the second order may be sent for the first order's crate.

With one kind of crate in `SUPPLIES` today, the harm is a wrong message and a wasted walk. Once a second kind is added (the light replacer plan), a janitor would be told its light bulbs have come because a box of mops was unpacked.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1279`, in `readsMessage`:

    const unpacked = text.match(UNPACKED_WORDS);
    if (unpacked) {
      const number = Number(unpacked[1]);
      const pickup = brain.pickups.find((it) => it.number === number);
      ...
      for (const ask of brain.asks) {
        if (!ask.ordered || ask.told) {
          continue;
        }
        ask.told = true;
        if (ask.who === from) {
          continue;
        }
        brain.toTell.push({
          to: ask.who,
          line: `${ask.who.split(' ')[0]}, what you asked for has come. It is in the ${room}.`,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:316`, in `sendFor`:

    const askers = brain.asks
      .filter((ask) => ask.ordered && !ask.told)
      .map((ask) => ask.who);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1257`, the requisition dropped on arrival, before any crate is collected:

    if (isCargo(job) && ARRIVED_WORDS.test(text)) {
      for (const crate of cratesIn(text)) {
        sendFor(brain, crate.number, crate.kind);
      }
      brain.requisition = null;

## How it was found

Read from the code, not seen in a round.

## How to fix it

1. Give each ask an `order` stamp: a counter `brain.orderSeq` bumped when a requisition is made in `syncTasks`, written into the requisition and onto each ask when it is marked `ordered`.
2. When "has come in" arrives, `sendFor` knows the requisition it is clearing: write that stamp, and the crate kind, onto each `pickups` entry it makes.
3. On "crate #N is unpacked", find the pickup for N, and mark told only the asks with that pickup's order stamp and whose job's supply matches the pickup's `what`. If there is no pickup for N (it was lost from memory), fall back to today's behaviour.
4. In `sendFor`, take as askers only the asks with the stamp of the order the crate belongs to.

## How to test the fix

- Simulator: two janitors asking at two meetings, with the first crate unpacked after the second order is placed. Pass if only the first asker is told at that point, and the second is told when the second crate is unpacked.
- Type check from `tgui/`.
- In a round's `pda.log`, each "what you asked for has come" should follow an "is unpacked in" for a crate ordered after that person asked.
