---
id: DOOR-02
title: A room with an open way in (shutters up, a gap with no door) is still taken as locked to the body
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_guarding.dm:118, code/modules/llm_crew/crew_npc_cargo.dm:153, code/modules/llm_crew/crew_npc_cleaning.dm:347, code/modules/llm_crew/crew_npc_doors.dm:42
fix: Have locked_out_of answer FALSE for a room with an open doorless way in from a hallway or a room open to the body, using the open-way test of crew_npc_room_is_closed with the DOOR-09 correction, kept for a minute per room
---

## What is wrong

`locked_out_of(room)` says a room is locked to the body when the room has airlocks and none of them opens to the body's ID. It never asks whether there is another way in. The project already has that test, and already has the rule: `crew_npc_room_is_closed` says "An open way in from the next room, with no door on it, is open to anyone". `locked_out_of` does not use it. So the two disagree about the same room.

The change log (top entries, "the kitchen, which anyone can walk into by its open shutters") and a comment in `tool_go_to_door` name the MetaStation kitchen as such a room. **The map does not bear that out** (checked by the reviewer, see Check): every square under the kitchen's shutters holds a reinforced table or the food smartfridge, and every walkable way into the kitchen is an airlock. The MetaStation room that is such a room is the **Cargo Lobby**: three squares at (84,145) to (84,147) stand open, under shutters that start up, onto the Storage Wing, which is open to the Central Primary Hallway; its only airlock is the Cargo Bay door at (78,146), which takes `supply/general`. So for anyone without cargo access, janitors and officers among them, `locked_out_of(Cargo Lobby)` is TRUE. A round log shows it: `data/logs/2026/11/18/round-15.52.18/game.log` line 455, "Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it", and `crew_brain.log` line 1060, a janitor (Delma Basinger) "shut in Cargo Lobby" at 22:20:11 after being walked out of the Cargo Bay. The fix in `tool_go_to_door` and `tool_force_door` does not reach anything else that asks `locked_out_of`:

1. **A janitor never goes to a mess it has seen in such a room.** `mess_places()` passes over any room for which `place_locked_to_body(place)` is TRUE, and that is `locked_out_of`. A janitor's ID does not open the Cargo Bay door, so a mess it saw in the Cargo Lobby is "not its to go to" unless it is standing in the lobby, though it could walk straight in. (Cargo staff do send for it by PDA, which gets round this.)
2. **It is never explored.** `pick_somewhere_new` marks any room `locked_out_of` says is locked as unreachable for the rest of the round.
3. **A body that does walk in is wrongly out of bounds, and then wrongly shut in.** `note_place` sets `out_of_bounds = locked_out_of(...)`, so `follow_trail` starts a trail. With a trail, `note_way_out_failed` needs only one failed walk of any kind to set `shut_in` and `wants_out`:

        	if(length(trail))
        		shut_in = TRUE
        		wants_out = TRUE
        		return

   The window then sends it to stand at "the door out" (`go_to_door` with no room), where it knocks and sends PDA messages to whoever can open a door it does not need, with the open way a few steps off. Concrete case: a janitor walks from the Storage Wing into the Cargo Lobby to clean. `out_of_bounds` is TRUE and the trail begins. One `go_to` from there that finds no route (a mess in a sealed corner of maintenance, a room behind the Service Hallway) and it is "shut in Cargo Lobby", and goes to stand at the Cargo Bay door to be let "out", with the open side three steps off.
4. `room_door_for` adds 200 to a door "that only leads into another room that is locked to them", and `tool_go_to_door` adds 200 for a door that opens from one. Both use `locked_out_of`, so a door that opens from the Cargo Lobby is the last one chosen though anyone can stand there.

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

Read from the code. The finder took the kitchen from the change log and a code comment without checking the map; the reviewer checked the map and found the kitchen is not such a room but the Cargo Lobby is (see Check). A round log shows the Cargo Lobby taken as locked to a janitor (round-15.52.18, quoted above).

## How to fix it

