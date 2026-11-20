---
id: SUP-02
title: An order the technician gives up on is told to nobody, stays in the cart, and later arrives as a crate nobody knows about
kind: bug
severity: medium
effort: medium
confidence: sure
status: duplicate
duplicate_of: CARGO-01
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:423, code/modules/llm_crew/crew_npc_cargo.dm:454, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:720, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:945
fix: On giving up, owe a notice to whoever ordered and keep the order's manifest numbers so its crates are held when they do come
---

## What is wrong

`supply_run_step` gives an order up in two cases: six minutes have passed (`CREW_NPC_SUPPLY_TIMEOUT`), or the shuttle has been unable to leave for thirty seconds (`CREW_NPC_SUPPLY_HELD_UP`). In both it only clears its own flags and sends the brain a sentence. Three things then go wrong.

1. **Nobody is told.** The sentence comes as an `action_result` for the `order` tool, minutes after the brain last used that tool. The window only acts on a result when it is for the step it last asked for (`noteResult` in `driver.ts`). So the line is one more event in the model's list and nothing else. The window's own state then says the order is finished: `syncTasks` in `jobs/cargo.ts` sees `order_pending` false and no "arrived" notice, sets `order.reported = true` and closes the task. The Quartermaster's book keeps the order as "given to Sam to place: it is going ahead, and has not come in yet" for the rest of the round (`quartermaster.ts` has a wait for the technician's "right away" and none for the crate). The head who asked waits for ever.

2. **The order is not "off".** The body is told "The order is off until it is clear." Nothing takes the order out of `SSshuttle.shopping_list`. The next time the shuttle makes a round trip for anyone, the game buys it and cargo's budget is charged.

3. **The crate comes in as a stranger.** `ordered_numbers` belongs to the run that was given up. When the crate does come, on some later run, its manifest number is in nobody's `ordered_numbers`, so `order_arrived` makes no held entry for it and owes no notice. It is hauled into the bay as a loose full crate and stays there: not held, not released, not empty so never sent back.

One case, with the Captain standing on the shuttle:

1. The Quartermaster gives Sam order 3 (janitorial supplies, for the Head of Personnel). Sam places it. `supply_run_active` is TRUE, the order is in the cart as #7.
2. The shuttle is docked and empty. `supply_run_step` wants to send it out. `shuttle.canMove()` is FALSE because the Captain is aboard. `supply_held_up_since` is set.
3. Thirty seconds later the Captain is still there. `supply_run_active = FALSE`, `pending_order = null`, and the body is told "The supply shuttle will not leave to fetch the Janitorial Supplies Crate: Zim Fire is aboard it. The order is off until it is clear."
4. In the window, the ORDER task closes as reported. The Quartermaster's book still says order 3 is going ahead. The Head of Personnel hears nothing.
5. Ten minutes later Sam places order 5. Its run sends the shuttle out and back. The game buys #7 with #9. `order_arrived` holds #9 only. Crate #7 sits in the bay, paid for, with nobody told.

The six-minute case is the same, and is reached without anything being wrong: an order placed while the shuttle is docked with four full crates aboard waits for them to be unloaded (the `crate_to_unload()` branch), then needs two one-minute flights. A staff meeting in the middle is enough.

A second way into the timeout that is not a hold-up at all: the crates have come and the body is not in the bay to see them (`aboard && get_area(pawn) != get_area(post_turf)` just waits). A technician in the brig, dead, or kept away for the rest of the six minutes is told "What you ordered has still not come. Something is holding the supply shuttle up" while the crates stand on the dock. Again no held entry and no notice. `supply_run_step` checks `QDELETED(pawn)` only, so a dead technician's timer runs to the timeout too.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:423`, in `supply_run_step`:

    	if(world.time - supply_run_started_at > CREW_NPC_SUPPLY_TIMEOUT)
    		supply_run_active = FALSE
    		pending_order = null
    		action_result(CREW_TOOL_ORDER, FALSE, "What you ordered ([ordered_words]) has still not come. Something is holding the supply shuttle up.")
    		return

`code/modules/llm_crew/crew_npc_cargo.dm:454`, same proc:

    				else if(world.time - supply_held_up_since > CREW_NPC_SUPPLY_HELD_UP)
    					// The shuttle will not fly with anyone aboard, or with cargo it is not allowed to carry.
    					supply_run_active = FALSE
    					pending_order = null
    					action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle will not leave to fetch [ordered_words]: [what_bars_shuttle(shuttle) || "someone is standing aboard it, or something aboard is not allowed to travel"]. The order is off until it is clear.")
    					return

