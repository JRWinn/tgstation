---
id: TRB-08
title: A cell whose glass door has been smashed is still picked first, the prisoner is shut in a cell that cannot shut, and is reported jailed
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1075, code/modules/llm_crew/crew_npc_security.dm:174, code/modules/llm_crew/crew_npc_security.dm:1163, code/modules/llm_crew/crew_npc_security.dm:1204
fix: In free_cell pass over a cell whose door() is null, and at the top of put_in_cell answer no_way with cell_refuses when the door is gone, before anyone walks in
---

## What is wrong

`free_cell` picks the first cell, by name, whose timer is stopped, powered, on the body's level and with nobody alive inside. It never asks whether the cell still has a door. A brig cell's door is a glass windoor; when it is broken it is deconstructed and deleted (`/obj/machinery/door/window/on_deconstruction`), and the timer's weak reference to it resolves to null. The cell's floor was worked out once, at the first ask (`crew_npc_brig_cells`), so the cell is still known and still looks empty.

`put_in_cell` copes with the missing door without a word (`var/atom/door = cell.door() || timer`), walks the prisoner in, steps out, starts the timer, waits one second, sees the prisoner still inside, and reports success. The window is told "You put Dana Reyes in Cell 1 and start its timer", the desk strikes the warrant, and the Captain is told she is in Cell 1 for 10 minutes. A player walks out a moment later. Nobody watches the cell after (TRB-06), so nobody knows.

How a cell comes to lose its door in a round: someone breaks out of it (the usual way out of a cell is to smash the glass), someone breaks in to let a friend out, or a fight in the brig. Since cells are taken in order of name and the broken one is free again once its timer has run out, the broken cell is the one picked next.

The case:

1. Pun Pun is in Cell 1. A player smashes Cell 1's windoor to let it out. The timer runs on to its end and stops.
2. The officer arrests Dana Reyes, a player, and sends `jail`. `free_cell`: Cell 1's timer is stopped, it has power, nobody alive is in it. Cell 1.
3. `put_in_cell`: `cell.door()` is null; `door = timer`. The deepest tile is worked out from the timer instead of the door. The officer walks in with her, lets go, walks out, starts the timer (it starts: `timer_start` loops over `doors`, finds none, and sets `timing` all the same), waits one second, and finds her still on the cell's floor.
4. Reported `jailed`, Cell 1, 10 minutes. Dana walks out of the doorless cell. The desk's list says she is in Cell 1.

For a crew NPC prisoner the cell holds by `custody_tick` (it stays while the timer runs) so the fault does not show; for every player prisoner it does.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1075`, `free_cell`, which looks at the timer only:

    for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
        var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
        if(isnull(timer) || timer.timing || timer.z != body.z || (timer.machine_stat & (NOPOWER|BROKEN)))
            continue
        if(length(cell.occupants() - apart_from - body))
            continue

`crew_npc_security.dm:174`, `door()`, which returns null once the door is gone:

    for(var/datum/weakref/door_ref as anything in timer.doors)
        var/obj/machinery/door/door = door_ref.resolve()
        if(!QDELETED(door))
            return door
    return null

`crew_npc_security.dm:1163`, `put_in_cell`, which carries on without one:

    var/turf/outside = get_turf(body)
    var/atom/door = cell.door() || timer

`crew_npc_security.dm:1204`, the only check that the cell held, one second after the timer starts:

    // The door takes a moment to shut. Anyone who is out of the cell when it has is not in it.
    sleep(1 SECONDS)
    ...
    if(QDELETED(prisoner) || !(get_turf(prisoner) in cell.turfs))

`code/game/machinery/doors/windowdoor.dm:335`, the base windoor broken into shards and deleted.

## How it was found

Read from the code and the base windoor and door timer (`code/game/machinery/doors/brigdoors.dm`, `timer_start`). Not seen in a round.

## How to fix it

1. In `free_cell`, `continue` past a cell whose `door()` is null, or whose door is `machine_stat & BROKEN`. A player sees the smashed door at once, so this is no more than looking at it. If the body cannot see the cell from where it stands, that is the same knowledge question as CHEAT-03; keep whatever rule that fix settles on.
2. In `put_in_cell`, if `cell.door()` is null when the body reaches the timer (it was broken while the prisoner was walked there), call `cell_refuses(cell, prisoner_name, "its door is broken")` and answer `reason = "no_way"`, so the window tries the next cell (`cellTries`).
3. After `work_timer(timer, "start")`, check that a door is now shut (`door.density`), as well as that the prisoner is inside.

## How to test the fix

- Server compile.
- In a round: smash a cell's glass door, then have a warrant served. `game.log` should show "could not put ... in Cell 1: its door is broken" or the next cell picked, and never "put ... in Cell 1" for the broken one.
- The simulator does not model doors of cells; no window change is needed.
