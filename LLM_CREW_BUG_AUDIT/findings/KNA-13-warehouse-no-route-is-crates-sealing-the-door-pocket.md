---
id: KNA-13
title: The Warehouse has no route in most rounds because random crates wall its one airlock off from the rest of the room
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
area: doors
files: code/modules/llm_crew/crew_npc_places.dm:32, code/modules/llm_crew/crew_npc_tools.dm:370, code/modules/llm_crew/crew_npc_tools.dm:534
fix: When no route reaches the spot picked in a room, try the tile inside each door the body can open, and let cargo staff press the button that opens a room's shutters
---

## What is wrong

Four change log entries carry this as open with the cause unknown. The newest, 2026-11-18, 15:00: "(10) The Warehouse. Its only airlock opens from the tunnel and the bay side is shutters, but why no route is found by way of the tunnel is still not known. It is now left fifteen minutes after two failures, which is all." Also 16:15 ("the Warehouse had no route twice more in this round") and 16:50 ("The Warehouse had no route once (known, item 10)").

The cause, read from the map (`_maps/map_files/MetaStation/MetaStation.dmm`, with a script that prints the objects on each tile):

- The Warehouse's floor is (66..72, 138..142). Its one airlock, "Warehouse Maintenance", is at (65,140) on the west wall, from the tunnel. The bay side is "Warehouse Shutters" at (69..71, 143), which start the round shut (`/obj/machinery/door/poddoor/shutters`, not `preopen`). They open by the button "Warehouse Shutters Control" at (72,144) in the Cargo Bay, or the one inside at (72,142).
- Just inside the airlock are four free tiles: (66,139), (66,140), (66,141), (67,140). Round them: a suit storage unit at (66,142), a table at (67,142), a rack at (67,138), and three crate spawners at (67,139), (67,141) and (68,140) (`/obj/effect/spawner/random/structure/crate`).
- That spawner puts down something solid about 85 times in 100 (`code/game/objects/effects/spawners/random/structure.dm:14`: crate loot 744, trash cart 75, mini fridge 35 and so on, out of about 1,030). When all three are solid, about 6 rounds in 10, the four tiles are a sealed pocket. A step on the diagonal from (67,140) to (68,139) or (68,141) needs one of the squares beside it open, and neither is.
- The spot the body walks to is picked from the whole room, nearest to where the body stands (`place_spot`, `safe_spot_in`). From the bay that is always in the east of the room, by the shutters. The failed walks in the logs were heading for (71,141), (71,142), (70,140) and (72,140): all east of the crates.

So both pathfinders are right: there is no way from the airlock to that spot. `log_no_route` says "Warehouse Maintenance at (65,140): opens for it" and "The game's other pathfinder finds none either", which is what the logs of several rounds show. In the rounds where one of the three spawners leaves a gap the walk works, which is why it comes and goes: in `data/logs/2026/11/19/round-20.00.21` a technician was in the Warehouse 11 seconds after setting out (02:15:59 to 02:16:10).

A player has two ways in that the crew code lacks: press the button by the shutters, or push a crate aside.

**Not checked in a running game:** that those three spawners did spawn solid things in the rounds that failed. It is read from the map and the odds, and it fits every line. That is why this is "likely".

## Where

`code/modules/llm_crew/crew_npc_places.dm:32`, `place_spot`: for a room it has not stood in, any safe tile of the room, nearest the body.

    var/area/station/room = crew_npc_station_places()[place]
    if(isnull(room))
    	return null
    return safe_spot_in(room, get_turf(pawn))

`code/modules/llm_crew/crew_npc_tools.dm:370`, `safe_spot_in`: no test that the tile can be reached from any door.

`crew_npc_tools.dm:484` to `:495`, `walk_finished`: a second spot is tried only for a head's meeting room.

    if(tool == CREW_TOOL_GO_TO && goal && goal == meeting_place && reason == "there is no way through")
    	var/area/station/meeting_room = crew_npc_station_places()[goal]
    	var/turf/other_spot = meeting_room ? safe_spot_in(meeting_room, get_turf(pawn)) : null

`crew_npc_tools.dm:534`, `log_no_route`: it lists the doors of the goal room and the first thing on the straight line. It does not say whether the tile inside each door can be reached, which is the line that would have shown this on the first day.

Nothing in `code/modules/llm_crew/` clicks a `/obj/machinery/button/door`. `crew_npc_grip.dm:407` notes that "Shutters and blast doors open for a button, not a card".

## How it was found

The failing lines were read in `game.log` of `data/logs/2026/11/18/round-14.28.06` through `data/logs/2026/11/19/round-20.43.32` (`grep "found no route to Warehouse"`). The map was read tile by tile with a throwaway script. The spawner's table was read in the code.

## How to fix it

1. **Try the door's own tile.** In `walk_finished`, for any `go_to` that failed with no route (not only a meeting room): for each door of the goal room that `door.allowed(body)`, take the tile just inside it (`crew_npc_doors_of(room, z)[door][1]`) and, if `get_path_to` finds a way there, note it as the spot the body knows the room by (`visited_places[goal] = list(x, y, z)`) and start the walk again, once. It then stands inside the room by the door it can use. This alone ends "no route to the Warehouse".
2. **Say it in the log.** In `log_no_route`, after each door line add "inside tile reachable" or "inside tile not reachable", from the same `get_path_to`.
3. **The button, for the rest of the room.** A technician standing in the pocket sees only a corner of the Warehouse, and a crate cannot be hauled through that airlock from the bay side at all. So add a small tool, `press_button`, for a body whose room has shutters: find a `/obj/machinery/button/door` whose `id` is the `id` of a `/obj/machinery/door/poddoor` on the edge of the room and that stands in a room the body can walk to; walk to it; `click_as_body(button)`; check the shutters' `density`. Use it from the walk when step 1 finds no door either, and when a haul into the room fails. General: any room with shutters and a button, not the Warehouse by name. **Question for the owner:** should cargo leave the Warehouse shutters open after going in, or shut them again on the way out? Open, the Warehouse is no longer a locked room and `closed_rooms` and `reached_through` change for it.
4. Pushing a crate aside is what `clear_the_way` in `crew_npc_grip.dm` does for a crate jammed in a doorway. It could be widened to a crate that blocks the only way on, but the button is the cleaner answer here.

Keeps the rules: a button pressed by a click from beside it is what a player does. Nothing is tied to MetaStation.

## How to test the fix

- Server compile to a side copy.
- The simulator does not run server code.
- In a round: spawn the test crew and grep `game.log` for "found no route to Warehouse". With step 2 in, the line names the inside tile. With step 1 in, the technician's first look-in ("going to look in on the Warehouse") should end "You arrive in Warehouse" every round. With step 3, look for the shutters standing open and the technician in the east half of the room.
