---
id: DOOR-16
title: Any shut fire door in sight is blamed for a walk that found no way, even one nowhere on the way, and that walk is then not counted towards being shut in
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:707, code/modules/llm_crew/crew_npc_tools.dm:502, code/modules/llm_crew/crew_npc_tools.dm:443
fix: In fire_door_report blame only a shut fire door the body can walk up to and that lies nearer the goal than the body does, and pass the walk's goal in so it can tell
---

## What is wrong

When a walk ends with "there is no way through", `walk_finished` asks `fire_door_report` whether fire doors are to blame. `fire_door_report` takes the nearest shut fire door anywhere in `view(7)` and says so, without asking whether that fire door is between the body and where it was going:

1. The words sent to the brain end "The fire doors are shut in X", and the details carry `fire_doors` (and `alarm_pulled`, see KNA-15). The brain then takes the fire-door path: it may go to reset X's alarm, or wait for the fire doors, instead of the locked-door path (go to the door, knock, ask, send word).
2. The same answer stops the failed walk counting towards being shut in: `note_way_out_failed()` is called only `if(... !length(fire_doors) ...)`. A body behind a locked door with a shut fire door somewhere in sight is never found to be shut in by `check_shut_in`.

Fire doors are often in sight and shut for reasons that have nothing to do with the walk: those of a neighbouring room whose alarm is on stand in that room's doorways, on the hallway's edge; fire doors "hang open across the middle of rooms and halls" (the comment in `crew_npc_clear_of_doors`) and come down in a whole section when its alarm goes.

One concrete case. A janitor in the Central Primary Hallway is sent to a room whose only doors do not open to it, and the planner finds no route. Across the hallway, the fire alarm of another room has gone off and that room's fire doors are shut in its doorways, five tiles away and in sight. `fire_door_report` finds that fire door and answers "You stop on the way to X: there is no way through. The fire doors are shut in <the other room>.", with `fire_doors` set. The brain goes about the other room's fire alarm, and never asks to be let into X.

The confidence is "likely" because how the brain acts on a stray `fire_doors` detail was read only in outline (`brain.ts:642`, the reset-alarm step in `driver.ts`).

## Where

`code/modules/llm_crew/crew_npc_doors.dm:707`, `fire_door_report`:

    	for(var/obj/machinery/door/firedoor/door in view(CREW_NPC_FIRE_DOOR_RANGE, body))
    		if(!door.density)
    			continue
    		var/distance = get_dist(body, door)
    		if(distance < nearest_distance)
    			nearest_distance = distance
    			nearest = door

`code/modules/llm_crew/crew_npc_tools.dm:500`, in `walk_finished`, the caller for walks to rooms:

    		var/fire_doors = reason == "there is no way through" ? fire_door_report(stop_details) : ""
    		...
    		if(reason == "there is no way through" && !length(fire_doors) && !(tool == CREW_TOOL_EXPLORE && isturf(target)) && !(goal_room && locked_out_of(goal_room)))
    			note_way_out_failed()

`code/modules/llm_crew/crew_npc_tools.dm:443`, the same for a walk to a door.

## How it was found

Read from the code. Not seen in a round; the round logs were not searched for a fire-door report on a walk to a locked room.

## How to fix it

1. Give `fire_door_report` the walk's target turf: `fire_door_report(list/details, turf/goal)`. Both callers have it (`target`).
2. Count a shut fire door only if it is nearer the goal than the body is (`get_dist(door, goal) < get_dist(body, goal)`), that is, it is on the side the body was making for. That is what someone who set off that way would find in front of them. Keep the view test: it is what the body can see.
3. If no fire door passes that test, return "" as now, so the locked-door path and the shut-in count go on as for any other failed walk.
4. Leave the `alarm_pulled` detail to the fix for KNA-15 and GAP-05.

A stricter test (a route to the fire door, then on from its far side) costs two pathfinder calls per failed walk; the distance test is enough to stop the plain case above.

## How to test the fix

- Compile.
- Simulator: if the stand-in server can be told to answer a failed `go_to` with `fire_doors`, check the janitor takes the fire-door path only then.
- In a round: pull a fire alarm in one room off a hallway and send a janitor from that hallway to a locked room on the far side. `game.log` should show the walk failing with no "fire doors are shut" words, and the janitor going to the locked room's door.
