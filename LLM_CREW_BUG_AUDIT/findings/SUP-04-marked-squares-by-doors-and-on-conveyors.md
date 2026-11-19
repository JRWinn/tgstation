---
id: SUP-04
title: Any painted box on the bay floor is taken for a crate square, with no look at doors or conveyors, so on some maps crates are stood on the loading conveyor by the dock doors
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_freight.dm:93, code/modules/llm_crew/crew_npc_freight.dm:75, code/modules/llm_crew/crew_npc_freight.dm:191
fix: Leave out of crew_npc_marked_squares any painted tile that has a conveyor on it or a door within one tile
---

## What is wrong

`storage_spot` is careful about where a crate is left: not within two tiles of a door, not on a conveyor, not beside the post. But it first asks `free_square`, and `free_square` takes any tile of the bay painted with a "bot" or "bot_white" box that is safe and not blocked. None of the other checks is made for a painted tile.

On MetaStation that is harmless: the Cargo Bay's sixteen `bot_white` squares are a four by four block in the middle of the room, none near a door. On other stations the same paint marks other things.

- **KiloStation** (`_maps/map_files/KiloStation/KiloStation.dmm`, `/area/station/cargo/storage`): eight `bot` tiles have an `/obj/machinery/conveyor` on them, the two loading lines from the dock at y 109 (x 157 to 160) and y 113 (x 158 to 160), and (158,115). Three of them, (158,115), (160,113) and (160,109), also stand next to the dock's airlocks and blast doors. A conveyor is not dense, so `is_blocked_turf` passes them. They are "free squares", and the two by the dock are the nearest to anyone coming off the shuttle.
- **DeltaStation**: six `bot` tiles of the bay are within a tile of a door. Today each has a machine or a cabinet on it and is blocked, but only by luck of the furniture.

One case, on KiloStation:

1. The shuttle docks with three crates. `tool_unload` asks `storage_spot()`, which returns `free_square(here)`: the nearest painted tile to the body, which from the shuttle is one of the conveyor tiles at the dock.
2. The technician hauls the crate there. `freight_hauled` even takes "one step on" to draw the crate onto the square. The crate now stands on the loading conveyor, one tile from the dock door.
3. `misplaced_crates()` sees a crate within a tile of a door (its first loop does not look at `crew_npc_left_on`) and counts it as misplaced. The window opens a STOW task, urgency "asked".
4. `haul_freight` for STOW asks `free_square(get_turf(crate))`: the nearest other free painted tile. The crate's own tile is blocked by the crate. From (160,113) the nearest is (159,113), the next tile of the same conveyor line.
5. (159,113) is two tiles from the dock doors, so the crate is not misplaced again: it stays on the loading conveyor. Every crate unloaded after it does the same, so the conveyor lines fill with crates, each hauled twice. If the conveyor is switched on, the crates are carried off their squares as well. (The write-up first said the crate goes back and forth between the door tiles; from these squares it does not, unless the next tiles of the line are taken and only another door tile is free.)

Two more things follow from the same lines:

