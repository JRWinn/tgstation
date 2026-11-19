---
id: DOOR-03
title: The test for being shut in can say yes in a hallway, and says yes when it has tested nothing
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Fable 5.2
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:184, code/modules/llm_crew/crew_npc_tools.dm:506, code/modules/llm_crew/crew_npc_tools.dm:277
fix: In check_shut_in leave out rooms locked to the body, never conclude shut in from zero routes tested or in a hallway, and first ask whether any door of the room it stands in opens to it
---

## What is wrong

See also: KNA-28 (the round-start "no way out" of the Custodial Closet). Its last step is item 2 here, the shut-in test with no room to test, and it has the round log lines for it (round-13.32.16, "tested whether it is shut in Custodial Closet ... found no way out"); its main cause, a walk to a sealed part of a room picked by `place_spot`, is a separate fault.

`check_shut_in` decides a body is shut in when it finds no route to the nearest three rooms in `visited_places`. Three things make that wrong.

1. **The rooms it tests include rooms that are locked to the body.** `visited_places` holds every room the body has stood in, and rooms it was let into are among them (`door_opened_for` adds them, `note_place` adds them). A route to a locked room is never found. So a locked room among the nearest three is a wasted test, and three of them is a false "shut in".
2. **With no other room known, it tests nothing and still says shut in.** The loop does not run, `way_out` stays FALSE, and `shut_in = TRUE`. The log line reads "found no way out" though no route was tried.
3. **It does not matter where the body stands.** `ways_out_failed` is counted for any failed walk to a room that is not locked to it, and for any `explore` that finds nowhere, wherever the body is. Nothing checks that it is in a room that can be shut at all.

One concrete case. A janitor has been let into the Cargo Bay, the Delivery Office and the Warehouse during the round (all three are now in `visited_places`) and has been let out into the Cargo Lobby. From the lobby it is twice told to explore, and both times `pick_somewhere_new` finds rooms left but no route to them (`nowhere_new_left = FALSE`, so `note_way_out_failed` is called). `ways_out_failed` is now 2 (`CREW_NPC_SHUT_IN_AFTER`). `check_shut_in` takes the three nearest known spots: the three cargo rooms, all locked to it. No route to any. `shut_in = TRUE`, standing in a public lobby.

What the window does with that (`driver.ts` about line 320): "Shut in, it goes and stands at the door first", a `go_to_door` with no room. `tool_go_to_door` takes that as leaving the room it is in, picks the best-scored door of the lobby or hallway, and the body goes and stands at it, knocks, and then sends PDA messages to "whoever can open the door". It stays that way until it happens to change room (`note_place` clears `shut_in`).

The second fault needs only a body that has not yet left the room it started in, and two failed walks. A janitor in the Custodial Closet at the start of a round has only the closet in `visited_places`.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:184`, `check_shut_in`:

    	for(var/place in visited_places)
    		if(place == room)
    			continue
    		var/list/spot = visited_places[place]
    		var/turf/there = spot[3] == here.z ? locate(spot[1], spot[2], spot[3]) : null
    		if(there)
    			spots[there] = get_dist(here, there)
    	var/way_out = FALSE
    	var/tries_left = CREW_NPC_SHUT_IN_ROUTES
    	...
    	while(length(spots) && tries_left > 0 && !way_out)
    	...
    	if(way_out)
    		ways_out_failed = 0
    	else
    		shut_in = TRUE

`code/modules/llm_crew/crew_npc_tools.dm:506`, in `walk_finished`, one of the two places the count goes up:

    		if(reason == "there is no way through" && !length(fire_doors) && !(tool == CREW_TOOL_EXPLORE && isturf(target)) && !(goal_room && locked_out_of(goal_room)))
    			note_way_out_failed()

`code/modules/llm_crew/crew_npc_tools.dm:277`, in `tool_explore`, the other:

    		else
    			note_way_out_failed()
    			action_result(CREW_TOOL_EXPLORE, FALSE, "You look for a way to somewhere new but find none from here. There may be more to find another time.")

## How it was found

Read from the code, not seen in a round. `LLM_CREW_PLAN_ROUND_0912.md` line 109 has "The Quartermaster was shut in the Service Hallway", which may be this or may be a real shut hallway: it was not looked into here.

## How to fix it

In `check_shut_in`, in this order:

1. **Ask the room first.** Get `crew_npc_doors_of(get_area(body), here.z)`. If any door of the room it stands in is one it could walk out by (`door.allowed(body) && door.hasPower() && !door.locked && !door.welded`, or `!door.density`), it is not shut in: set `ways_out_failed = 0` and return. This is cheap, needs no route, and is the plain meaning of "shut in". (It also wants the open-way test of DOOR-02 and the free-exit test of DOOR-05 when those are built.)
2. **A hallway or a maintenance tunnel is not somewhere to be shut in by a door.** If `place_kind()` is not "room", only go on to the route test if the room has no door that opens to it at all (step 1 already covers that), otherwise return.
3. **Leave locked rooms out of the candidates.** When filling `spots`, skip any `place` for which `place_locked_to_body(place)` is TRUE (it is cached). Prefer hallways: sort a hallway spot ahead of a room at the same distance.
4. **Nothing tested is not an answer.** If `spots` is empty after that, do not set `shut_in`. Leave `ways_out_failed` as it is, so the next failed walk tries again.
5. Write to the log how many routes were tested, so "found no way out" can be told from "had nowhere to test".

Keep the quick path in `note_way_out_failed` for a body with a trail. That one is right in a room with real doors (but see DOOR-02 for a room with an open side).

## How to test the fix

- Server compile.
- The simulator does not run this code. In a round, grep `game.log` for `tested whether it is shut in`. Every such line should name a room, not a hallway or lobby, and "found no way out" should only appear for a room whose doors are all locked to that body, bolted or dead.
