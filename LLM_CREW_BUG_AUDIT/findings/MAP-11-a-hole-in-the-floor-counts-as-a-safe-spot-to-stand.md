---
id: MAP-11
title: A hole down to the floor below counts as a safe spot to stand, so on multi-floor maps a room's spot, its middle or a spawn tile can be open space, which no walk reaches and a body made there falls through
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: 76865ecee56
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:43, code/modules/llm_crew/crew_npc_tools.dm:370, code/modules/llm_crew/crew_npc_cargo.dm:245, code/modules/llm_crew/crew_npc_spawn.dm:79
fix: Make crew_npc_safe_turf refuse any tile the body could fall through, using the turf's own can_cross_safely, so every spot picker leaves holes out
---

## What is wrong

`crew_npc_safe_turf` is the one test every spot picker uses: "solid floor, breathable, and not an airlock to space". It asks `isopenturf`, `isspaceturf`, an outer airlock, and the air pressure. Open space (`/turf/open/openspace`, a hole to the floor below) is an open turf, is not space, and has the room's air at the room's pressure. So it passes.

The game has a test for exactly this: `/turf/open/openspace/can_cross_safely` is false for anyone who would fall (`!crossing.can_z_move(DOWN, ...)`), and the route planner will not path onto it (`/turf/open/openspace/CanAStarPass` returns FALSE for someone who would fall). The idle shuffle in `crew_npc_motor.dm` asks `can_cross_safely` and is safe. Nothing else does. The pickers that use only `crew_npc_safe_turf` and `is_blocked_turf`:

- `safe_spot_in` (`crew_npc_tools.dm:370`): the spot a body walks to for any room it has not stood in, and the spot `learn_place` records for a room it is taught (the Brig, an office, the lobby).
- `middle_of` (`crew_npc_cargo.dm:245`): the middle of a room, for meeting rooms and the officer's and engineer's posts. A room with a well in the middle is where this goes wrong first: the tile nearest the centroid can be over the well.
- `crew_npc_spawn_turf` (`crew_npc_spawn.dm:79`): the tile a body is made on.

Open space inside station rooms, counted from the maps' `.dmm` files: Tramstation's Brig has 46 open-space tiles of its 281 with nothing over them; IceBox's Cargo Bay has 12 bare ones (and 7 more under catwalks, which are safe); NebulaStation's Brig 13; CatwalkStation has hundreds in its hallways, dorms and recreation (many under catwalks). MetaStation has none, which is why it has never shown.