- The paint is matched by two icon states only, `"bot_white"` and `"bot"`. A bay marked with `delivery` or `box` paint (both are used for crate spots on other maps: DeltaStation's bay has twenty-one `delivery` tiles) has "no marked squares", and the whole second half of `misplaced_crates` and the square logic in `freight_hauled` never runs there. That is safe, only different from MetaStation. It is said here so nobody is surprised.
- `crew_npc_marked_squares` keeps its answer for ever once it has found any (`static/list/found`, keyed by `REF(room)`). A tile whose paint is scraped off, or whose floor is replaced, stays a "square". Low.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:93`, `free_square`:

    	for(var/turf/square as anything in crew_npc_marked_squares(get_area(post_turf), post_turf.z))
    		if(!crew_npc_safe_turf(square) || square.is_blocked_turf(exclude_mobs = TRUE))
    			continue
    		var/distance = get_dist(square, here)

Compare `storage_spot` a few lines on, for a tile with no paint:

    		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf() || get_dist(candidate, post_turf) <= 1)
    			continue
    		if((locate(/obj/machinery/conveyor) in candidate) || !crew_npc_clear_of_doors(candidate, 2))
    			continue

`:75`, `crew_npc_marked_squares`:

    	for(var/turf/open/tile in room.get_turfs_by_zlevel(z_level))
    		for(var/mutable_appearance/paint as anything in tile.overlays)
    			if(paint.icon_state == "bot_white" || paint.icon_state == "bot")
    				squares += tile
    				break

`:191`, the first loop of `misplaced_crates`, which calls a crate on such a square misplaced:

    	for(var/obj/structure/closet/crate/crate as anything in crates_in_hand())
    		if(crew_npc_clear_of_doors(crate))
    			continue

`crew_npc_clear_of_doors` (`crew_npc_cargo.dm:271`) counts every `/obj/machinery/door` that is not a fire door: airlocks, windoors, shutters and blast doors.

## How it was found

Read from the code. The maps were checked with a throwaway script (bun, kept outside the repo) that reads a `.dmm` file and lists, for `/area/station/cargo/storage`, each tile with a `turf_decal/bot`, `box` or `delivery` on it, what else is on the tile, and any door within one tile. It printed for KiloStation, among others:

    158,115 bot objs=[/obj/machinery/conveyor/inverted] doors=[airlock/mining/glass@159,116]
    160,113 bot objs=[/obj/machinery/conveyor] doors=[poddoor@161,113 airlock/external/glass@161,112]
    160,109 bot objs=[/obj/machinery/conveyor] doors=[airlock/external/glass@161,110 poddoor@161,109]

and for MetaStation sixteen `bot_white` tiles at x 69 to 72, y 146, 148, 150 and 152, none with a door beside it.

Not seen in a round: every round so far was on MetaStation. Whether the crate really hops between the three tiles on KiloStation depends on which squares are free at the time. That it is stood on a conveyor by the dock door when that tile is nearest follows from the code.

## How to fix it

1. In `crew_npc_marked_squares`, when a painted tile is found, add it only if it has no conveyor on it and no door within one tile:

       if((locate(/obj/machinery/conveyor) in tile) || !crew_npc_clear_of_doors(tile))
       	break

   Doing it there, and not in `free_square`, keeps every user of the list in step: `free_square`, the second loop of `misplaced_crates` (`get_turf(crate) in squares`) and the "one step on" in `freight_hauled`.
2. Also leave out a tile within one tile of `post_turf`, as `storage_spot` does, so a crate is not stood on the technician's own spot at the counter. `crew_npc_marked_squares` is a plain proc keyed by room and knows no post, so this test goes in `free_square` (`get_dist(square, post_turf) <= 1`), not in the list.
3. Leave the two icon states as they are unless the owner wants `delivery` and `box` paint to count as well. That is a design question: on DeltaStation `delivery` paint also marks the mulebot stops. I would not widen it.
4. The cache: key it as now, but look again every few minutes even when squares were found (drop the `length(squares) ||` from the test), so a changed floor is noticed. The scan is one pass over the bay's tiles.

What must keep working: on MetaStation the same sixteen squares are found, and crates are stood on them as now.

## How to test the fix

- Server compile to a side copy.
- No simulator case: the window is only told a count (`freight.misplaced`).
- The same map script can be run before and after to list which painted tiles pass the new test on each station. On KiloStation all eight conveyor tiles must drop out, and the three by a door with a machine on them, (150,113), (150,109) and (154,118); the ten in the block at x 153 to 155 must stay. On MetaStation all sixteen must stay.
- In a round on KiloStation (the owner has not played one): order two crates and watch where they are stood: on the block of squares in the bay, not on the loading lines at the dock. The `stow_crate` results are not written to `game.log`; look in `crew_brain.log` for a `stow_crate` straight after each `unload`, which is the double haul this causes today.

## Check

Checked by Opus 5.5. Confirmed, with the KiloStation tiles and step 5 of the case corrected.

- Read `crew_npc_marked_squares`, `free_square`, `misplaced_crates`, `storage_spot`, `haul_freight` and `freight_hauled` (`crew_npc_freight.dm:75` to `:520`) and `crew_npc_clear_of_doors` (`crew_npc_cargo.dm`). The quotes are what the code says. A painted tile gets none of `storage_spot`'s checks; `misplaced_crates`' first loop calls any crate within a tile of a non-fire door misplaced; STOW of a crate in the bay goes to `free_square(get_turf(crate))` first.
- Ran my own throwaway map reader (bun, in the scratchpad, outside the repo) over KiloStation, MetaStation and DeltaStation for `/area/station/cargo/storage` tiles with `turf_decal/bot` or `bot_white`. KiloStation: twenty-one `bot` tiles, eight of them with a conveyor (157-160,109; 158-160,113; 158,115), three of those within a tile of a door, as the finder said. MetaStation: sixteen `bot_white` tiles, none by a door. DeltaStation: six by a door, each with a dense machine or cabinet on it, as the finder said.
- Wrong in the write-up: only three conveyor tiles were named, and the crate was said to go back and forth. From (160,113) the STOW goes to (159,113), which is clear of the doors, and it stays there. Mended. The fault is still real: crates are stood on the loading conveyor lines and each is hauled twice.
- Already known in part: the change log's entry for round 13.32 lists under "Known and not fixed" "A crate on a marked square that is within a tile of a door would be moved again. The bay on MetaStation has no such square." This finding adds the conveyors, the maps where it happens and the fix, so it stands.
- The fix is right and keeps the rules (it only narrows which painted tiles count). Doing it in `crew_npc_marked_squares` keeps `free_square`, `misplaced_crates` and `freight_hauled` in step. Step 2 had to move to `free_square`: mended. Not checked in a round: that the decal is readable from `tile.overlays` at all, which the change log also lists as unseen.
