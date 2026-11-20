---
id: MAP-04
title: On Tramstation every prisoner taken on the brig's level is walked to the Cargo Cell at the cargo checkpoint, because cells are tried in order of name and not by where they are
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: c95bca71411, ac27729920e
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1075, code/modules/llm_crew/crew_npc_security.dm:190, code/modules/llm_crew/crew_npc_security.dm:211
fix: In free_cell try the free cells nearest first, brig cells before checkpoint cells, and on a map with no brig cell let the window's brig be the room with the nearest cell
---

## What is wrong

See also: CHEAT-03, which is about how `free_cell` knows which cell is free. This one is about which cell it picks.

`crew_npc_brig_cells` takes every door timer on any station level that has a flasher wired to it (same `id`, within 20 tiles, `brigdoors.dm:49`) and a small closed floor behind that flasher, and sorts them by name. `free_cell` returns the first one in that order that is free and on the body's own level. On MetaStation the only cells are "Cell 1" to "Cell 3", all in the Brig, so name order is a fine order. A map whose checkpoint cells have flashers has cells outside the brig whose names can sort first.

`cmp_crew_npc_brig_cells` is `sorttext(second.name, first.name)`, which is ascending (as `cmp_text_asc` in `code/__HELPERS/cmp.dm`), so "Cargo Cell" comes before "Cell 1".

Which timers are counted, read from each map's `.dmm` (a timer with no flasher of its `id` gives `crew_npc_cell_turfs` an empty list and is left out):

- **Tramstation:** counted are "Cargo Cell" (checkpoint/supply, upper level), "Medical Cell" and "Science Cell" (checkpoints, upper level), "Engineering Cell" (checkpoint/engineering, lower level). "Isolation Cell A" to "D" (execution/transfer) have no flasher and are not counted. No timer is in `/area/station/security/brig`, which is on the upper level.
- **DeltaStation:** counted are "Cell 1", "Cell 2" (Brig) and "Isolation Cell" (its flasher is in prison/safe). The "Cargo Cell", "Engineering Cell" and "Med-Sci Cell" checkpoint timers have no flasher with their `id` (`cargocell`, `engcell`, `medsci-cell`) and are not counted. Order: Cell 1, Cell 2, Isolation Cell, which is fine.
- **IceBox:** "Cell 1" to "Cell 3". "Isolation Cell" has no flasher. Fine.
- **NebulaStation:** only "Cell 2" and "Cell 3" have flashers; "Cell 1" and the four checkpoint timers do not. Fine for order.

So the fault is Tramstation's. (The cells left out for want of a flasher are a different gap, not this finding.)

Concrete case: Tramstation. The officer cuffs someone on the upper level, where the Brig is, and is told to jail them. `tool_jail` calls `free_cell`, which passes over "Engineering Cell" (other level, `timer.z != body.z`) and returns "Cargo Cell" while it is empty. `start_errand(timer, ...)` walks the prisoner by the arm to the Cargo security checkpoint, on the far side of the station. The next goes to "Medical Cell", then "Science Cell". The Head of Security's report says a prisoner is in "Cargo Cell". If every cell refuses, the window's "you are taking them back to the brig to wait there" step (`arrests.ts`, `brigPlace`) sends it to a Brig with no cell in it. Whether the walk to the cargo checkpoint can be made at all on Tram (it may need the tram) was not checked; HOLE-05 covers more than one floor.

## Where

`code/modules/llm_crew/crew_npc_security.dm:190`, `crew_npc_brig_cells`:

    for(var/obj/machinery/status_display/door_timer/timer as anything in SSmachines.get_machines_by_type_and_subtypes(/obj/machinery/status_display/door_timer))
    	if(isnull(timer.id) || !is_station_level(timer.z))
    		continue
    	var/list/inside = crew_npc_cell_turfs(timer)
    	if(!length(inside))
    		continue
    	...
    sortTim(found, GLOBAL_PROC_REF(cmp_crew_npc_brig_cells))

`code/modules/llm_crew/crew_npc_security.dm:211`:

    /// Puts brig cells in order of name: Cell 1, Cell 2, Cell 3.
    /proc/cmp_crew_npc_brig_cells(datum/crew_npc_brig_cell/first, datum/crew_npc_brig_cell/second)
    	return sorttext(second.name, first.name)

