---
id: TRUST-07
title: The Quartermaster takes "order N did not go through" and "crate N is lost" from anyone in a cargo job, and places the order again or buys the crate again
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 7beb93b9b1b
found_by: Opus 5.5
checked_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1550, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1308, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19
fix: Take did-not-go-through only from the technician the order was given to, and put a big reorder from a lost line to the Captain instead of carrying the old approval over
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

1. Did-not-go-through: add `&& order.givenTo === speaker` to the test, as for `TAKEN_WORDS`. Only the technician who has the order can say it failed. This is safe for the NPC technicians: the only place they say it is `afterActing` in `jobs/cargo.ts:1923`, for `brain.givenOrder`, the order given to that body, and `givenTo` is set from the same full name (`order.pick`, or the "Given to" line read back). This half is the one that buys twice and is a one-line change.
2. Lost: do **not** require the speaker to be the technician the order was given to, or the one who reported it docked. Whoever at the post first sees a lost crate writes it off and passes the word (`write_off_lost_crates` in `crew_npc_held.dm`, "One of those at the post does this for any one crate"), so with the counter and shuttle split between two technicians the one who says it is lost is often not the one who placed the order. That rule would stop honest reorders in most rounds. What the Quartermaster can fairly check from what it knows:
   - the crate number is one of `order.crates` (it is already), and
   - the speaker is someone it counts as its staff (`isTechnician` on a name it can see or has on its PDA list, as now).
   Beyond that, a technician's word is a technician's word, as it would be to a player Quartermaster.
3. Carry the approval over only for a reorder that is not a big purchase. A reorder at or over the Captain's limit is put to the Captain as any big order is (`approved = null`, so the order goes through the usual asking). That bounds what a false "lost" can cost without the Captain's word.
4. Whether to go further (ask the orderer before reordering, as HEAD-02 touches on) is the owner's question: the plan decided "cargo reorders it once by itself".
5. A small one: `isTechnician` should be the exact job ("Cargo Technician"), not any title with "cargo" in it. HOLE-01 has the general fix for loose titles.

## How to test the fix

- `tools/llm_crew/book.ts` covers the Quartermaster's book and already imports `QUARTERMASTER`. Add, through `QUARTERMASTER.overhears` with Sam and Kim on the PDA list as Cargo Technicians: an order given to Sam; "Ada, order 4 did not go through." heard from Kim: the order stays `given` to Sam. The same from Sam: it goes back to `new` and "Order 4. Could not be placed." is to be written.
- A lost case: a docked order of Sam's; the lost line from Kim: one new order (Kim is staff and may have written it off). A docked order that was a big purchase approved by the Captain: the reorder's `approved` is null, not `'captain'`.
- Type check.

## Check

Read `overhears` in `jobs/quartermaster.ts` (the `NOT_PLACED_WORDS` branch at `:1580` and the `TAKEN_WORDS` one after it, which does test `givenTo === speaker`), `crateLost` (`:1308`, `again.approved = order.approved`), `isTechnician` in `jobs/supply.ts:19`, where the technicians say the line (`jobs/cargo.ts:1923`), and where a crate is written off on the server (`write_off_lost_crates`, `crew_npc_held.dm`). Ran a throwaway bun script (scratchpad, not the repo): with order 9 given to Sam Tech, `QUARTERMASTER.overhears` of "Ada, order 9 did not go through." from Kim Lie, another Cargo Technician, set order 9 back to `new`. So the double placing is real. Confirmed. Two corrections: the fix's rule for lost lines (only from the technician who had the order or reported it docked) would block honest reorders, because whoever at the post sees the loss first writes it off; replaced with step 3, which keeps the reorder but stops a big one going through on the old approval. And the harm is bounded: a player who has the Cargo Technician job can already place orders at the console with cargo access, so this matters most for an honest slip (a player technician saying the wrong order number) rather than as a way in. Severity stays medium (spends the budget twice, in a case that needs a player in cargo). Effort small.
