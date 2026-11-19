---
id: TRUST-07
title: The Quartermaster takes "order N did not go through" and "crate N is lost" from anyone in a cargo job, and places the order again or buys the crate again
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1550, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1308, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19
fix: Take did-not-go-through only from the technician the order was given to, and lost only for a crate cargo is holding, from the technician who reports it, before ordering it again
---

## What is wrong

The Quartermaster's technicians tell it things in fixed words, and it acts on them as facts. Two of them spend money:

- "Ada, order 4 did not go through." The order goes back to `new` and is given to a technician again two minutes later.
- "Crate #1779 for Jane Marsh is lost: ..." The Quartermaster writes a new order for the same crates, with the old order's approval carried over (`again.approved = order.approved`, so a big purchase is not put to the Captain again), and tells Jane it is ordered again.

Who may say them is anyone whose job, by the voice name looked up in view or on the PDA list, matches `/cargo/i` (`isTechnician`). That is every player who takes the Cargo Technician job, and anyone whose card or PDA says "cargo" anywhere. Neither line is checked against anything the Quartermaster knows:

- For did-not-go-through, the code does not check that the speaker is the one the order was given to. The very next block, for "Order 4, right away.", does check it (`order.givenTo === speaker`). So a technician who never had order 4, or a player, frees an order an NPC technician is placing right now. Two minutes on, it is given to whoever is free, and both place it: two crates bought for one order.
- For lost, nothing checks that cargo is holding such a crate, or that the speaker had it. Any crate number from the book that has docked (`order.crates`) is enough. The numbers are read out aloud by the technicians at the counter (TRUST-04).

One concrete case:

1. The Quartermaster gives order 4 (two Janitorial Supplies Crates, 800 credits, approved by the Captain) to its NPC technician Sam. Sam says "Order 4, right away." and walks to the console.
2. A player who is a Cargo Technician walks into the Quartermaster's office and says "Ada, order 4 did not go through."
3. `overhears`: `isTechnician("Cargo Technician")` is true. `NOT_PLACED_WORDS` matches. `order.state === 'given'`, so it is set to `new`, `givenTo` to null, and `retryAt` two minutes on.
4. Sam places order 4. Two minutes later the Quartermaster gives order 4 to its other technician, who places it as well. 1,600 credits are spent, and the Captain approved 800.

The same player saying "Crate #1779 for Jane Marsh is lost: it fell down the chute." after it docked has the Quartermaster buy it again with no question to anyone.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580`, in `overhears`:

    const failed = heard.match(NOT_PLACED_WORDS);
    if (failed) {
      const order = ledger.orders.find((it) => it.n === Number(failed[1]));
      if (order && order.state === 'given') {
        order.state = 'new';
        order.givenTo = null;
        ...

and right after it:

    const taken = heard.match(TAKEN_WORDS);
    if (taken) {
      const order = ledger.orders.find((it) => it.n === Number(taken[1]));
      if (order && order.state === 'given' && order.givenTo === speaker) {

`quartermaster.ts:1550`, the lost line, and `crateLost` at `:1308`, which orders again with the old approval.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19`:

    export function isTechnician(title: string): boolean {
      return /cargo/i.test(title) && !isQuartermaster(title);
    }

## How it was found

Read from the code. Not seen in a round: no player has played cargo alongside the crew NPCs.

## How to fix it

1. Did-not-go-through: add `&& order.givenTo === speaker` to the test, as for `TAKEN_WORDS`. Only the technician who has the order can say it failed.
2. Lost: in `crateLost`, reorder only when the crate's order was given to the speaker (`order.givenTo === speaker`, or the speaker is the one who reported it docked, which `noteDocked` can keep as `order.dockedBy`). Anyone else's word that a crate is lost is passed on to whoever ordered, as now, but the reorder waits for the Quartermaster's own technician to say so. With no such technician aboard, it asks the Captain, as for a big purchase.
3. Carry the approval over only for a reorder the rule in step 2 allows. A big reorder from anyone else goes to the Captain.
4. A small one: `isTechnician` should be the exact job ("Cargo Technician"), not any title with "cargo" in it. HOLE-01 has the general fix for loose titles.

## How to test the fix

- `tools/llm_crew/book.ts` covers the Quartermaster's book. Add: an order given to Sam; "Ada, order 4 did not go through." heard from Kim, another technician: the order stays `given` to Sam. The same from Sam: it goes back to `new`.
- A lost case: a docked order of Sam's; the lost line from Kim: no new order in the ledger. From Sam: one new order.
- Type check.
