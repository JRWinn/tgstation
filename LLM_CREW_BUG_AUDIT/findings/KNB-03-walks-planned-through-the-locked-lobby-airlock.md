---
id: KNB-03
title: A body with no cargo access is given a route through the shut Cargo Bay lobby airlock and walks at it for ten seconds, 51 times in the logs
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Fable 5.2
area: logs
files: code/modules/llm_crew/crew_npc_motor.dm:68, code/modules/llm_crew/crew_npc_doors.dm:286, code/modules/llm_crew/crew_npc_tools.dm:515
fix: Look over each planned route in route_planned and end the walk at once, naming the door, when it runs through a shut airlock the body's ID does not open
---

## What is wrong

A janitor that has been let into the Cargo Bay and wants to leave is given a route straight through the airlock "Cargo Bay" at (78,146), between the bay and the Cargo Lobby. That door is shut and its ID does not open it. It walks to (77,146), the tile in front of the door, and steps at the door until the walk gives up, about ten seconds later, with "there is no way through". Then it does the same again for its next destination.

Listed three times in the change log, never run down:

- 2026-11-18 morning, "fixes from the first round with a Quartermaster": "The route planner sends a janitor inside the Cargo Bay to the lobby airlock, which is locked to it (11 failed walks stopping at 77,146). Cause not found. The fix above only stops the janitor walking at it over and over."
- 2026-11-18 20:19, "the last entry played": "two bodies stopped at Cargo Bay (77,146) on a five-step route to the Cargo Lobby, six times between them", not looked into. The same entry notes "the pathfinder takes a door that is standing open for a way through" and mends it for `tool_go_to_door` only.

What this finding adds:

1. **How often.** 51 walks in the logs of 2026/11/18 and 2026/11/19 ended at (77,146) with a route planned ("the last route planned was N steps"): 45 `go_to`, 2 `release`, 2 `throw_out`, 1 `go_to_door`, 1 `recycle`. It is in every round with janitors called into cargo: 4 in `round-15.52.18`, 5 in `17.48.05`, 5 in `19.33.50`, 8 in `20.00.21`, 6 in `20.43.32`.
2. **It is not a door that happened to be open when the route was planned.** The move loop plans again after every step that fails (`handle_move_attempt_failure` in `code/controllers/subsystem/movement/movement_types_navmap.dm` calls `recalculate_path`), and the log line gives the length of the *last* plan. "5 steps" from (77,146) to (82,147) is a plan made while standing at the shut door, through it. So for the ten seconds it stood there, every fresh plan still went through the door. 40 seconds later, from the Delivery Office, the same search for the same body says no route and the log says of that door "locked to it".
3. **The log's second opinion is no check** (KNB-02): it is the same planner.
4. **The cause inside the planner is not found.** The DM side reads right: the edge into the door's tile is marked conditional and is meant to be settled by `/obj/machinery/door/airlock/CanAStarPass`, which lets through only an open door or an ID that fits. The search itself runs in `navmap_pathfinder.dll`, which was not read. Whatever the reason, the crew code trusts a plan it could check for itself in a few lines.

Concrete case, `data/logs/2026/11/19/round-20.43.32/game.log`. Jean-Luc Willey, a janitor, was let into the Cargo Bay by the Quartermaster Maintenance door at 02:48:22 and finished at 02:49:06:

    [02:49:17.475] ... (Jean-Luc Willey) walk failed (go_to, to Cargo Lobby): there is no way through. Stopped at Cargo Bay (77,146,2), heading for The floor at Cargo Lobby (82,147,2); the last route planned was 5 steps.
    [02:49:56.891] ... found no route to Cargo Lobby from Delivery Office (80,142,2). ... Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it. ...
    [02:51:38.360] ... walk failed (go_to, to Bar Lounge): ... Stopped at Cargo Bay (77,146,2) ...; the last route planned was 61 steps.
    [02:52:04.404] ... walk failed (go_to, to Bar Lounge): ... Stopped at Cargo Bay (77,146,2) ...; the last route planned was 61 steps.
    [02:57:30.048] ... walk failed (go_to, to Central Primary Hallway): ... Stopped at Cargo Bay (77,146,2) ...; the last route planned was 39 steps.

