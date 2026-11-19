---
id: SUP-11
title: The budget check before an order leaves out what is already in the cart, and an order the shuttle cannot pay for flies the shuttle to and fro for six minutes and is then called held up
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:347, code/modules/llm_crew/crew_npc_cargo.dm:432, code/modules/llm_crew/crew_npc_cargo.dm:423, code/modules/shuttle/mobile_port/variants/supply.dm:252
fix: Count the cost of every order already in SSshuttle.shopping_list against the budget in tool_order, and in supply_run_step tell an order that came back unbought for want of money from one held up, and say so
---

## What is wrong

`tool_order` refuses an order the cargo budget cannot cover, and the comment says why: "An order the budget cannot cover is never loaded, and the shuttle would come back without it." But the check is of this one order against the whole balance. Every order already in the cart (`SSshuttle.shopping_list`) is paid out of the same balance first, because `buy()` pays the orders in the order they were placed. Nothing subtracts them.

So two orders that each fit, but not together, both pass the check. When the shuttle loads at the far dock, the first is paid and the second is skipped:

    if(!paying_for_this.adjust_money(-price, "Cargo: [spawning_order.pack.name]"))
    	...
    	continue

The skipped order stays in the cart. The technician whose order it is then gets this from `supply_run_step`:

1. The shuttle comes home. Its order is still in `SSshuttle.shopping_list`, so `aboard` is FALSE.
2. Not aboard, shuttle docked at home: once the other order's crates are off (`crate_to_unload()`), it sends the shuttle out again (`SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)`).
3. At the far dock `buy()` tries again. If the balance is still short, it is skipped again, and the step brings the shuttle home (`docked_at == "cargo_away"`).
4. This goes round, a minute each way, until `CREW_NPC_SUPPLY_TIMEOUT` (6 minutes). Then the body is told "What you ordered (...) has still not come. Something is holding the supply shuttle up."

That reason is not the real one. Nothing held the shuttle up: there was no money. The brain is not told that, nor is whoever ordered (SUP-02 covers that nobody is told at all), and the order is left in the cart to be bought, unasked, on some later trip once the money has come in.

The same happens with one technician alone, for any order still in the cart from before: an order given up under SUP-02 is still there and is paid for first.

A concrete case, with a Quartermaster sharing out work:

1. The cargo budget stands at 1,000 credits. The Quartermaster gives Maria order 2 (two Janitorial Supplies Crates, 800) and Sam order 3 (one Bureaucracy Crate, 640). The book's own money check is the window's; the server's is `tool_order`'s.
2. Maria's `tool_order`: 800 of 1,000, passes. She places it.
3. Sam's `tool_order`: 640 of 1,000, passes. He places it after her.
4. `buy()`: Maria's two crates are paid (balance 200). Sam's is skipped.
5. Sam's `supply_run_step` sends the shuttle back and forth until six minutes are up, then says it is held up.

Cargo also starts the round with nothing (`SSeconomy.Initialize`: "cargo starts with NOTHING", see QM-15), so early orders are made on a small balance and this comes up in ordinary rounds with two technicians.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:347`, in `tool_order`:

    	// An order the budget cannot cover is never loaded, and the shuttle would come back without it.
    	var/cost = 0
    	for(var/kind in wanted)
    		var/datum/supply_pack/pack = SSshuttle.supply_packs[known[kind]]
    		cost += pack.get_cost() * wanted[kind]
    	var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
    	if(budget && !budget.has_money(cost))

`code/modules/llm_crew/crew_npc_cargo.dm:432`, in `supply_run_step`, where "not aboard" is all it can see:

    	var/datum/supply_order/order = pending_order?.resolve()
    	var/aboard = isnull(order) || !(order in SSshuttle.shopping_list)

and at :423 the only way out once that never changes:

    	if(world.time - supply_run_started_at > CREW_NPC_SUPPLY_TIMEOUT)
    		...
    		action_result(CREW_TOOL_ORDER, FALSE, "What you ordered ([ordered_words]) has still not come. Something is holding the supply shuttle up.")

`code/modules/shuttle/mobile_port/variants/supply.dm:252`, in `buy()`, the base game's rule: orders are paid one by one, in cart order, and one that cannot be paid is left in the cart.

## How it was found

Read from the code, with `buy()` read in full. Not seen in a round. CHEAT-13 says the check is made from wherever the technician stands, which is a different fault; it also notes that it did not check the shuttle's loading code. QM-15 is the window side of money and the Captain. Neither covers the cart.

## How to fix it

1. In `tool_order` (or, better, at the console as CHEAT-13 asks, inside `place_order` before `add_item`), add to `cost` the `get_final_cost()` of every `datum/supply_order` in `SSshuttle.shopping_list` whose `paying_account` is null and `charge_on_purchase` is TRUE and that has no `department_destination`: those are the ones `buy()` will charge to cargo first. A player at the console sees the cart and its total on the same screen, so this is what a player could know.
2. In `supply_run_step`, when the shuttle is docked at home, the pending order is still in the cart, and the shuttle has made a trip since the order was placed, the order was not bought. Note a flag on the controller when `docked_at == "cargo_away"` moves it home (`supply_trip_made = TRUE`), and when it is home with the order still in the cart and that flag set, end the run with "The supply shuttle came back without [ordered_words]: there was not enough money in the cargo budget to pay for it." and take the order out of the cart through `console.remove_item(id)`, as a player would at the console, so it is not bought later behind everyone's back. Whether to take it out or leave it waiting for money is the owner's call: the Quartermaster plan holds orders "for money" in the book, so leaving it in the cart would be a second, hidden hold.
3. Keep the other ways out of `supply_run_step` as they are.

## How to test the fix

Add a case to `tools/llm_crew/` with two technicians given orders whose sum is over the budget: the second should be refused at placing (step 1) or told "not enough money" after one trip (step 2), not "held up" after six minutes. Compile. In the next round's `game.log` look for "has still not come. Something is holding the supply shuttle up" and compare its time with the cargo investigate log line "orders in this shipment ... left".
