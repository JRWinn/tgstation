---
id: KNA-31
title: The rule against a way in through a locked door that stands open this minute is skipped for hallways, so the officer can still walk into the Service Hallway behind a janitor, the case it was written for
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:372, code/modules/llm_crew/crew_npc_guarding.dm:119, code/modules/llm_crew/crew_npc_forcing.dm:78, code/modules/llm_crew/crew_npc_doors.dm:286
fix: In tool_go_to_door test every route with route_by_open_door, whatever room the door opens from, and in particular treat a hallway with doors of its own as locked by hallway_locked_to
---

## What is wrong

The change log entry of 2026-11-18, 20:19 to 20:40, says: "How the officer came to be standing in the Service Hallway is inferred, not seen. By the map it has no way in either. Janitors, who carry a service ID, were in that hallway at the time, and the pathfinder takes a door that is standing open for a way through." And as changed: "A way that is only there because a locked room's door stands open this minute is not taken (`route_by_open_door`)."

The round bears the inference out. `data/logs/2026/11/19/round-20.00.21/game.log`: at 02:06:00 (log time) the officer is in the Central Primary Hallway (118,114); at 02:06:11 it sends the Captain "I am at the Bar Storage door of the Bar Backroom"; at 02:06:20 it speaks from the Service Hallway (132,118). Bar Storage (133,120) opens only from the Service Hallway, whose doors take a service ID.

But the fix does not cover that case. In `tool_go_to_door` the open-door test is applied only when the room the door opens from is `outer_locked`, and that is `locked_out_of(outer)`. `locked_out_of` answers FALSE for every hallway, by its first line. The Service Hallway is a hallway (`/area/station/hallway/secondary/service`). So for the Bar Storage door, `outer_locked` is FALSE, the route through the Service Hallway door that a janitor has just opened is kept, and the officer is sent through it, as in the round.

The forcing code knows this and has its own test: `hallway_locked_to` ("The service hallway is one: only service staff walk it, and locked_out_of() takes every hallway for open"). `tool_go_to_door` does not use it.

What follows from being let through that way: the officer stands in a hallway it has no right to be in, at a door nobody will open for it there (it asked the Captain from inside the Service Hallway), and when the door it came in by shuts, it is shut in a hallway. `note_place` would not mark it as out of bounds (`locked_out_of` is FALSE for a hallway), so no trail is kept and it does not know the way it came in.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:370`, `tool_go_to_door`:

    		var/list/nearest_sides = doors[nearest]
    		var/area/outer = get_area(nearest_sides[2])
    		var/outer_locked = outer != get_area(body) && locked_out_of(outer)
    		var/list/route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
    		...
    		if(outer_locked && length(route) && route_by_open_door(route))
    			route = null

`code/modules/llm_crew/crew_npc_guarding.dm:118`, `locked_out_of`:

    	if(!istype(room, /area/station) || istype(room, /area/station/hallway) || istype(room, /area/station/maintenance))
    		return FALSE

`code/modules/llm_crew/crew_npc_forcing.dm:78`, the test that is wanted:

    /datum/ai_controller/crew_npc/proc/hallway_locked_to(area/room)
    	if(!istype(room, /area/station/hallway))
    		return FALSE
    	...
    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(door.allowed(body))
    			return FALSE
    	return TRUE

Base game, `code/game/machinery/doors/airlock.dm:1523`, why the planner takes the open door:

    /obj/machinery/door/airlock/CanAStarPass(to_dir, datum/can_pass_info/pass_info)
    	//Airlock is passable if it is open (!density), bot has access, and is not bolted shut or powered off)
    	return !density || (check_access_list(pass_info.access) && !locked && hasPower() && !pass_info.no_id)

## How it was found

Read from the code, with the timings from the round's `game.log` named above. Which door it went through is not in the log (no line is written for a walk that works).

## How to fix it

1. In `tool_go_to_door`, test every route found with `route_by_open_door`, not only those to a door of a locked outer room. `route_by_open_door` already asks the right question of each airlock on the route (`!door.allowed(body)`, so a door the body could open itself is fine). A route that needs a door someone else happens to have open is no route to stand at a door by. **But first teach `route_by_open_door` to let through a door that stands open for good**, or this breaks the project's own way in: an engineer forces a door by cutting its power and prying it (`tool_force_door`), and that door stays open, unpowered, so it can be walked through by anyone, the officer it was forced for above all. Skip a door on the route when it is open (`!door.density`) and cannot shut by itself: `!door.hasPower() || door.locked || (door.obj_flags & EMAGGED)`. As the code stands this hole is already there for the Cargo Bay and its offices; widening the test to every route makes it bite far more often.
2. If the owner wants hallways kept apart from rooms elsewhere (for janitors cleaning, say), at least make `outer_locked` use `locked_out_of(outer) || hallway_locked_to(outer)`, as `tool_force_door` does for `through`. Then the answer for the Bar Backroom becomes "it opens from the Service Hallway, which is locked to you as well", which is what the engineer is already told.
3. The same hole is in every other walk: `tool_go_to` plans with `get_path_to` and the airlock's own `CanAStarPass`, which takes any open door. ARR-06 and KNB-03 discuss that. This finding is only that the one place built to stop it misses the case it was built for.

## How to test the fix

Server compile to a side copy. An airlock shuts itself after a few seconds, so to make the case at will, as an admin set `autoclose` to 0 on the "Service Hall" airlock at (129,118) with View Variables and open it (it stays open, powered and unbolted: "open this minute"). Then (or in a round with a janitor holding a Service Hallway door open) send the officer after someone in the Bar Backroom: `pda.log` should read "I have a warrant for Pun Pun, who is in the Bar Backroom. I cannot get to its door." (the far line) or the Service Hallway named as locked, not "I am at the Bar Storage door".
