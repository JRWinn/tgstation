---
id: DOOR-02
title: A room with an open way in (shutters up, a gap with no door) is still taken as locked to the body
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Fable 5.2
area: doors
files: code/modules/llm_crew/crew_npc_guarding.dm:118, code/modules/llm_crew/crew_npc_cargo.dm:153, code/modules/llm_crew/crew_npc_cleaning.dm:347, code/modules/llm_crew/crew_npc_doors.dm:42
fix: Have locked_out_of answer FALSE for a room that has an open doorless way in, using the test crew_npc_room_is_closed already makes, kept for a minute per room
---

## What is wrong

`locked_out_of(room)` says a room is locked to the body when the room has airlocks and none of them opens to the body's ID. It never asks whether there is another way in. The project already has that test, and already has the rule: `crew_npc_room_is_closed` says "An open way in from the next room, with no door on it, is open to anyone". `locked_out_of` does not use it. So the two disagree about the same room.

The MetaStation kitchen is such a room. The change log (top entries, "the kitchen, which anyone can walk into by its open shutters") and a comment in `tool_go_to_door` both say so: "A room none of whose doors open to it may be one it can walk into all the same: the kitchen, by its open shutters". That was mended for `tool_go_to_door` and `tool_force_door` only. Everything else that asks `locked_out_of` still gets the wrong answer:

1. **A janitor never goes to a mess it has seen in such a room.** `mess_places()` passes over any room for which `place_locked_to_body(place)` is TRUE, and that is `locked_out_of`. A janitor's ID (`ACCESS_JANITOR`, `ACCESS_MAINT_TUNNELS`, `ACCESS_MINERAL_STOREROOM`, `ACCESS_SERVICE`) does not open the kitchen's airlocks, so a mess seen through the kitchen counter is "not its to go to", though it could walk straight in.
2. **It is never explored.** `pick_somewhere_new` marks any room `locked_out_of` says is locked as unreachable for the rest of the round.
3. **A body that does walk in is wrongly out of bounds, and then wrongly shut in.** `note_place` sets `out_of_bounds = locked_out_of(...)`, so `follow_trail` starts a trail. With a trail, `note_way_out_failed` needs only one failed walk of any kind to set `shut_in` and `wants_out`:

        	if(length(trail))
        		shut_in = TRUE
        		wants_out = TRUE
        		return

   The window then sends it to stand at "the door out" (`go_to_door` with no room), where it knocks and sends PDA messages to whoever can open a door it does not need, with the open way a few steps off. Concrete case: a security officer who has walked into the kitchen to make an arrest, as the change log's top entries describe one doing. One `go_to` from there that finds no route (a room behind the Service Hallway, say) and it is "shut in the Kitchen".
4. `room_door_for` adds 200 to a door "that only leads into another room that is locked to them", and `tool_go_to_door` adds 200 for a door that opens from one. Both use `locked_out_of`, so a door onto the kitchen is the last one chosen though anyone can stand there.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:118`, `locked_out_of`:

    	var/list/doors = crew_npc_doors_of(room, here.z)
    	if(!length(doors))
    		return FALSE
    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(door.allowed(body))
    			return FALSE
    	return TRUE

`code/modules/llm_crew/crew_npc_cargo.dm:153`, `crew_npc_room_is_closed`, which has the test that is missing above:

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

`code/modules/llm_crew/crew_npc_cleaning.dm:374`, `mess_places`:

    		if(place != current_place && place_locked_to_body(place))
    			passed_over += place
    			continue

`code/modules/llm_crew/crew_npc_tools.dm:325`, `pick_somewhere_new`:

    			if(locked_out_of(nearest))
    				unreachable_places[format_text(nearest.name)] = TRUE

## How it was found

Read from the code. That the kitchen is such a room on this map is taken from the change log and the code comment, not checked against the map file here. Whether the janitor's ID opens a kitchen airlock on this map was not checked against the map's access helpers: if one does, the janitor is not affected and the officer and the engineer still are. Not seen in a round log.

## How to fix it

1. In `crew_npc_cargo.dm`, lift the first loop of `crew_npc_room_is_closed` into its own proc, `crew_npc_open_way_into(area/room, z_level)`, returning TRUE if some open floor tile of the room touches an open floor tile of another station area with nothing solid on either. Call it from `crew_npc_room_is_closed` so that proc is unchanged.
2. The loop walks every tile of the room, and `locked_out_of` is called often (once per door in `tool_go_to_door` and `room_door_for`, on every change of room in `note_place`). So keep the answer: a global list `"[REF(room)]-[z]" -> list(answer, world.time)`, good for about a minute. Shutters go up and down, so do not keep it for the round.
3. In `locked_out_of`, after the "no doors" check and before the loop over doors, return FALSE if `crew_npc_open_way_into(room, here.z)` (through the cache).
4. Leave `tool_go_to_door` and `tool_force_door` as they are: they test real routes and stay right. Their comments about the kitchen can then be shortened.
5. Note that `is_blocked_turf` does not count plastic flaps (not dense) as shut, so a room joined to the next only by a flapped conveyor opening counts as open. A standing body cannot walk through flaps. In the new proc, treat a tile holding `/obj/structure/plasticflaps` with `require_resting` as blocked. (This is a fault in `crew_npc_room_is_closed` today as well: see DOOR-08.)

Question for the owner: is a room whose airlocks are locked but whose shutters are up a room the crew may walk into to work (clean, look round)? The existing rule in `crew_npc_room_is_closed` says yes. If the answer is no for some rooms (a bar counter is service, not an invitation), then the fix is narrower: only `out_of_bounds`, the trail and `shut_in` should use the new test, so that a body is never "shut in" a room it can walk out of, and `mess_places` stays as it is.

## How to test the fix

- Server compile (see README).
- In a round on MetaStation: make a mess in the kitchen in sight of a janitor in the hallway and see that it goes in by the open side and cleans it. In `game.log` there should be no `walk failed (go_to_door` for the Kitchen.
- Walk a crew body into the kitchen and give it one `go_to` that cannot succeed. In the Crew Brain window `shut_in` and `wants_out` must stay off.
