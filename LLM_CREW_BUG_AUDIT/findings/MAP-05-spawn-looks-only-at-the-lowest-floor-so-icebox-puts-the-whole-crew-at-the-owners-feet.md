---
id: MAP-05
title: The standing crew is placed only on the lowest station floor, so on IceBox all eleven are piled at the owner's feet and on the other multi-floor maps half are, or land in the wrong department
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: design
files: code/modules/llm_crew/crew_npc_spawn.dm:100, code/modules/llm_crew/crew_npc_spawn.dm:73, code/modules/llm_crew/crew_npc_spawn.dm:115
fix: Look for each job's rooms on every station level in crew_npc_spawn_turf, trying the rooms in order across all levels before the broad fallbacks, and never fall back to the owner's turf off the station
---

## What is wrong

See also: HOLE-05, which says the crew cannot work across floors at all and names this spawn line as point 1. This finding adds what that line does, map by map, because it is much worse than "a job whose rooms are on another floor": on IceBox it is every job, and on two maps the broad fallbacks put bodies in the wrong department, where they then take that room as their post.

`spawn_test_crew` takes `station_levels[1]`, the lowest station level, and `crew_npc_spawn_turf` looks only on it. Each job's list ends in a broad fallback (`/area/station/hallway`, `/area/station/cargo`), and after that the owner's turf.

What that gives, read from each map's `.dmm` (the map's first z is the game's first station level):

- **IceBox** (three station levels, the lowest is the mining and prison level): none of the rooms, not even a hallway, is on it. All eleven bodies are made on `get_turf(owner.mob)`: on the Captain's tile, or in the lobby's start room if the owner has not joined yet (HOLE-04).
- **Tramstation** (two levels; the lower has Engineering, the Custodial Closet and the mining dock): the Head of Security and the officer go to the owner's turf. The Quartermaster and both technicians fall through to `/area/station/cargo`, which on the lower level is only the mining dock, the foundry and the ore silo. The Head of Personnel goes to a tram hallway.
- **NebulaStation** (two levels): the three janitors and the Head of Personnel fall through to `/area/station/hallway`, which on the lower level is the departures lounge. The technicians fall through to `/area/station/cargo` on the lower level: the bitrunning den, the cargo break room, the drone bay, `/area/station/cargo/lower` or the mining rooms, whichever `GLOB.areas` lists first.
- **CatwalkStation** (two levels): the Head of Security goes to the owner's turf (its office and the Security Office are both upstairs); the officer lands in the Brig.

A technician in the mining dock then learns its post from `supply_console()`, which only looks at consoles on its own level; a janitor in the departures lounge finds no Custodial Closet on its level. So the wrong start is not put right later.

## Where

`code/modules/llm_crew/crew_npc_spawn.dm:100`:

    var/list/station_levels = SSmapping.levels_by_trait(ZTRAIT_STATION)
    var/z_level = length(station_levels) ? station_levels[1] : owner.mob.z

`code/modules/llm_crew/crew_npc_spawn.dm:73`, `crew_npc_spawn_turf`:

    for(var/area_type in area_types)
    	for(var/area/station/place in GLOB.areas)
    		if(!istype(place, area_type))
    			continue
    		for(var/turf/candidate as anything in place.get_turfs_by_zlevel(z_level))

`code/modules/llm_crew/crew_npc_spawn.dm:115`:

    var/turf/spot = crew_npc_spawn_turf(entry[2], z_level) || get_turf(owner.mob)

`levels_by_trait` returns the levels in the order they were made (`z_trait_levels[trait]`, `code/modules/mapping/space_management/traits.dm:33`), so `[1]` is the lowest.

## How it was found

Read from the code. The rooms on each floor were counted with a throwaway script over each map's `.dmm` that lists the area types per z. Not seen in a round: only MetaStation, which has one level, has been played.

## How to fix it

1. Change `crew_npc_spawn_turf(list/area_types, z_level)` to take the list of station levels and, for each room type in order, try every level before going on to the next type. So the Head of Security's office upstairs wins over the hallway downstairs. The same file already walks a room on every level in `jump_to_cargo_lobby` (`place.get_zlevel_turf_lists()`); either loop over `station_levels` calling `get_turfs_by_zlevel(level)`, or use that list and skip turfs where `!is_station_level(candidate.z)`.
2. Make the broad fallbacks narrower or drop them: `/area/station/cargo` for a technician should be `/area/station/cargo/storage`, then `/area/station/cargo/office`, then `/area/station/cargo/lobby`, not "any cargo room". A janitor's fallback should be a hallway on the level that has the Custodial Closet.
3. Never use `get_turf(owner.mob)` unless it is on a station level (`is_station_level`); otherwise skip that job and log which one had nowhere to stand.
4. This only puts the bodies in the right rooms. Until HOLE-05 is done they still cannot use stairs; the owner should know that a body upstairs cannot reach a room downstairs.

## How to test the fix

- Server compile.
- Add one `log_game` line in `spawn_test_crew` per body with `AREACOORD(spot)` (today only the count is logged). Load IceBox and Tramstation in turn and read those lines: each body should be in its own department.
- MetaStation must give the same rooms as now.
- No map load is needed to check the room choice beforehand: the throwaway area-per-z script named under "Check" gives, for each map, which of each job's room types exist on which floor; the logged `AREACOORD` lines must match it.

## Check

Read `spawn_test_crew` and `crew_npc_spawn_turf` (`code/modules/llm_crew/crew_npc_spawn.dm:73-123`): the quotes are as the code is today. `levels_by_trait` returns `z_trait_levels[trait]` (`code/modules/mapping/space_management/traits.dm:34`), filled in creation order by `space_level.dm:17`; every level of a station map gets `ZTRAIT_STATION` (`code/datums/map_config.dm:187`), so `station_levels[1]` is the map file's z1, the lowest floor.

Ran a throwaway bun script (scratchpad, outside the repo) over each map's `.dmm` listing, per z, the area types that match the spawn lists. It agrees with the write-up: IceBox z1 has none of them (all eleven fall to `get_turf(owner.mob)`); Tramstation z1 has the CE's office, Engineering, the Custodial Closet, tram hallways and only the mining dock, foundry and ore silo of cargo, so the HoS and officer go to the owner, the QM and technicians to a mining room; NebulaStation z1 has the departures lounge as its only hallway, no Custodial Closet and no HoP office; CatwalkStation z1 has the Brig but neither the HoS office nor the Security Office. MetaStation z1 has every room. `supply_console()` skips consoles with `console.z != body.z` (`crew_npc_cargo.dm:181`), as said.

Nothing in the change log or plans speaks of other maps or floors. HOLE-05 names this spawn line as its point 1 and step 3; this file is the separable small fix with the map-by-map effect, so it is kept, not marked a duplicate.

Severity lowered to medium: the fault is certain on every multi-floor map, but `config/maps.txt` gives each of them `minplayers` 25 or more, so the owner's test server stays on MetaStation unless a map is chosen by hand, and on such a map HOLE-05 stops the crew working across floors whatever the spawn does. That is "a case that comes up less often", not most rounds.
