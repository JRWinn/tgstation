---
id: HOLE-05
title: On a station with more than one floor the crew cannot leave the floor they are spawned on, and jobs whose rooms are on another floor get no post
kind: gap
severity: medium
effort: large
confidence: likely
status: found
area: design
files: code/modules/llm_crew/crew_npc_motor.dm:56, code/modules/llm_crew/crew_npc_spawn.dm:100, code/modules/llm_crew/crew_npc_tools.dm:371, code/modules/llm_crew/crew_npc_cargo.dm:133, code/datums/ai/movement/ai_movement_navmap_astar.dm:7
fix: Turn on the route planner's multi-floor routes for crew, look for rooms on every station level, and send a body to the nearest floor of a room that it can reach
---

## What is wrong

Every piece of the crew's knowledge of the station is cut down to the floor the body is standing on, and the route planner is told not to plan across floors. MetaStation has one floor, so none of this shows there. Three of the maps in `_maps/map_files/` have more than one: `tramstation`, `IceBoxStation` and `NebulaStation` (to be checked for each map's json; `CatwalkStation` too if it is multi-floor). The project's rules say nothing should assume MetaStation.

What the code does on such a map:

1. **Spawning.** `spawn_test_crew` takes `station_levels[1]` and looks for each job's room on that level only (`crew_npc_spawn_turf(entry[2], z_level)`). A job whose rooms are all on another floor falls through to `get_turf(owner.mob)`: the body is spawned at the owner's feet, or in the lobby if the owner has not joined yet (see HOLE-04).
2. **Walking.** `/datum/ai_movement/navmap_astar/crew_npc` sets only `maximum_length`. The base type has `allow_multiz = FALSE` (`code/datums/ai/movement/ai_movement_navmap_astar.dm:7`), and with that off the planner is given `max_path_cost = 0` for other levels. A walk to a turf on another floor finds no route and fails with "there is no way through".
3. **Knowing rooms.** `safe_spot_in` picks its spot from `place.get_turfs_by_zlevel(here.z)`. For a room with no floor on the body's level that list is empty, it returns null, and `tool_go_to` answers "You cannot work out the way back to X" for a room the body is told it knows the way to. `pick_somewhere_new` skips such rooms, so exploring never finds them.
4. **Its own department.** `learn_department` skips every room with no floor on the body's level (`if(!length(place.get_turfs_by_zlevel(body.z)) ...) continue`). So do the Head of Personnel's meeting room (`crew_npc_cargo.dm:79`), the Quartermaster's, Chief Engineer's and Head of Security's offices (`crew_npc_quartermaster.dm:57`, `crew_npc_engineering.dm:48`, `crew_npc_security.dm:140`), the supply console (`console.z != body.z`, `crew_npc_cargo.dm:181`), brig cell timers (`timer.z != body.z`, `crew_npc_security.dm:1081`), security lockers and fire alarms.
5. **Doors.** Every call of `crew_npc_doors_of` passes `body.z` or `here.z`. A room's doors on another floor do not exist for the body.

One concrete case: Tramstation, where the brig is on the lower level and the bridge on the upper. The officer, spawned on whichever level `station_levels[1]` is, is told by the Head of Security to take a prisoner to a cell. `free_cell` skips every cell whose timer is on the other level, finds none, and the prisoner is held by the arm with "no cell is free" for as long as the warrant stands.

This is `likely`, not `sure`: no round has been played on a multi-floor map, and I did not read how the base planner treats stairs with `allow_multiz` on.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:56`:

    /datum/ai_movement/navmap_astar/crew_npc
    	maximum_length = CREW_NPC_MAX_PATH_LENGTH

`code/datums/ai/movement/ai_movement_navmap_astar.dm:7` and `:39` (base game):

    	var/allow_multiz = FALSE
    		allow_multiz = allow_multiz,
    		max_path_cost = allow_multiz ? maximum_length * 10 : 0,

`code/modules/llm_crew/crew_npc_spawn.dm:100`:

    	var/list/station_levels = SSmapping.levels_by_trait(ZTRAIT_STATION)
    	var/z_level = length(station_levels) ? station_levels[1] : owner.mob.z

`code/modules/llm_crew/crew_npc_tools.dm:370`, `safe_spot_in`:

    /datum/ai_controller/crew_npc/proc/safe_spot_in(area/station/place, turf/here)
    	var/list/place_turfs = place.get_turfs_by_zlevel(here.z)

`code/modules/llm_crew/crew_npc_cargo.dm:133`, `learn_department`:

    		if(!length(place.get_turfs_by_zlevel(body.z)) || locked_out_of(place))
    			continue

A grep of `code/modules/llm_crew/` for `get_turfs_by_zlevel`, `body.z` and `here.z` gives 77 lines. Each is a place this has to be thought about.

## How it was found

Read from the code. The only map played is MetaStation. The change log already says "Only MetaStation has a list" of the engine's machines (line 886); nothing in the change log or plans speaks of floors.

## How to fix it

Do this as its own piece of work, with a multi-floor map loaded to test on.

1. Set `allow_multiz = TRUE` on `/datum/ai_movement/navmap_astar/crew_npc`, and read `code/datums/ai/movement/ai_movement_navmap_astar.dm` and the navmap code it calls to learn what it takes for a way between floors (stairs, and whether ladders and lifts count). The explicit `get_path_to` calls in crew code (`pick_somewhere_new`, `log_no_route`, the door and shut-in checks) use a different planner: check whether each has a multi-floor option, and pass it.
2. Add one helper, `crew_npc_turfs_of(area/place, turf/near)`, that returns the room's turfs on `near.z` if it has any and otherwise on the nearest station level that has some. Use it in `safe_spot_in`, `nearest_place`, `middle_of`, `learn_place` and `crew_npc_spawn_turf` in place of the bare `get_turfs_by_zlevel(here.z)`.
3. In `spawn_test_crew`, look for each job's room on every station level, not the first.
4. Go through the 77 lines. Those that mean "is it in sight" (`machine.z == body.z` with a `get_dist`) are right as they are. Those that mean "does this room exist for me" (`learn_department`, the offices, `free_cell`, lockers, the supply console) must stop looking at `body.z`.
5. `crew_npc_doors_of(room, level)` takes a level by design, since a door is on one floor. Callers that want "the doors of this room" should ask for each station level the room has floor on, as `crew_npc_find_closed_rooms` in `crew_brain_rooms.dm` already does.
6. `get_dist` ignores floors when both turfs are on different levels in some builds and returns a large number in others. Read it before trusting any "nearest" pick across floors.

A lift (Tramstation's tram, IceBox's elevators) is a machine a player works by pressing a button. Using one is a new tool, done as a player would. Leave it out of the first pass and say so in the change log: the crew then use stairs only.

Question for the owner: is any map but MetaStation wanted soon? If not, the cheap step is to refuse: at spawn, if the station has more than one level, log "the crew do not yet work across floors" and spawn only the jobs whose rooms are all on one level.

## How to test the fix

- Server compile.
- Load `tramstation` (set it as the next map), start a round, and read `game.log` for "walk failed" lines whose target is on another level, and for any body spawned outside its own department.
- The simulator has no floors, so none of this is tested there.
