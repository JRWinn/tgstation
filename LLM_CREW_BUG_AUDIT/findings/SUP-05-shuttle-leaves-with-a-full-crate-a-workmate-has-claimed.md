---
id: SUP-05
title: The shuttle is sent away, and its load sold, while a full crate a workmate has set off for is still aboard
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_freight.dm:165, code/modules/llm_crew/crew_npc_cargo.dm:446, code/modules/llm_crew/crew_npc_freight.dm:623, code/modules/llm_crew/crew_npc_freight.dm:276, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:111
fix: Decide whether the shuttle may leave from every full crate aboard, not only from those no workmate has claimed
---

## What is wrong

"Is there anything left to unload?" is asked in four places before the shuttle is sent, and all four use a count that leaves out a crate a workmate has claimed. A claim is made the moment a workmate's brain calls `unload`, before its body has taken a step, and it stands for 45 seconds (`CREW_NPC_CRATE_CLAIM`) whether or not the workmate ever gets there. So while one technician is walking to the last full crate, the other is told the shuttle is unloaded.

The shuttle will not fly with a living body aboard, so nothing goes wrong once the workmate has reached the deck. The gap is the walk to it, and any time the workmate was called away after claiming.

When the supply shuttle reaches the far dock the game sells everything on it that is not fixed down (`sell()` in `supply.dm`). A full crate left aboard is sold with what is in it. If it was a crate being held for someone, its held entry finds the crate deleted, calls it "destroyed", and it is written off as lost.

One case, with two technicians and two orders close together (the Quartermaster has given Maria the counter and Sam the shuttle):

1. Order 1 docks: two janitorial crates and a mail crate. Maria is in the bay, so `order_arrived` runs at once and her `supply_run_active` goes FALSE with all three crates still aboard.
2. The Quartermaster gives Maria order 2. She places it. Her `supply_run_step` now runs every five seconds. The order is not aboard and the shuttle is docked, so it asks `crate_to_unload()`.
3. Sam unloads. When he calls `unload` for the last full crate, `tool_unload` claims it and he starts to walk.
4. Maria's next tick: `crate_to_unload()` skips the crate because `crate_taken(crate)` is TRUE (Sam's claim). It returns null. `shuttle.canMove()` is TRUE: Sam is not on the deck yet. `SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)`.
5. The shuttle leaves with the last crate of order 1. Sam's errand fails. A minute later the crate and its contents are sold. Its held entry becomes lost: "it has been destroyed".

The same hole is open through the `send_shuttle` tool with no order pending: Maria's window is told `to_unload` is 0 (the same count), opens a SEND task, and `tool_send_shuttle` agrees.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:165`, `crate_to_unload`:

    	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
    		if(crate.anchored || crew_npc_crate_spent(crate) || crate_taken(crate))
    			continue

`code/modules/llm_crew/crew_npc_cargo.dm:446`, in `supply_run_step`:

    				// Something that came on it has yet to be hauled off. Sent now, it would go back with it.
    				if(crate_to_unload())
    					addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
    					return
    				if(shuttle.canMove())
    					SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)

`code/modules/llm_crew/crew_npc_freight.dm:623`, in `tool_send_shuttle`:

    	if(supply_run_active || crate_to_unload())
    		action_result(CREW_TOOL_SEND, FALSE, "There is still something aboard the supply shuttle that has to come off first.")
    		return

`send_shuttle_back` (same file, line 633) does not ask again at the console at all. It only counts every crate aboard and calls them "empty" in what it says.

`code/modules/llm_crew/crew_npc_freight.dm:276`, in `freight_state`:

    		// One a workmate is already hauling off is not this body's to unload.
    		if(!crate_taken(crate))
    			to_unload++

`tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:111`, in `syncFreight`:

      keep(
        brain,
        SEND,
        docked &&
          freight?.toUnload === 0 &&
          freight.emptyCrates === 0 &&
          !freight.mailCrate &&
          !brain.orderPending,
      );

The claim, `crew_npc_freight.dm:141` and `:159`:

    /datum/ai_controller/crew_npc/proc/claim_crate(obj/structure/closet/crate/crate)
    	GLOB.crew_npc_crate_claims[REF(crate)] = list(WEAKREF(src), world.time)
    ...
    	if(QDELETED(claimant) || world.time - claim[2] > CREW_NPC_CRATE_CLAIM)

Nothing takes a claim back when the errand it was made for fails or is dropped.

## How it was found

Read from the code. Not seen in a round. Whether it happens depends on a five-second timer falling inside a workmate's walk to the last crate, so it is rated likely, not sure. With the mail crate still aboard the shuttle will not move at all (mail is barred), which hides it in rounds where the mail is the last thing taken off.

## How to fix it

Leaving a workmate's crate out of "what is mine to unload" is right. Using the same count for "may the shuttle go" is the fault. Keep the two apart.

1. Add a proc beside `crate_to_unload` in `crew_npc_freight.dm`:

       /// How many crates aboard the docked shuttle still have something in them, whoever is going for them.
       /datum/ai_controller/crew_npc/proc/full_crates_aboard()
       	var/count = 0
       	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
       		if(!crate.anchored && !crew_npc_crate_spent(crate))
       			count++
       	return count

2. In `supply_run_step`, replace `if(crate_to_unload())` with `if(full_crates_aboard())`.
3. In `tool_send_shuttle`, replace `crate_to_unload()` with `full_crates_aboard()`.
4. In `send_shuttle_back`, in the docked branch, ask again before the shuttle is moved, since the walk to the console took time: if `full_crates_aboard()`, return `list(FALSE, "There is still something aboard the supply shuttle that has to come off first.")`. Count `empties` from spent crates only, so the words are true.
5. In `freight_state`, add `"full_aboard" = <that count>` to the list. In the window, add `fullAboard` where `brain.freight` is filled (`brain.ts`, next to `toUnload`) and to its type in `types.ts`, and change the SEND test in `syncFreight` from `freight?.toUnload === 0` to `(freight?.fullAboard ?? freight?.toUnload) === 0`. Add the field to the simulator's freight state in `tools/llm_crew/sim.ts`.
6. Release a claim when its errand ends without the crate in hand: in `finish_errand` (`crew_npc_hands.dm`), when the tool was `unload`, `stow_crate` or `recycle` and the outcome is a failure, remove the body's own entry from `GLOB.crew_npc_crate_claims`. Also in `cancel_errand` when `errand_tool` is one of those. Then a workmate called away does not keep a crate out of everyone's count for 45 seconds.

What must keep working: two technicians still do not go for the same crate (`crate_taken` is untouched), and a shuttle with only empties aboard is still sent.

## How to test the fix

- Type check, then `sim.ts quiet` on the freight scenarios (the list is at the top of `sim.ts`), a few runs each.
- A new simulator case is cheap: two technicians, the shuttle docked, `to_unload` 0 and `full_aboard` 1 for one of them. That one must not open a SEND task.
- Server compile to a side copy.
- In a round: give two orders one after the other and watch the second. In `game.log`, "sent the supply shuttle away with N crate(s) aboard" must never follow an `unload` errand that then fails, and no "wrote off held crate ... it has been destroyed" should appear for a crate that was never hauled off.
