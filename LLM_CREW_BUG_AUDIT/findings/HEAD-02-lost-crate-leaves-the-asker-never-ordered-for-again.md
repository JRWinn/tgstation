---
id: HEAD-02
title: A crate that is lost, or never unpacked, leaves whoever asked for it noted as ordered for good, so the Head of Personnel never orders for them again
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:222, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:663, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1279, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:594, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:259
fix: Read Lost at cargo in the head's readsMessage, drop that crate's pickup and set its askers back to not ordered unless cargo is reordering it, drop the pickup on the no-such-crate word, and give an ordered and untold ask an age limit after which it is dropped
---

## What is wrong

Once a head has ordered for one of its staff, that ask is `ordered: true, told: false` until word comes that a crate was unpacked. Only then is it `told`, and only told asks are ever dropped. While an untold ask stands, `noteAsk` will not note another from the same person, and `orderFor` takes only asks that are not ordered. So if the unpacked word never comes, that person is never ordered for again for the rest of the round, however often they say at meetings that they need something.

Three ways the unpacked word never comes, all of them sent to the head in set words and all of them dropped by its `readsMessage`:

1. **Cargo loses the crate.** With no Quartermaster aboard, a technician sends the head "Lost at cargo: crate #12 (Janitorial Supplies Crate) from your order. ... It will have to be ordered again, and nobody need come for it." (`cargo.ts:594`). With a Quartermaster aboard the technician tells the Quartermaster instead (`tellQuartermaster`, `cargo.ts:577`), and the Quartermaster sends the head "Lost at cargo: ..." (`quartermaster.ts:1351`). The head's `readsMessage` has no branch for "Lost at cargo": it is not `NOTED_WORDS`, `REFUSED_WORDS`, `ARRIVED_WORDS`, `STILL_WAITING_WORDS` or `UNPACKED_WORDS`, the sender is not its staff, and `noteAsk` ignores anyone who is not its staff. Nothing happens. The Quartermaster reorders a lost crate once (`!order.reordered`, `quartermaster.ts:1320`); that reorder's "has come in" reaches the head's `ARRIVED_WORDS` branch, `sendFor` sends someone for the new number, and the ask heals. So with the standing test crew (which has a Quartermaster) it sticks only on a second loss of the same order ("It will have to be ordered again"). With no Quartermaster it sticks on the first. Either way the old pickup (#12) stays in `brain.pickups` and in `cues` for good.
2. **The janitor is told at the counter there is no such crate.** `pickupsOverhear` finishes its collect task and sends the head "Cargo says there is no crate #12 to collect: it has been lost, or the number is wrong. I have not got it." (`pickups.ts:259`). The head reads it as a message from its staff: not `COMING_WORDS`, not `REPORT_BY_PDA`, and no `NEED_WORDS`. Dropped.
3. **The unpacked message is not sent.** `planPickups` sends it only with a PDA (`brain.hasPda && task.askedBy`), and marks it told after one try "sent or not" (`pickups.ts:314`). The server keeps a message that would not send and tries it again for 8 minutes (`CREW_NPC_UNSENT_KEPT`), so a short blackout does not lose it; a janitor with no PDA, or PDAs down for more than 8 minutes (test rounds lose power about 15 to 26 minutes in), leaves the ask untold.

What softens it: word that any crate is unpacked marks every ordered, untold ask as told, whatever order it was on (`head.ts:1288`, the fault in HEAD-08). So a stuck ask clears if someone else's later order is collected and unpacked. It stays stuck for good when everyone short was on the lost order, which is the usual case: one crate is ordered for up to three (`PER_CRATE`), and janitors start with nothing, so the first meeting's order is for all of them.