The body not in the bay, same proc:

    				if(aboard && (isnull(post_turf) || get_area(pawn) == get_area(post_turf)))
    					order_arrived()
    					return
    				if(aboard)
    					addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
    					return

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:720`, in `syncTasks`:

      } else if (order) {
        // The PDA message was the telling, so nobody is left waiting to hear.
        order.reported = true;
        finishTask(brain, order);
      }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:945`, in `noteResult`:

      if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
        return;
      }

The base game leaves an order it cannot or did not buy in the list: `buy()` in `code/modules/shuttle/mobile_port/variants/supply.dm` only removes an order after it has made its crate.

## How it was found

Read from the code, server and window. Not seen in a round. `grep` of the change log and plans for "still not come", "is off until" and "holding the supply shuttle" finds nothing, so it is not listed as known.

## How to fix it

The owner has one thing to decide first: **when a run is given up, should the technician cancel the order at the console (a player can, with the cart's remove button), or leave it in the cart and go on watching for it?** I would leave it and go on watching: it needs no extra walk, the money is only spent when the crate really ships, and it fits section 4.7 of `LLM_CREW_PLAN_NO_CHEATS.md` ("If the technician is held up, the shuttle waits at the far end"). The steps below are for that answer.

1. Add a global list in `crew_npc_held.dm`, `GLOB.crew_npc_orders_adrift`: manifest number (as text) to a list of `for`, `via`, `ref`, `what` (the kind from `ordered_kinds`) and `post`.
2. In both give-up branches of `supply_run_step`, before clearing: for each number in `ordered_numbers` whose order is still in `SSshuttle.shopping_list` or whose crate has no held entry yet, write an entry to that list. Then add one notice, as `order_arrived` does:

       notices_owed += list(list("to" = order_for, "kind" = CREW_NOTICE_HELD_UP, "what" = ordered_words, "why" = <the words after "will not leave: ", or "it has not come back in time">, "via" = order_via, "ref" = order_ref))

   with a new define `CREW_NOTICE_HELD_UP "held_up"` beside the other three in `_defines.dm`. Change the body's words from "The order is off until it is clear" to "It is still on order, and will come when the shuttle next makes the trip."
3. In `freight_state` (or a small proc it calls), for each crate aboard or in `freight_rooms()` with a manifest number that is in `GLOB.crew_npc_orders_adrift` and has no held entry: make the held entry exactly as `order_arrived` does, owe the "arrived" notice to the stored `for`/`via`/`ref`, and remove the number from the list. Any technician at the post may do this, the same as writing off a lost crate.
4. The timeout case where the crates have come and the body was not in the bay: do not time out while `aboard` is true and the shuttle is docked. The order has come. Let the wait run until the body is back in the bay or is dead (`body.stat == DEAD`: then hand the numbers to the adrift list at once, so a workmate holds the crates).
5. Window: in `jobs/cargo.ts`, treat a `held_up` notice the way `arrived` is treated: tell the Quartermaster face to face through `tellQuartermaster` with a fixed line added to `jobs/supply.ts` (for example `order 3 is held up: <why>.` with its `_WORDS` regex), then `word_passed` with `kind: 'held_up'`; with no Quartermaster, a PDA message to whoever ordered. In `jobs/quartermaster.ts` `overhears`, read that line, write "Order 3. Held up: ..." in the book, and pass it on by PDA to whoever ordered, as it does for a lost crate. Code only, a fixed line with a plain fallback: no model call is needed.
6. Keep `orderInHand` true while a `held_up` notice is owed, so the ORDER task is not closed as reported.

If the owner would sooner have it cancelled: the technician walks to the console and removes each of its numbers (`console.remove_item(id)` after `can_interact`), and the notice says the order is cancelled and must be given again. Then step 3 is not needed.

## How to test the fix

- Type check and the tables `tools/llm_crew/book.ts` (a new book line) and `reports.ts` if the line is reported.
- A new `sim.ts` scenario: the simulated server answers the `order` tool, then after a while drops `order_pending` and puts a `held_up` notice in `notices`. Check that the technician says the fixed line to the Quartermaster, that the book gets the line, and that whoever ordered gets a PDA message.
- Server compile to a side copy.
- In a round: order, then stand on the supply shuttle for forty seconds. `game.log` should show the technician telling the Quartermaster, and `pda.log` the message to whoever ordered. Step off, let another order run, and check that the first crate is held under its number and its "arrived" message goes out.
