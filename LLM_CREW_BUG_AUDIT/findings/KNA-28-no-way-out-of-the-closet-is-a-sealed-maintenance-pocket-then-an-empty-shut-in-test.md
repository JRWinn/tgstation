---
id: KNA-28
title: The "no way out" of the Custodial Closet at round start is a walk to a sealed corner of the maintenance next door, followed by a shut-in test that tests nothing
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_tools.dm:231, code/modules/llm_crew/crew_npc_places.dm:44, code/modules/llm_crew/crew_npc_doors.dm:199
fix: Pick the spot to walk to in a room only from the squares joined by floor to a door the body can open, and do not count shut in from a test that tried no route
---

## What is wrong

See also: KNA-19 (a room in parts, the spot picked from a part it cannot reach) and DOOR-03 (the shut-in test that tests nothing). This finding is the cause of a change log item neither names, with the round evidence, and one more kind of sealed part that a fix built from doors alone would miss.

Listed in the change log entry of 2026-11-18, 15:00, Not built: "(9) 'No way out' of the crowded closet at the start of a round. Cause not confirmed." The plan (`LLM_CREW_PLAN_ROUND_1332.md:44`) guessed "People in the way are waited for, not counted as a shut door." That is not it. The pathfinder does not count people at all (`LinkBlockedWithAccess` in `code/__HELPERS/paths/path.dm` looks only at objects).

What happens, every time it was seen:

1. A janitor in the Custodial Closet is sent to **Lesser Starboard Maintenance** (to explore, or to look for something) early in the round.
2. It has never stood there, so `place_spot` takes `safe_spot_in(room, get_turf(pawn))`: the nearest safe square of that whole area to where the body stands.
3. The nearest squares of Lesser Starboard Maintenance to the closet are four tiles south, through the closet's back wall: (146..149, 98..104), an abandoned surgery room. Read from the map, it has no door. Its one gap, (144,101), holds a girder and a grille spawner. It is part of the same area, so it counts as the room.
4. No route can reach it. "no route could be found", and `log_no_route` adds "The game's other pathfinder finds none either", which is true.
5. Once a second walk has failed, the body tests whether it is shut in. At round start a janitor has stood in no room but the closet, so `check_shut_in` has no spot to test, `way_out` stays FALSE, and it logs "found no way out" and sets `shut_in`.

From the logs, a walk from the Custodial Closet to Lesser Starboard Maintenance ended at a square of that sealed room in five of the rounds read:

    round-13.32.16  19:34:47 Jared Wolff      heading for ... Lesser Starboard Maintenance (148,102,2); no route could be found.
                    19:34:47 Jared Wolff      tested whether it is shut in Custodial Closet at Custodial Closet (149,107,2): found no way out.
    round-15.52.18  21:53:56 Edward Harrison  heading for ... (147,102,2)
    round-17.48.05  23:49:59 Corrine Whittier heading for ... (148,103,2)
    19/round-19.33.50 01:36:07 Reuben Shirey  heading for ... (146,100,2)
    19/round-20.43.32 02:45:28 Abel Murphy    heading for ... (147,103,2)

(log times, six hours ahead). In the 13:32 round the walk before it, to **Greater Starboard Maintenance** at (156,117), failed the same way: that square is in a corner of Greater Starboard Maintenance behind "maintenance" airlock (156,115), which takes engineering maintenance access (`access/all/engineering/maintenance`) and is mapped `abandoned`. A janitor cannot open it.

The two walks together make the "no way out" the plan saw. The room is not crowded; the closet's door is open to every janitor.

Why a fix from doors alone (KNA-19's "work out which part of a room the body can get into from the doors that open for it") must be a flood fill: the surgery room has no door at all. A rule that counts as reachable "the part of the room inside a door that opens for it" must find the part by walking the floor from each door square, stopping at walls, girders, grilles and dense fittings, not by area. A rule that only removes parts behind a locked inner door would keep the surgery room.

## Where

`code/modules/llm_crew/crew_npc_places.dm:41`, `place_spot`:

    var/area/station/room = crew_npc_station_places()[place]
    if(isnull(room))
        return null
    return safe_spot_in(room, get_turf(pawn))

`code/modules/llm_crew/crew_npc_tools.dm:231`, `tool_go_to`:

    var/turf/destination = place_spot(known_place)

`code/modules/llm_crew/crew_npc_doors.dm:192`, `check_shut_in`, which with no other room known tries no route and still decides:

    for(var/place in visited_places)
        if(place == room)
            continue
        ...
    var/way_out = FALSE
    ...
    while(length(spots) && tries_left > 0 && !way_out)
        ...
    log_game("... tested whether it is shut in [room] at [AREACOORD(here)]: found [found || "no way out"].")
    ...
    if(way_out)
        ways_out_failed = 0
    else
        shut_in = TRUE

## How it was found

Seen in round logs (the lines above, from `game.log` in each folder named), and the map read with a script (Python, in the system temp folder): it prints every object on (144..151, 97..110) of `_maps/map_files/MetaStation/MetaStation.dmm`, and a flood fill from (147,103) that stops at walls, girders, grilles, tables, racks and machines reaches 18 squares and no door. The same flood fill finds a 25-step way from the closet to (156,117) only by going through the engineering door at (156,115), which the fill does not test for access.

## How to fix it

1. For each room, work out once a round (or on first use, and keep it) its reachable parts: flood-fill the room's floor from the inside square of each of its doors (`crew_npc_doors_of`), crossing only open floor without walls, girders, grilles, windows or dense anchored fittings. Squares not reached from any door are not walked to.
2. In `place_spot` (and so `tool_go_to`), for a room the body has not stood in, give `safe_spot_in` only squares in parts that are reached from a door that opens to the body (`door.allowed(body)`), or from a door of the room it is standing in. This is KNA-19's fix, with the flood fill.
3. In `check_shut_in`, if there was no spot to test, test the doors of the room itself instead: a route to the outside square of any door that opens to the body is a way out. Never set `shut_in` from zero routes tried (DOOR-03, item 2).
4. In `log_no_route`, when the goal square is in no part reached from any door, say so ("that square is in a part of X with no door to it"), so the next round's log names this case at once.

## How to test the fix

Server compile to a side copy. The simulator does not run the server. Next round on MetaStation, `game.log`: no walk from the Custodial Closet "heading for" any of (144..149, 98..104), and no "tested whether it is shut in Custodial Closet ... found no way out" in the first minutes.
