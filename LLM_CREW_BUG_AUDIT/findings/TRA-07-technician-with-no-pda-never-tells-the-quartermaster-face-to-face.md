---
id: TRA-07
title: A technician with no PDA never tells the Quartermaster face to face that an order has come in, is still waiting or is lost, though that word does not go by PDA
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:226, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:490, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:515, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:327
fix: Gate the arrived, waiting and lost tasks on having a PDA only when the word would go by PDA, so that word owed to the Quartermaster face to face is owed with or without one
---

## What is wrong

With a Quartermaster aboard, a technician's word about crates goes to the Quartermaster face to face: "Nothing between a technician and the Quartermaster goes by PDA" (`tellQuartermaster`). The PDA is only the fall-back when the Quartermaster cannot be found.

But the tasks that carry that word only exist while the technician has a PDA:

- The `ORDER` task, which tells of an order that has come in, is kept by `orderInHand`, which counts an arrived notice only `&& brain.hasPda`. With no PDA, the moment the shuttle docks `orderPending` goes false, `orderInHand` is false, and `syncTasks` closes the task as reported.
- The `REMIND` and `LOST` tasks are made from `brain.hasPda ? brain.notices.filter(...) : []`. With no PDA they are never made.

So a technician that has lost its PDA, or whose PDA has no messenger (`pda_messenger()` is null: `has_pda` false), places the Quartermaster's order, sees it dock, and says nothing. The Quartermaster's book keeps the order as given for good (`freeTechnicians` then never gives that technician another order, and `moneyFree` counts the money as spent; see CARGO-02 for the same end reached another way). The head is never sent the crate number. Cargo's reminders and loss notices about that technician's post are made by whoever's check comes up, but a technician without a PDA that wins the check never passes them on either.

Concrete case: Pun Pun steals Vik's PDA. The Quartermaster gives Vik order 4. Vik answers "Order 4, right away.", places it (placing needs no PDA), and the crate docks as #15. The server owes a notice to Hop Kins via the Quartermaster. In the window, `orderInHand` is false; the `ORDER` task closes. Vik is standing beside the Quartermaster in the bay and says nothing. Order 4 is "given to Vik" in the book for the rest of the round.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:226`:

    function orderInHand(brain: NpcBrain): boolean {
      return (
        brain.orderPending ||
        (!!arrivedNotice(brain) && brain.hasPda) ||
        (!!brain.givenOrder && !brain.givenOrder.placed)
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:490` and `:515`, in `syncHeld`:

    const owed = brain.hasPda
      ? brain.notices.filter((notice) => notice.kind === 'waiting')
      : [];
    ...
    const lost = brain.hasPda
      ? brain.notices.filter((notice) => notice.kind === 'lost')
      : [];

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:335`, `tellQuartermaster`, which needs no PDA until it falls back:

    if (!quartermaster || task.byPda) {
      return null;
    }

## How it was found

Read from the code. Not seen in a round: a technician without a PDA has not come up.

## How to fix it

1. Add a helper `canPassOn(brain, notice)`: TRUE if `brain.hasPda`, or if the word goes through the Quartermaster face to face (an arrived notice with `toldThrough(brain, notice.via)`, or any waiting or lost notice while `quartermasterAboard(brain)`).
2. Use it in `orderInHand` and in the two filters in `syncHeld` in place of `brain.hasPda`.
3. In `tellQuartermaster`, when it would fall back to the PDA (`task.byPda`) and the body has none, keep trying face to face on a longer wait instead of returning null; with no Quartermaster aboard and no PDA, say it to whoever ordered when they are next at the counter (TRA-02's line).

## How to test the fix

- Type check from `tgui/`.
- Simulator: in `qm`, give one technician no PDA (`hasPda` false in the fake state). Pass if, when its order docks, it says "Ada, order 1 has come in: ..." to the Quartermaster and the book shows the order docked.
