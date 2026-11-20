---
id: SUP-12
title: A crate a player puts aboard the docked supply shuttle to be sold is taken for one that came in on it, hauled off into the bay, and stops the shuttle leaving until it is
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 523ac5f1d43
found_by: Opus 5.5
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_freight.dm:267, code/modules/llm_crew/crew_npc_freight.dm:165, code/modules/llm_crew/crew_npc_freight.dm:623, code/modules/llm_crew/crew_npc_cargo.dm:446, tgui/packages/tgui/interfaces/CrewBrain/jobs/freight.ts:82
fix: Note which crates are aboard when the shuttle docks at the station and unload only those, so a crate put aboard afterwards goes out with the shuttle
---

## What is wrong

Selling is how the station earns: the supply shuttle sells everything loose on its deck when it reaches the far dock (`sell()` in `supply.dm`), and cargo's budget starts the round at nothing (QM-15). In the base game players fill a crate with things to sell, haul it aboard while the shuttle is docked, and send the shuttle.

Crew cargo staff cannot tell such a crate from one that came in on the shuttle. Every look at the freight takes any crate aboard that holds something to be one that came on it:

    	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
    		...
    		// It came in with something in it: when it is empty, it is one that goes back.
    		crate.crew_npc_came_by_shuttle = TRUE
    		// One a workmate is already hauling off is not this body's to unload.
    		if(!crate_taken(crate))
    			to_unload++

So:

1. The window opens an UNLOAD task (`keep(brain, UNLOAD, docked && (freight?.toUnload ?? 0) > 0)`), and `tool_unload` hauls the player's crate off the shuttle and into the bay.
2. Until it is off, nobody will send the shuttle: `tool_send_shuttle` refuses ("There is still something aboard the supply shuttle that has to come off first"), and a technician with an order on the go waits in `supply_run_step` (`if(crate_to_unload())`).
3. Once it is in the bay it is a full crate that is not held and not empty. Nothing ever sends it back. The player has to haul it aboard again, and it is hauled off again.

A player who sends the shuttle themselves at the console gets their crate sold only if they send it before a technician has reached it. A technician walking to it holds a claim, but the crate goes with the shuttle; that half is like SUP-05.

A concrete case:

1. The supply shuttle is docked at the station, empty. The Captain fills a crate with things to sell and drags it aboard, and walks off the deck.
2. Within two seconds a technician's `freight_state` says `to_unload` 1. Its window opens UNLOAD.
3. The technician hauls the Captain's crate to a marked square in the bay and is told "You haul the crate off the supply shuttle and leave it in Cargo Bay."
4. The Captain's crate is never sold. The Captain drags it aboard again, and the same happens again.

It is not only players. A crate any crew NPC put aboard for some other reason (an empty that a player then put something in, a crate of the station's own) is the same. Plan alteration 18 in `LLM_CREW_PLAN_ROUND_1332.md` ("loose things left on the marked squares are sold ... anyone with something to sell can put it on a square", a future TODO) is about cargo doing the selling. It does not cover cargo undoing a player's sale, which is a fault now.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:267`, in `freight_state` (quoted above).

`code/modules/llm_crew/crew_npc_freight.dm:165`, `crate_to_unload`, the same test with no question of where the crate came from:

    	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
    		if(crate.anchored || crew_npc_crate_spent(crate) || crate_taken(crate))
    			continue

`code/modules/llm_crew/crew_npc_freight.dm:623`, in `tool_send_shuttle`:

    	if(supply_run_active || crate_to_unload())
    		action_result(CREW_TOOL_SEND, FALSE, "There is still something aboard the supply shuttle that has to come off first.")

## How it was found

Read from the code. Not seen in a round: the test rounds have one human, who has not sold anything by crate yet as far as the logs show (not searched).

## How to fix it

A body standing in the bay sees the shuttle dock and sees what is on it. What is put aboard after that, it sees being put aboard. So the honest rule is: what was aboard when it docked came in on it.

1. Add a global list, `GLOB.crew_npc_shuttle_arrivals`, of weak references to the crates aboard the supply shuttle when it last docked at the station.
2. Fill it when the shuttle docks at `cargo_home`. The plainest place that needs no base-game edit: the first `freight_state` (or the once-a-second look PERF-07 asks for) of any cargo body that finds `docked_supply_shuttle()` non-null after it was null, keyed by a docking count (`world.time` of the first look that saw it docked). Clear the list when the shuttle is found not docked. Do this in one shared proc (say `crew_npc_shuttle_arrivals()`), not inside `freight_state`'s two-second cache: `crate_to_unload` is also called on its own by `supply_run_step`, `tool_send_shuttle` and `tool_unload`, and each of them must see the same list.
3. In `freight_state` and `crate_to_unload`, count and choose only crates in that list. Set `crew_npc_came_by_shuttle` only for those. Take a crate out of the list once it has left the shuttle's areas, so one hauled off and then put back aboard by a player in the same stay at the dock is not hauled off a second time.
4. A crate aboard that is not in the list and holds something is being sent out. Leave it: do not count it as to unload, do not stow it (the stow loop over `crates_aboard()` in `misplaced_crates` already looks at spent crates only).
5. Keep the mail crate rule: a mail crate is always in the list, as it is made at the far dock with the orders.

Question for the owner: should a crew technician ever take a player's crate off on purpose, for example one with mail or a living thing in it that would stop the shuttle? `what_bars_shuttle` already names those, so the plain answer is to say what bars it and leave the crate where it is.

## How to test the fix

The fix is all server side, and the simulator runs only the window code: a simulator case with `freight.to_unload` 0 tests nothing new, as `syncFreight` already opens UNLOAD only when it is above 0. Compile. In the next round, have the Captain haul a full crate aboard and watch `game.log` for "sent the supply shuttle away with 1 crate" and no "haul the ... off the supply shuttle" line for it.

## Check

Checked by Opus 5.5. Read `crates_aboard`, `docked_supply_shuttle`, `crate_to_unload`, `crate_taken`, `freight_state`, `misplaced_crates`, `spent_crates`, `tool_unload`, `tool_send_shuttle` (`crew_npc_freight.dm`), the `crate_to_unload()` wait in `supply_run_step` (`crew_npc_cargo.dm:446`) and `syncFreight` (`jobs/freight.ts:82`). The quotes are as the code stands. Nothing asks where a crate aboard came from: any unanchored, not-spent crate on the docked shuttle that nobody else is pulling counts as to unload, holds up SEND and the order run, and once in the bay is never put back (`spent_crates` wants it empty). The player's own pull covers it only while the player still holds it (`crate.pulledby != pawn`). Read `sell()` in `supply.dm`: everything unanchored on the deck is sold at the far dock, so a full crate aboard is how a player sells. Searched `LLM_CREW_CHANGELOG.md` (the round-1332 entry 14 that added `crew_npc_came_by_shuttle`) and `LLM_CREW_PLAN_ROUND_1332.md` alteration 18: neither covers a crate put aboard to sell. The fix was sound; I added that the arrival list must be shared by all four callers rather than live in the freight cache, and that a crate should leave the list once off the shuttle. Not run.
