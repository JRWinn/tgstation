---
id: SUP-15
title: Crates are packed onto the bay's block of squares until the middle ones cannot be reached, and a held crate there is then written off as lost, with the count never set back
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_freight.dm:93, code/modules/llm_crew/crew_npc_hands.dm:421, code/modules/llm_crew/crew_npc_held.dm:65, code/modules/llm_crew/crew_npc_freight.dm:305
fix: Let free_square take only a square that leaves every crate on the squares with a free tile beside it, and set entry.unreachable back to 0 whenever the crate is reached
---

## What is wrong

Two things together.

**The squares are filled so that crates wall each other in.** `free_square(here)` gives the nearest free painted square to `here`, which for unloading is where the body stands, on the shuttle. On MetaStation the bay's sixteen squares are one four by four block (SUP-04). Crates are dense, and a body has to stand on one of the eight tiles round a crate to touch it (`can_reach_target_now` is `Adjacent`). Filled from the shuttle side, a column at a time, the block walls in its middle crates once the third column is full: with twelve crates on the squares, the two middle crates of the second column have a crate on all eight sides. With all sixteen full, the middle four are walled in.

**A held crate nobody can get to is written off after two tries, for good.** When the walk to a crate's side fails, `crew_npc_fail_errand` adds one to the crate's `unreachable` count for a `check_held`, `release` or `stow` errand. `crew_npc_crate_lost` calls the crate lost at `CREW_NPC_LOST_AFTER` (2). Nothing ever sets the count back, not when the crates round it go and not when a later errand does reach it. So a crate that was walled in for a while, or that twice could not be reached for any passing reason, is lost for the rest of the round.

Lost means: taken off the held list, said aloud as "Crate 12 for Hop Kins is lost: nobody can get to it", and a LOST notice by PDA to whoever ordered it. The crate is in fact standing in the bay with what was ordered in it. With TRA-03, HEAD-02 and QM-12 that sets off more: the collecting errand ends, the head stops ordering for that asker, or the Quartermaster orders it again.

A concrete case, on MetaStation:

1. A long round. Several orders have come in and not been collected yet, mail crates and empties come and go, and some crates sit in the bay unheld (SUP-02, SUP-12). Twelve crates are on the squares, filled from the shuttle side.
2. Crate #14, held for the Head of Personnel, is on the second column, second row. All eight tiles round it have crates.
3. Five minutes later a technician's `check_held` errand goes for the nearest overdue crate, #14. The walk finds no way to its side and fails. `entry.unreachable` is 1.
4. A janitor comes to the counter for #14. `tool_release`'s errand fails the same way. `entry.unreachable` is 2.
5. On the next look `crew_npc_crate_lost` says "nobody can get to it". The crate is written off and the Head of Personnel is told it is lost.
6. Later the crates beside it are collected and #14 could be reached again. It is not held any more, so it is never handed over. It is a full crate on a square that nobody will move or send back.

A player in the same spot would drag one of the outer crates aside and get at the one behind.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:93`, `free_square`: the nearest free square, with no look at what it shuts in:

    	for(var/turf/square as anything in crew_npc_marked_squares(get_area(post_turf), post_turf.z))
    		if(!crew_npc_safe_turf(square) || square.is_blocked_turf(exclude_mobs = TRUE))
    			continue
    		var/distance = get_dist(square, here)
    		if(distance < nearest_distance)

`code/modules/llm_crew/crew_npc_hands.dm:421`, in `crew_npc_fail_errand`:

    	if(istype(target, /obj/structure/closet/crate) && (crew_controller.errand_tool == CREW_TOOL_CHECK_HELD || crew_controller.errand_tool == CREW_TOOL_RELEASE || crew_controller.errand_tool == CREW_TOOL_STOW))
    		var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(target)
    		if(entry)
    			entry.unreachable++

`code/modules/llm_crew/crew_npc_held.dm:65`, in `crew_npc_crate_lost`:

    	if(entry.unreachable >= CREW_NPC_LOST_AFTER)
    		return "nobody can get to it"

`grep -n "unreachable" code/modules/llm_crew/*.dm` finds only the variable, the `++` and this test: it is never set back.

## How it was found

Read from the code. The four by four block is from SUP-04's reading of `MetaStation.dmm`. Not seen in a round: the test rounds so far have not had twelve crates on the squares at once as far as I know (not searched). TRA-03 takes a crate "boxed in by other crates on the bay's squares" as the start of its own case, which is this, but does not write it up. The pathfinder does not route over a shut crate: crates have no `CanAStarPass` of their own, and the default in `code/game/atom/_atom.dm:1005` is `. = !density`. Confidence is likely, not sure, only because the order the squares fill in depends on where the body stands each time, so the exact count at which a crate is first walled in varies.

## How to fix it

1. In `free_square`, skip a square if putting a crate on it would leave any crate already on a square, or the new one, with no free open tile among its eight neighbours. A small helper, `crew_npc_square_shuts_in(turf/square)`, can test each crate within one tile of `square` with `square` counted as blocked. Where every free square would shut one in, return null so `storage_spot` falls back to its open-floor spot, which already wants open floor all round.
2. Set `entry.unreachable = 0` whenever an errand reaches the crate: at the top of `look_over_held`, `haul_released` and `haul_freight` for a held crate (`crew_npc_held_entry(crate)`).
3. Count a failed reach only when the crate is not merely walled in by crates: in `crew_npc_fail_errand`, if every neighbour of the crate is a crate or a wall and at least one is a crate, do not count it; say so instead ("Crate #14 is boxed in by other crates"), and let cargo move the outer one. Moving one aside is a STOW of that crate to a free spot, which `tool_stow` can do if `misplaced_crates` lists an outer crate that walls in a held one. That last part is the bigger change; steps 1 and 2 alone stop the write-off.

## How to test the fix

Compile. A table case cannot reach this; it needs the server. In a round on MetaStation, put twelve crates on the squares from the shuttle side (or order enough), hold one in the middle, and check `game.log` for "wrote off held crate #... nobody can get to it". After the fix there should be none while the crate is in the bay.
