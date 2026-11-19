---
id: CARGO-01
title: An order that fails after it was placed is told to nobody, and the Quartermaster's book keeps it as given for good
kind: bug
severity: high
effort: medium
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1911, code/modules/llm_crew/crew_npc_cargo.dm:419, code/modules/llm_crew/crew_npc_cargo.dm:499, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:674
fix: Have the server owe a notice of kind failed when a placed order is given up, and have the technician pass it on like any other word (to the Quartermaster face to face, or to whoever ordered by PDA)
---

## What is wrong

A technician places an order at the console. That goes well, and the window marks the order as placed. The shuttle run is then watched by a server timer (`supply_run_step`). That timer can give the order up in three ways, minutes later:

- "What you ordered (...) has still not come. Something is holding the supply shuttle up." (6 minutes, `CREW_NPC_SUPPLY_TIMEOUT`)
- "The supply shuttle will not leave to fetch ...: ... The order is off until it is clear." (30 seconds held up, `CREW_NPC_SUPPLY_HELD_UP`)
- "The supply shuttle has docked, but you cannot see what you ordered (...) aboard." (`order_arrived`)

Each is sent as an `action_result` for the tool `order` with `ok` false. Nothing in the window acts on it:

- `noteResult` in `driver.ts` only looks at the answer to the step it last sent (`brain.lastAct`), and by now that is some other step or none. So `afterActing` in `cargo.ts` is not called for it.
- The only thing that changes is `order_pending` going false, so `orderInHand` is false and the `order` task is closed with `reported = true`.
- `brain.givenOrder` stays, with `placed: true`.

So whoever ordered is never told that the crate is not coming, and with a Quartermaster aboard its book keeps the order as `given` and `taken` for the rest of the round. That has two more effects in `quartermaster.ts`: `freeTechnicians` leaves that technician out for good (it "has an order on the go"), and `moneyFree` counts the order's cost as promised for good.

The text of the failure only goes into `brain.pending`, for the model to read next time it speaks. Whether anyone hears of it is then up to the model, which is against the rule that code does the work.

One concrete case, one technician and a Quartermaster:

1. The Quartermaster gives Sam order 3. Sam says "Order 3, right away.", walks to the console and places it. `afterActing` sets `given.placed = true`.
2. A mouse is on the shuttle deck (or a monkey, or a person standing in it). `shuttle.canMove()` is false. After 30 seconds `supply_run_step` sets `supply_run_active = FALSE` and sends "The supply shuttle will not leave to fetch the Janitorial Supplies Crate: the mouse is aboard it. The order is off until it is clear."
3. In the window `orderPending` is now false. `syncTasks` closes the `order` task. Sam goes back to its post.
4. The Quartermaster's book still reads "Order 3. Given to Sam." It never gives Sam another order. The Head of Personnel waits for a crate that was never fetched.

