---
id: SUP-15
title: A held crate that twice could not be reached is written off as lost for good, as its count is never set back, and on a map whose squares form a solid block the middle crates can be walled in
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_hands.dm:421, code/modules/llm_crew/crew_npc_held.dm:65, code/modules/llm_crew/crew_npc_hands.dm:195, code/modules/llm_crew/crew_npc_freight.dm:93
fix: Set entry.unreachable back to 0 in do_errand whenever a held crate is reached, and on maps whose squares form a solid block let free_square skip a square that would wall a crate in
---

## What is wrong

Two things. The first is the fault; the second makes it come up on some maps.

**A held crate nobody can get to is written off after two tries, for good.** When the walk to a crate's side fails, `crew_npc_fail_errand` adds one to the crate's `unreachable` count for a `check_held`, `release` or `stow` errand. `crew_npc_crate_lost` calls the crate lost at `CREW_NPC_LOST_AFTER` (2). Nothing ever sets the count back, not when the way is clear again and not when a later errand does reach the crate. So a crate that twice could not be reached, for any passing reason and however far apart in the round, is lost for the rest of the round. Passing reasons: the three-minute `time_limit` of `crew_npc_reach`, the way shut by an unpowered door (test rounds lose power about 15 minutes in), someone standing in the only gap, a crate left on open floor beside it.

Lost means: taken off the held list, said aloud as "Crate 12 for Hop Kins is lost: nobody can get to it", and a LOST notice by PDA to whoever ordered it. The crate is in fact in the bay with what was ordered in it. With TRA-03, HEAD-02 and QM-12 that sets off more: the collecting errand ends, the head stops ordering for that asker, or the Quartermaster orders it again. Once off the held list it is never handed over, even when it can be reached again.

**On a map whose squares form a solid block, crates wall each other in.** `free_square(here)` gives the nearest free painted square, and crates are dense: the pathfinder will not route through one (crates have `pass_flags_self = PASSSTRUCTURE | LETPASSTHROW`, so the navmap keeps them as live blockers and `CanAStarPass` is `!density` for a human), and a body has to stand on one of the eight tiles round a crate to touch it (`can_reach_target_now` is `Adjacent`). Where three or more rows of squares touch, the middle row's crates have crates on all eight sides once the rows round them are full.

This is not so on MetaStation. Its sixteen squares are four rows of four at x 69 to 72 and y 146, 148, 150 and 152 (SUP-04), with an open row of floor between each two rows. Every crate on a square has the three tiles above and the three below free, so full squares never wall a crate in. The same holds for DeltaStation, IceBox, KiloStation, Nebula and Tram. Of the station maps only CatwalkStation has a solid block: three rows of five at y 119 to 121, x 171 to 175, where with all fifteen full the four middle-row crates at x 171 to 174 are walled in. CatwalkStation is votable from 25 players (`config/maps.txt`).

A concrete case, on any map:

1. Crate #14 is held in the bay for the Head of Personnel.
2. The station's power fails. A technician off on an errand is sent a `check_held` for #14; the door back into the bay will not open without power and the walk fails. `entry.unreachable` is 1.
3. An hour later, with the power back, a janitor comes to the counter for #14 while a player stands in the gap beside it, and the `release` walk times out. `entry.unreachable` is 2.
4. On the next look `crew_npc_crate_lost` says "nobody can get to it". The crate is written off and the Head of Personnel is told it is lost, though it stands on its square and could be reached a moment later.