1. In `crew_npc_cargo.dm`, lift the first loop of `crew_npc_room_is_closed` into its own proc, `crew_npc_open_way_into(area/room, z_level)`, returning TRUE if some open floor tile of the room touches an open floor tile of another station area with nothing solid on either. Call it from `crew_npc_room_is_closed` so that proc is unchanged. Build DOOR-09's correction into it at the same time (pass over any tile holding an airlock, a windoor or plastic flaps): without it a locked room whose door a worker has just opened counts as open, and with the cache in step 2 it stays open to the body for a minute.
2. The loop walks every tile of the room, and `locked_out_of` is called often (once per door in `tool_go_to_door` and `room_door_for`, on every change of room in `note_place`). So keep the answer: a global list `"[REF(room)]-[z]" -> list(answer, world.time)`, good for about a minute. Shutters go up and down, so do not keep it for the round.
3. In `locked_out_of`, after the "no doors" check and before the loop over doors, return FALSE if `crew_npc_open_way_into(room, here.z)` (through the cache). **The open way must lead from somewhere the body may be.** On MetaStation Cytology and Xenobiology are open to each other with no door between, and the Engineering break room to the atmospherics gas storage; both of each pair have only airlocks to the rest of the station. A bare adjacency test makes each of them "not locked" because of the other, and a janitor would then go for messes seen through their windows, and its failed walks there would count toward being shut in (`walk_finished` at `crew_npc_tools.dm:506` stops counting them only for a locked room). So have the new proc return the neighbouring areas it found open, and count the way in only if one of them is a hallway, a maintenance tunnel, or a room with a door that opens to the body (the doors-only part of `locked_out_of`, not called recursively).
4. Leave `tool_go_to_door` and `tool_force_door` as they are: they test real routes and stay right. Their comments about the kitchen can then be shortened.
5. Note that `is_blocked_turf` does not count plastic flaps (not dense) as shut, so a room joined to the next only by a flapped conveyor opening counts as open. A standing body cannot walk through flaps. In the new proc, treat a tile holding `/obj/structure/plasticflaps` with `require_resting` as blocked. (This is a fault in `crew_npc_room_is_closed` today as well: see DOOR-09, which also covers an airlock standing open.)

Question for the owner: is a room whose airlocks are locked but whose open side stands open (the Cargo Lobby's shutters) a room the crew may walk into to work (clean, look round)? The existing rule in `crew_npc_room_is_closed` says yes. If the answer is no for some rooms (a bar counter is service, not an invitation), then the fix is narrower: only `out_of_bounds`, the trail and `shut_in` should use the new test, so that a body is never "shut in" a room it can walk out of, and `mess_places` stays as it is.

## How to test the fix

- Server compile (see README).
- In a round on MetaStation: make a mess in the Cargo Lobby in sight of a janitor in the Storage Wing and see that it walks in by the open side and cleans it without being sent for. In `game.log` there should be no "Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it" for a walk that failed, and no `walk failed (go_to_door` from the Cargo Lobby.
- Walk a janitor into the Cargo Lobby and give it one `go_to` that cannot succeed. In the Crew Brain window `shut_in` and `wants_out` must stay off.
- Check the other side: a janitor must still take Xenobiology and Cytology as locked (no walk at either from a mess seen through the window), and the Cargo Bay itself, with a worker holding its lobby door open, must still be locked to it.

## Check

Opus 5.5, 2026-11-19. Confirmed, with the example changed.

- Read `locked_out_of` (`crew_npc_guarding.dm:118`), `crew_npc_room_is_closed` (`crew_npc_cargo.dm:153`), `place_locked_to_body` and `mess_places` (`crew_npc_cleaning.dm:347-379`), `pick_somewhere_new` (`crew_npc_tools.dm:325`), `note_place` (`crew_npc_senses.dm:240`), `note_way_out_failed` (`crew_npc_doors.dm:42`), `crew_npc_doors_of` (`crew_npc_doors.dm:241`). The quotes match. `locked_out_of` asks only the airlocks; nothing in it or its callers asks about a doorless way in.
- Ran a throwaway Python reader over `_maps/map_files/MetaStation/MetaStation.dmm` (kept in the scratchpad, not the repo) that lists, for each station room, the doorless edges where neither square holds a wall, table, window, airlock, closet or dense machine, and the access helpers on each airlock touching the room. Results:
  - Kitchen and Bar: no such edge. The squares under the kitchen shutters at (137..143,128) hold the food smartfridge and reinforced tables; (136,128) is the kitchen airlock (`any/service/bar`, `any/service/kitchen`). So the change log's "open shutters" kitchen is wrong, and the finder's example with it.
  - Cargo Lobby: open at (84,145..147) onto the Storage Wing, only airlock (78,146) `all/supply/general`. This is a real case, and `round-15.52.18/game.log:455` prints "Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it".
  - Also open edges with airlocks: Medbay Lobby and Science Lobby (but their airlocks include public ones, so not locked), Cytology with Xenobiology and the Engineering break room with atmospherics gas storage (both rooms of each pair locked to a janitor). The last two are why the fix must ask where the open way leads.
- The flaps cross-reference was to DOOR-08, which is about door names; it is DOOR-09 (open-way test counts an open airlock or flaps).
- Changed: confidence to sure, the example to the Cargo Lobby, "How it was found", fix step 1 (take DOOR-09's correction along) and step 3 (the open way must lead somewhere the body may be), the tests. Severity medium and effort medium stand.
