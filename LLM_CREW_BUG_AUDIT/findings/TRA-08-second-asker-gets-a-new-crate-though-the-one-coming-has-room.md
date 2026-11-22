---
id: TRA-08
title: Someone who asks while an order is on its way gets a crate of their own ordered, though the crate coming holds enough for them, and is then served from the first crate anyway
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: b1b63386888
found_by: Opus 5.5
checked_by: Opus 5.5
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
2. In `noteAsk`, if an order is in hand with a line for this person's kind of supply that has room (`line.people.length < line.count * PER_CRATE`), add the person to `line.people`. If the order is already sent (`askedAt !== null`), also mark the ask `ordered: true`; if it is not yet sent, leave that to `afterSaying`/`afterActing`, which mark everyone in `orderedFor` when it goes (`head.ts:1336-1376`). They wait on that crate, and are told when it is unpacked. If the order is refused, `orderedFor` now includes them, so their ask is cleared with the rest and they say so again at the next meeting: that is right.
3. Keep that order's lines after word that it has come in, until its crates are unpacked, so that someone who asks between the crate docking and its unpacking is put on it too, not ordered for afresh. One way: move the lines to `brain.pickups` (which already holds the crate number and room) with the people they cover.
4. With HEAD-08's fix (asks tied to the crate they were ordered on), step 2 is what puts the second janitor on crate #12.
5. Use the true number per crate: TRA-01 says one Janitorial Supplies Crate holds two tools, not three. Counting room at three would put a third janitor on a crate that cannot serve them.

## How to test the fix

- Type check from `tgui/`.
- Simulator: a `qm` variant in which a second janitor runs out two minutes after the first order goes in. Pass if only one order is sent, and both janitors are told when crate #4521 is unpacked.
- In the next round's `pda.log`, count the head's "I need to order" lines against the crates unpacked with nobody short at the time.

## Check

Checked by Opus 5.5. Confirmed; effort raised to medium.

- The quotes are the code today: `orderFor` (`jobs/head.ts:241-261`) takes only asks with `ordered` false and counts `ceil(people / PER_CRATE)`; `syncTasks` (`head.ts:634-643`) makes a new order only when `requisition` is null; `ARRIVED_WORDS` clears it (`head.ts:1257-1262`).
- Traced the case: Mo's ask is noted while order 1 is out (`noteAsk`, `head.ts:218-237`, refuses only a second untold ask from the same person). On the next state update after "has come in", `metOnce` is true, so the batch wait does not apply, and `orderFor` makes order 2 for Mo alone. Order 2 is sent and Mo's ask is marked `ordered` (`afterActing`, `head.ts:1360-1376`). When #12 is unpacked, the unpacking branch (`head.ts:1279-1303`) tells every ordered, untold ask, Mo among them (HEAD-08). Order 2's crate then comes for nobody.
- The write-up's numbers check out: the crate costs `CARGO_CRATE_VALUE * 2` (`code/modules/cargo/packs/service.dm:32`), 400 credits; the first meeting is at `FIRST_MEETING_DS` 1200 ds, two minutes. Whether the Captain is asked depends on the budget left, so "likely" is fair.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans chooses to order afresh for a later asker.

Severity medium stands: the work gets done, but a second crate is bought and maybe put to the Captain, which a player would notice. Effort is medium, not small: step 3 has to carry the people an order covers past "has come in" (into `brain.pickups` or a list of orders) and fit HEAD-08's change, which is more than 20 lines. Read from the code only; nothing was run.
