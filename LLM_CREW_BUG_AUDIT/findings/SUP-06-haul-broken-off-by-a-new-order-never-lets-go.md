---
id: SUP-06
title: A body sent somewhere else in the middle of a haul keeps dragging the crate, and a crate being collected stays "being taken away" for good
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_tools.dm:397, code/modules/llm_crew/crew_npc_tools.dm:409, code/modules/llm_crew/crew_npc_hands.dm:161, code/modules/llm_crew/crew_npc_held.dm:400, code/modules/llm_crew/crew_npc_held.dm:372, code/modules/llm_crew/crew_npc_guarding.dm:183, code/modules/llm_crew/crew_npc_guarding.dm:213, code/modules/llm_crew/crew_npc_tools.dm:20, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:726
fix: Have start_walk and start_errand end a haul or a walk out they replace - let go, clear collected_by or call put_out, tell the brain - and let a collected_by claim or an in_hand hold lapse when nobody is pulling
---

## What is wrong

Also written up as: SENSE-07 (the same hole, for a person being walked out of a room by the arm with `throw_out`).

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

**The same hole for a person walked out by the arm** (from SENSE-07). `take_hold_of` starts a walk with `CREW_TOOL_EVICT` (`CREW_NPC_HAULS` counts it as a haul; `CREW_NPC_HAULS_CRATE` leaves it out). Only `walk_finished` then `put_out` lets go of the person, clears `evicting` and calls `let_go_of` on the person's controller. When that walk is replaced:

1. The body is still pulling the stranger, and drags it to wherever the new walk goes.
2. A crew stranger is still "in hand". `taken_hold_of` set `in_hand_until = world.time + CREW_NPC_EVICT_HOLD` (40 s) and `stand_still(40 s)`. Nobody calls `let_go_of`, so for the rest of the 40 s every tool but `say` and `hold` is refused with "[name] has you by the arm and is walking you out.", and its window shows `in_hand` and does nothing. That is still said after the pull has broken, because nothing looks at `pulledby`.
3. The keeper's brain is told nothing about the walk out, and `evicting` is left set.

The same "held though nobody holds it" happens when the keeper dies or is knocked out mid-walk: its controller stops, `put_out` never runs, and the stranger stands still for the rest of the 40 s.

The window cuts a walk short in more ways than an order: `driver.ts:726` drops what the body is doing for an order from someone it answers to (`orderToDrop`), for being told to leave (`dropToLeave`), and for being asked to step aside (`dropToMove`, asked by anyone). Case: a cargo technician is walking a janitor out of the Cargo Bay by the arm. Someone in the bay asks the technician to step aside. The window sends `step_aside`, `tool_step_aside` starts a walk of a tile or two, and the `throw_out` walk is replaced and never reports. The technician steps aside with the janitor still in tow and goes on to its next step with the janitor pulled behind it, inside the bay. The janitor is told for up to 40 s that it is being walked out, and stands still. After that it is free to act but still pulled; the technician's brain thinks the matter is open, asks again, and sends `throw_out` again.

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

`code/modules/llm_crew/crew_npc_guarding.dm:213`, in `taken_hold_of`, a hold that runs on the clock:

    	in_hand_until = world.time + CREW_NPC_EVICT_HOLD
    	in_hand_of = by.name
    	stand_still(CREW_NPC_EVICT_HOLD, by)

`code/modules/llm_crew/crew_npc_tools.dm:20`, the refusal that trusts that clock:

    	if(world.time < in_hand_until && tool != CREW_TOOL_SAY && tool != CREW_TOOL_HOLD)
    		action_result(tool, FALSE, custody_words() || "[in_hand_of] has you by the arm and is walking you out.")

`code/modules/llm_crew/crew_npc_guarding.dm:187`, `put_out`, the only end of a walk out.

## How it was found

Read from the code: `start_walk`, `start_errand`, `walk_finished`, the walk leaf's `finish_action` in `crew_npc_motor.dm`, and `orderToDrop` in `driver.ts`. Not seen in a round. I did not check every path by which the window can send a tool mid-walk, so "likely". No round log was searched for a janitor arriving at a meeting with a crate.

`grep` of the change log and the plans for `collected_by` and "called away" finds nothing about this.

The walk-out side (SENSE-07) was read from the code by a second finder, sure of it, not seen in a round.

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

   Cover the walk out by the arm in the same helper (from SENSE-07): test `CREW_NPC_HAULS(tool)` rather than `CREW_NPC_HAULS_CRATE(tool)`, and when `tool == CREW_TOOL_EVICT` call `put_out(FALSE, "you were called away")` in place of `finish_haul`. `put_out` lets go, clears `evicting`, tells the stranger's controller (`let_go_of`), and gives the brain a result. One helper, so both are mended in one place.
2. Call `break_off_haul(tool)` as the first line of `start_walk` and of `start_errand`. Check the three callers that restart a haul on purpose still work: `go_back_for` / `take_up` (the walk key is already clear by then), `haul_clear` (new tool is `put_clear`), and `go_back_to`.
3. `finish_haul` on a failure may leave the crate in a doorway. That is no worse than today, and for cargo's rooms `misplaced_crates` picks it up. If the owner wants better, the body could put it clear first (`put_clear`) before it obeys, at the cost of some seconds on an emergency.
4. Give `collected_by` a way to lapse, for the cases no finisher covers. In `crew_npc_held_crates()` (`crew_npc_held.dm`), for an entry with `collected_by` set: if the crate has no `pulledby`, note the time on the entry (`loose_since`), and when that is more than `CREW_NPC_CRATE_CLAIM` (45 seconds) old, set `collected_by = null`. Clear `loose_since` whenever the crate is being pulled.
5. Let an `in_hand` hold lapse when the hand is gone (from SENSE-07), for the keeper that dies or is knocked out mid-walk. In `taken_hold_of`, keep a weak reference to `by` (`in_hand_by`). In `look_around` (once a second), if `world.time < in_hand_until` and the body's `pulledby` is not `in_hand_by`, call `let_go_of(by, place, FALSE)` and clear it. Keep the 40 s as the upper bound. Leave security's custody (`custody_phase`) to its own code.
6. Window: a `collect_crate` result with `ok` false already puts the pick-up back (`pickupsAfterActing`). But this result will arrive when the last act was the new tool, so `noteResult` in `driver.ts` will not match it. Check `jobs/pickups.ts`: the pick-up task should reopen from the server's `held_crates` list (the crate is `out` again with no `taken_by`), not only from the tool's result.

What must keep working: a crate that slips the grip is still gone back for three times (`crate_got_away`), and a haul that ends by itself still reports once, not twice.

## How to test the fix

- Server compile to a side copy.
- Simulator: the scenarios with a collection in them (see the list at the top of `sim.ts`), with one new case where the simulated Captain gives the janitor an order halfway through `collect_crate`. The simulator plays the server, so it has to be taught to answer the broken-off haul with a failed `collect_crate` result as step 1 would.
- Simulator, the walk out (from SENSE-07): a technician walking a janitor out, and a step-aside request in the middle. After the fix the technician's window gets a `throw_out` result ("you were called away"), and the janitor's window gets "lets go of you" at once.
- In a round, grep `game.log` for `took hold of` and check each is followed by `walked ... out of` or a fail for the same pair.
- In a round: have a janitor collect a crate and call it away mid-haul. It should let go where it stands. `game.log` should have the haul's failure line, and the crate's line in the Crew Brain window should show nobody taking it. Then send someone else for it: `collect_crate` must be accepted.
