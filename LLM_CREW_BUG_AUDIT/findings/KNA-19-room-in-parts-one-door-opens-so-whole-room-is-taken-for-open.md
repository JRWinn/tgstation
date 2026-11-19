---
id: KNA-19
title: A room split by inner locked doors counts as open if one outer door opens, so janitors set off for a part of it they cannot reach (the Research Division, no route)
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: doors
files: code/modules/llm_crew/crew_npc_guarding.dm:118, code/modules/llm_crew/crew_npc_places.dm:41, code/modules/llm_crew/crew_npc_tools.dm:370, code/modules/llm_crew/crew_npc_cleaning.dm:366, code/modules/llm_crew/crew_npc_tools.dm:506
fix: Work out which part of a room the body can get into from the doors that open for it, and pick the spot to walk to, and the messes that are its to clean, from that part only
---

## What is wrong

This is item 26 of the change log entry "2026-11-18, 16:15: faults from the 15:09 round", under "Not built": "Both janitors found no route to Research Division three times between 15:45:51 and 15:47:30, though maintenance access at (141,90): opens for it. Not diagnosed." It is not the fire alarm the entry guessed at. This is the cause.

A room is taken as open to a body if any one of its doors opens for that body (`locked_out_of`). That is wrong for a room that is in parts, with locked doors between the parts that carry the same room name.

The Research Division on MetaStation is one. Read from the map file (`_maps/map_files/MetaStation/MetaStation.dmm`):

- The main hall is x 126 to 139, y 91 to 93.
- At (140,92) is the airlock "Xenobiology Access" and at (143,92) the airlock "Xenobiology Entrance". Both stand on Research Division floor, both take science access only (`/obj/effect/mapping_helpers/airlock/access/all/science/general`).
- Between them is a pocket of six tiles, (141..142, 91..93), which is also Research Division.
- The maintenance door at (141,90) opens into that pocket. It takes science or maintenance access (`access/any/science/maintenance`, which is `ACCESS_SCIENCE, ACCESS_MAINT_TUNNELS` in `code/modules/mapping/access_helpers.dm:247`). A janitor has maintenance access.

So a janitor can get into six tiles of the Research Division and no more. The two inner airlocks are not "doors of the room" to `crew_npc_doors_of`, because both sides of them are the same room, so nothing ever looks at them.

The concrete case, from `data/logs/2026/11/18/round-15.09.26`:

1. Both janitors remember a mess in the Research Division ("decomposing garbage, dried pool of blood, dirt"). `mess_places()` asks `place_locked_to_body("Research Division")`, which asks `locked_out_of`. The door at (141,90) opens for a janitor, so the answer is "not locked", and the room is offered as work.
2. The brain sends `go_to("Research Division")` (`crew_brain.log` 21:45:40, "You have a mess to clean up in Research Division, and you are going there with your mop").
3. The janitor has never stood in the room, so `place_spot` falls to `safe_spot_in`, which takes the nearest of 40 random tiles of the whole room that is clear of doors. It picked (138,91), in the main hall, behind "Xenobiology Access".
4. No route. `game.log`: "walk failed (go_to, to Research Division): there is no way through. Stopped at Lesser Starboard Maintenance (142,98,2), heading for The floor at Research Division (138,91,2); no route could be found." Three times, two janitors.
5. Each failure also counts towards the body thinking it is shut in where it stands (`note_way_out_failed`), because the room "is not locked to it".
6. The room is put down as blocked for five minutes, then tried again, then left for the long time. The mess is never cleaned and nobody is told.

The pocket is too small to have a tile that is "clear of doors", so even a lucky pick would not choose it while any tile of the main hall is in the sample.

What it should do: know that the part of the room it can walk into is the pocket, go there if the mess is there, and leave the mess alone (as it does for a room that is locked to it) if the mess is in a part it cannot get into.

Where the messes were is not known. The logs do not give a mess's tile. They were either in the pocket, or seen through a door that stood open for someone.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:118`, `locked_out_of`:

    	var/list/doors = crew_npc_doors_of(room, here.z)
    	if(!length(doors))
    		return FALSE
    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(door.allowed(body))
    			return FALSE
    	return TRUE

`code/modules/llm_crew/crew_npc_places.dm:41`, `place_spot`, for a room the body has not stood in:

    	var/area/station/room = crew_npc_station_places()[place]
    	if(isnull(room))
    		return null
    	return safe_spot_in(room, get_turf(pawn))

