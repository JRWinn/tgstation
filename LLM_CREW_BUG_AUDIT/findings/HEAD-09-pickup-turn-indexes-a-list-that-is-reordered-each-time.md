---
id: HEAD-09
title: Who is sent for a crate is picked by a round-wide counter into a list that is put in a new order every time, so after the first crate the one who asked is seldom the one sent
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:316, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:329
fix: Send the askers of an order first in order of asking, counting from zero for each order, and keep the round-wide turn only for the crates beyond the askers
---

## What is wrong

`sendFor` is meant to send "those who asked for what is in it first, then the rest of those it is for, and round again". It builds `turns` as the askers followed by the other able staff, and then takes `turns[brain.pickupTurn % turns.length]`, where `pickupTurn` counts every crate sent for since the round began. The list is rebuilt for each crate with different people at the front, so the count no longer points at the front of it.

Concrete case, janitors Ann, Bob and Cy (in that order on the PDA list), one crate per order:

1. Ann asks. Crate #12: `turns = [Ann, Bob, Cy]`, `pickupTurn` 0, Ann is sent. Right.
2. Later Cy asks. Crate #20: `turns = [Cy, Ann, Bob]`, `pickupTurn` 1, Ann is sent. Cy, who asked, is not.
3. Later Bob asks. Crate #31: `turns = [Bob, Ann, Cy]`, `pickupTurn` 2, Cy is sent.

The crate still goes to the closet, so the work gets done. But the one who needs the things is left waiting for a PDA message, the one sent drops its own work to haul it, and "the asker first" in the comment and the doc block at the top of the file is not what happens. With two crates for one order it also mixes the two rules: the second crate may go to the first asker again.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:316`, in `sendFor`:

    const askers = brain.asks
      .filter((ask) => ask.ordered && !ask.told)
      .map((ask) => ask.who);
    const able = staff(brain)
      .filter((person) => supply.for(person.job))
      .map((person) => person.name);
    const turns = [
      ...askers.filter((name) => able.includes(name)),
      ...able.filter((name) => !askers.includes(name)),
    ];
    if (turns.length === 0) {
      return;
    }
    let to = turns[brain.pickupTurn % turns.length];
    brain.pickupTurn++;

## How it was found

Read from the code, not seen in a round.

## How to fix it

1. Keep a count per order of how many of its crates have been sent for (on the pickups entries, or as `brain.pickupsSent[orderStamp]`, with the order stamp of HEAD-08). For the k-th crate of an order, send `askers[k]` while `k < askers.length`.
2. Beyond the askers, send the able staff in round-wide turn, using `pickupTurn` over `able` alone (a list whose order does not change), skipping whoever already has an open pickup.
3. Keep the "still waiting" rule as it is: not the one who did not come, the next in turn.

## How to test the fix

- A small table in `tools/llm_crew/`: three orders, one asker each, different askers. Pass if each crate goes to its asker.
- Type check from `tgui/`.
- In a round's `pda.log`, each "crate #N of janitorial supplies is waiting at cargo" should go to someone who said at the meeting before it that they needed supplies, while any of them is waiting.