On CatwalkStation the same comes from the squares alone: with the block full, two errands for a crate in its middle row both fail.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:421`, in `crew_npc_fail_errand`:

    	if(istype(target, /obj/structure/closet/crate) && (crew_controller.errand_tool == CREW_TOOL_CHECK_HELD || crew_controller.errand_tool == CREW_TOOL_RELEASE || crew_controller.errand_tool == CREW_TOOL_STOW))
    		var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(target)
    		if(entry)
    			entry.unreachable++

`code/modules/llm_crew/crew_npc_held.dm:65`, in `crew_npc_crate_lost`:

    	if(entry.unreachable >= CREW_NPC_LOST_AFTER)
    		return "nobody can get to it"

`grep -n "unreachable" code/modules/llm_crew/*.dm` finds only the variable, the `++` and this test: it is never set back.

`code/modules/llm_crew/crew_npc_hands.dm:195`, in `do_errand`, the one place every errand passes once the body is beside its target:

    	if(QDELETED(target) || QDELETED(body) || !can_reach_target_now(target))
    		return list(FALSE, "You could not get to it.")

`code/modules/llm_crew/crew_npc_freight.dm:93`, `free_square`: the nearest free square, with no look at what it shuts in:

    	for(var/turf/square as anything in crew_npc_marked_squares(get_area(post_turf), post_turf.z))
    		if(!crew_npc_safe_turf(square) || square.is_blocked_turf(exclude_mobs = TRUE))
    			continue
    		var/distance = get_dist(square, here)
    		if(distance < nearest_distance)

## How it was found

Read from the code. Not seen in a round. The first write-up said MetaStation's squares were one four by four block; they are not (see Check).

## How to fix it

1. In `do_errand`, just after the `can_reach_target_now` test passes, set the count back: if the target is a crate and `crew_npc_held_entry(target)` gives an entry, `entry.unreachable = 0`. That one place covers `look_over_held`, `haul_released` and `haul_freight`. This alone stops a crate being written off for two failures far apart.
2. Better still, count only failures close together: keep `world.time` of the last failure on the entry, and start the count again at 1 when the last failure is more than a few minutes old. Then a crate is written off only when it could not be reached twice in a row, not twice in a round.
3. For maps whose squares touch in three or more rows (CatwalkStation today), in `free_square` skip a square if a crate on it would leave any crate already on a square, or the new one, with no free open tile among its eight neighbours. A small helper, `crew_npc_square_shuts_in(turf/square)`, can test each crate within one tile of `square` with `square` counted as blocked. Where every free square would shut one in, return null so `storage_spot` falls back to its open-floor spot. On MetaStation the helper must change nothing: all sixteen squares stay usable.
4. Moving an outer crate aside to reach one walled in (a STOW of it to a free spot) is what a player would do, but it is a larger change and steps 1 to 3 make it rare.

## How to test the fix

Compile. A table case cannot reach this; it is server code. In a round, hold a crate, make one `check_held` walk to it fail (stand a mob in its only gap, or cut the bay door's power), let the next errand reach it, then make one more fail: `game.log` should have no "nobody can get to it" for that crate. On CatwalkStation, fill the squares and check that no crate is left with crates on all eight sides.

## Check

Checked by Opus 5.5. Read `crew_npc_fail_errand`, `do_errand` and `can_reach_target_now` (`crew_npc_hands.dm`), `crew_npc_crate_lost` and `crew_npc_held_crates` (`crew_npc_held.dm`), `free_square`, `storage_spot` and `haul_freight` (`crew_npc_freight.dm`), the errand's walk in `crew_npc.bt.json` and `crew_npc_reach` (`crew_npc_storage.dm`), and in the base game the navmap bake (`turf.dm` `nav_evaluate_edge`, `nav_classify_atom`) and the crate's `pass_flags_self` (`crates.dm:19`). The count is only ever raised, so the write-off after two failures in a whole round is real: confirmed.

The walled-in block on MetaStation is wrong. A throwaway script over the `.dmm` files (kept in the scratchpad, not the repo) listed the `bot`/`bot_white` tiles of `/area/station/cargo/storage` on every station map and tested, with every square full, which square has squares, walls or dense furniture on all eight sides. MetaStation: none; its rows are at y 146, 148, 150, 152 with open floor between (as SUP-04 line 77 already says). DeltaStation, IceBox, KiloStation, Nebula, Tram: none. CatwalkStation: four, (171..174, 120), the middle row of its three-by-five block. The body was rewritten round the count, the MetaStation case replaced, the files line led with the count, and effort set to small, as fix step 1 is a few lines in one proc. Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers `unreachable` or a write-off of a crate that can be reached.
