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
fix: Read Lost at cargo and the no-such-crate word in the head's readsMessage, drop that crate's pickup and set its askers back to not ordered, and give an ordered and untold ask an age limit after which it is dropped
---

## What is wrong

Once a head has ordered for one of its staff, that ask is `ordered: true, told: false` until word comes that a crate was unpacked. Only then is it `told`, and only told asks are ever dropped. While an untold ask stands, `noteAsk` will not note another from the same person, and `orderFor` takes only asks that are not ordered. So if the unpacked word never comes, that person is never ordered for again for the rest of the round, however often they say at meetings that they need something.

Three ways the unpacked word never comes, all of them sent to the head in set words and all of them dropped by its `readsMessage`:

1. **Cargo loses the crate.** A technician sends the head "Lost at cargo: crate #12 (Janitorial Supplies Crate) from your order. ... It will have to be ordered again, and nobody need come for it." (`cargo.ts:594`), or the Quartermaster sends "Lost at cargo: ..." (`quartermaster.ts:1351`). The head's `readsMessage` has no branch for "Lost at cargo": it is not `NOTED_WORDS`, `REFUSED_WORDS`, `ARRIVED_WORDS`, `STILL_WAITING_WORDS` or `UNPACKED_WORDS`, the sender is not its staff, and `noteAsk` ignores anyone who is not its staff. Nothing happens. The Quartermaster's version may add that it is ordering it again, which comes in as a new order and is fine; the technician's version says it "will have to be ordered again", and nobody does.
2. **The janitor is told at the counter there is no such crate.** `pickupsOverhear` finishes its collect task and sends the head "Cargo says there is no crate #12 to collect: it has been lost, or the number is wrong. I have not got it." (`pickups.ts:259`). The head reads it as a message from its staff: not `COMING_WORDS`, not `REPORT_BY_PDA`, and no `NEED_WORDS`. Dropped.
3. **The unpacked message is not sent.** `planPickups` sends it only with a PDA (`brain.hasPda && task.askedBy`), and sends it once "whether or not it got through". A janitor that has lost its PDA, or a message sent while the PDA network is down (test rounds lose power about 15 minutes in), leaves the ask untold.

Concrete case: Ann, a janitor, says at the 2-minute meeting that she needs something to clean with. The head orders, and the order comes in as crate #12. Ann is sent for it. Before she gets to the counter the crate is lost in the bay; the technician tells the head so. The head does nothing. At the 12-minute meeting Ann says "I need something to clean with." `hearReport` gives `need: true`, `noteAsk` finds Ann's old ask with `!ask.told` and returns. The closing line says "Nobody needs anything." It says the same at every meeting until the round ends. Meanwhile `brain.pickups` keeps crate #12 with Ann's name, and `cues` tells the LLM every turn that "Cargo is holding crates of yours for collection, and you have sent for them: Ann ... for crate #12".

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

1. Add `LOST_WORDS = /^lost at cargo: (.+?) from your order\b/i` (or import one shared constant from `cargo.ts`, where the line is written, so the two cannot drift; `supply.ts` is where such shared words already live). In the head's `readsMessage`, for a message from cargo that matches: take the numbers with `numbersIn`, drop those `brain.pickups`, and for the asks those pickups were for, set `ordered = false`. If the message says it is being ordered again ("having it ordered again"), leave them ordered instead and keep the pickup out: the new order's "has come in" brings the new number.
2. Read the staff's "Cargo says there is no crate #N to collect" the same way (match on `there is no crate #(\d+) to collect`): drop the pickup and send the next of its staff with `sendFor` only if cargo has not said it is lost; otherwise set the asks back to not ordered.
3. Give ordered, untold asks an age limit in `syncTasks`: an ask that has been ordered and untold for, say, two meeting gaps (`2 * MEETING_EVERY_DS`) with no pickup still out for it is dropped. Whoever is still short says so at the next meeting and is ordered for again. This is the safety net for case 3 and anything not yet thought of.
4. Give each pickup the same limit, so the `cues` line does not tell of crates that are gone.

## How to test the fix

- Add to the simulator a scenario where the fake cargo sends the head "Lost at cargo: crate #12 (Janitorial Supplies Crate) from your order. ..." after "has come in". Pass if the head's next meeting closing line says one of them needs supplies and a new order goes out.
- A scenario where the janitor sent for the crate has no PDA: pass if, after the age limit, a fresh need at a meeting is ordered.
- Type check from `tgui/`.
- In the next round's `pda.log`, after any "Lost at cargo" to the Head of Personnel, look for a new "I need to order" from it within one meeting.
