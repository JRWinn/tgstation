---
id: KNB-05
title: The supply shuttle is sent out and called home by a timer and a direct call to the shuttle system, wherever the technician is standing
kind: bug
severity: high
effort: large
confidence: sure
status: found
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:450, code/modules/llm_crew/crew_npc_cargo.dm:461, code/modules/llm_crew/crew_npc_freight.dm:642, code/modules/llm_crew/crew_npc_freight.dm:653, LLM_CREW_PLAN_NO_CHEATS.md:155
fix: Lift the cargo console's send code into a proc of its own and have the body press it at the console, twice for an order, as section 4.7 of the no-cheats plan lays out
---

## What is wrong

Two cheats in how the supply shuttle moves, both listed in `LLM_CREW_PLAN_NO_CHEATS.md` and both still in the code. The change log's last line ("Earlier work") has the whole plan as "Planned and not built ... (all but the mail chute)". The owner's memory note has "four cheats to remove", of which this is the largest.

1. **An order's round trip is run by a timer.** After a technician places an order, `supply_run_step` calls itself every few seconds. When the shuttle is idle at the station it calls `SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)`. When it is idle at the far end it calls `SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)`. The body may be anywhere on the station, cuffed, or in a brig cell. No console is touched. A player has to walk to a supply console and press "Send" each time.
2. **Sending it back with empties goes to the console and then round it.** `send_shuttle_back` runs only once the body is standing at a supply console (`start_errand(console, CREW_TOOL_SEND, null)`), which is honest as far as it goes. But what it then does is the same direct `SSshuttle.moveShuttle` call, not the console's own code, so the console's checks do not apply: whether the console is powered or broken, whether its access lets this body use it, and the console's own refusal messages.

Concrete case: a technician places an order and is arrested ten seconds later. In a cell, with its tools refused ("custody_words"), the shuttle still leaves, loads and comes home, because `supply_run_step` is a timer on the controller and asks nothing of the body but `QDELETED(pawn)`. The only place the body's whereabouts matter is learning that the crate has come (`get_area(pawn) == get_area(post_turf)`).

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:449`, in `supply_run_step`:

    			if(shuttle.canMove())
    				SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)
    				supply_held_up_since = 0

and a few lines on:

    		else if(docked_at == "cargo_away")
    			SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)
    	addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)

`code/modules/llm_crew/crew_npc_freight.dm:642` and `:653`, in `send_shuttle_back`:

    		SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)
    		freight_changed()
    		return list(TRUE, "You call the supply shuttle in, to take [waiting] empty crate[waiting == 1 ? "" : "s"] back.")

    	SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)
    	freight_changed()

The plan's table, `LLM_CREW_PLAN_NO_CHEATS.md:81`: "Shuttle | `supply_run_step` | A timer sends the shuttle out and calls it home, wherever the body is." and ":82": "`send_shuttle_back` | Walks to the console first, then calls the shuttle system and not the console."

## How it was found

Read from the code, against the plan. Not seen in a round as a fault, because it works: that is what a cheat looks like in a log.

## How to fix it

Section 4.7 of the plan, accepted by the owner on 2026-11-18. In steps:

1. **One change to a base file.** In `code/modules/cargo/orderconsole.dm`, the "send" branch of `/obj/machinery/computer/cargo/ui_act` holds the send code. Lift it into a proc, `/obj/machinery/computer/cargo/proc/send_shuttle(mob/user)`, and call that from `ui_act`. Nothing changes for players. Add the file to the list of base edits in `LLM_CREW_BUG_AUDIT/FORMAT.md` and `CLAUDE.md`.
2. `send_shuttle_back` calls `console.send_shuttle(body)` after the reach and power checks `work_window` already makes for other machines (`crew_npc_machines.dm`), in place of both `SSshuttle.moveShuttle` calls. The owner's ruling "Send what the window would send" (11:00 entry) covers this.
3. **Take the timer's hands off the shuttle.** In `supply_run_step`, delete both `moveShuttle` calls. Keep the proc as a watcher only: it still notices the order is aboard and the shuttle docked, and still reports "will not leave".
4. **Make the two presses steps of the technician's job.** In `jobs/cargo.ts` (or `jobs/freight.ts`, where `CALL` already lives): after an order is placed, a step "send the shuttle for it" (`send_shuttle`); then back to work; then, after the trip time, a step "call the shuttle home" (`send_shuttle` again). The plan: "If the technician is held up, the shuttle waits at the far end. A workmate at the post may press in its place." The `SEND` and `CALL` steps for empties already exist and already walk to the console: this adds the same for orders.
5. The server must tell the brain where the shuttle is (docked here, away idle, in transit) so the step is offered at the right time. `freight_state` already sends most of it.
6. The dead-model rule: these are coded steps with no speech, so nothing waits on the LLM.

What must keep working: "The supply shuttle will not leave: ..." (`what_bars_shuttle`), an order held up told to whoever ordered after two failures, and the Quartermaster's count of crates in.

Question for the owner (already decided, repeat it when building): "Where does a technician wait between the two presses? It goes back to work and returns to the console."

## How to test the fix

- Server compile to a side copy.
- Simulator: `sim.ts` plays the shuttle itself, so its `order` and `send_shuttle` have to be changed to need the two presses. Then `qm`, `qmbig`, `qmwait`, `crew`, and a new scenario from the plan's list: "an order runs with the technician held up between the two presses".
- A round: `grep "moveShuttle" code/modules/llm_crew/` should find nothing. In `game.log`, each order should show two "sent the supply shuttle" lines by a body standing at a console, and the shuttle should sit at the far end if the technician is busy.
