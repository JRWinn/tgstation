---
id: MAP-06
title: The technicians' post and the room the Quartermaster looks for them in are each the supply console nearest that body at spawn, so on a map with consoles in two cargo rooms they can differ
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:176, code/modules/llm_crew/crew_npc_cargo.dm:51, code/modules/llm_crew/crew_npc_quartermaster.dm:44
fix: Choose the cargo post once for the station (the cargo-area supply console in the room with the most cargo floor, or the one nearest the counter room), keep it in a global, and give the same room to every technician and to the Quartermaster
---

## What is wrong

A technician's post, and the room the Quartermaster is told its technicians work from, are both "the room of the supply console nearest me", worked out by each body from where it stands when it is made:

- `learn_starting_places` (technician): `supply_console()`, then `post_area = get_area(console)`.
- `learn_quartermaster_places`: `supply_console()`, then `staff_post_place = learn_place(staff_area.type)`.

`supply_console` takes the nearest non-request console on the body's level, with 1000 added for one outside `/area/station/cargo`. On MetaStation there is one cargo-area console (in the Cargo Bay) and one in the Quartermaster's office, so every body gets the Cargo Bay. Other maps have supply consoles in two or three cargo rooms. Read from each map's `.dmm`:

- KiloStation: Cargo Office (146,122), Delivery Office (`cargo/sorting`, 145,111), Cargo Bay (160,111), and the QM's and HoP's offices.
- IceBox: two in the Cargo Office, one in the Cargo Bay.
- Tramstation and NebulaStation: two in the Cargo Office, one in the Cargo Bay.
- DeltaStation: two in the Cargo Bay, one in the Cargo Office.

So the room depends on the spot each body is made on. On KiloStation the Quartermaster's office runs x150-155, y119-123: the Cargo Office console is about 7 tiles from it and the Cargo Bay's about 10, so the Quartermaster is told "Your technicians work from the Cargo Office". The technicians are made on the first free tile of the Cargo Bay (x150-163, y105-118). From its west end the Delivery Office console is nearer than the bay's own, so the technicians' post may be the Delivery Office or the Cargo Bay, and is not the Cargo Office.

What follows: the Quartermaster holds its supply meeting in `brain.staffPost` (`quartermaster.ts:779`), goes there to give an order face to face (`quartermaster.ts:989`, `1096`), and goes there when a technician knocks (`1172`). Its technicians are in another room, so it does not see them there, and the meeting is held to an empty room. A technician spawned later with the admin verb, from wherever the admin stands, can get a third room.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:176`, `supply_console`:

    for(var/obj/machinery/computer/cargo/console as anything in SSmachines.get_machines_by_type(/obj/machinery/computer/cargo))
    	if(console.requestonly || console.is_express || console.z != body.z)
    		continue
    	var/score = get_dist(body, console)
    	if(!istype(get_area(console), /area/station/cargo))
    		score += 1000

`code/modules/llm_crew/crew_npc_cargo.dm:51` (technician):

    var/obj/machinery/computer/cargo/console = supply_console()
    var/area/post_area = console ? get_area(console) : null

`code/modules/llm_crew/crew_npc_quartermaster.dm:44` (Quartermaster):

    var/obj/machinery/computer/cargo/console = supply_console()
    var/area/staff_area = console ? get_area(console) : null

## How it was found

Read from the code. The consoles and room bounds were read from each map's `.dmm` with a throwaway script. Which technician tile is "first" depends on the order of the area's turf list, which I did not pin down, so which room KiloStation's technicians get is `likely`, not proven. That the Quartermaster's and the technicians' choices are made apart, from different spots, is sure. Not seen in a round.

## How to fix it

1. Add a global proc `crew_npc_cargo_post_console()` that picks one console for the station, once: among non-request, non-express consoles in `/area/station/cargo` on a station level, the one whose room has the most floor (the bay, on every map listed), or, once MAP-03's counter room exists, the one nearest the counter. Cache it in a global; pick again if it is deleted.
2. Use it in `learn_starting_places` and `learn_quartermaster_places` instead of `supply_console()`.
3. Keep `supply_console()` for placing an order (`tool_order`): any working console in reach will do, and the nearest is right there.
4. Question for the owner: should the post instead be the room with the counter window to the lobby, whatever console stands there? On MetaStation both answers are the Cargo Bay.

## How to test the fix

- Server compile.
- On KiloStation, read the knowledge sense of the Quartermaster and of each technician in `crew_brain.log`: "Your technicians work from the X" and "Your post is the X" should name the same room.
- Spawn a technician with the admin verb from the far side of the station: it gets the same post.
