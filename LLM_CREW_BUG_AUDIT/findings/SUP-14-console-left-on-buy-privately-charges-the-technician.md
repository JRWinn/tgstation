---
id: SUP-14
title: A supply console left on "buy privately" puts a technician's order on its own bank account, though the money was checked in cargo's budget
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:395, code/modules/llm_crew/crew_npc_cargo.dm:352, code/modules/cargo/orderconsole.dm:256, code/modules/cargo/orderconsole.dm:504
fix: In place_order look at console.self_paid, as a player sees it on the screen, and switch it off through the console's own toggleprivate action before adding the order
---

## What is wrong

The supply console has one switch, shared by everyone who uses it: "buy privately" (`self_paid`). A player turns it on to buy something with their own money and may leave it on. While it is on, `add_item` charges each order to the bank account on the ID of whoever placed it, not to cargo:

    	account = id_card?.registered_account // We can still assign an account for request department purposes.
    	if(self_paid)
    		...
    	if(!self_paid)
    		account = personal_department
    	...
    		var/datum/supply_order/order = new(
    			...
    			paying_account = account,

`place_order` calls `console.add_item(body, pack_type)` without looking at the switch. So with it left on:

1. `tool_order` has checked cargo's budget (`SSeconomy.get_dep_account(ACCOUNT_CAR)`), not the technician's own account.
2. The order goes in with `paying_account` the technician's own account. `buy()` charges that account, at a tenth more for a private order where the account has that modifier.
3. If the technician has the money, it pays for the Head of Personnel's crates out of its own wages, and nobody is told: the "charged to your bank account" message goes to its ID's bank card talk, which the body does not sense.
4. If it does not, `buy()` skips the order and the shuttle goes to and fro until the six-minute timeout says "Something is holding the supply shuttle up" (as in SUP-11).

A player at the console sees the switch on its screen (`data["self_paid"]`) and would switch it back before ordering for a department.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:395`, in `place_order`:

    		for(var/crate_number in 1 to order_items[kind])
    			console.add_item(body, pack_type)

`code/modules/cargo/orderconsole.dm:504`, the switch:

    		if("toggleprivate")
    			self_paid = !self_paid

## How it was found

Read from the code. Not seen in a round. It needs a player to have bought privately at that console and left the switch on, so it is not common.

## How to fix it

1. In `place_order`, before the loop, if `console.self_paid` is TRUE, switch it off the way a player's click does: `work_window(console, "toggleprivate")` (`crew_npc_machines.dm:281`), the stand-in the owner allowed for pressing a button on a machine's screen. Setting `console.self_paid = FALSE` directly would be setting a machine by variable, which the no-cheats rule forbids. (SUP-01's fix, ordering through `work_window` with the console's `add` action, would bring this check in for free if the switch is read first.)
2. Say so in the result: "The console was set to buy privately; you switch it back to the cargo budget."
3. Switch it back on afterwards only if the owner wants the body to leave the console as it found it. The question for the owner: leave it off, or put it back?

## How to test the fix

Compile. In a round, toggle "buy privately" on the supply console as the Captain, have the Quartermaster give an order, and check the cargo investigate log line for the order ("paid by ...") names the cargo budget, not the technician.
