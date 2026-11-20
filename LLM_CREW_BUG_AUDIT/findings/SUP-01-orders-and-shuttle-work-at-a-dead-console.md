---
id: SUP-01
title: A technician orders and sends the shuttle at a supply console that has no power or is broken
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: bf19845c7e8
found_by: Fable 5.2
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:379, code/modules/llm_crew/crew_npc_freight.dm:633, code/modules/llm_crew/crew_npc_hands.dm:195, code/game/machinery/_machinery.dm:650, code/modules/cargo/orderconsole.dm:221, code/modules/llm_crew/crew_npc_machines.dm:281
fix: Have place_order and send_shuttle_back ask console.can_interact(body) first (or order through work_window) and answer that the console is dead when it says no
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

The same holds for `send_shuttle_back`, reached by the `send_shuttle` tool, both when it sends the shuttle away and when it calls it in for empties (`SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)`).

It also hides the fault that matters more: with the bay dark, the crew should be telling someone the power is out (GAP-19), and they notice nothing because their orders still go through. (From GAP-20.)

Written up three times: RT-04 and GAP-20 are duplicates of this one.

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

`code/modules/cargo/orderconsole.dm:221`, `add_item`, makes none of those checks. It goes straight from `if(is_express) return` to looking the pack up. A player reaches it only through the window's `"add"` action (`orderconsole.dm:444`):

    		if("add")
    			return add_item(ui.user, params["id"])

`code/modules/llm_crew/crew_npc_cargo.dm:180`, in `supply_console`, which looks only at the kind of console and the level:

    		if(console.requestonly || console.is_express || console.z != body.z)
    			continue

The supply console is a `/obj/machinery/computer`, whose `interaction_flags_machine` (`_computer.dm:9`) has no `INTERACT_MACHINE_OFFLINE`, so `can_interact` does refuse it with no power.

The crew code already has the right check, but not here: `work_window` (`crew_npc_machines.dm:281`, the test at 286) and `work_timer` (`crew_npc_security.dm:1061`) refuse when `!machine.can_interact(body)`, and the brig timers are skipped on `machine_stat & (NOPOWER|BROKEN)` (`crew_npc_security.dm:1081`). Nothing for the supply console.

## How it was found

Read from the code. Not seen in a round: no round log was searched for an order placed after the power went. The memory note "station power fails early" says it fails about fifteen minutes into test rounds, which is why this is rated high.

The cheat of moving the shuttle by a timer and by `SSshuttle.moveShuttle` is already listed in `LLM_CREW_PLAN_NO_CHEATS.md` (the table in section 3, and 4.7) and is not this finding. This finding is the missing power check, which that plan does not list and which stays missing even after 4.7 is built unless the new console proc is called through `can_interact`.

## How to fix it

1. In `place_order` (`crew_npc_cargo.dm`), before the `ordered_numbers = list()` line, add:

       if(!console.can_interact(body))
       	return list(FALSE, "The supply console is dead. It has no power, or it is broken, and will take no order.")

   `can_interact` is the proc the game's window code asks. It also covers a console with its panel open, and a body that cannot read or is incapacitated. It needs the body next to the console, which `do_errand` has already made sure of. If the words should tell "dead" from "cannot use it", test `!console.is_operational` (a var, FALSE for `NOPOWER` and `BROKEN`) for the dead case and give other words otherwise.

   A fuller way (from GAP-20), and the one I would take: place each crate through the player's own path, `work_window(console, "add", list("id" = "[pack_type]"))`, in place of `console.add_item(body, pack_type)`. `work_window` makes the reach and `can_interact` test, then calls the console's `ui_act` with the body as `ui.user`; `"add"` is `return add_item(ui.user, params["id"])`, and `add_item` turns the text id back into a path. It sleeps `CREW_NPC_CLICK_GAP` per call, about a second a crate, which is fine inside `do_errand` (it may sleep). If the first `work_window` returns FALSE, return the dead-console words as above. The order count is still read from `SSshuttle.shopping_list` as now.
