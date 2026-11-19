---
id: DOOR-06
title: The door out of a room is chosen without testing that the body can walk to it, so it makes for the same unreachable door every time
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:363, code/modules/llm_crew/crew_npc_tools.dm:440
fix: Test a route to the inside tile for a door out as is done for a door in, so a door out that cannot be walked to is passed over and the next one tried
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

## Check

Checked by Opus 5.5. Confirmed, for the main fault; the case needs a room whose own floor is cut in two, so it is not common.

- The quote at `crew_npc_doors.dm` about 363 is today's code: `if(leaving || get_dist(body, nearest) <= CREW_NPC_AT_DOOR)` takes the best-scored door out with no `get_path_to`. The score is `get_dist(body, spot)` (the inside tile, not the door) plus the 50 / 25 / -100 terms. Nothing in `walk_finished` (`crew_npc_tools.dm` about 440) or in `driver.ts` remembers which door was tried, and the choice is the same from the same spot, so the window's retry of `{ tool: 'go_to_door' }` (`driver.ts` about 325) goes to the same door.
- `came_in_by` covers most bodies that are shut in: `note_way_out_failed` marks a body with a trail shut in at once, and the trail gives the -100. The case is a body with no trail: one that came out of the disposal pipes (`forget_trail()` in `crew_npc_senses.dm` about 157), one in a room its own ID let it into whose doors then lost power (`follow_trail` keeps no trail when `!out_of_bounds`, and `CanAStarPass` in `airlock.dm` 1523 wants `hasPower()`), or one there since the round began.
- The two smaller points stand: a bolted door is scored like any other in both directions (the route to the near-side tile never crosses the door, so the test for a door in does not catch it either), and `at_door_of` is only `get_dist <= 2`; the motor ends a door walk on that same test (`crew_npc_motor.dm` about 113).
- No map was searched for a room that fits; that part stays untested.

Corrections to "How to fix it":

- Step 1: dropping `leaving ||` sends a door out through the rest of the loop, which was written for a door in. Gate the `outer_locked` / `route_by_open_door` lines and the `outer_name` short cut on `!leaving` (for a door out the far room being locked is not a reason to pass the door over, and "it opens from X, which is locked to you as well" would be untrue), and word the log line "a door out of" for a door out. With the route test in, a door that cannot be reached is passed over on every call, so nothing needs remembering.
- Step 4: `tool_knock` needs `at_door_of()`, so a knock cannot be let run away from the door. Only the PDA steps (`WORD_OUT_KEY`, `WRITE_OUT_KEY`) can, and their text says "am at the ... door"; a body that never reached it needs a line without that, for instance "I am shut in the X and cannot get to its door." That is a window change, so this step makes the fix medium if it is taken; steps 1 to 3 alone are small.