What follows when a hole is picked: a walk there has no route ("there is no way through"), the room is put in `blocked_places`, and a body that has a trail counts it toward being shut in (`note_way_out_failed`). A body made on a hole would fall to the floor below as soon as it is made, hurt. Today that cannot happen: `spawn_test_crew` passes only the lowest station floor (MAP-05), and on Tramstation, IceBox, NebulaStation and CatwalkStation no station room on that floor has open space (counted in the check). With MAP-05 fixed so that rooms on every floor are looked in, the spawn case becomes real on all four, since `crew_npc_spawn_turf` takes the first tile that passes, not a random one.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:43`:

    /proc/crew_npc_safe_turf(turf/destination)
    	if(!isopenturf(destination) || isspaceturf(destination))
    		return FALSE
    	// Stepping into an external airlock opens it and starts it cycling, which ends in vacuum.
    	if(locate(/obj/machinery/door/airlock/external) in destination)
    		return FALSE
    	var/datum/gas_mixture/air = destination.return_air()

`code/game/turfs/open/openspace.dm:211` (base game, the test not used):

    /turf/open/openspace/can_cross_safely(atom/movable/crossing)
    	return HAS_TRAIT(crossing, TRAIT_MOVE_FLYING) || !crossing.can_z_move(DOWN, src, z_move_flags = ZMOVE_FALL_FLAGS)

`code/game/turfs/open/openspace.dm:167` (base game, why the planner finds no way):

    /turf/open/openspace/CanAStarPass(to_dir, datum/can_pass_info/pass_info)
    	...
    	if(our_movable && !our_movable.can_z_move(DOWN, src, null, ZMOVE_FALL_FLAGS))
    		return TRUE
    	return FALSE

## How it was found

Read from the code; the open-space tiles were counted with a throwaway script over the maps. Not seen in a round: only MetaStation has been played. `likely` and not `sure` because `safe_spot_in` samples 40 tiles at random and keeps the nearest, so whether a hole is the one chosen depends on the room and on where the body stands.

## How to fix it

1. Give `crew_npc_safe_turf` an optional `mob/living/walker` argument, and add: `if(!destination.can_cross_safely(walker || <a stand-in>)) return FALSE`. With no walker to hand (the spawn picker, before there is a body), test `istype(destination, /turf/open/openspace) && !(locate(/obj/structure/lattice) in destination)` instead, which is what `can_z_move` comes down to for a human, and refuse `/turf/open/chasm` and `/turf/open/lava` as well, which have their own `can_cross_safely` and pass today for the same reason.
2. Pass the body in `safe_spot_in`, `middle_of`, `spot_inside` and wherever else a body is at hand.
3. `can_cross_safely` also covers turfs marked `TRAIT_AI_AVOID_TURF` (the base proc), which is what the game's own AI is kept off; that is right for the crew too.

## How to test the fix

- Server compile.
- On Tramstation, `learn_place` the Brig for an officer several times (or call `safe_spot_in` from the admin proc-call) and check no spot is on `/turf/open/openspace`.
- On MetaStation nothing changes.

## Check

Confirmed, read from the code, and the open space counted again with a throwaway bun script over the `.dmm` files (outside the repo). Not seen in a round.

- `crew_npc_safe_turf` (`crew_npc_motor.dm:43`) is as quoted: `isopenturf`, not space, no outer airlock, pressure in range. `/turf/open/openspace` is a `/turf/open`, not space, and carries the room's air, so it passes. The only crew caller of `can_cross_safely` is the idle shuffle at `crew_npc_motor.dm:28`.
- `safe_spot_in` (`crew_npc_tools.dm:370`), `middle_of` (`crew_npc_cargo.dm:245`) and `crew_npc_spawn_turf` (`crew_npc_spawn.dm:73`) each take a tile on `crew_npc_safe_turf` and `is_blocked_turf` alone. Open space is not dense, so `is_blocked_turf` does not stop it.
- The walk cannot reach it: crew walks use `navmap_astar`, and `/turf/open/openspace/nav_bake_pathing_pass` (`openspace.dm`) bakes only a flight edge for open space with an open fall below it; the route tests through `get_path_to` use `CanAStarPass`, quoted above, which refuses it too. So the walk ends with `CREW_NPC_NO_WAY`, and `walk_finished` marks the room blocked and may call `note_way_out_failed`.
- Counts of bare open space (no lattice or catwalk on the tile) in station rooms: Tramstation upper floor Brig 46, Cargo Bay 12, Recreation 52; IceBox Brig 6, Cargo Bay 12 (7 more covered); NebulaStation Brig 15 by my count (13 in the write-up, the difference is how catwalk tiles were told apart, and does not matter). None on the lowest station floor of any of the four maps, which is why the spawn case cannot happen until MAP-05 is fixed; the body now says so.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions open space or holes.

On the fix: it works and keeps the rules; it is a test of where to stand, not an action. The base `can_cross_safely` also has overrides for `/turf/open/chasm` and `/turf/open/lava` (`chasm.dm:76`, `lava.dm:367`), which pass `crew_npc_safe_turf` today for the same reason, so passing the body to `can_cross_safely` mends those too. For the case with no body to hand, the stand-in test should cover all three: open space with no lattice, a chasm, or lava. A fourth test step: on Tramstation, call `middle_of(/area/station/security/brig)` from the proc-call menu with a body on the upper floor, and check the tile is not open space. Severity medium stands: it only shows on maps that have not been played, but there it writes off the Brig for an officer.
