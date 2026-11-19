---
id: KNB-01
title: Nobody can walk into the Warehouse - crates spawn across its floor just inside its only airlock, and no body can press the shutter button
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Fable 5.2
area: logs
files: code/modules/llm_crew/crew_npc_places.dm:32, code/modules/llm_crew/crew_npc_tools.dm:370, code/modules/llm_crew/crew_npc_tools.dm:534
fix: Walk to a spot the body has a route to (just inside the door its ID opens) when the chosen spot has none, and give bodies a way to press a door button they can see
---

## What is wrong

Also written up as: KNA-13

A cargo technician sent to "look in on the Warehouse" finds no route, every time, in every round since the first one with a Quartermaster. It stands at its post for about 18 seconds, fails, and after two failures leaves the room for fifteen minutes. Nothing in the Warehouse is ever looked at, tidied or cleaned.

Listed as known, cause not found, in four change log entries:

- 2026-11-18 morning, "fixes from the first round with a Quartermaster": "A technician found no route from the Cargo Bay to the Warehouse, twice. Not looked into."
- 2026-11-18 12:00, "eleven faults from the 09:12 round": "The Warehouse fault has no cause yet. The new log line should give one."
- 2026-11-18 15:00: "(10) The Warehouse. Its only airlock opens from the tunnel and the bay side is shutters, but why no route is found by way of the tunnel is still not known."
- 2026-11-18 16:15 and 17:35: "the Warehouse had no route twice more".

**The cause, which the change log does not have.** It is not the tunnel and not the airlock. It is the floor of the Warehouse itself. On MetaStation the room is seven tiles wide (x 66 to 72, y 138 to 142). Its one airlock, "Warehouse Maintenance", is at (65,140) on the west wall. The map puts a random crate spawner on almost every tile between the door and the rest of the room:

    x:    66        67         68            69        70          71      72
    142:  suit unit table      rack          floor     floor       floor   table
    141:  floor     CRATE?     locked crate? CRATE?    crate       floor   table
    140:  floor     floor      CRATE?        floor     floor       floor   floor (sink)
    139:  floor     CRATE?     floor         CRATE?    crate       floor   mech
    138:  wall      rack       rack          floor     crate       floor   recharger

`CRATE?` is `/obj/effect/spawner/random/structure/crate`, which puts down something solid (a crate, a trash cart, a mini-fridge) about nine times in ten (`code/game/objects/effects/spawners/random/structure.dm:14`). From the door a body stands on (66,140) or (67,140). To get further east it needs (68,140), or a diagonal past it, and a diagonal step needs one of its two corner tiles free: (67,141) or (68,140) for the upper one, (67,139) or (68,140) for the lower. With crates on (68,140), (67,139) and (67,141), which is the usual roll, the four tiles inside the door are a pocket and the rest of the room cannot be walked to. A player pushes a crate aside or opens the shutters. The route planner counts a crate as a wall.

The spot the body is sent to is always in the far part. `place_spot` falls back to `safe_spot_in(room, get_turf(pawn))`, which takes the spot **nearest the body** that is clear of doors. The technician is at its post, east of the Warehouse, so the nearest spot is on the east side: every one of the 30 failed walks in the logs heads for x 70 to 72 (`(71,141)`, `(72,140)`, `(70,140)`, `(71,138)`). None heads for the pocket by the door.

Concrete case, `data/logs/2026/11/19/round-20.43.32/game.log`:

    [02:49:33] Walter Marshall ... say: I am going to look in on the Warehouse.
    [02:49:51] Walter Marshall ... walk failed (go_to, to Warehouse): there is no way through. Stopped at Cargo Bay (76,143,2), heading for The floor at Warehouse (72,140,2); no route could be found.
    [02:49:51] ... found no route to Warehouse from Cargo Bay (76,143,2). The game's other pathfinder finds none either. Doors of Warehouse: Warehouse Maintenance at (65,140): opens for it. ...

And the one time the log lists what stood round a crate in there, `round-12.23.07`, 18:31:55: "It lies at Warehouse (70,142,2). Next to it: crate at (69,141), Warehouse Shutters at (69,143), grimy mini-fridge at (70,141) ...".

From KNA-13, which read the same map and came to the same cause:

- Its count of the spawner's table: something solid about 85 times in 100 (crate loot 744, trash cart 75, mini fridge 35 and so on, out of about 1,030), so all three of (67,139), (67,141) and (68,140) are solid, and the pocket shut, in about 6 rounds in 10.
- It comes and goes, which fits a random roll: in `data/logs/2026/11/19/round-20.00.21` a technician was in the Warehouse 11 seconds after setting out (02:15:59 to 02:16:10).
- So both pathfinders are right when they find no way. `log_no_route` says "Warehouse Maintenance at (65,140): opens for it" and "The game's other pathfinder finds none either", but not whether the tile inside each door can be reached, which is the line that would have shown this on the first day.
- `walk_finished` (`crew_npc_tools.dm:484` to `:495`) already tries a second spot after "there is no way through", but only for a head's meeting room:

        if(tool == CREW_TOOL_GO_TO && goal && goal == meeting_place && reason == "there is no way through")
        	var/area/station/meeting_room = crew_npc_station_places()[goal]
        	var/turf/other_spot = meeting_room ? safe_spot_in(meeting_room, get_turf(pawn)) : null

