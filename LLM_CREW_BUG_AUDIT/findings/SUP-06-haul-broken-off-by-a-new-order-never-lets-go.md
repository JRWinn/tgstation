---
id: SUP-06
title: A body sent somewhere else in the middle of a haul keeps dragging the crate, and a crate being collected stays "being taken away" for good
kind: bug
severity: medium
effort: small
confidence: likely
status: found
area: supply
files: code/modules/llm_crew/crew_npc_tools.dm:397, code/modules/llm_crew/crew_npc_tools.dm:409, code/modules/llm_crew/crew_npc_hands.dm:161, code/modules/llm_crew/crew_npc_held.dm:400, code/modules/llm_crew/crew_npc_held.dm:372
fix: Have start_walk and start_errand end a haul they replace - let go, clear collected_by, tell the brain - and let a collected_by claim lapse when nobody is pulling the crate
---

## What is wrong

Every haul ends in one of four procs: `freight_hauled`, `crate_released`, `crate_collected`, `crate_taken_back`. Those are the only places the body lets go of the crate (`stop_pulling`), and `crate_collected` is the only place `entry.collected_by` is cleared. All four are reached from `walk_finished`.

`walk_finished` returns at once when the walk it is being told about has been replaced:

    	// A newer walk has replaced this one; it will report for itself.
    	if(blackboard[BB_CREW_NPC_WALK_TARGET] != target)
    		return

So when a body that is hauling is given any tool that starts a new walk or a new errand, the haul never ends:

- **It is still pulling the crate.** Nothing calls `stop_pulling`. `grep -n stop_pulling code/modules/llm_crew/` shows it only in the haul finishers, the grip code and the security and eviction code. The crate goes wherever the body goes next.
- **The brain is told nothing about the haul.** No `action_result` for `collect_crate`, `unload` and so on.
- **A crate being collected stays `collected_by` that body.** `tool_collect` refuses everyone else ("X is already taking crate #N away"), `tool_release` refuses to bring it out again, `held_waiting` leaves it out so nobody is reminded of it, `misplaced_crates` leaves it lying wherever it is, and `crew_npc_crate_lost` will never call it "emptied". It is held for ever and nobody can take it.

The window does send a new tool in the middle of a walk. `orderToDrop` in `driver.ts` is "the one thing it drops what it is doing for": a ready task of urgency `emergency` (an order from someone the body answers to, a call to flee). And the model's own reply to someone speaking can carry `go_to` or `walk_to`.

One case:

1. A janitor has come for crate #12. `haul_collected` sets `entry.collected_by = "Ysabel Harrold"`, takes hold of the crate and starts the walk to the Custodial Closet.
2. Halfway there the Head of Personnel calls a meeting, or the Captain says "Ysabel, come to the bridge". The window sends `go_to`.
3. `tool_go_to` calls `start_walk`. `walk_tool` becomes `go_to` and the walk target key is set to the new spot. The old walk's `finish_action` calls `walk_finished(old target, FALSE)`, which sees a different target on the blackboard and returns.
4. Ysabel walks to the Bar with crate #12 behind her and is told "You arrive in Bar". She is still pulling it. The crate is left wherever she happens to be when something else breaks the pull.
5. Crate #12's entry says `collected_by = "Ysabel Harrold"` for the rest of the round. If her brain later asks to collect it again it is allowed (the name matches), but nothing makes it ask: the window's pick-up task was for a crate in the lobby.

For a technician the same thing happens with `unload`, `recycle`, `stow_crate` and `release`: called to the counter in the middle of unloading, it drags the crate to the counter. That at least rights itself, since the crate is in cargo's rooms and gets stowed.

A second way to the stuck entry: `collected_by` is a name with no time on it. If the collector's body is deleted (gibbed, or its controller removed) the finisher never runs either.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:397`, `start_walk`. Nothing here asks what walk is being replaced:

    /datum/ai_controller/crew_npc/proc/start_walk(atom/target, tool, goal, timeout)
    	walk_tool = tool
    	walk_goal = goal
    	walk_timeout = timeout
    	last_route_steps = null
    	resting = FALSE
    	// Being sent somewhere ends any search or errand the body was on.
    	cancel_search()
    	cancel_errand()
    	set_blackboard_key(BB_CREW_NPC_WALK_TARGET, target)

