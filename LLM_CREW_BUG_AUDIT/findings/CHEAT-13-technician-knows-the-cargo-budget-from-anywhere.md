---
id: CHEAT-13
title: A cargo technician refuses an order for want of money wherever it stands, reading the cargo budget it has no way to see
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:347, code/modules/llm_crew/crew_npc_quartermaster.dm:320
fix: Check the budget at the console in place_order, as the console itself shows it, or from a budget program on the technician's PDA, never before it walks there
---

## What is wrong

`tool_order` checks the money before the body moves:

    var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
    if(budget && !budget.has_money(cost))
    	action_result(CREW_TOOL_ORDER, FALSE, "There is not enough money left in the cargo budget to order [order_in_words(wanted)].")

The technician can be anywhere: at a meeting in the Bar, in the hallway. A player learns the budget by looking at a supply console's screen, or from a budget program on a PDA. The Quartermaster side of this was built honestly: `cargo_budget()` gives the budget to the Quartermaster only if its PDA has the budget program ("it knows the budget the way a head of staff does, from the budget program, and without that it does not know"). The technician's check has no such test.

Concrete case: a Head of Personnel asks a technician, face to face in the Cargo Lobby, for two crates. The budget is 600 credits and two crates are 800. The technician answers "There is not enough money left in the cargo budget" without turning to the console; a player would walk to it, try, and read the refusal. Asked by PDA while the technician is across the station, it is the same.

A smaller point: by the code's own comment, an order the budget cannot cover is taken by the console and then never loaded ("An order the budget cannot cover is never loaded, and the shuttle would come back without it"). So the check is a useful one; it is only in the wrong place. (Not checked against the shuttle's loading code.)

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:347`, in `tool_order`:

    	// An order the budget cannot cover is never loaded, and the shuttle would come back without it.
    	var/cost = 0
    	for(var/kind in wanted)
    		var/datum/supply_pack/pack = SSshuttle.supply_packs[known[kind]]
    		cost += pack.get_cost() * wanted[kind]
    	var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
    	if(budget && !budget.has_money(cost))

The honest pattern, `code/modules/llm_crew/crew_npc_quartermaster.dm:320`, `cargo_budget`:

    	if(!has_budget_program())
    		return null

## How it was found

Read from the code.

## How to fix it

1. Move the money check from `tool_order` into `place_order`, before `console.add_item`. There the body is standing at the console, whose screen shows the budget (`/obj/machinery/computer/cargo/ui_data` sends `points`). Return "The supply console shows there is not enough money in the cargo budget for [what]." and place nothing.
2. Optionally keep an early check in `tool_order` for a technician whose PDA has the budget program (`has_budget_program()` already exists on the controller), with the same words as the console.
3. Nothing else changes: the order still fails before it is placed, only after the walk.

## How to test the fix

- Server compile.
- A round, or a simulator case that plays `order` with a low budget: the technician walks to the console and then reports the shortfall; `game.log` shows the walk.