`code/modules/llm_crew/crew_npc_tools.dm:370`, `safe_spot_in`, which looks at no door and tests no route:

    	for(var/sample in 1 to min(length(place_turfs), 40))
    		var/turf/candidate = pick(place_turfs)
    		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf())
    			continue

`code/modules/llm_crew/crew_npc_cleaning.dm:366`, `mess_places`, which is how a mess in such a room becomes work:

    		if(place != current_place && place_locked_to_body(place))
    			passed_over += place
    			continue
    		places += place

`code/modules/llm_crew/crew_npc_tools.dm:506`, in `walk_finished`, where the failed walk counts towards being shut in:

    		if(reason == "there is no way through" && !length(fire_doors) && !(tool == CREW_TOOL_EXPLORE && isturf(target)) && !(goal_room && locked_out_of(goal_room)))
    			note_way_out_failed()

`code/modules/llm_crew/crew_npc_doors.dm:241`, `crew_npc_doors_of`, which only finds doors with another room on the far side:

    			var/turf/next = get_step(room_turf, direction)
    			if(isnull(next) || get_area(next) == room)
    				continue

## How it was found

Seen in a round log and then read from the map and the code. `data/logs/2026/11/18/round-15.09.26/game.log`:

    [2026-11-18 21:45:51.562] GAME: Crew NPC *no key*/(Kayden Ivanov) found no route to Research Division from Lesser Starboard Maintenance (142,98,2). The game's other pathfinder finds none either. Doors of Research Division: Genetics Lab at (113,87): locked to it; maintenance access at (141,90): opens for it; Ordnance Lab at (128,90): locked to it; Research Maintenance at (133,90): locked to it; Xenobiology Space Bridge at (150,92): locked to it; Research Director's Office at (131,94): locked to it. ...

The map was read with a throwaway script that prints the tiles and areas round (141,90). No round was played. Other rooms of this shape were not counted: any department hall with a maintenance door into an airlock chamber of the same room name will do the same, on any map.

## How to fix it

1. Add a helper in `crew_npc_doors.dm`, say `open_part_of(area/room)`: the tiles of the room the body can get into. Start from the inside tile (`sides[1]`) of every door of `crew_npc_doors_of(room, z)` for which `door.allowed(body)` is true and which is not bolted or welded. Spread over the room's own open tiles, a step at a time in the four directions, and do not step onto a tile that holds an airlock or a windoor that does not open for the body (`!door.allowed(body)`). A room with no doors at all, or one the body is standing in, starts from every tile (or from the body's own tile). Keep the answer for a minute by room name, as `locked_place_cache` already does. This is a look at doors and floor the body knows, not a pathfinder call, so it need not sleep.
2. In `place_spot` (and so `tool_go_to`), for a room the body has not stood in, pass that list to `safe_spot_in` in place of the room's whole floor. If the list is empty, answer as for a room it cannot work out the way to.
3. In `safe_spot_in`, when nothing in the list is clear of doors, a tile beside a door is already allowed (`best_clear || best`), so the pocket works as it is.
4. In `mess_places`, `workable_mess_places` and `remembered_mess_in` (`crew_npc_cleaning.dm`), pass over a remembered mess whose tile (`memory[3]`) is not in `open_part_of` its room, the same way a room that is locked to the body is passed over. It then goes there only when someone who can open the inner door sends for it.
5. When the body is going to a room for a mess it remembers, walk to that mess's tile, not to a spot picked at random: in `tool_go_to`, if `remembered_mess_in(known_place)` gives a mess in the open part, make for the nearest safe tile beside it. This is general (it is "go to the room, to where you know the work is") and not a janitor rule.
6. In `walk_finished`, do not count a failed walk towards being shut in when the target tile is outside `open_part_of` the goal room.
7. Keep working: rooms with no inner doors (the helper returns the whole floor), the Cargo Bay and its offices (those are separate rooms and still go by `locked_out_of`), and a body standing inside the room.

KNA-13 proposes trying the tile inside each door when the first spot has no route. That would also get a body into the pocket, but it would not stop it setting off for a mess in the main hall, so step 4 is still needed.

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code, so this cannot be shown there. In the next round on MetaStation, grep `game.log` for "to Research Division" and "found no route to Research Division": there should be none from a janitor. If a mess is in the pocket at (141..142, 91..93) a janitor should walk in by the maintenance door at (141,90) and clean it.
- To force the case: as the Captain, spill something in the pocket and something in the main hall, and watch which one a janitor goes to.
