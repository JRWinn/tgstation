---
id: CARGO-03
title: Word that an order did not go through is said once, only if the Quartermaster is in sight within two minutes, and nothing checks it was heard
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1919, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:441, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580
fix: Pass the did-not-go-through word through tellQuartermaster as a task of its own, with the same I-have-that answer and PDA fall-back as the other three words
---

## What is wrong

When the console will not take an order the Quartermaster gave, the technician forgets the order at once (`brain.givenOrder = null`) and queues one spoken line for the Quartermaster in `brain.toTell`. That queue is not the careful path the other words take:

- The line is said the first time the Quartermaster is in `peopleInView`. In view is not in earshot: the Quartermaster goes back to its office after giving an order, and the office has a window on to the bay. This is the very fault "Said is not told" was built for on 2026-11-18, and this line was left out of it.
- The Quartermaster does not answer it. `overhears` in `quartermaster.ts` calls `heardIt()` for has-come-in, would-not-come, lost and still-waiting, and not for did-not-go-through.
- If the Quartermaster is not in view within `TELL_KEPT_MS` (two minutes) the line is dropped unsaid (`driver.ts:441`).
- Nothing goes by PDA.

If the line is lost, the Quartermaster's book has the order as `given` and `taken` (it heard "Order 3, right away." before the technician walked to the console). Nothing ever moves it on: the technician is left out of `freeTechnicians` for the rest of the round, the head is never told, and the money stays promised.

One concrete case:

1. The Quartermaster has no budget program on its PDA (or the budget fell after it cleared the order). It gives Sam order 4. Sam answers "Order 4, right away." The Quartermaster hears, sets `order.taken = true`, and walks back to its office.
2. Sam reaches the console. `tool_order` answers "There is not enough money left in the cargo budget to order the Janitorial Supplies Crate."
3. `afterActing` runs with `ok` false: `brain.givenOrder = null`, and the line "Ada, order 4 did not go through. The console would not take it." goes into `toTell` with no `byPda` and no `keepMs`.
4. Sam can see the Quartermaster through the office window. `nextStep` finds the tell and says the line in the bay. `noteDone` removes it. The Quartermaster is out of earshot.
5. The book says "Order 4. Given to Sam Tech." for the rest of the round.

The same happens when the errand to the console fails with "You could not get to it." because a workmate is standing at it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1916`, in `afterActing`:

    if (task?.kind === GIVEN && act.tool === 'order' && given) {
      if (ok) {
        given.placed = true;
      } else {
        brain.givenOrder = null;
        brain.toTell.push({
          to: given.by,
          line: `${firstName(given.by)}, order ${given.n} ${NOT_PLACED}. The console would not take it.`,
          why: `You could not place order ${given.n}, which ${given.by} gave you. You are telling ${given.by} so, face to face.`,
          needs: new RegExp(`\\border ${given.n} ${NOT_PLACED}\\b`, 'i'),
          at: Date.now(),
        });
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:441`, in `nextStep`:

    brain.toTell = brain.toTell.filter(
      (tell) => Date.now() - tell.at < (tell.keepMs ?? TELL_KEPT_MS),
    );
    const tell = brain.toTell.find((it) =>
      it.byPda
        ? brain.hasPda
        : brain.peopleInView.some((person) => person.name === it.to),
    );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580`, no `heardIt()`:

    const failed = heard.match(NOT_PLACED_WORDS);
    if (failed) {
      const order = ledger.orders.find((it) => it.n === Number(failed[1]));
      if (order && order.state === 'given') {
        order.state = 'new';

Also: the line always says "The console would not take it.", whatever the server gave as the reason. "Not enough money" and "you could not get to it" are different things for the Quartermaster to act on, and the reason is thrown away (`afterActing` is not passed the text, only `details`).

## How it was found

Read from the code, not seen in a round. `LLM_CREW_PLAN_QUARTERMASTER.md` line 106 says only "An order could not be placed: the Quartermaster gives it again after two minutes", and line 107 lists "the first three" words as the ones answered by name.

## How to fix it

1. In `cargo.ts`, add a task kind (for example `NOT_PLACED_TASK = 'not_placed'`, item the order number) opened in `afterActing` in place of the `toTell` push, carrying `by` and the reason. Its plan calls `tellQuartermaster(brain, task, { name: by }, line, about, { tool: 'rest' })`, the way `wontComeStep` does, and closes when `task.passedOn` is set. On `task.byPda` it sends the same line to the Quartermaster by PDA (see CARGO-02 for the question of PDA between the two).
2. In `quartermaster.ts` `overhears`, call `heardIt()` in the `NOT_PLACED_WORDS` branch. In `readsMessage`, read `NOT_PLACED_WORDS` from a technician and do the same as the spoken branch.
3. Keep `brain.givenOrder = null` so that the same order given again is taken again.
4. Pass the reason on. `afterActing` gets `details` but not the text. Either have `tool_order` add a short `"why"` to its details (`"no_money"`, `"no_console"`, `"busy"`), or have `noteResult` pass `event.text`. Then say "there is not enough in the budget" or "I could not get to the console". On the Quartermaster's side "no money" should hold the order for money (its `short` state) and not give it out again in two minutes.

CARGO-01 uses the same line for an order that fails after it was placed. Build the two together.

## How to test the fix

- Simulator: `qmpoor` is the scenario with too little money. Make the sim refuse the order at the console with the Quartermaster out of earshot, and check the book gets "Could not be placed." and the order is given out again.
- `tools/llm_crew/book.ts`: a case for the new line.
- Type check.
- In a round: `game.log` "said as part of its work" or "was told by its brain to say: ..., order N did not go through", followed by the Quartermaster's "..., I have that."
