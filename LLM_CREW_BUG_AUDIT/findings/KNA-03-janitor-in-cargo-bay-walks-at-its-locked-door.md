---
id: KNA-03
title: A janitor let into the Cargo Bay walks into its locked lobby door for five seconds, then asks out by the wrong door
kind: bug
severity: medium
effort: medium
confidence: likely
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_motor.dm:68, code/modules/llm_crew/crew_npc_tools.dm:200, code/modules/llm_crew/crew_npc_tools.dm:506, code/modules/llm_crew/crew_npc_doors.dm:42, code/modules/llm_crew/crew_npc_doors.dm:286, code/modules/llm_crew/crew_npc_tools.dm:515
fix: End a walk at once when the route just planned runs through a shut airlock that is locked to the body, say which door, and ask to be let out by that door
---

## What is wrong

Also written up as: KNB-03

What KNB-03 adds, kept here so nothing is lost:

- **How often.** 51 walks in the logs of 2026/11/18 and 2026/11/19 ended at (77,146) with a route planned ("the last route planned was N steps"): 45 `go_to`, 2 `release`, 2 `throw_out`, 1 `go_to_door`, 1 `recycle`. It is in every round with janitors called into cargo: 4 in `round-15.52.18`, 5 in `17.48.05`, 5 in `19.33.50`, 8 in `20.00.21`, 6 in `20.43.32`. Found by `grep 'Stopped at Cargo Bay (77,146'` over every `game.log` of those two days. 5 of the 51 are technicians' hauls held at the same tile for another reason (a crate that will not go through).
- **The change log lists it twice besides the 20:19 entry quoted below**: the 2026-11-18 morning entry, "fixes from the first round with a Quartermaster": "The route planner sends a janitor inside the Cargo Bay to the lobby airlock, which is locked to it (11 failed walks stopping at 77,146). Cause not found."
- **A second case**, `data/logs/2026/11/19/round-20.43.32/game.log`. Jean-Luc Willey, a janitor, let into the Cargo Bay by the Quartermaster Maintenance door at 02:48:22, finished at 02:49:06:

      [02:49:17.475] ... (Jean-Luc Willey) walk failed (go_to, to Cargo Lobby): there is no way through. Stopped at Cargo Bay (77,146,2), heading for The floor at Cargo Lobby (82,147,2); the last route planned was 5 steps.
      [02:49:56.891] ... found no route to Cargo Lobby from Delivery Office (80,142,2). ... Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it. ...
      [02:51:38.360] ... walk failed (go_to, to Bar Lounge): ... Stopped at Cargo Bay (77,146,2) ...; the last route planned was 61 steps.
      [02:52:04.404] ... walk failed (go_to, to Bar Lounge): ... Stopped at Cargo Bay (77,146,2) ...; the last route planned was 61 steps.
      [02:57:30.048] ... walk failed (go_to, to Central Primary Hallway): ... Stopped at Cargo Bay (77,146,2) ...; the last route planned was 39 steps.

  KNB-03 measured about ten seconds at the door in that round, not five. A far walk (the Bar Lounge, 61 steps) is held back by the driver as a failed step and tried again, so the body goes back to the same door.
- **Why it is not a door that happened to be open.** The move loop plans again after every failed step (`handle_move_attempt_failure` calls `recalculate_path`), and "5 steps" from (77,146) to (82,147) is a plan made while standing at the shut door, through it. The search itself runs in `navmap_pathfinder.dll`, which was not read. The log's own "locked to it" second opinion is the same planner (KNB-02), so it is no check.

The change log entry of 2026-11-18, 20:19 to 20:40 lists, as "not looked into": "two bodies stopped at Cargo Bay (77,146) on a five-step route to the Cargo Lobby, six times between them".

What happened, from `data/logs/2026/11/19/round-20.00.21`:

