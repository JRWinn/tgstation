---
id: DOOR-06
title: The door out of a room is chosen without testing that the body can walk to it, so it makes for the same unreachable door every time
kind: bug
severity: medium
effort: small
confidence: likely
status: found
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:363, code/modules/llm_crew/crew_npc_tools.dm:440
fix: Test a route to the inside tile for a door out as is done for a door in, and remember a door that a walk failed to reach so the next call passes it over
---

## What is wrong

`tool_go_to_door` scores every door of the room and then tries them best first. For a door **into** a room, each one is tested for a route before it is chosen, and up to `CREW_NPC_DOORS_TRIED` (3) are tried. For the door **out of** the room the body is in (`leaving`), the best-scored door is taken at once with no test:

    		if(leaving || get_dist(body, nearest) <= CREW_NPC_AT_DOOR)
    			best = nearest
    			best_spot = spot
    			break

The score is distance, plus 50 for a door onto maintenance, plus 25 for a door into another room, minus 100 for the door it came in by. Nothing in it says whether the body can get to the tile inside that door. The choice is the same every time it is made from the same spot, and nothing remembers that the last walk to that door failed.

So when the best-scored door cannot be reached, the walk fails ("You could not get to the door out of X: there is no way through"), the window backs off for a while and sends `go_to_door` again, and the server sends the body to the same door again. The room's other doors are never tried.

One concrete case. A body is shut in a room it did not walk into by a door it remembers (it came out of a disposal pipe, where `look_around` calls `forget_trail()`; or the power failed and the door it came by is dead). So `came_in_by` is null and there is no bonus. The room has two doors: one onto a hallway on the far side of a counter with a windoor that does not open to it, 6 tiles off (score 6), and one into the next room 3 tiles off on its own side (score 3 + 25 = 28). It is sent to the hallway door, cannot get past the counter, and is sent there again each time.

Two smaller things in the same choice:

- A door that is bolted (`door.locked`), welded or without power is scored like any other, for going in and for going out. A player sees the bolt lights and goes to another door. A technician asked to open a bolted door answers "The door will not open for you" (`hold_door_for`), and the body goes back to the same door.
- "At the door" is `get_dist(body, door) <= CREW_NPC_AT_DOOR` (2 tiles), with no look at walls. A body two tiles from a door on the wrong side of a wall is told "You are at the door into X" and may knock at it from there (`tool_knock` makes the same test through `at_door_of`). The walk to a door ends the same way, the moment it is within two tiles (`crew_npc_walk/perform` in `crew_npc_motor.dm`).

## Where

`code/modules/llm_crew/crew_npc_doors.dm:355`, in `tool_go_to_door`:

    	while(length(scores) && tries_left > 0)
    		tries_left--
    		var/obj/machinery/door/airlock/nearest
    		for(var/obj/machinery/door/airlock/door as anything in scores)
    			if(isnull(nearest) || scores[door] < scores[nearest])
    				nearest = door
    		scores -= nearest
    		var/turf/spot = spots[nearest]
    		if(leaving || get_dist(body, nearest) <= CREW_NPC_AT_DOOR)
    			best = nearest
    			best_spot = spot
    			break

`code/modules/llm_crew/crew_npc_tools.dm:440`, `walk_finished`, where the failed walk is reported and nothing is kept:

    	if(tool == CREW_TOOL_TO_DOOR)
    		var/at_it = succeeded || !isnull(at_door_of())
    		...
    		action_result(tool, at_it, at_it ? "You are at [goal]." : "You could not get to [goal]: [why].[fire_doors]", door_details)
    		return

## How it was found

Read from the code, not seen in a round. No map was searched for a room that fits the case.

## How to fix it

1. In the loop, drop `leaving ||` from the short cut, so that only "already within reach of it" skips the test. For a door out, test the route to `spot` (the inside tile) with `get_path_to`, exactly as is done for a door in. A door with no route is passed over and logged with the existing "found no way to ... and looks for another" line (change "a door into" to say which way).
2. Keep the door it came in by first: it has -100 and will pass the test in the usual case, so nothing changes for a body with a trail.
3. Pass over, or put last (+300), a door that is bolted or welded. Leave a door without power in: it can be pried, and someone may come with a crowbar.
4. If no door out can be walked to, answer "You cannot find a way to the door out of X" as now. That is true, and the window's shut-in steps (asking whoever is in sight, PDA to the door's keepers) still work from where it stands. Check `driver.ts` about line 360: knocking and writing are only done when `brain.atDoorOf === brain.location`. A body that cannot reach any door never gets that far, so it never sends word. Let those two steps run without being at the door when the last `go_to_door` failed with no way.
5. For the two-tile "at the door" test: in `at_door_of`, also require that the body can see the door or is within one tile (`get_dist <= 1 || (door in view(CREW_NPC_AT_DOOR, body))`). Glass doors and walls are told apart by `view`. Check `try_random_step` and `room_door_for`, which use the same distance, still do what they should.

## How to test the fix

- Server compile.
- In a round: shut a body in a room with two doors where a locked windoor or a row of tables cuts it off from the nearer hallway door. `game.log` should show one `found no way to` line for that door and then a walk to the other.