`code/modules/llm_crew/crew_npc_hands.dm:161`, `start_errand`, which clears the walk the same way:

    	cancel_search()
    	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)

`code/modules/llm_crew/crew_npc_held.dm:400`, in `haul_collected`, where the claim is made:

    	entry.collected_by = body.real_name

and `:426`, in `crate_collected`, the only place it is given up:

    	// Left where it stopped, it is still there for the taking.
    	if(entry)
    		entry.collected_by = null

`:372`, in `tool_collect`, what everyone else is then told:

    	if(entry.collected_by && entry.collected_by != body.real_name)
    		action_result(CREW_TOOL_COLLECT, FALSE, "[entry.collected_by] is already taking crate #[entry.number] away.", list("no_such_crate" = TRUE))

## How it was found

Read from the code: `start_walk`, `start_errand`, `walk_finished`, the walk leaf's `finish_action` in `crew_npc_motor.dm`, and `orderToDrop` in `driver.ts`. Not seen in a round. I did not check every path by which the window can send a tool mid-walk, so "likely". No round log was searched for a janitor arriving at a meeting with a crate.

`grep` of the change log and the plans for `collected_by` and "called away" finds nothing about this.

## How to fix it

1. Add a proc in `crew_npc_grip.dm`, next to `begin_haul`:

       /// Ends a haul that is being broken off for something else: lets go of the crate where it is and says so.
       /datum/ai_controller/crew_npc/proc/break_off_haul(new_tool)
       	var/tool = walk_tool
       	if(!blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) || !CREW_NPC_HAULS_CRATE(tool))
       		return
       	// The same haul carrying on is not a new job: taking the crate up again, or putting it clear.
       	if(new_tool == tool || new_tool == CREW_TOOL_PUT_CLEAR || tool == CREW_TOOL_PUT_CLEAR)
       		return
       	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
       	finish_haul(tool, FALSE, "you were called away")

   `finish_haul` already does the right thing for each tool on a failure: lets go, clears `collected_by`, calls `freight_changed`, and tells the brain where the crate was left.
2. Call `break_off_haul(tool)` as the first line of `start_walk` and of `start_errand`. Check the three callers that restart a haul on purpose still work: `go_back_for` / `take_up` (the walk key is already clear by then), `haul_clear` (new tool is `put_clear`), and `go_back_to`.
3. `finish_haul` on a failure may leave the crate in a doorway. That is no worse than today, and for cargo's rooms `misplaced_crates` picks it up. If the owner wants better, the body could put it clear first (`put_clear`) before it obeys, at the cost of some seconds on an emergency.
4. Give `collected_by` a way to lapse, for the cases no finisher covers. In `crew_npc_held_crates()` (`crew_npc_held.dm`), for an entry with `collected_by` set: if the crate has no `pulledby`, note the time on the entry (`loose_since`), and when that is more than `CREW_NPC_CRATE_CLAIM` (45 seconds) old, set `collected_by = null`. Clear `loose_since` whenever the crate is being pulled.
5. Window: a `collect_crate` result with `ok` false already puts the pick-up back (`pickupsAfterActing`). But this result will arrive when the last act was the new tool, so `noteResult` in `driver.ts` will not match it. Check `jobs/pickups.ts`: the pick-up task should reopen from the server's `held_crates` list (the crate is `out` again with no `taken_by`), not only from the tool's result.

What must keep working: a crate that slips the grip is still gone back for three times (`crate_got_away`), and a haul that ends by itself still reports once, not twice.

## How to test the fix

- Server compile to a side copy.
- Simulator: the scenarios with a collection in them (see the list at the top of `sim.ts`), with one new case where the simulated Captain gives the janitor an order halfway through `collect_crate`. The simulator plays the server, so it has to be taught to answer the broken-off haul with a failed `collect_crate` result as step 1 would.
- In a round: have a janitor collect a crate and call it away mid-haul. It should let go where it stands. `game.log` should have the haul's failure line, and the crate's line in the Crew Brain window should show nobody taking it. Then send someone else for it: `collect_crate` must be accepted.
