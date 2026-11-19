---
id: SUP-01
title: A technician orders and sends the shuttle at a supply console that has no power or is broken
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:379, code/modules/llm_crew/crew_npc_freight.dm:633, code/modules/llm_crew/crew_npc_hands.dm:195
fix: Have place_order and send_shuttle_back ask console.can_interact(body) first and answer that the console is dead when it says no
---

## What is wrong

A player cannot use a supply console that has lost power or been smashed: the game shuts its window. A cargo technician NPC can. It walks up to the console and the order goes in, and the shuttle is sent, as if the screen were lit.

This breaks the no-cheats rule (a body "goes through the same code a player's click reaches ... so the game's own checks apply", `LLM_CREW_PLAN_NO_CHEATS.md` section 4). That plan lists "placing an order (`console.add_item` with the body as the user)" as "checked and honest". It is honest about who pays, but `add_item` is the proc *behind* the window. The check for power is in front of it, in `/obj/machinery/can_interact`, which the window goes through and the NPC does not.

It matters in play because station power fails in the test rounds about fifteen minutes in (no NPC runs the engine). From then on every order a technician places is placed at a dark console.

One case:

1. Power is out in the Cargo Bay. The supply console has `machine_stat & NOPOWER`.
2. The Quartermaster gives Sam order 4. Sam's brain calls the `order` tool.
3. `tool_order` picks the console with `supply_console()` (which does not look at whether it works) and starts the errand.
4. `do_errand` checks only that Sam is next to the console (`can_reach_target_now`), then calls `place_order`.
5. `place_order` calls `console.add_item(body, pack_type)`. `add_item` has no power check. The order goes on `SSshuttle.shopping_list`.
6. Sam is told "You order the Janitorial Supplies Crate ... at the supply console and call the shuttle." The timer in `supply_run_step` then moves the shuttle (that part is the known cheat, see below).

The same holds for `send_shuttle_back`, reached by the `send_shuttle` tool.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:379`, in `place_order`. Nothing looks at the console before it is used:

    /datum/ai_controller/crew_npc/proc/place_order(obj/machinery/computer/cargo/console)
    	var/mob/living/carbon/human/body = pawn
    	var/list/known = orderable_crates()
    	if(!length(order_items))
    		return list(FALSE, "You forget what you came to order.")
    ...
    		for(var/crate_number in 1 to order_items[kind])
    			console.add_item(body, pack_type)

`code/modules/llm_crew/crew_npc_freight.dm:633`, in `send_shuttle_back`. The `console` argument is never read at all:

    /datum/ai_controller/crew_npc/proc/send_shuttle_back(obj/machinery/computer/cargo/console)
    	var/obj/docking_port/mobile/supply/shuttle = docked_supply_shuttle()
    	if(isnull(shuttle))
    ...
    	SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)

`code/modules/llm_crew/crew_npc_hands.dm:195`, in `do_errand`, the only check made before either is called:

    	if(QDELETED(target) || QDELETED(body) || !can_reach_target_now(target))
    		return list(FALSE, "You could not get to it.")

The base game's check that a player meets, `code/game/machinery/_machinery.dm:650`:

    /obj/machinery/can_interact(mob/user)
    	if(QDELETED(user))
    		return FALSE

    	if((machine_stat & (NOPOWER|BROKEN)) && !(interaction_flags_machine & INTERACT_MACHINE_OFFLINE)) // Check if the machine is broken, and if we can still interact with it if so
    		return FALSE

`grep -n "machine_stat\|is_operational\|NOPOWER" code/modules/llm_crew/` finds the check only for brig cell timers (`crew_npc_security.dm:1081`). Nothing for the supply console.

## How it was found

Read from the code. Not seen in a round: no round log was searched for an order placed after the power went. The memory note "station power fails early" says it fails about fifteen minutes into test rounds, which is why this is rated high.

The cheat of moving the shuttle by a timer and by `SSshuttle.moveShuttle` is already listed in `LLM_CREW_PLAN_NO_CHEATS.md` (the table in section 3, and 4.7) and is not this finding. This finding is the missing power check, which that plan does not list and which stays missing even after 4.7 is built unless the new console proc is called through `can_interact`.

## How to fix it

1. In `place_order` (`crew_npc_cargo.dm`), before the `ordered_numbers = list()` line, add:

       if(!console.can_interact(body))
       	return list(FALSE, "The supply console is dead. It has no power, or it is broken, and will take no order.")

   `can_interact` is the proc the game's window code asks. It also covers a console with its panel open, and a body that cannot read. It needs the body next to the console, which `do_errand` has already made sure of.
2. The same two lines at the top of `send_shuttle_back` (`crew_npc_freight.dm`), with words to fit: "The supply console is dead, so the shuttle cannot be sent from it."
3. Do not put the check in `tool_order`, `tool_send_shuttle` or `supply_console()`. The body does not know the console is dead until it is standing at it (senses only).
4. Optional, and better: when a console is found dead, note it on the controller (`dead_console_ref`, `dead_console_at`) and have `supply_console()` pass over it for a few minutes, so the next try goes to another console on the level, the one in the Quartermaster's office if its ID opens that door. Without this the body walks to the same dark console every time.
5. When 4.7 of the no-cheats plan is built (the console's send code lifted into a proc), call that proc only after the same `can_interact` check, or put the check inside it.
6. Window side, nothing has to change for it to be safe. A failed `order` on a `GIVEN` task already tells the Quartermaster "order N did not go through. The console would not take it." (`afterActing` in `jobs/cargo.ts`), and the Quartermaster gives it again after `PLACE_AGAIN_DS`. A failed `send_shuttle` is backed off by `fail()` in `driver.ts`. The owner may want the Quartermaster to tell the Captain that cargo has no power, which is a new line and is theirs to decide.

What must keep working: an order at a live console is placed exactly as now.

## How to test the fix

- Server compile to a side copy (see README).
- The simulator runs no server code, so this cannot be shown there. Add a `sim.ts` case only if step 4 changes what the window is told.
- In a round: cut the power to the Cargo Bay (or wait for it to fail), have the Captain order through the Quartermaster, and look in `game.log` for the technician's errand result. It should read "The supply console is dead" and `SSshuttle.shopping_list` should not grow. With power on, the order should go through as before.
