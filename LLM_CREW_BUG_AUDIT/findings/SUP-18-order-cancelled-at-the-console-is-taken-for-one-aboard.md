---
id: SUP-18
title: An order someone cancels at the supply console is taken for one loaded aboard, and the technician is told the shuttle has docked without it
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:432, code/modules/llm_crew/crew_npc_cargo.dm:499, code/modules/cargo/orderconsole.dm:352
fix: Keep the pending order's id as well as its weak reference, and when the order is gone with no shuttle trip since it was placed, end the run as cancelled and say so
---

## What is wrong

`supply_run_step` knows its order is aboard because the order has gone: "The shuttle takes the order off the list and deletes its record as it loads the crate. So an order that is gone is an order aboard."

    	var/datum/supply_order/order = pending_order?.resolve()
    	var/aboard = isnull(order) || !(order in SSshuttle.shopping_list)

There is a second way for an order to go: anyone at a supply console can take it out of the cart, which deletes it (`remove_item`: `SSshuttle.shopping_list -= order` then `qdel(order)`). The step cannot tell the two apart.

A concrete case:

1. Sam places order #9 for the Head of Personnel. The shuttle is docked at the station and empty, so the step is about to send it.
2. Before the next five-second step the Captain, at the console, clears #9 from the cart.
3. The step: `pending_order` resolves to null, so `aboard` is TRUE. The shuttle is docked at home and Sam is in the bay, so `order_arrived()` runs at once.
4. Nothing with #9 on it is anywhere. Sam is told "The supply shuttle has docked, but you cannot see what you ordered (the Janitorial Supplies Crate) aboard." The shuttle has not moved. Nobody is told the order was cancelled, and the window closes the ORDER task (SUP-02, CARGO-01).

If the shuttle was away instead, the step brings it home empty and says the same.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:432`, quoted above, and `order_arrived` at :499:

    	if(!length(found))
    		action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle has docked, but you cannot see what you ordered ([ordered_words]) aboard.")

`code/modules/cargo/orderconsole.dm:352`, `remove_item`.

## How it was found

Read from the code. Not seen in a round. It needs a player to remove the order from the cart, so it is not common; it is written up because the body is told something that did not happen.

## How to fix it

1. Note on the controller whether the shuttle has been away since the order was placed: FALSE in `place_order`, TRUE whenever a step finds the shuttle anywhere but idle at `cargo_home` (in flight, or docked at `cargo_away`). Do not set it only where this body's own step moves the shuttle: a workmate's step or `send_shuttle` may move it instead, and `buy()` runs on the leg home whoever sent it. SUP-11 wants the same flag.
2. In `supply_run_step`, if the order is gone and `supply_trip_made` is FALSE, it was not loaded. End the run with "Order [numbers] has been taken off the supply console's cart. It will not come." A body standing at the console would see the cart; one away from it would find out when it next looked. Owe the asker word of it, the same way SUP-02 asks for an order given up.
3. Leave the rest of the step as it is.

## How to test the fix

Compile. In a round, have a technician place an order and remove it from the cart at the console as the Captain before the shuttle leaves. The technician should say the order is off, and `game.log` should show no "cannot see what you ordered" line.