- Both bodies are janitors (Collin Archibald, Brenna Beedell) who had been let into the Cargo Bay by a technician. The bay is locked to them.
- Each was then given work in the Cargo Lobby next door (a mess there; "collect crate #764 ... going to the counter in the Cargo Lobby to ask for it") and was told `go_to("Cargo Lobby")` from inside the bay.
- The only way from the bay to the lobby is the airlock "Cargo Bay" at (78,146). By the map (`_maps/map_files/MetaStation/MetaStation.dmm`) it is `/obj/machinery/door/airlock/mining` with `/obj/effect/mapping_helpers/airlock/access/all/supply/general` and no unrestricted side. (78,145) is the ore redemption machine, (78,147) and (78,148) are windows. The server's own check, 39 seconds after the first failure, says of the same body: "Doors of Cargo Lobby: Cargo Bay at (78,146): locked to it".
- All the same the route planner gave a route through it every time: "the last route planned was 5 steps" from (77,146) to (82,147) is exactly through (78,146). The body walked to (77,146), which is the tile in front of the door, and walked into the shut door until the walk gave up (20 failed steps, about 5 seconds: `max_pathing_attempts = 20` in `code/datums/ai/movement/ai_movement_navmap_astar.dm`). The same tile ends two more walks in that round, one to the Warehouse door ("the last route planned was 45 steps") and one to the Bar Lounge ("67 steps"): every route out of the bay was planned through that door.

    [02:05:30.566] ... (Collin Archibald) ... walk failed (go_to, to Cargo Lobby): there is no way through. Stopped at Cargo Bay (77,146,2), heading for The floor at Cargo Lobby (82,147,2); the last route planned was 5 steps.
    [02:12:08.056] ... the same, [02:12:41.082], [02:13:57.244], [02:18:39.315]
    [02:18:23.057] ... (Brenna Beedell) ... Stopped at Cargo Bay (77,146,2), heading for The floor at Cargo Lobby (82,146,2); the last route planned was 5 steps.

What follows each failure makes it worse. The failed walk counts as "tried to leave and could not", and a body with a trail is then shut in and goes back to the door it came in by (`note_way_out_failed`). Collin came in by the Quartermaster Maintenance door on the far side of the bay, so at 02:13:21 it stood at (77,154) asking "could you let me out to the Fore Port Maintenance, please?", when what it wanted was the lobby, one door from where it had been standing. Let out to maintenance at 02:15:29, it walked round to the lobby, asked for its crate at 02:18:04, was let into the bay again at 02:18:14 for the mess, and at 02:18:39 failed at (77,146) once more.

What it should do: know at once that the door in its way is locked to it, and ask for that door.

**Not proven:** why the planner takes that airlock for passable. By `code/game/machinery/doors/airlock.dm:1523` a shut airlock passes only with the access for it:

    /obj/machinery/door/airlock/CanAStarPass(to_dir, datum/can_pass_info/pass_info)
    	//Airlock is passable if it is open (!density), bot has access, and is not bolted shut or powered off)
    	return !density || (check_access_list(pass_info.access) && !locked && hasPower() && !pass_info.no_id)

and in the same round the planner rightly found no route for a janitor out of the Mining Office ("no route could be found"), whose doors are also cargo's. Two things could explain a route through (78,146), and the logs cannot tell them apart: the door was standing open each time the route was planned (a technician had just walked through, or it was being held for someone) and shut before the body reached it, with every later replan somehow still passing; or the native planner behind `SSpathfinder.navmap_pathfind` answers differently from the DM proc for this door. The walk replans after every blocked step (`handle_move_attempt_failure` in `code/controllers/subsystem/movement/movement_types_navmap.dm`), and `last_route_steps` holds the newest plan, so "5 steps" was the answer at the end, with the body against the shut door. That points at the second. The fix below does not depend on which it is, and step 1 writes the line that settles it.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:68`, `route_planned`: the one place the planned route is in hand, and only its length is kept.

    /datum/ai_movement/navmap_astar/crew_npc/proc/route_planned(datum/move_loop/has_target/navmap_astar/source, list/path)
    	SIGNAL_HANDLER
    	var/datum/ai_controller/crew_npc/crew_controller = source.extra_info
    	if(istype(crew_controller))
    		crew_controller.last_route_steps = length(path)

`code/modules/llm_crew/crew_npc_doors.dm:286`, `route_by_open_door`: the test that is wanted already exists, and is used only by `tool_go_to_door`.

    /datum/ai_controller/crew_npc/proc/route_by_open_door(list/route)
    	var/mob/living/carbon/human/body = pawn
    	for(var/turf/tile as anything in route)
    		for(var/obj/machinery/door/airlock/door in tile)
    			if(!door.allowed(body))
    				return TRUE
    	return FALSE

`code/modules/llm_crew/crew_npc_tools.dm:506`, `walk_finished`: the failure is counted as a way out that failed, though the goal was not locked.

    if(reason == "there is no way through" && !length(fire_doors) && !(tool == CREW_TOOL_EXPLORE && isturf(target)) && !(goal_room && locked_out_of(goal_room)))
    	note_way_out_failed()