The same tile catches technicians' hauls for a different reason (a crate that will not go through), which is why 5 of the 51 are not `go_to`.

It costs more than the ten seconds. One failed walk is how a body let into a locked room learns it is shut in (the 12:00 entry: "one failed walk, then the door"), so the delay sits in front of every "let me out". And a walk to somewhere far off (the Bar Lounge, 61 steps) is held back by the driver as a failed step and tried again, so the janitor goes back to the same door.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:68`, the one place that sees each planned route, and it only counts it:

    /datum/ai_movement/navmap_astar/crew_npc/proc/route_planned(datum/move_loop/has_target/navmap_astar/source, list/path)
    	SIGNAL_HANDLER
    	var/datum/ai_controller/crew_npc/crew_controller = source.extra_info
    	if(istype(crew_controller))
    		crew_controller.last_route_steps = length(path)

`code/modules/llm_crew/crew_npc_doors.dm:286`, the check that exists already and is used by `tool_go_to_door` alone:

    /datum/ai_controller/crew_npc/proc/route_by_open_door(list/route)
    	var/mob/living/carbon/human/body = pawn
    	for(var/turf/tile as anything in route)
    		for(var/obj/machinery/door/airlock/door in tile)
    			if(!door.allowed(body))
    				return TRUE
    	return FALSE

`code/game/machinery/doors/airlock.dm:1523`, what the planner is meant to go by:

    /obj/machinery/door/airlock/CanAStarPass(to_dir, datum/can_pass_info/pass_info)
    	//Airlock is passable if it is open (!density), bot has access, and is not bolted shut or powered off)
    	return !density || (check_access_list(pass_info.access) && !locked && hasPower() && !pass_info.no_id)

## How it was found

Seen in the round logs (the counts above are from `grep 'Stopped at Cargo Bay (77,146'` over every `game.log` of those two days). The planner's DM side, the move loop and the airlock's answer were read. The DLL was not, and no round was played.

## How to fix it

Do not wait for the cause. Check the plan.

1. In `route_planned` (`crew_npc_motor.dm`), walk the path once. For each tile, look for an airlock that is shut (`door.density`) and that `!door.allowed(body)`, or that is bolted, welded or without power. Keep the first one on the controller: `route_shut_by = WEAKREF(door)`. Clear it when a plan has none. This is one pass over a list the body is about to walk, a few times a walk.
2. In `/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/perform`, before `return ..()`: if `crew_controller.route_shut_by` resolves, set `fail_reason = CREW_NPC_NO_WAY` and return `AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED`. The walk ends in the same tick it was planned, where it stands, not after a walk to the door and ten seconds of stepping at it.
3. Leave alone a door that is standing open: that case is `route_by_open_door`'s, and whether a body may walk through an open door of a room locked to it is already decided per tool.
4. In `log_walk_failed` (`crew_npc_tools.dm`), add the door when there was one: "the route planned ran through [door] at (x,y), which is shut and does not open for it". That line is the evidence the next person needs to take the planner's fault to whoever owns the navmap code.
5. Everything after stays as built: `walk_finished` counts it toward being shut in, and the body goes to the door it came in by and asks.

What must keep working: a technician, whose ID opens the door, is not stopped (`door.allowed(body)` is true). A body hauling a crate is handled by the grip code first (`CREW_NPC_HAULS`), which is above this check in `perform`.

Not a cheat: the body is told nothing a person would not see. It is standing in the room with the door and knows whether its card opens it.

## How to test the fix

- Server compile to a side copy.
- The simulator has no planner. Nothing there can show this.
- Next round, `game.log`: `grep 'Stopped at Cargo Bay (77,146'` should show no `go_to` walk with "last route planned", and the new "ran through ... which is shut" line should appear instead, with the walk failing in the same second it was begun. If that line names (78,146) for a janitor, the planner fault is proven and can be reported upstream with the line.
