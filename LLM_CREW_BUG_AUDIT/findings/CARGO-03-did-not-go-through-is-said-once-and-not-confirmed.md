---
id: CARGO-03
title: Word that an order did not go through is said once, only if the Quartermaster is in sight within two minutes, and nothing checks it was heard
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1919, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:441, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1580
fix: Pass the did-not-go-through word through tellQuartermaster as a task of its own, with the same I-have-that answer and PDA fall-back as the other three words
---

## What is wrong

When the console will not take an order the Quartermaster gave, the technician forgets the order at once (`brain.givenOrder = null`) and queues one spoken line for the Quartermaster in `brain.toTell`. That queue is not the careful path the other words take:

- The line is said the first time the Quartermaster is in `peopleInView`, and never again. It is not passed through `tellQuartermaster`, so there is no knock at the office door, no second try and no wait for "I have that", which is what "Said is not told" was built for on 2026-11-18. (Through a window within seven tiles the line is heard: base speech goes by `get_hearers_in_view`, which glass does not block. The loss is when the Quartermaster is not in sight at all.)
- The Quartermaster does not answer it. `overhears` in `quartermaster.ts` calls `heardIt()` for has-come-in, would-not-come, lost and still-waiting, and not for did-not-go-through.
- If the Quartermaster is not in view within `TELL_KEPT_MS` (two minutes) the line is dropped unsaid (`driver.ts:441`).
- Nothing goes by PDA.

If the line is lost, the Quartermaster's book has the order as `given` and `taken` (it heard "Order 3, right away." before the technician walked to the console). Nothing ever moves it on: the technician is left out of `freeTechnicians` for the rest of the round, the head is never told, and the money stays promised.

One concrete case:

1. The Quartermaster has no budget program on its PDA (or the budget fell after it cleared the order). It gives Sam order 4. Sam answers "Order 4, right away." The Quartermaster hears, sets `order.taken = true`, and walks back to its office.
2. Sam reaches the console. `tool_order` answers "There is not enough money left in the cargo budget to order the Janitorial Supplies Crate."
3. `afterActing` runs with `ok` false: `brain.givenOrder = null`, and the line "Ada, order 4 did not go through. The console would not take it." goes into `toTell` with no `byPda` and no `keepMs`.
4. The Quartermaster has gone on to its office, or out on the station, and is not in Sam's sight. Sam does not go to its door: the line waits in `toTell` for the Quartermaster to come into view.
5. Two minutes pass (`TELL_KEPT_MS = 120000`, `driver.ts:97`) and `nextStep` drops the line unsaid.
6. The book says "Order 4. Given to Sam Tech." for the rest of the round. `TAKEN_WAIT_DS` (`quartermaster.ts:802`) only gives again an order that is not `taken`, and nothing else moves a taken order out of `given` but `NOT_PLACED_WORDS` or word that it docked.

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

## Check

Checked by Opus 5.5. The quotes are what the code says today: the `toTell` push in `afterActing` (`cargo.ts:1916`), the two-minute filter and in-view test in `nextStep` (`driver.ts:441`, `TELL_KEPT_MS` at `driver.ts:97`), and the `NOT_PLACED_WORDS` branch in `overhears` (`quartermaster.ts:1580`) with no `heardIt()`, while the four branches above it call it.

Traced the Quartermaster's side: an order is `given` and `taken` once the technician answers (`quartermaster.ts:1596`). The re-give after `TAKEN_WAIT_DS` (`quartermaster.ts:800`) skips a taken order. The only ways out of `given` are the not-placed line (`order.state = 'new'`) and `noteDocked`. A taken order stuck in `given` keeps the technician out of `freeTechnicians` (`quartermaster.ts:674`) and its cost in `moneyFree` (`quartermaster.ts:215`). So a lost line leaves the order stuck for the round. `tool_order` does refuse for want of money (`crew_npc_cargo.dm:354`), so the case is a real way in.

One thing in the write-up was wrong and is mended above: the Quartermaster seen through its office window does hear the line, since `send_speech` uses `get_hearers_in_view` (`code/__HELPERS/spatial_info.dm:83`) with range 7, the same as `CREW_NPC_VISION_RANGE`. The fault is the case where it is not in sight within two minutes, and that the line gets none of the knock, retry and answer the other words get. Read from the code, not run. Severity medium stands. Effort raised to medium: a new task kind with its plan and sync in `cargo.ts`, plus two branches in `quartermaster.ts`, is more than twenty lines in two files. Step 4 (the reason) is extra and touches the server.