2. The same two lines at the top of `send_shuttle_back` (`crew_npc_freight.dm`), before both the call-in branch and the send branch, with words to fit: "The supply console is dead, so the shuttle cannot be sent from it."
3. Do not put the check in `tool_order`, `tool_send_shuttle` or `supply_console()`. The body does not know the console is dead until it is standing at it (senses only). RT-04 and GAP-20 proposed skipping or down-scoring dead consoles in `supply_console()`; that picks by a state the body has not seen, so do not.
4. Extra details for the window: `finish_errand` (`crew_npc_hands.dm:349`) passes a third part of the outcome only for security's tools (`CREW_NPC_SECURITY_TOOL(tool) ? security_details(...) : null`). A `list(FALSE, words, list("console_dead" = TRUE))` from `place_order` would be dropped. Either put it all in the words, or widen that line to pass `outcome[3]` for `CREW_TOOL_ORDER` and `CREW_TOOL_SEND` too. (From RT-04.)
5. Optional, and better: when a console is found dead, note it on the controller (`dead_console_ref`, `dead_console_at`) and have `supply_console()` pass over it for a few minutes, so the next try goes to another console on the level, the one in the Quartermaster's office if its ID opens that door. Without this the body walks to the same dark console every time: the Quartermaster gives the order again every `PLACE_AGAIN_DS` (1200 deciseconds, two minutes, `jobs/quartermaster.ts:111`) for as long as the power is out. That is a slow repeat, not a stall.
6. When 4.7 of the no-cheats plan is built (the console's send code lifted into a proc), call that proc only after the same `can_interact` check, or put the check inside it.
7. Window side, nothing has to change for it to be safe. A failed `order` on a `GIVEN` task already tells the Quartermaster "order N did not go through. The console would not take it." (`afterActing` in `jobs/cargo.ts:1911`), and the Quartermaster sets the order back to `new` and gives it again after `PLACE_AGAIN_DS` (`jobs/quartermaster.ts:1588`). A failed `send_shuttle` is backed off by `fail()` in `driver.ts`. Better words ("order 3 did not go through: the supply console has no power") are a small change in `afterActing` and must keep the `NOT_PLACED` words, which the Quartermaster's `NOT_PLACED_WORDS` match. Whether the Quartermaster should then tell the Captain, or call engineering (GAP-19), that cargo has no power is a new line and the owner's to decide.

What must keep working: an order at a live console is placed exactly as now.

## How to test the fix

- Server compile to a side copy (see README).
- The simulator runs no server code, so this cannot be shown there. Add a `sim.ts` case only if step 4 changes what the window is told.
- In a round: cut the power to the Cargo Bay's APC (or wait for it to fail), have the Captain order through the Quartermaster, and look in `crew_brain.log` for the technician's `order` result. It should read "The supply console is dead", the Quartermaster should hear "order N did not go through", and `SSshuttle.shopping_list` should not grow (View Variables on `SSshuttle`). Smash a console (BROKEN) for the second case. With power on, an order should be placed and the shuttle sent as before.
- Ask for a send while the bay is dark: `send_shuttle` should come back with the dead-console words, and the shuttle should not move.
- If step 7's words change, add a `sim.ts` cargo case in which `order` answers `ok: false` with them, and check the Quartermaster still marks the order failed and gives it again after two minutes.

## Check

Checked by Opus 5.5, with RT-04 and GAP-20, which are the same fault (one missing test in `place_order` and `send_shuttle_back`, one change puts it right). This one kept as the main write-up: it has the `do_errand` quote, the window side traced right, and the senses-only point about `supply_console()`. Taken from the others: the `work_window` route and the `add` action quote (GAP-20), the `finish_errand` third-part point (RT-04), the GAP-19 link.

Read: `place_order` and `supply_console` (`crew_npc_cargo.dm:176`, `:379`), `tool_send_shuttle` and `send_shuttle_back` (`crew_npc_freight.dm:606`, `:633`), `do_errand` and `finish_errand` (`crew_npc_hands.dm:183`, `:327`), `work_window` (`crew_npc_machines.dm:281`); base `/obj/machinery/can_interact` (`_machinery.dm:650`), `/atom/can_interact` (`_onclick/other_mobs.dm:103`), `/obj/machinery/computer` flags (`_computer.dm:9`), `add_item` and `ui_act` (`orderconsole.dm:221`, `:377`, `:444`), `/datum/tgui` (default `status = UI_INTERACTIVE`, so `work_window`'s own `can_interact` test is the only gate); `afterActing` in `jobs/cargo.ts` and the failed-order handling in `jobs/quartermaster.ts`. The quotes match the code today. `place_order` is reached only from `do_errand`, after a reach test and nothing else; `add_item` has no power, broken or reach test; the computer has no `INTERACT_MACHINE_OFFLINE`, so a player at a dark console cannot order. Nothing in `LLM_CREW_CHANGELOG.md` or the plans fixes it or chooses it: `LLM_CREW_PLAN_NO_CHEATS.md:85` calls this call honest without looking at power. Confirmed. Severity high: it breaks the no-cheats rule, and power loss is common in test rounds. Effort small: two guards on the server, the window already copes. Not seen in a round; nothing was run.
