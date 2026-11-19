---
id: KNB-02
title: The no-route log line says the game's other pathfinder finds none either, but it asks the same pathfinder a second time
kind: bug
severity: low
effort: small
confidence: sure
status: found
area: logs
files: code/modules/llm_crew/crew_npc_tools.dm:539, code/controllers/subsystem/pathfinder.dm:79, code/__HELPERS/paths/path.dm:18
fix: Drop the second opinion from log_no_route and print what the route search actually met instead, a flood fill from the body that names the furthest tile reached and what stands on the next ones
---

## What is wrong

The 12:00 entry of the change log ("eleven faults from the 09:12 round") added a second line to `game.log` for a walk with no route, "for the Warehouse, which a technician twice found no way to", and said "The new log line should give one [a cause]". It never did. Four later entries still list the Warehouse as "cause not found" (see KNB-01).

One reason is that the line's first claim is empty. It says "The game's other pathfinder finds none either", and that reads as two independent searches agreeing, so the reader rules out the planner and looks at doors. But `get_path_to` in this checkout is not a second pathfinder. It goes to `SSpathfinder.pathfind`, which is the same navmap search the walk itself uses (`/datum/ai_movement/navmap_astar/crew_npc`). The same search, from the same tile, to the same tile, with the same access, a fraction of a second later, gives the same answer every time. In all 95 "found no route" lines of `round-12.23.07` and every one in the later rounds it says "finds none either". It can say nothing else.

The other two parts of the line did not help for the Warehouse either: "Doors of Warehouse: Warehouse Maintenance at (65,140): opens for it" was true and beside the point, and "the first thing in the way on the straight line" named a railing or a techfab next to the body, three rooms from the real trouble.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:539`, in `log_no_route`:

    	var/list/other_way = get_path_to(body, heading_for, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())

and at the end:

    	log_game("Crew NPC [key_name(body)] found no route to [goal] from [AREACOORD(from)]. The game's other pathfinder [length(other_way) ? "finds one of [length(other_way)] steps" : "finds none either"]. ...

`code/controllers/subsystem/pathfinder.dm:78`, what `get_path_to` reaches:

    /// Initiates a pathfind. Returns true if we're good, FALSE if something's failed.
    /// Uses the DLL if available, otherwise uses the DM navmap A* implementation.
    /datum/controller/subsystem/pathfinder/proc/pathfind(atom/movable/requester, atom/end, max_distance = 30, ...

`code/modules/llm_crew/crew_npc_motor.dm:56`, what the walk uses:

    /datum/ai_movement/navmap_astar/crew_npc
    	maximum_length = CREW_NPC_MAX_PATH_LENGTH

The same holds for every other `get_path_to` in the crew code (`check_shut_in`, `tool_go_to_door`, `pick_somewhere_new`, `tool_force_door`, the cell walk): none of them is a check against the walk's own planner. That is right for those, since they want to know what the walk will find. It is only wrong where the log presents it as a second opinion.

## How it was found

Read from the code. Backed by the logs: `grep -c "finds one of" data/logs/2026/11/1[89]/round-*/game.log` would be the proof, and across the rounds read for this finding no such line was seen (every "found no route" line read says "finds none either").

## How to fix it

1. In `log_no_route`, take out the `get_path_to` call and the sentence about the other pathfinder.
2. Put in its place what would have found the Warehouse fault in one round: how far the body can get. From the body's tile, flood out over tiles the planner would let it onto (`turf.is_blocked_turf()` is false, or the only dense thing is an airlock with `door.allowed(body)`), 400 tiles at most, and note the reached tile that is nearest the goal. Print that tile, its distance from the goal, and the dense things on the tiles between it and the goal (their names and coordinates, six at most). For the Warehouse that would have read "got as far as (67,140), 4 tiles short: crate at (68,140), crate at (67,139), crate at (67,141)".
3. Keep the door list. Leave out "on the straight line there": it names something beside the body, not what is in the way.
4. This only writes to the log, as now. The body must learn nothing from it (senses only).

## How to test the fix

Server compile to a side copy. Next round, read any "found no route to" line in `game.log` and check the tile it names is one the body could stand on and that what it lists really lies between there and the goal.
