---
id: MAP-04
title: On DeltaStation and Tramstation every prisoner is walked to the Cargo Cell at the cargo checkpoint, because cells are tried in order of name and not by where they are
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:190, code/modules/llm_crew/crew_npc_security.dm:211, code/modules/llm_crew/crew_npc_security.dm:1075
fix: Count as the brig's cells only the timers inside the brig rooms (the area the officer was taught as the brig and its subtypes), and among them try the nearest first, keeping checkpoint and isolation cells for when those are full
---

## What is wrong

See also: CHEAT-03, which is about how `free_cell` knows which cell is free. This one is about which cell it picks.

`crew_npc_brig_cells` takes every door timer on any station level that has a flasher and a small closed floor behind it, and sorts them by name. `free_cell` returns the first one in that order that is free. On MetaStation the only cells are "Cell 1" to "Cell 3", all in the Brig, so name order is a fine order. Other maps have cells outside the brig, in the department security checkpoints, and their names sort first.

The door timer names, read from each map's `.dmm`:

- DeltaStation: "Cargo Cell", "Cell 1", "Cell 2", "Engineering Cell", "Isolation Cell", "Med-Sci Cell".
- Tramstation: "Cargo Cell", "Engineering Cell", "Isolation Cell A" to "D", "Medical Cell", "Science Cell".
- IceBox: "Cell 1" to "Cell 3", "Isolation Cell".
- NebulaStation: "Cell 1" to "Cell 3", and four checkpoint timers.

`cmp_crew_npc_brig_cells` is `sorttext(second.name, first.name)`, which is ascending, so "Cargo Cell" comes before "Cell 1".

Concrete case: DeltaStation. The officer cuffs someone outside the Brig and is told to jail them. `tool_jail` calls `free_cell`, which returns "Cargo Cell" while it is empty, and `start_errand(timer, ...)` walks the prisoner by the arm to the Cargo security checkpoint, across the station, past the Brig. The next prisoner goes to "Cell 1" in the Brig only because the Cargo Cell is now in use. The Head of Security's report and the officer's own state then say a prisoner is in "Cargo Cell", which nobody on security is near, and the window's "you are taking them back to the brig to wait there" step (`arrests.ts`, `brigPlace`) sends it to the Brig while the cell it was refused at is elsewhere.

On Tramstation it is worse. No timer at all is in `/area/station/security/brig`: the four "Isolation Cell" timers are in `/area/station/security/execution/transfer` on the lower level, and the rest are in the department checkpoints. So the room the officer is taught as "the cells are in the Brig" has no cell, and the order it tries is Cargo, Engineering, then the isolation cells. On IceBox and DeltaStation the "Isolation Cell" is in the transfer room too, not the Brig; it sorts after "Cell N" and is used once those are full.

Where each map's door timers stand (read from the `.dmm`): MetaStation, KiloStation, CatwalkStation, all in the Brig; IceBox, three in the Brig and one in the transfer room; NebulaStation, three in the Brig and four in checkpoints; DeltaStation, two in the Brig, three in checkpoints, one in the transfer room; Tramstation, none in the Brig.

## Where

`code/modules/llm_crew/crew_npc_security.dm:190`, `crew_npc_brig_cells`:

    for(var/obj/machinery/status_display/door_timer/timer as anything in SSmachines.get_machines_by_type_and_subtypes(/obj/machinery/status_display/door_timer))
    	if(isnull(timer.id) || !is_station_level(timer.z))
    		continue
    	...
    sortTim(found, GLOBAL_PROC_REF(cmp_crew_npc_brig_cells))

`code/modules/llm_crew/crew_npc_security.dm:211`:

    /// Puts brig cells in order of name: Cell 1, Cell 2, Cell 3.
    /proc/cmp_crew_npc_brig_cells(datum/crew_npc_brig_cell/first, datum/crew_npc_brig_cell/second)
    	return sorttext(second.name, first.name)

`code/modules/llm_crew/crew_npc_security.dm:1075`, `free_cell`: the first free cell of that list wins, with no look at distance or room.

## How it was found

Read from the code. The timer names were read from each map with `grep -A3 "^/obj/machinery/status_display/door_timer" <map>.dmm`. Not seen in a round: only MetaStation has been played.

## How to fix it

1. In `crew_npc_brig_cells`, record for each cell the area of its timer (`get_area(timer)`).
2. In `free_cell`, sort the free cells by: first, whether the timer's area is the brig the body knows (`istype(get_area(timer), /area/station/security/brig)` covers the brig and its `upper`, `lower` and `entrance` parts on IceBox and NebulaStation); then by `get_dist` from the body. A checkpoint cell (`/area/station/security/checkpoint`) is taken only if no brig cell is free. An isolation or transfer cell (`/area/station/security/execution`, `/area/station/security/prison`) is taken last.
3. Where no timer is in the brig at all (Tramstation), the "brig" the officer is taught in `learn_security_places` should be the room that holds the most cell timers, not `/area/station/security/brig` by type, so the window's "take them back to the brig to wait" goes where the cells are.
4. Keep `cell_refused` working as it is: a refused cell drops to the back of its group, not of the whole list.
5. Fix the comment on `cmp_crew_npc_brig_cells`, or drop the sort once the new order is in.

Question for the owner: may a crew officer use a department checkpoint's cell at all? A player officer posted to Cargo often does. If not, leave them out entirely.

## How to test the fix

- Server compile.
- On DeltaStation (set as the next map), jail one person with the admin warrant flow and read `game.log` for which cell the officer walked to: it should be "Cell 1".
- On MetaStation nothing changes: Cell 1, then 2, then 3.
