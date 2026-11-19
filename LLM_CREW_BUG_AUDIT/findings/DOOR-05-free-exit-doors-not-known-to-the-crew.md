---
id: DOOR-05
title: A door that lets anyone out from one side is taken as locked, so a body asks to be let out of somewhere it could walk out of
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:561, code/modules/llm_crew/crew_npc_doors.dm:184, code/modules/llm_crew/crew_npc_guarding.dm:118, code/game/machinery/doors/airlock.dm:1523
fix: Teach the route planner that an airlock opens from its free-exit side, or failing that have a shut-in body look for such a door of its room and walk into it
---

## What is wrong

Many airlocks have a free-exit side (`unres_sides`, set by the map's `unres` helpers). From that side anyone opens the door by walking into it or clicking it, with no ID: `user_can_activate_door` in `door.dm` ends with `if(unrestricted_side(user))`. MetaStation has 86 of them. A count over the map file by area: 64 on maintenance doors (out of the tunnels into the halls), 8 in Medbay, 5 in Research, and one each in the Service Hallway, the Theater and Recreation.

Nothing in the crew code knows of them, and neither does the base game's route planner:

- `/obj/machinery/door/airlock/CanAStarPass` asks only `check_access_list(pass_info.access)`. A shut free-exit door is a wall to every planned route for a body whose ID does not open it.
- `door.allowed(body)` (`/obj/machinery/door/allowed` is `..() || emergency`) does not count the free side either. So `locked_out_of`, `shut_in_at_door`, `route_by_open_door`, `room_door_for` and `tool_force_door` all read such a door as locked to the body.

What follows: a body standing on the free side of such a door, with no ID for it, finds no route out, is counted as shut in, goes and stands at "the door out", knocks, and sends PDA messages asking to be let out. A player in the same spot walks into the door and it opens.

One concrete case. A body without a service ID ends up in the Service Hallway (`/area/station/hallway/secondary/service`): the Quartermaster did, by the mail chute, and `LLM_CREW_PLAN_ROUND_0912.md` line 109 records "The Quartermaster was shut in the Service Hallway". That hallway has a free-exit door on this map. `walk_finished` gets "there is no way through" for every walk out, `note_way_out_failed` counts them, `check_shut_in` finds no route to anywhere and sets `shut_in`. The body waits to be let out of a hallway it could leave by one push on a door. (Whether that is what happened to the Quartermaster in that round was not checked in its log. It fits.)

The same goes for anyone without maintenance access who comes out of a disposal pipe or is walked into a tunnel: every tunnel door onto a hall opens from inside.

## Where

`code/game/machinery/doors/airlock.dm:1523` (base game, not ours):

    /obj/machinery/door/airlock/CanAStarPass(to_dir, datum/can_pass_info/pass_info)
    	//Airlock is passable if it is open (!density), bot has access, and is not bolted shut or powered off)
    	return !density || (check_access_list(pass_info.access) && !locked && hasPower() && !pass_info.no_id)

`code/game/machinery/doors/door.dm:370`, what a player gets:

    /obj/machinery/door/proc/unrestricted_side(mob/opener)
    	return get_dir(src, opener) & unres_sides

`code/modules/llm_crew/crew_npc_doors.dm:561`, `shut_in_at_door`, "cannot open that door for themselves":

    			if(person != body && get_area(person) == room && !door.allowed(person))
    				return person

`code/modules/llm_crew/crew_npc_guarding.dm:130`, `locked_out_of`:

    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(door.allowed(body))
    			return FALSE
    	return TRUE

## How it was found

Read from the code. The count of free-exit doors is from a script over `_maps/map_files/MetaStation/MetaStation.dmm` (blocks holding `mapping_helpers/airlock/unres`, counted by their area line). Which way each one faces was not worked out. Not seen in a round log.

## How to fix it

Two ways. The first is better and is the owner's to allow, since it is a fourth edit to a base-game file.

**A. Teach the planner (one line, base game).** In `/obj/machinery/door/airlock/CanAStarPass`, also pass when the door is being come at from its free side:

    return !density || (!locked && hasPower() && ((check_access_list(pass_info.access) && !pass_info.no_id) || (unres_sides & to_dir)))

`to_dir` is already the right direction: `LinkBlockedWithAccess` calls it with `get_dir(destination_turf, src)` and `nav_blocker_can_pass` with the reverse of the direction of travel, both of which are "from the door towards whoever is coming", the same thing `unrestricted_side` tests. Check `is_living`/bots: a bot walking into the door from that side opens it too (`Bumped` calls `bumpopen` for any living mob), so the rule is true for every pathfinder. Some doors make the opener wait a few seconds (`delayed_unres_open`): the walk already copes with a door that is slow to open, but watch for "it was taking too long" on short walks.

Then, in our code, so the answers agree with the planner:

1. Add `/datum/ai_controller/crew_npc/proc/opens_from_here(obj/machinery/door/airlock/door, atom/from)`: `door.allowed(pawn) || (door.unres_sides & get_dir(door, from))`.
2. Use it in `shut_in_at_door` (with `from = person`, and the person in place of the pawn), and in `tool_go_to_door` when leaving: a door of the room that opens from its inside tile needs no knocking.
3. Leave `locked_out_of` alone: getting in is still locked.

**B. Ours only.** If the base edit is not wanted: in `check_shut_in` and at the top of `tool_go_to_door` when leaving, look through `crew_npc_doors_of(room, z)` for a door with power, not bolted or welded, whose `unres_sides & get_dir(door, sides[1])` is set. If there is one, walk to its inside tile (`sides[1]`) and then take one step at the door with `body.Move()`, which is the bump that opens it for a player. Then walk on. This needs a small new walk state ("through this door") and does nothing for routes that pass through a tunnel on the way somewhere else, which A mends as well.

## How to test the fix

- Server compile.
- In a round on MetaStation: put a body with no maintenance access into a maintenance tunnel (drop it in a disposal bin) and tell it to go to its post. It should walk out by the nearest tunnel door. In `game.log` there should be no `tested whether it is shut in` line for it.
- With A, also check a cleanbot or medibot still finds its way about (run a round for a few minutes and look for bots stuck at doors).