Note that the server leaves the order itself in `SSshuttle.shopping_list`. If the shuttle later makes a run for someone else, the crates come anyway, and nobody holds them for anyone: `ordered_numbers` is still set on the controller but `order_arrived` is never called.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:423`, in `supply_run_step`:

    if(world.time - supply_run_started_at > CREW_NPC_SUPPLY_TIMEOUT)
        supply_run_active = FALSE
        pending_order = null
        action_result(CREW_TOOL_ORDER, FALSE, "What you ordered ([ordered_words]) has still not come. Something is holding the supply shuttle up.")
        return

and at line 454:

    else if(world.time - supply_held_up_since > CREW_NPC_SUPPLY_HELD_UP)
        // The shuttle will not fly with anyone aboard, or with cargo it is not allowed to carry.
        supply_run_active = FALSE
        pending_order = null
        action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle will not leave to fetch [ordered_words]: ...

and at line 499 in `order_arrived`:

    if(!length(found))
        action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle has docked, but you cannot see what you ordered ([ordered_words]) aboard.")
        return

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1911`, the only place the window notes how an order went, which runs only for the answer to the placing:

    const given = brain.givenOrder;
    if (task?.kind === GIVEN && act.tool === 'order' && given) {
      if (ok) {
        given.placed = true;
      } else {
        brain.givenOrder = null;
        brain.toTell.push({
          to: given.by,
          line: `${firstName(given.by)}, order ${given.n} ${NOT_PLACED}. The console would not take it.`,

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:944`, why the late answer is not seen:

    const last = brain.lastAct;
    if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:674`, what a book stuck at `given` does:

    function freeTechnicians(brain: NpcBrain, ledger: Ledger): string[] {
      const busy = new Set(
        ledger.orders
          .filter((order) => order.state === 'given')
          .map((order) => order.givenTo),
      );

## How it was found

Read from the code, not seen in a round. I searched the window code for every reader of an `order` result (`'order'` in `brain.ts`, `driver.ts`, `cargo.ts`) and found only the three above. `LLM_CREW_CHANGELOG.md` and the plans do not list it: the "dropped order" in `LLM_CREW_PLAN_NO_CHEATS.md` section 4.2 is a different fault (an order asked for while the tool is withheld).

## How to fix it

Keep it on the same rails as the other word a technician owes.

1. Server, `crew_npc_cargo.dm`: add a notice kind, for example `CREW_NOTICE_FAILED "failed"` in `_defines.dm`. In each of the three places above, if `order_for` is set, add to `notices_owed` a list with `"to" = order_for`, `"kind" = CREW_NOTICE_FAILED`, `"via" = order_via`, `"ref" = order_ref`, `"what" = ordered_words` and `"why"` (the plain reason: "the supply shuttle would not leave", "it did not come", "it was not aboard"). A notice survives the window being reloaded, which a one-off event does not.
2. Server, `tool_word_passed`: it already matches on kind, so nothing to change there.
3. Window, `cargo.ts`: treat a `failed` notice like `arrived` in `orderInHand`, `syncTasks` and `plan`. In `plan`, for a notice with `via` the Quartermaster and a number `ref`, call `tellQuartermaster` with the line `` `${first}, order ${ref} ${NOT_PLACED}. ${why}.` `` and `{ tool: 'word_passed', person: to, kind: 'failed' }`. With no Quartermaster, or when `tellQuartermaster` returns null, send whoever ordered a PDA message: "Your order did not come: <what>. <Why>. Ask again when it is clear."
4. Window, `quartermaster.ts` `overhears`: the `NOT_PLACED_WORDS` branch must call `heardIt()` like the other three, or the technician will never get "I have that" back and will fall through to the PDA after two tries. It already puts the order back to `new` with `retryAt`, which is the right outcome. Also read `NOT_PLACED_WORDS` in `readsMessage` from a technician, for when the word comes by PDA (see CARGO-02 and CARGO-03).
5. Window: when the `failed` notice is first seen, clear `brain.givenOrder` if its number is the notice's `ref`.
6. Decide what happens to the order left in `SSshuttle.shopping_list`. Simplest that keeps the no-cheats rule: leave it, and in `freight_state` or `tool_unload` call the same matching that `order_arrived` does when a crate whose manifest number is in `ordered_numbers` is seen aboard, so that crates which come late are still held for whoever ordered. Then send an `arrived` notice as usual. Owner's question: should a late crate be held for the first asker when the Quartermaster has since given the order out again?

What must keep working: the immediate failure at the console (CARGO-03 covers its own weakness), and an order with no Quartermaster aboard.

## How to test the fix

- Simulator: add a scenario to `tools/llm_crew/sim.ts` beside `qm` in which the sim answers the order as placed, then two minutes later clears `order_pending` and sends a `failed` notice. Check that the Quartermaster's book gets "Could not be placed." and that the order is given out again, and with no Quartermaster that the head gets the PDA message.
- `tools/llm_crew/book.ts`: a case for the new line against `NOT_PLACED_WORDS`.
- Type check and server compile.
- In a round: stand on the shuttle deck while an order is placed. In `game.log` look for "The order is off until it is clear", then in `pda.log` or `game.log` for the technician telling the Quartermaster "order N did not go through".
