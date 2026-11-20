---
id: KNA-20
title: Any airlock beside any square of a room is taken for a door of it, so the Kitchen's door is a third door of the Bar, with both its sides on fridges
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:246, code/modules/llm_crew/crew_npc_forcing.dm:204, code/modules/llm_crew/crew_npc_doors.dm:268
fix: In crew_npc_doors_of keep a door only when its inside and outside tiles are on its line of passage and neither holds a dense machine or table
---

## What is wrong

Listed in the change log entry of 2026-11-18, 20:19 to 20:40, Known and not fixed: "`crew_npc_doors_of` takes a door for a door of a room if it touches any square of that room's floor. The square of bar floor outside the bar's counter makes the kitchen's door a door of the bar." It is still so. The entry gets the square wrong, and the fix it built on that belief does not do what its comment says.

Read from the map (`_maps/map_files/MetaStation/MetaStation.dmm`):

- The airlock "Kitchen" at (136,128) is in the Kitchen's area. It is the door between the Bar Lounge at (136,129) and the Kitchen at (136,127): north and south.
- West of it, (135,128) is Bar floor with `/obj/machinery/smartfridge/drinks` on it. East of it, (137,128) is Kitchen floor with `/obj/machinery/smartfridge/food` and the counter shutters on it.
- So the square of bar floor beside the door is not "standing open to the lounge": it holds the drinks fridge, which is dense.

`crew_npc_doors_of(Bar)` walks the bar's squares. At (135,128), looking east, it finds the Kitchen airlock on the next square, and lists it with `inside` = (135,128) and `outside` = (137,128). Both are fridges. Neither can be stood on, and the door does not lead from one to the other. The bar has two real doors, (135,127) "Bar" from the kitchen and (130,123) from the back room. The change log's "The bar has three doors" counts this one.

What comes of it, by the code:

1. **The engineer's "leads only to floor it can walk to already" test never fires for this door.** It asks for a route to `far_side` = (135,128). A dense fridge cannot be walked onto, so no route is found, and the door goes on to the next test: a route to `spot` = (137,128), the other fridge. That fails too, so it is put down as "Kitchen at (136,128)" in "It found no way to", it uses up one of the three doors tried (`CREW_NPC_DOORS_TRIED`), and `through` may be set to "Kitchen" from it. The comment at `crew_npc_forcing.dm:204` says the test was made for this door. It cannot have been the reason anything changed in a round.
2. **Two doors of the Bar are both called "Kitchen".** `crew_npc_door_label` gives the "Bar" door at (135,127) the name of the room it opens from, "Kitchen". The stray door is "Kitchen" by its own name. A body asked to the "Kitchen door of the Bar" can be given the stray one (DOOR-08 covers what a shared label does).
3. In `tool_go_to_door` the stray door is one more route test to a tile nobody can stand on, done while the body waits. With `CREW_NPC_DOORS_TRIED` at 3 it can push a real door of a room with more doors out of the three that are tried.

On MetaStation this is the only door listed for a room it does not lead into: a script over the map that checks, for every airlock and every room that would list it, whether the room's square and the far square are on the door's line of passage and free of fridges, tables, vending machines and consoles, found the Kitchen door and nothing else that matters (three more hits were doors with a directional window on one side, which the test above also lets through). Other maps were not checked. Any room whose floor runs up beside a door in a counter line will have the same fault.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:246`, in `crew_npc_doors_of`:

    	for(var/turf/room_turf as anything in room.get_turfs_by_zlevel(z_level))
    		// A door may stand on the last tile of the room, or on the first tile outside it.
    		var/obj/machinery/door/airlock/own_door = locate() in room_turf
    		for(var/direction in GLOB.cardinals)
    			var/turf/next = get_step(room_turf, direction)
    			if(isnull(next) || get_area(next) == room)
    				continue
    			var/obj/machinery/door/airlock/door = own_door || (locate(/obj/machinery/door/airlock) in next)
    			...
    			var/turf/inside = own_door ? get_step(room_turf, REVERSE_DIR(direction)) : room_turf
    			var/turf/outside = own_door ? next : get_step(next, direction)
    			if(!isopenturf(inside) || !isopenturf(outside) || !istype(get_area(outside), /area/station))
    				continue
    			doors[door] = list(inside, outside)

Only `isopenturf` is asked of the two sides. A floor with a fridge on it is an open turf.

`code/modules/llm_crew/crew_npc_forcing.dm:204`, in `tool_force_door`:

    		// A door that leads only to floor it can walk to already is no door to force. The bar has one:
    		// its kitchen door opens onto a square of the bar's own floor that stands open to the lounge.
    		// Forced, it would have let nobody into the bar. A door that was named is forced all the same.
    		var/turf/far_side = inside ? nearest_sides[2] : nearest_sides[1]

## How it was found

Read from the code, and from the map with a Python script (in the system temp folder, not the repo) that prints every object on (134..137, 126..129) and then checks every airlock on the map as described above. Not seen in a round: the 20:00 round's engineer was sent to the Bar Backroom, not the Bar, so the forcing log for the Bar has never been written.

## How to fix it

1. In `crew_npc_doors_of`, after `inside` and `outside` are worked out, drop the door if either tile holds something dense and anchored that is part of the room's fittings: a machine (`/obj/machinery`, not a door) or a table. Do not use the base game's `is_blocked_turf` as it stands: it also counts crates, and a crate parked in front of a door for a minute must not take the door off the room's list (the list is made fresh on every call). A door nobody can stand at either side of is no door of the room for anyone.
2. Also drop it when the door's line of passage is not along `direction`: the door's two side squares, `get_step(door_turf, turn(direction, 90))` and `turn(direction, -90)`, should be wall or window. Where both are open floor, the door runs the other way and `room_turf` is only beside it. This is what would catch a door in a counter line with no fridge beside it.
3. Correct the comment at `crew_npc_forcing.dm:204` to say what the test is for, or take the test out if, after step 1, no case is left that needs it. Keep it if the owner wants a door whose far side is open floor reached another way left alone (that case is real elsewhere: a door from a room's own open alcove).
4. `crew_brain_rooms.dm:92` uses the same list for the window's "Locked rooms" section, so the Bar will lose one door there. Nothing else should change.

## How to test the fix

Server compile to a side copy. A throwaway check in game (an admin proc call on a crew controller, or a log line at round start) that prints `crew_npc_doors_of` for the Bar, the Kitchen and the Cargo Bay on MetaStation: the Bar should have two doors, the Kitchen should still have its own door at (136,128) with sides (136,127) and (136,129). In the next round with an engineer sent to the Bar, `game.log` "It found no way to" should not name "Kitchen at (136,128)".
