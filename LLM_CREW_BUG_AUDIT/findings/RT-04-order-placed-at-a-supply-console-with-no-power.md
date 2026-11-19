---
id: RT-04
title: A cargo technician places an order, and sends the shuttle, at a supply console that has no power or is broken
kind: bug
severity: high
effort: small
confidence: sure
status: found
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:379, code/modules/llm_crew/crew_npc_freight.dm:633, code/game/machinery/_machinery.dm:650, code/modules/cargo/orderconsole.dm:221
fix: Refuse in place_order and send_shuttle_back when console.can_interact(body) is false, and tell the brain the console is dead
---

## What is wrong

`place_order` calls the console's inner proc `add_item` straight away. That proc is what the console's window calls after the window's own checks have passed, and it makes none of them itself: it does not look at whether the console has power, is broken, or can be used by this body at all. A player at a dead console gets no window and can order nothing. A crew NPC orders as if the screen were lit.

`LLM_CREW_PLAN_NO_CHEATS.md` lists this call as "Checked and honest: placing an order (`console.add_item` with the body as the user)". It is honest only while the console works. The test rounds lose station power about fifteen minutes in, and cargo goes on ordering after that.

One concrete case:

1. The station has lost power. The supply console in the Cargo Bay shows `NOPOWER` in `machine_stat`.
2. A head asks for janitorial supplies. The technician's brain sends `order`. `tool_order` picks the console with `supply_console()`, which does not look at power either, and starts the errand.
3. The body walks up. `do_errand` checks only `can_reach_target_now(target)` and calls `place_order(console)`.
4. `console.add_item(body, pack_type)` adds the order to `SSshuttle.shopping_list`. The body is told "You order the Janitorial Supplies Crate ... at the supply console and call the shuttle."
5. `supply_run_step` then flies the shuttle from a timer (that part is already known: see the table in `LLM_CREW_PLAN_NO_CHEATS.md`, "Shuttle").

`send_shuttle_back` in `crew_npc_freight.dm` has the same gap: it walks to the console and then calls `SSshuttle.moveShuttle` whatever state the console is in. That it calls the shuttle system and not the console is already in the same table. That it does so at a dead console is not.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:379`, in `place_order`:

    	var/mob/living/carbon/human/body = pawn
    	var/list/known = orderable_crates()
    	if(!length(order_items))
    		return list(FALSE, "You forget what you came to order.")
    	...
    		var/orders_before = length(SSshuttle.shopping_list)
    		for(var/crate_number in 1 to order_items[kind])
    			console.add_item(body, pack_type)

`code/modules/llm_crew/crew_npc_freight.dm:633`, in `send_shuttle_back`:

    	var/obj/docking_port/mobile/supply/shuttle = docked_supply_shuttle()
    	if(isnull(shuttle))
    		...
    		SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)
    	...
    	SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)

The check the game makes for a player, `code/game/machinery/_machinery.dm:650`:

    /obj/machinery/can_interact(mob/user)
    	if(QDELETED(user))
    		return FALSE

    	if((machine_stat & (NOPOWER|BROKEN)) && !(interaction_flags_machine & INTERACT_MACHINE_OFFLINE)) // Check if the machine is broken, and if we can still interact with it if so
    		return FALSE

`code/modules/cargo/orderconsole.dm:221`, `add_item`, has no such check: it goes from `if(is_express) return` to looking the pack up.

The crew code already uses the right check elsewhere: `work_window` (`crew_npc_machines.dm:286`) and `work_timer` (`crew_npc_security.dm:1061`) both refuse when `!machine.can_interact(body)`.

## How it was found

Read from the code, with the base procs read. Not seen in a round: I did not match order times against the time the power failed in any round.

## How to fix it

1. At the top of `place_order`, after the `order_items` check: `if(!console.can_interact(body)) return list(FALSE, "The supply console is dead: it has no power, or it is broken. You cannot order anything at it.", ...)`. `finish_errand` passes only two parts of the outcome for this tool, so either give the reason in the words alone, or extend `finish_errand` to pass a third part as details for `CREW_TOOL_ORDER` the way it does for security's tools.
2. The same check at the top of `send_shuttle_back`, with "You cannot send the shuttle from a dead console."
3. In `supply_console()`, pass over consoles with `machine_stat & (NOPOWER|BROKEN)` when another one works, so that a body with a live console in a head's office to hand is not sent to a dead one. If none works, return the nearest as now and let `place_order` say why.
4. `tool_order` sets `order_items`, `order_for` and `order_via` before the errand. When `place_order` refuses, clear nothing else: `supply_run_active` is still FALSE, so the next `order` call starts clean.
5. Window side: the technician's job (`jobs/cargo.ts`) and the Quartermaster's (`jobs/quartermaster.ts`) should tell whoever asked that the console is dead, and not send `order` again every few seconds. The words for that need a plain fallback, as every line does.

Question for the owner: with no console working, should the Quartermaster be told to get engineering to bring the power back, or just hold the order in the book? The plans do not say.

## How to test the fix

- Compile the server.
- In a round: cut the Cargo Bay's APC, then ask the Quartermaster for a crate. `cargo.html` and `game.log` should show no order placed, and the brain should be told the console is dead.
- With power on, an order should go through as before: check `tools/llm_crew/sim.ts` cargo scenarios still pass, and add one in which `order` answers `ok: false` with the dead-console words.