`code/modules/llm_crew/crew_npc_security.dm:1075`, `free_cell`: the first free cell of that list on the body's level wins, with no look at distance or room.

## How it was found

Read from the code. The timer names and areas were read from each map's `.dmm`. Not seen in a round: only MetaStation has been played.

## How to fix it

1. In `free_cell`, among the free cells on the body's level, order by: first, whether the timer's area is the brig (`istype(get_area(timer), /area/station/security/brig)` covers the brig and its `upper`, `lower` and `entrance` parts on IceBox and NebulaStation); then by `get_dist` from the body. A checkpoint cell (`/area/station/security/checkpoint`) comes after any brig cell; an isolation or transfer cell (`/area/station/security/execution`, `/area/station/security/prison`) last. On Tramstation this picks the nearest checkpoint cell; on every other map listed it changes nothing.
2. Keep `cell_refused` working as it is: a cell refused lately drops behind the others, and the one refused longest ago is the fallback.
3. Where no counted cell is in the brig at all (Tramstation), `brigPlace` in `arrests.ts` should not send it to the Brig to wait. The simplest is to have the server send, with `security.cells`, the room of each cell, and let the waiting step go to the room of the nearest cell when no cell is in the Brig.
4. Fix the comment on `cmp_crew_npc_brig_cells`, or drop the sort once `free_cell` orders the cells itself.

Question for the owner: may a crew officer use a department checkpoint's cell at all? A player officer posted to Cargo often does. If not, Tramstation has no cell the officer may use.

## How to test the fix

- Server compile.
- On Tramstation (set as the next map), jail one person on the upper level with the admin warrant flow and read `game.log` for which cell the officer walked to: it should be the nearest checkpoint cell, not "Cargo Cell" by name.
- On MetaStation and DeltaStation nothing changes: Cell 1, then 2 (then 3).

## Check

Checked by Opus 5.5. The quotes match the code today. The fault stands, but only on Tramstation: the write-up said DeltaStation's checkpoint cells and the isolation cells were counted, and they are not. `crew_npc_brig_cells` skips a timer whose `crew_npc_cell_turfs` is empty, and that is empty when the timer has no flasher (the loop over `timer.flashers` at crew_npc_security.dm:222 finds none); `timer.flashers` is filled only from flashers with the same `id` within 20 tiles (code/game/machinery/doors/brigdoors.dm:49). A throwaway bun script in the scratchpad read every door timer and `/obj/machinery/flasher` of each map with its `id`, area and level: on DeltaStation no flasher has the id `cargocell`, `engcell` or `medsci-cell`; on Tramstation flashers exist for `crgcell`, `engcell`, `medcell` and `scicell` and none for `Isolation_A` to `D`; Tram's `/area/station/security/brig` is all on the second level, as are the Cargo, Medical and Science checkpoints, and the Engineering checkpoint is on the first. Nothing in LLM_CREW_CHANGELOG.md or the plans speaks of other maps' cells (the plan names MetaStation's three cells only). Rewrote the body and title to Tramstation, set the main file to `free_cell`, and cut the fix to the ordering, since a brig-first rule alone does nothing on Tram. Severity medium (one map, but every jailing there goes wrong while the work still gets done) and effort small stand for the server part; step 3 touches the window too.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: c95bca71411.

- MAP-04: part done. free_cell now picks a free cell in /area/station/security/brig first, then any other room, with prison and execution rooms last, and the nearest within each rank. It no longer goes by name, so on Tramstation the prisoner is not walked to 'Cargo Cell' (crew_npc_security.dm, free_cell). A cell refused lately still drops behind. Left: Step 3, window plus server: when no counted cell is in the Brig (Tram), brigPlace in jobs/arrests.ts should send the officer to wait by the nearest cell's room. That needs the server to send each cell's room with security.cells, a 'room' key per cell, built where security.cells is built in crew_npc_security.dm or its senses.

Round three (branch crew-bug-fixes-medium): ac27729920e. This finishes the parts left above, apart from any step that waits on the owner.
