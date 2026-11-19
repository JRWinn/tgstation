---
id: CHEAT-13
title: A cargo technician with no budget program to hand still refuses an order for want of money, reading a budget it cannot see
kind: bug
severity: low
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:352, code/modules/llm_crew/crew_npc_quartermaster.dm:320, code/modules/modular_computers/computers/item/role_tablet_presets.dm:291
fix: In tool_order read the budget through cargo_budget(), which needs the budget program on a carried PDA, and with no program check the money at the console in place_order
---

## What is wrong

`tool_order` checks the money before the body moves:

    var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
    if(budget && !budget.has_money(cost))
    	action_result(CREW_TOOL_ORDER, FALSE, "There is not enough money left in the cargo budget to order [order_in_words(wanted)].")

The technician can be anywhere: at a meeting in the Bar, in the hallway. A player learns the budget by looking at a supply console's screen, or from a budget program on a PDA. The Quartermaster side of this was built honestly: `cargo_budget()` gives the budget to the Quartermaster only if its PDA has the budget program ("it knows the budget the way a head of staff does, from the budget program, and without that it does not know"). The technician's check has no such test.

Correction (checker): the cargo technician's own PDA, `/obj/item/modular_computer/pda/crew/cargo` (`role_tablet_presets.dm:285`), starts with `/datum/computer_file/program/budgetorders`, and that program shows the cargo budget to a technician (`budgetordering.dm:88-103`: the buyer is the cargo account, or the department of the ID's job, which for a technician is cargo). So a technician carrying its PDA can know the budget from anywhere, as a player can, and the check is honest in the usual round. The fault is only that `tool_order` does not ask whether the body has that program, as `cargo_budget()` does.

Concrete case: a technician has lost its PDA (dropped while knocked down, taken by someone, left in a crate). A Head of Personnel asks it, face to face in the Cargo Lobby, for two crates. The budget is 600 credits and two crates are 800. The technician answers "There is not enough money left in the cargo budget" without looking at anything that shows it; a player without a PDA would walk to the console and read it there.

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

1. In `tool_order`, replace the `SSeconomy.get_dep_account` read with `var/budget = cargo_budget()` (it is on the controller, in `crew_npc_quartermaster.dm`, and returns null without the program), and refuse only when `!isnull(budget) && budget < cost`. A technician with its PDA behaves exactly as now.
2. In `place_order`, before `console.add_item`, check the money again from the account the console shows (`SSeconomy.get_dep_account(console.cargo_account)`, as `/obj/machinery/computer/cargo/ui_data` does). The body is standing at the console, so this is fair. Return "The supply console shows there is not enough money in the cargo budget for [what]." and place nothing. Keep `order_items` cleared or not as the other failure paths there do.
3. Nothing else changes: with a PDA the order is refused before the walk, as now; without one, after it.

## How to test the fix

- Server compile.
- A round, or a simulator case that plays `order` with a low budget: with its PDA the technician refuses at once, as today; with the PDA taken off it (admin delete or drop it), it walks to the console and then reports the shortfall, and `game.log` shows the walk.

## Check

Confirmed, but much narrower than written, so severity is lowered from medium to low and the title, case and fix are rewritten. The quote at `crew_npc_cargo.dm:347-355` is today's code, and `tool_order` has no `has_budget_program()` test. But the write-up missed that the cargo technician's PDA starts with the budget program (`role_tablet_presets.dm:291`, `/datum/computer_file/program/budgetorders`), and that program's `ui_data` (`budgetordering.dm:83-103`) shows a technician the cargo budget. So in the usual round the technician knows the budget the same honest way the Quartermaster does, and the write-up's case (a technician in the lobby with its PDA) is not a cheat. What is left is the case with no PDA, which comes up rarely; the only harm is a correct refusal given without the walk.

Also read: `cargo_budget` and `has_budget_program` (`crew_npc_quartermaster.dm:308-324`), `/obj/machinery/computer/cargo/ui_data` (`orderconsole.dm:84-90`), `/datum/bank_account/proc/has_money` (`account.dm:156`, `account_balance >= amount`, the same test as `budget < cost` inverted), and the shuttle's `buy` (`code/modules/shuttle/mobile_port/variants/supply.dm:226-233`), which confirms the code comment: an order the budget cannot cover is skipped and left on the list, not loaded. Searched `LLM_CREW_CHANGELOG.md` (line 1083) and `LLM_CREW_PLAN_QUARTERMASTER.md` (line 55): the "knows the budget only from the budget program" rule was set for the Quartermaster; nothing there excuses the technician's check. Nothing was run.
