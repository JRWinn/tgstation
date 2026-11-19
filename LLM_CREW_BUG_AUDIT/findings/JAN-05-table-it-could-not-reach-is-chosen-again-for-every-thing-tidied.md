---
id: JAN-05
title: A table or bin the body could not walk to is marked skipped but never looked at again, so every thing tidied is picked up, carried at it and dropped
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_tidying.dm:77, code/modules/llm_crew/crew_npc_tidying.dm:89, code/modules/llm_crew/crew_npc_hands.dm:417, code/modules/llm_crew/crew_npc_hands.dm:340, code/modules/llm_crew/crew_npc_tidying.dm:254
fix: Make nearest_surface and nearest_bin skip a place with a fresh tidy_skipped entry, as wants_tidying already does for things
---

## What is wrong

When a tidying errand cannot reach its target, `crew_npc_fail_errand` writes the target into `tidy_skipped`. That works for the thing to be put away: `wants_tidying` and `wants_shutting` read `tidy_skipped` and leave it alone for five minutes. But the target of the second half of the errand is the place it goes, a table, rack or disposal bin. `nearest_surface` and `nearest_bin` never read `tidy_skipped`, so the place that could not be reached is chosen again for the very next thing.

What follows: `finish_errand` sees a failed tidy and calls `drop_tidy_item`, which drops what the body carried where it stopped and skips that thing. `tool_tidy` is called again, `next_to_tidy` finds the next thing on the floor, `place_for` gives the same unreachable table, the body picks the thing up, walks at the table, fails, drops it. Every loose thing in the room is carried part way across it and dropped in turn, and `tidy_state` goes on counting all of them as work to do (it too uses the same surface test). Five minutes later the first ones are free to be tried again.

Concrete case: a cargo technician's Cargo Bay has a table whose open sides are all taken up by crates waiting to be sent (the bay is full of crates most of a round; crates are dense). It is the nearest table with room on it (`crew_npc_free_surface`: fewer than 4 things on it). A box of gloves lies on the bay floor. The technician picks it up, sets off for that table, cannot reach a tile beside it, and `crew_npc_fail_errand` sets `tidy_skipped[REF(table)]`. The gloves are dropped where it stopped. A pen on the floor is next: `nearest_surface(pen)` returns the same table. And so on through the room.

The same holds for a disposal bin that is boxed in or in a part of the room it cannot get to: rubbish is carried at it and dropped.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:417`, in `crew_npc_fail_errand`:

    	if(crew_controller.errand_tool == CREW_TOOL_TIDY && !QDELETED(target))
    		crew_controller.tidy_skipped[REF(target)] = world.time
    		crew_controller.tidy_changed()

`code/modules/llm_crew/crew_npc_tidying.dm:89`, `nearest_surface`, which never reads it:

    	for(var/obj/structure/surface in room)
    		if(!istype(surface, /obj/structure/table) && !istype(surface, /obj/structure/rack))
    			continue
    		if(!crew_npc_free_surface(get_turf(surface)))
    			continue
    		var/distance = get_dist(from, surface)

`code/modules/llm_crew/crew_npc_tidying.dm:77`, `nearest_bin`, the same:

    	for(var/area/room as anything in tidy_rooms())
    		for(var/obj/machinery/disposal/bin/bin in room)
    			var/distance = get_dist(from, bin)

`code/modules/llm_crew/crew_npc_hands.dm:340`, in `finish_errand`, the drop:

    	if(tool == CREW_TOOL_TIDY && !outcome[1])
    		drop_tidy_item()

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. Add a small helper, `tidy_skipped_lately(atom/thing)`, returning TRUE when `tidy_skipped[REF(thing)]` is younger than `CREW_NPC_TIDY_GIVE_UP`. Use it in `wants_tidying` and `wants_shutting` in place of the two copies of that test.
2. In `nearest_surface` and `nearest_bin`, `continue` past any surface or bin for which it is TRUE.
3. In `tidy_state`, the `has_surface` loop and `has_bin` should use the same rule, so the brain is not told there is tidying to do that has nowhere to go.
4. Better, and worth asking the owner: when carrying something and the place cannot be reached, try the next nearest place at once rather than dropping it (`tidy_step` would call `place_for` again and start a new errand). Dropping is what the code does now; the fix above is enough to end the loop.

## How to test the fix

- Server compile to a side copy.
- In a round: put a table in the Cargo Bay with crates on every side, and a few small things on the floor. The technician should put them on another table or leave them, and not carry each one at the boxed-in table. Grep `game.log` for "put away its" and watch the bay.