`code/modules/llm_crew/crew_npc_doors.dm:42`, `note_way_out_failed`: one failure with a trail is being shut in, and `trail_door()` (`:108`) is then the door it came in by, not the door it was walking at.

    if(length(trail))
    	shut_in = TRUE
    	wants_out = TRUE
    	return

## How it was found

Seen in a round log (`game.log` and `crew_brain.log` of `round-20.00.21`, lines quoted). The map tiles were read with a script over the `.dmm` file. The server code was read. The planner's side was read as far as `CanAStarPass` and the move loop and not settled.

## How to fix it

1. In `route_planned` (`crew_npc_motor.dm`), look at the first few tiles of `path` (three is enough) for an airlock that is shut (`door.density`) and `!door.allowed(body)`. If there is one, note it on the controller (`route_locked_door = WEAKREF(door)`) and write one `log_game` line: "was routed through [door] at (x,y), which is shut and locked to it". This is a signal handler: note and log only, no sleeping calls.
2. In `/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/perform` (`crew_npc_motor.dm:94`), if that note is set, fail the walk at once with `fail_reason = CREW_NPC_NO_WAY`. No five seconds of walking into a door.
3. In `walk_finished` (`crew_npc_tools.dm`), when the walk failed on such a door, put it in the answer to the brain: "You stop on the way to X: the door Y is locked to you." with details `locked_door` (its label from `crew_npc_door_label`) and `place`. And make that door the one it wants out by: set `wanted_door`, `wanted_door_place`, `wanted_door_leaving = TRUE`, `wanted_door_label` as `tool_go_to_door` does at its end (`crew_npc_doors.dm:399`), so that the knock and the PDA message name the lobby door. `trail_door()` should give this door ahead of the one it came in by while it is set.
4. On the window side nothing new is needed if step 3 sets the door: the shut-in steps in `driver.ts` already knock and send "I am at the X door". Check that `doorCalled(brain, brain.location)` (`jobs/janitor.ts`) reads the label the server now sends.
5. A choice for the owner: should a janitor who was let into the bay for a mess leave it for other work while the mess is still there? The rule built on 2026-11-18 ("does not walk out of a room while there is work in it that it can get on with", `driver.ts:412`) covers only the walk back out, not other tasks. In the round the pick-up of crate #764 and the lobby mess both pulled it out of the bay mid-clean. I would hold other rooms' work back while `task.place === brain.location` work is ready and the room is locked to it. That is a question of priorities, so ask.

Points from KNB-03 for steps 1 to 3:

- In step 1, walk the whole path once, not only the first tiles, and count as shut also an airlock that is bolted, welded or without power. Keep the first such door (`route_shut_by` or `route_locked_door`, one field) and clear it when a fresh plan has none. The move loop plans again after each failed step, so the note always matches the newest plan.
- In step 2, put the check before `return ..()` in `perform` and return `AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED`, so the walk ends in the tick it was planned.
- Leave alone a door that is standing open: that case is `route_by_open_door`'s, decided per tool.
- In `log_walk_failed` (`crew_npc_tools.dm:515`), add the door to the failure line: "the route planned ran through [door] at (x,y), which is shut and does not open for it". That line is the evidence to take the planner's fault upstream.
- Must keep working: a technician whose ID opens the door is not stopped (`door.allowed(body)` is true), and a body hauling a crate is handled by the grip code first (`CREW_NPC_HAULS`), which is above this check in `perform`.
- KNB-03's last step left the ask by the door it came in by as built; step 3 here (ask by the door that stopped it) is the better one, by the Collin Archibald case above.

Keeps the rules: the body learns only what it would find by trying the door. No door is opened by code.

## How to test the fix

- Server compile to a side copy (see `README.md`).
- The simulator runs no server code. On the window side, add a case to a janitor scenario in `tools/llm_crew/sim.ts` where the server answers a `go_to` with the new "the door Y is locked to you" result, and check the janitor then goes to that door and knocks.
- Next round, `game.log`: "was routed through" lines say which doors the planner wrongly takes for open, which settles the unproven part. "Stopped at Cargo Bay (77,146,2)" should be gone, or should come within a second of the walk's start. `grep 'Stopped at Cargo Bay (77,146'` should show no `go_to` walk with "last route planned" (51 such walks in the logs of 2026/11/18 and 19 before the fix). If the new line names (78,146) for a janitor, the planner fault is proven.
