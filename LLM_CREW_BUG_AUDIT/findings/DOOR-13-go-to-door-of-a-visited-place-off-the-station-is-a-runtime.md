---
id: DOOR-13
title: Going to the door of a place the body has stood in that is not a station room, a shuttle say, is a runtime and the brain gets no answer
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:309, code/modules/llm_crew/crew_npc_doors.dm:246, code/modules/llm_crew/crew_npc_tools.dm:238, code/modules/llm_crew/crew_npc_senses.dm:232
fix: In tool_go_to_door answer FALSE when the named place has no station area, and give crew_npc_doors_of a null guard
---

## What is wrong

`tool_go_to_door(place)` turns the name into a room with `find_known_place`, which looks first among `visited_places`. `visited_places` holds every area the body has stood in, by `get_area_name(here, TRUE)` in `note_place`, station room or not: the emergency shuttle, an escape pod, the arrivals shuttle, space. The room is then looked up only among the station's rooms, `crew_npc_station_places()`, which holds `/area/station` areas alone. For a visited place that is not a station room that lookup is null, nothing checks it, and `crew_npc_doors_of(null, z)` calls a proc on null.

The tool call dies with a runtime. No `action_result` is sent, so the brain hears nothing and tries the same step again after its lost-action wait, with the same runtime each time.

One concrete case. At the end of the round the emergency shuttle docks and an officer walks aboard ("Emergency Shuttle" goes into its `visited_places`). Someone with a warrant is inside the shuttle with its doors shut. The officer's walk to them fails as locked, the brain's `letInStep` asks for `go_to_door` with `place: "Emergency Shuttle"`. `find_known_place` returns "Emergency Shuttle" (an exact match among the visited places). `crew_npc_station_places()["Emergency Shuttle"]` is null. Line 314 runs `crew_npc_doors_of(null, body.z)`, and inside it `room.get_turfs_by_zlevel(z_level)` is "Cannot execute null.get_turfs_by_zlevel()".

A second way to the same runtime: a station room renamed with the station blueprints (`rename_area` in `code/__HELPERS/areas.dm:314` sets `area.name`). `crew_npc_station_places()` is worked out once, the first time anyone asks, and keeps the old name. A body that walks into the room afterwards records the new name in `visited_places`, and `go_to_door` with the new name meets the same null. A room made new with the blueprints is the same: it was never in the list.

The other door tools do check: `tool_force_door` and `tool_open_door` go through `room_by_name` and answer "You do not know of anywhere aboard by that name" or "That is not a room whose door is yours to open" when it is null. Only `tool_go_to_door` does not.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:300`, in `tool_go_to_door`:

    	var/named = istext(place) && length(trim(place))
    	var/known = named ? find_known_place(place) : null
    	if(named && isnull(known))
    		...
    	var/leaving = isnull(known)
    	var/area/room = leaving ? get_area(body) : crew_npc_station_places()[known]
    	var/room_name = leaving ? current_place : known
    	if(!leaving && get_area(body) == room)
    		...
    	var/list/doors = crew_npc_doors_of(room, body.z)

`code/modules/llm_crew/crew_npc_doors.dm:241`, `crew_npc_doors_of`, which guards the level but not the room:

    	if(!isnum(z_level) || z_level < 1)
    		return doors
    	for(var/turf/room_turf as anything in room.get_turfs_by_zlevel(z_level))

`code/modules/llm_crew/crew_npc_tools.dm:244`, `find_known_place`, which returns visited names first:

    	for(var/list/names as anything in list(visited_places, crew_npc_station_places()))
    		for(var/known_place in names)
    			if(LOWER_TEXT(known_place) == wanted)
    				return known_place

`code/modules/llm_crew/crew_npc_senses.dm:232`, `note_place`, which records any area:

    	var/place = get_area_name(here, TRUE)

## How it was found

Read from the code, following `tool_go_to_door` into `find_known_place` and `crew_npc_doors_of`. Not seen in a round. How often a crew body stands in a non-station area was not checked; the end-of-round shuttle is the likely one.

## How to fix it

1. In `tool_go_to_door`, after `room` is worked out, if `!leaving && isnull(room)`, answer `action_result(CREW_TOOL_TO_DOOR, FALSE, "[known] has no door you can find.", list("place" = current_place))` and return.
2. In `crew_npc_doors_of`, return the empty list when `isnull(room)` as well as when the level is bad. Several other callers (`room_door_for`, `shut_in_at_door`, `person_at_room`, `hold_door_for`) pass rooms looked up by name, and the guard makes them all safe.
3. Leave `find_known_place` as it is: a visited shuttle is still somewhere the body can be sent to with `go_to`.
4. For the renamed room: add `/proc/crew_npc_station_place(name)` beside `crew_npc_station_places` in `crew_npc_places.dm`. It returns the list's entry, and on a miss walks `GLOB.areas` once for a station area of that name and adds it. Use it in place of `crew_npc_station_places()[name]` in `tool_go_to_door`, `room_by_name`, `place_spot`, `place_locked_to_body` and `tool_reset_alarm`. That is cheap (only on a miss) and keeps every other caller right too. The old name can stay in the list; it still points at the same area.

## How to test the fix

- Compile.
- Simulator, if it can send a place that is visited and not a station room: `go_to_door` with that place should come back as failed with "has no door you can find".
- Next round: `runtime.log` should have no `get_turfs_by_zlevel` error from `crew_npc_doors_of`.
