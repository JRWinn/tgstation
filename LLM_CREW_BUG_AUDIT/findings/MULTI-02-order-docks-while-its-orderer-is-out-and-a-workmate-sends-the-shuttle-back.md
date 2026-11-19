---
id: MULTI-02
title: An order that docks while the technician who placed it is out of the bay is unloaded as plain freight by its workmate, the shuttle is sent back and called home again for nothing, and after two misses the order is given up with its crate sitting in the bay
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:439, code/modules/llm_crew/crew_npc_cargo.dm:460, code/modules/llm_crew/crew_npc_cargo.dm:423, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:111, code/modules/llm_crew/crew_npc_freight.dm:623
fix: Once the order has left the shopping list and the shuttle has docked home with it, stop moving the shuttle and stop the timeout, and let order_arrived find the crates in the bay whenever the orderer is next there
---

## What is wrong

`supply_run_step` only counts an order as arrived if the technician who placed it is standing in the bay at a moment when the shuttle is docked at the station. Anywhere else "it finds out when it next gets back". But its workmate does not wait for that. To the workmate the order's crates are ordinary freight: it hauls them off, and with nothing left aboard its window opens a SEND task (its own `orderPending` is false) and its body sends the shuttle away. The orderer's timer then sees the shuttle at the far dock and calls it straight back, because `supply_run_step` still thinks the order has not come. Each miss costs a two-minute round trip with nothing on it. The run times out six minutes after the order was placed, so two misses end it with "What you ordered has still not come. Something is holding the supply shuttle up", while the crates have been in the bay for minutes. `order_arrived` never runs: no held entry, no number, no PDA to whoever asked, and the Quartermaster's book never hears it came.

One concrete case, the standing test crew (two technicians, Sam and Maria):

1. 0:00. The Head of Personnel asks Sam for a janitorial crate. Sam places it. `supply_run_step` sends the shuttle away (it was docked and empty) and calls it home from the far dock.
2. Sam's rounds come due (`syncRounds`: quiet, at its post a while) and Sam walks off to look in on the Warehouse, or goes to the lobby to bring out a held crate, or to the Quartermaster's door.
3. 2:10. The shuttle docks at the station with the crate. Sam is not in the bay, so `supply_run_step` re-arms and waits.
4. Maria's window: `toUnload` is 1. She unloads it to a marked square. Then `toUnload` 0, no empties, no mail, `orderPending` false: SEND. `tool_send_shuttle` checks only Maria's own `supply_run_active`, so at about 3:00 the shuttle leaves.
5. 4:00. The shuttle is idle at `cargo_away`. Sam's timer: `docked_at == "cargo_away"`, so it calls it home. 5:00 it docks, empty.
6. If Sam is back in the bay now, `order_arrived` finds the crate in the bay by its manifest number and all is well, two and a half minutes late. If Sam is out again (a meeting, the lobby), Maria sends the shuttle away again at about 5:50, and at 6:00 Sam's run times out.

From then on the crate is a full crate on a square in the bay that no one is holding for anyone. Nobody is told it came. The Head of Personnel is never sent a number, and orders again.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:436`, in `supply_run_step`: arrival is only seen from the bay, and everywhere else the run goes on moving the shuttle:

    			if(docked_at == "cargo_home")
    				// The body learns of it the way a person would: it is in the bay and sees the shuttle dock.
    				// Anywhere else, it finds out when it next gets back.
    				if(aboard && (isnull(post_turf) || get_area(pawn) == get_area(post_turf)))
    					order_arrived()
    					return
    				if(aboard)
    					addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
    					return
    	...
    		else if(docked_at == "cargo_away")
    			SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)

`crew_npc_cargo.dm:423`, the timeout that is still running after the order has come:

    	if(world.time - supply_run_started_at > CREW_NPC_SUPPLY_TIMEOUT)
    		supply_run_active = FALSE
    		pending_order = null
    		action_result(CREW_TOOL_ORDER, FALSE, "What you ordered ([ordered_words]) has still not come. Something is holding the supply shuttle up.")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:111`, the workmate's SEND, which looks only at its own order:

    keep(
      brain,
      SEND,
      docked &&
        freight?.toUnload === 0 &&
        freight.emptyCrates === 0 &&
        !freight.mailCrate &&
        !brain.orderPending,
    );

`code/modules/llm_crew/crew_npc_freight.dm:623`, `tool_send_shuttle`, the same on the server:

    if(supply_run_active || crate_to_unload())

`order_arrived` itself already copes with the crates having been hauled off ("A workmate may have hauled one off the shuttle already, so the bay and the lobby are looked in as well"), so the only thing missing is that the run stops treating the shuttle as still to be fetched.

## How it was found

Read from the code. Not seen in a round; the times come from `CREW_NPC_SUPPLY_TIMEOUT` (6 minutes) and the supply shuttle's `callTime` of 60 seconds (`code/modules/shuttle/mobile_port/variants/supply.dm:48`). Not checked: how often a technician is out of the bay two minutes after ordering. Rounds, the lobby and the Quartermaster's door all take it out, and SUP-05 is a different fault in the same send (it is about a crate a workmate has claimed). CHEAT-06 is about the window being told the freight from anywhere; this one is the server's own run.

## How to fix it

1. Add `var/supply_run_landed = FALSE` to the controller. Set it FALSE in `place_order`.
2. In `supply_run_step`, when `docked_at == "cargo_home"` and `aboard`, set `supply_run_landed = TRUE` whether or not the body is in the bay.
3. At the top of `supply_run_step`, once `supply_run_landed` is TRUE: never call `moveShuttle` again, and do not apply `CREW_NPC_SUPPLY_TIMEOUT` (or give it a much longer one for "you have not been back to the bay"). Just re-arm until the body is in the bay, then call `order_arrived`.
4. Optional, and the owner's to decide: should a workmate who unloads a crate with a manifest number on it it did not order say so aloud ("Crate 14 came in"), so the orderer knows? That would be the honest way for the orderer to learn of it without walking back.
5. Keep `order_arrived` looking in the bay and the lobby as it does now.

## How to test the fix

- The simulator runs none of this, so it needs a round or a compile: compile to a side copy.
- In a round with two technicians, have one place an order and walk it out of the bay (send it to the lobby). Grep `game.log` for "sent the supply shuttle away" by the other technician and then, with the fix, no "called the supply shuttle in" with zero crates and no "has still not come" line. The held crate should appear in the Crew Brain window's held crates when the orderer walks back in.