Concrete case (no Quartermaster aboard, or the Quartermaster's reorder lost too): Ann, a janitor, says at the 2-minute meeting that she needs something to clean with. The head orders, and the order comes in as crate #12. Ann is sent for it. Before she gets to the counter the crate is lost in the bay; the technician tells the head so. The head does nothing. At the 12-minute meeting Ann says "I need something to clean with." `hearReport` gives `need: true`, `noteAsk` finds Ann's old ask with `!ask.told` and returns. The closing line says "Nobody needs anything." It says the same at every meeting until the round ends. Meanwhile `brain.pickups` keeps crate #12 with Ann's name, and `cues` tells the LLM every turn that "Cargo is holding crates of yours for collection, and you have sent for them: Ann ... for crate #12".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:222`, in `noteAsk`:

    if (brain.asks.some((ask) => ask.who === who && !ask.told)) {
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:663`, in `syncTasks`, the only trimming of asks:

    brain.asks = brain.asks.filter(
      (ask) => !ask.told || brain.now - ask.at < MEETING_EVERY_DS,
    );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1279`, the only place `told` is set:

    const unpacked = text.match(UNPACKED_WORDS);
    if (unpacked) {
      ...
      for (const ask of brain.asks) {
        if (!ask.ordered || ask.told) {
          continue;
        }
        ask.told = true;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:594`, what the technician sends:

    text: `Lost at cargo: ${written}${notice.what ? ` (${notice.what})` : ''} from your order. ${why[0].toUpperCase()}${why.slice(1)}. It will have to be ordered again, and nobody need come for it.`,

`grep -n -i "lost" jobs/head.ts` finds only two comments about staff "lost on the way".

## How it was found

Read from the code, not seen in a round. Lost crates do come up: the change log has the lost-crate work (secure-areas, 2026-11-17) and the Quartermaster reorders lost crates once.

## How to fix it

1. Put one shared `LOST_AT_CARGO = 'Lost at cargo:'` and `LOST_WORDS = /^lost at cargo: (.+?) from your order\b/i` in `supply.ts`, where the other shared order words live, and use the constant in both senders (`cargo.ts:594`, `quartermaster.ts:1351`) so the reader cannot drift from them. In the head's `readsMessage`, for a message from cargo (`isCargo(job)`) that matches: take the numbers with `numbersIn` and drop those `brain.pickups` (the new order, if any, brings a new number). Then, unless the message says it is being ordered again (`/ordered again, as order \d+/i`, the Quartermaster's reorder line), set `ordered = false` on the ordered, untold asks for that kind of crate, so `orderFor` takes them up again (at once, since `metOnce` is true). Asks carry no crate number today (`{ who, what, at, ordered, told }`), so "for that kind" means `what` matching the `SUPPLIES` entry whose `crate` is in the brackets; once HEAD-08 adds the crate numbers to each ask, use those instead.
2. Read the staff's "Cargo says there is no crate #N to collect" (match `/there is no crate #(\d+) to collect/i`, and share the words with `pickups.ts:259` the same way): drop that pickup and do nothing more at once. If the crate is lost, cargo's "Lost at cargo" does the rest (step 1); if the number was wrong and the crate is still in the bay, cargo's own "Still waiting at cargo" reminder sends someone for it through `sendFor`. Setting the asks back here would order a second crate in the wrong-number case.
3. Give ordered, untold asks an age limit in `syncTasks`, beside the trim at `head.ts:663`: an ask that has been ordered and untold for, say, two meeting gaps (`2 * MEETING_EVERY_DS`) is dropped. Whoever is still short says so at the next meeting and is ordered for again. This is the safety net for case 3 and anything not yet thought of. It needs no new field: `ask.at` is when it was asked.
4. Give each pickup the same limit, so the `cues` line does not tell of crates that are gone.

## How to test the fix

- Add to the simulator a scenario where the fake cargo sends the head "Lost at cargo: crate #12 (Janitorial Supplies Crate) from your order. ..." after "has come in". Pass if the head's next meeting closing line says one of them needs supplies and a new order goes out.
- A scenario where the janitor sent for the crate has no PDA: pass if, after the age limit, a fresh need at a meeting is ordered.
- Type check from `tgui/`.
- A scenario with a Quartermaster aboard where the reorder is lost too: pass if after the second "Lost at cargo" ("It will have to be ordered again") the head orders again.
- A scenario where a janitor sends "Cargo says there is no crate #12 to collect" and the technician later sends "Still waiting at cargo: crate #12": pass if one janitor is sent again and no second order goes out.
- In the next round's `pda.log`, after any "Lost at cargo" to the Head of Personnel, look for a new "I need to order" from it within one meeting.

## Check

Checked by Opus 5.5. The quotes at `head.ts:222`, `head.ts:663`, `head.ts:1279` and `cargo.ts:594` are what the code says today. Traced `readsMessage` (`head.ts:1213` to 1341) branch by branch: no branch reads "Lost at cargo" or "there is no crate", and the last one (`NEED_WORDS`) does not match either line. `told` is set only in the unpacked branch (1292); the trim at 663 keeps every untold ask. Read the senders: the technician tells the Quartermaster when one is aboard (`cargo.ts:575` to 586) and the head only when not; the Quartermaster reorders once (`quartermaster.ts:1320`), which heals the first loss through the head's `ARRIVED_WORDS` branch. Read `tool_message` and `resend_unsent` (`crew_npc_cargo.dm:691`, 755): an unsent message is kept 8 minutes.

Ran a throwaway script (scratchpad, bun, `tools/llm_crew/fixtures.ts` and `jobs/head.ts`): one janitor's ask ordered, "Your order has come in: crate #12" from a technician, then "Lost at cargo: crate #12 ...", then the janitor's "Cargo says there is no crate #12 to collect ...", then 40 minutes later "I need something to clean with, please." from the janitor. Result: still one ask, `ordered: true, told: false`, no requisition, `pickups` still [12], and `cues` still saying the janitor has been sent for crate #12.

The secure-areas plan (Lost crates) proposed that "whoever ordered it is told by PDA, and the errand to collect it is cancelled or given the new number"; the head's side of that was never built. Nothing chooses this behaviour. Lowered to medium: with the standing test crew the Quartermaster's reorder heals the first loss, and any other unpacked crate clears it; it sticks for good only with no Quartermaster, a second loss, or PDAs down past 8 minutes. Effort medium: three readers and an age limit in `head.ts`, plus shared words in `supply.ts` and two senders. Changed fix step 2: sending someone at once, or setting the asks back, on "no crate #N" would order or fetch twice when only the number was wrong.