- Nothing in `code/modules/llm_crew/` clicks a `/obj/machinery/button/door`; `crew_npc_grip.dm:407` notes that "Shutters and blast doors open for a button, not a card". A technician standing in the pocket sees only a corner of the room, and a crate cannot be hauled in through that airlock from the bay side at all, which is why the button is needed as well as step 1.

The way a player gets in from the bay is three steps: a button "Warehouse Shutters Control" on the bay's south wall (map key `gxu`, `id = "warehouse"`, no access needed) opens the three shutters at (69..71,143). There is a second one inside at (72,142). No crew tool presses a button.

## Where

`code/modules/llm_crew/crew_npc_places.dm:32`, `place_spot`:

    	var/area/station/room = crew_npc_station_places()[place]
    	if(isnull(room))
    		return null
    	return safe_spot_in(room, get_turf(pawn))

`code/modules/llm_crew/crew_npc_tools.dm:370`, `safe_spot_in`, which never asks whether the spot can be walked to:

    		var/distance = get_dist(here, candidate)
    		if(distance < best_distance)
    			best_distance = distance
    			best = candidate
    		if(distance < best_clear_distance && crew_npc_clear_of_doors(candidate))
    			best_clear_distance = distance
    			best_clear = candidate
    	return best_clear || best

`tool_go_to` then calls `start_walk(destination, CREW_TOOL_GO_TO, known_place, CREW_NPC_TRAVEL_TIMEOUT)` with that one spot and no second try.

`_maps/map_files/MetaStation/MetaStation.dmm`, keys `gxu` (the bay's button) and `vde` (the one inside):

    /obj/machinery/button/door/directional/south{
    	id = "warehouse";
    	name = "Warehouse Shutters Control"
    	},

## How it was found

Seen in the round logs: 30 failed walks to the Warehouse across `round-13.32.16`, `14.28.06`, `15.09.26`, `15.52.18`, `17.06.14`, `17.48.05` (2026/11/18) and `19.33.50`, `20.43.32` (2026/11/19), every one from the technicians' post and every one heading for x 70 to 72. The room's tiles were read from the map file with a throwaway script. The spawner's odds were read from the code.

Not seen: which tiles held crates in any one round (the log does not say), so "the pocket is shut" is worked out from the odds and from the one "next to it" line above, not watched. The tunnel between the bay's maintenance door (65,144) and (65,140) was read from the map and is two tiles wide with one side clear, so it is not the cause. No round was played.

## How to fix it

Two parts. The first is small and makes the technician reach the room. The second is the way a player does it and is the owner's to approve.

1. **Go where there is a way to.** In `tool_go_to` (`crew_npc_tools.dm`), for a room the body has never stood in, do not trust one random spot. When the walk to the first spot ends with "no route could be found" (`last_route_steps == 0` in `walk_finished`), try once more with the tile just inside a door of the room that the body's own ID opens: `crew_npc_doors_of(room, z)` gives `door -> list(inside, outside)`, and `door.allowed(body)` says whether it is the body's to open. Being in the room is already what counts as arrival (`arrived_in == goal`), so standing at (66,140) is "You arrive in Warehouse". This is general: any room whose far side is cut off by furniture.
   KNA-13 puts the same step in `walk_finished`, widening its meeting-room retry to any `go_to` that failed with no route: for each door of the goal room that `door.allowed(body)`, take the tile just inside it (`crew_npc_doors_of(room, z)[door][1]`), check `get_path_to` finds a way there, note it as `visited_places[goal]` and start the walk again, once.
   Also, in `log_no_route`, after each door line add "inside tile reachable" or "inside tile not reachable", from the same `get_path_to`, so the next fault of this kind shows its cause in the log.
2. Keep `visited_places[goal]` as the spot it actually reached, which `look_around` already does, so the next visit goes straight there.
3. **Press the button (new tool, owner to approve).** A body with no way into a room, or no way past the pocket, that can see or remembers a `/obj/machinery/button/door` whose `id` matches a shutter (`/obj/machinery/door/poddoor`) on the edge of that room, walks to it and clicks it with an empty hand through `click_as_body` (`crew_npc_machines.dm`), then walks in. The button's own access check stands, so nothing is opened that a player in the same shoes could not open. It should shut the shutters behind it when it leaves, the same way. This is the no-cheats way into the Warehouse and into any other room worked by a button.
4. Do not teach the planner to walk through crates, and do not move the crates by code. Pushing a crate aside is what `clear_the_way` in `crew_npc_grip.dm` does for a crate jammed in a doorway, and it could be widened to a crate that blocks the only way on (KNA-13), but the button is the cleaner answer here. Use the button from the walk when step 1 finds no door either, and when a haul into the room fails. If the shutters are left open, the Warehouse is no longer a locked room, and `closed_rooms` and `reached_through` change for it.

Question for the owner: should cargo staff open the Warehouse shutters with the wall button, and should they shut them again after? Open shutters let anyone into the Warehouse from the bay.

## How to test the fix

- Server compile to a side copy.
- The simulator has no furniture and no route planner, so it cannot show this. Add a case to its `go_to` that fails the first spot of a room once, and check the technician ends in the room and not back at its post.
- Next round, `game.log`: there should be no "walk failed (go_to, to Warehouse)" from a technician, and after part 3, no "found no route to Warehouse" at all. Grep for the technician saying or standing in "Warehouse (6" to see it got in. With the `log_no_route` line in, a failure names whether the inside tile was reachable. The first look-in ("going to look in on the Warehouse") should end "You arrive in Warehouse" every round.
