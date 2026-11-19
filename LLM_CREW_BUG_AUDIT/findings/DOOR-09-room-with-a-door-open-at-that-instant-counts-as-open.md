---
id: DOOR-09
title: A locked room counts as open to all for the whole round if one of its doors stood open at the instant it was looked at
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: doors
files: code/modules/llm_crew/crew_npc_cargo.dm:153, code/modules/llm_crew/crew_brain_rooms.dm:80, code/modules/llm_crew/crew_npc_cargo.dm:121
fix: In the open-way test of crew_npc_room_is_closed pass over any tile that holds an airlock, a windoor or plastic flaps, so only a way with no door on it counts
---

## What is wrong

`crew_npc_room_is_closed` decides whether a room is "locked to the crew at large". It first looks for "an open way in from the next room, with no door on it": a floor tile of the room, with nothing solid on it, next to a floor tile of another station area with nothing solid on it. If it finds one the room is not closed.

It does not check that there is no door on either tile. An airlock that is standing open is not solid (`density` is FALSE), so `is_blocked_turf` says the tile is free. So a room with an airlock that happens to be open at that instant, because someone has just walked through it, is "not closed".

The answer is worked out once and kept:

- for each cargo body at spawn (`closed_rooms` and `reached_through` in `crew_npc_cargo.dm`, about lines 121 to 150), and never again;
- for the Crew Brain window's list of locked rooms, once a round, the first time a window asks (`crew_npc_find_closed_rooms`: "the answer is kept for the round"). By then the crew are walking about and doors are opening all over the station.

One concrete case, the costly one. The crew are spawned ten seconds into the round (`CREW_NPC_AUTOSTART_DELAY`), one after another. A cargo technician is set up at the moment a workmate, the Captain or another body is in the Cargo Bay's doorway. The door is open, so `crew_npc_room_is_closed(Cargo Bay)` is FALSE and the Cargo Bay is not in that technician's `closed_rooms`. In the window, `cargo.ts` acts on a knock from outside only for a closed room (`brain.closedRooms.includes(knock.room)`, about line 1437) and treats someone found inside as out of place only for one (line 1198). For the rest of the round that technician ignores knocks at the Cargo Bay door. Rooms that "lie inside" it are wrong too: `reached_through` is built from `closed_rooms`.

The cheap case: the window's "locked rooms" section misses whichever rooms had a door open during the one pass. That is display only, but it is the list the owner reads to see who is allowed where.

Plastic flaps are the same fault from the other side. They are not solid either (`density = FALSE` in `plasticflaps.dm`), so a conveyor opening with flaps between a locked room and the next area counts as "an open way in", though nothing on its feet can walk through flaps. Whether any room on MetaStation is caught by this was not checked on the map: the Delivery Office is treated as closed in the rounds the change log describes, so it is not.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:153`:

    /proc/crew_npc_room_is_closed(area/room, z_level)
    	var/list/doors = crew_npc_doors_of(room, z_level)
    	if(!length(doors))
    		return FALSE
    	// An open way in from the next room, with no door on it, is open to anyone.
    	for(var/turf/room_turf as anything in room.get_turfs_by_zlevel(z_level))
    		if(!isopenturf(room_turf) || room_turf.is_blocked_turf(exclude_mobs = TRUE))
    			continue
    		for(var/direction in GLOB.cardinals)
    			var/turf/next = get_step(room_turf, direction)
    			if(isnull(next) || get_area(next) == room || !isopenturf(next) || !istype(get_area(next), /area/station))
    				continue
    			if(!next.is_blocked_turf(exclude_mobs = TRUE))
    				return FALSE

`code/modules/llm_crew/crew_brain_rooms.dm:96`, in `crew_npc_find_closed_rooms`, run once a round:

    			if(!crew_npc_room_is_closed(room, level))
    				open = TRUE
    				break

`code/game/turfs/turf.dm:302`, `is_blocked_turf`, which only looks at `density`:

    		if(movable_content.density && (!exclude_mobs || !ismob(movable_content)))

## How it was found

Read from the code, not seen in a round.

## How to fix it

1. In the open-way loop of `crew_npc_room_is_closed`, a tile that has a door on it is not "a way with no door on it". Skip `room_turf`, and skip `next`, if it holds an `/obj/machinery/door/airlock` or an `/obj/machinery/door/window`. Do not skip shutters (`/obj/machinery/door/poddoor`): shutters that are up are the open side the comment is about. Do not skip fire doors.
2. Skip a tile that holds `/obj/structure/plasticflaps` with `require_resting` set.
3. Put the test in one small proc, `crew_npc_doorless(turf/spot)`, and use it for both tiles. DOOR-02 proposes lifting this loop into `crew_npc_open_way_into()`: do both together.
4. The window's list is still worked out once a round. Shutters go up and down during a round, so a room can change. If the owner wants the list to follow that, work it out again every few minutes. It is one pass over the station with `CHECK_TICK`.

## How to test the fix

- Server compile.
- Start a round, stand in the Cargo Bay doorway as the crew are spawned (or hold the door open with a crate), and open the Crew Brain window. The Cargo Bay must be in the window's locked rooms, and in each technician's `closed_rooms` (shown through what `cargo.ts` does with a knock: a janitor knocking is answered).
