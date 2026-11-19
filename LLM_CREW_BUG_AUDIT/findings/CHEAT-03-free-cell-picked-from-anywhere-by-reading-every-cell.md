---
id: CHEAT-03
title: An officer picks a free brig cell from wherever it makes the arrest, by reading every cell's timer and who is inside, unseen
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1075, code/modules/llm_crew/crew_npc_security.dm:1117, code/modules/llm_crew/crew_npc_security.dm:1583
fix: Choose the cell from what the body last saw of the cells, or Cell 1 if it has seen none, and pick again at the brig once the cells are in view
---

## What is wrong

`security_state` is careful: it tells the brain whether a cell's timer is running, how long is left and who is inside only for a cell in the body's view, and null for the rest ("they know only by looking"). But the server's own choice of cell does not keep to that. `tool_jail` calls `free_cell` the moment the brain asks, wherever the officer is standing with its prisoner, and `free_cell` reads every cell on the level: `timer.timing`, `timer.machine_stat`, and `cell.occupants()`, which walks the cell's floor tiles for anyone alive. It then walks straight to the one cell that is free.

The security plan (`LLM_CREW_PLAN_SECURITY.md`, 3.8) has the officer take the prisoner "to the brig" and then pick "the first of the three cells with nobody in it and its timer not running", which a player does on arrival by looking at the cell windows and timers.

Concrete case: Cell 1 and Cell 2 hold prisoners a player officer put in. An NPC officer cuffs Pun Pun in the Bar, far from the brig, and is told to jail it. `free_cell` returns Cell 3 at once, and the officer walks to Cell 3's timer without ever having looked at the other two. If every cell is full, `tool_jail` answers "Every cell is in use." from the Bar, and the officer never takes a step, where a player would have walked over and found out.

The same reading is in the "Every cell is in use" answer, which the brain then acts on (`noCellAt` in the window waits and asks again).

## Where

`code/modules/llm_crew/crew_npc_security.dm:1075`, `free_cell`:

    	for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
    		var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
    		if(isnull(timer) || timer.timing || timer.z != body.z || (timer.machine_stat & (NOPOWER|BROKEN)))
    			continue
    		if(length(cell.occupants() - apart_from - body))
    			continue

`:1117`, in `tool_jail`, before any walk:

    	jail_cell = free_cell(prisoner)
    	var/obj/machinery/status_display/door_timer/timer = jail_cell?.timer_ref?.resolve()
    	if(isnull(timer))
    		action_result(CREW_TOOL_JAIL, FALSE, "Every cell is in use.", list("reason" = "no_cell", "prisoner" = prisoner.name))

`:1606`, in `security_state`, the rule the brain is held to:

    		var/seen = can_look && (timer in in_sight)
    ...
    			"running" = seen ? !!timer.timing : null,

## How it was found

Read from the code and checked against `LLM_CREW_PLAN_SECURITY.md` 3.8. Not seen in a round log.

## How to fix it

1. Keep on the controller what the body last saw of each cell: `cells_seen[cell.name] = list(world.time, running, occupied)`, filled in by `security_state` for each cell it marks `seen`.
2. In `tool_jail`, when the body is not in the brig: choose the first cell that, by `cells_seen`, was free when last seen, or the first cell by name if it has seen none, and walk to the brig (its timer) as now. Do not answer "Every cell is in use" from afar: at most "The cells were all in use when you last looked" if every entry in `cells_seen` was full within the last minute or two, and walk there anyway.
3. In `put_in_cell`, which already re-checks the chosen cell on arrival (`timer.timing || length(cell.occupants() ...)`), with the body now standing in the brig: if that cell is in use, call `free_cell` there, limited to cells in the body's view, and go to that timer. If none is free in view, answer "Every cell is in use" now, from where it can see that.
4. Leave the power test (`NOPOWER`) to the arrival step too: a dead timer is seen as a blank display. ARR-04 and SEC-08 are about what to do then.

No owner question: this is the plan's own order of steps.

## How to test the fix

- Server compile.
- Simulator: the security scenarios play `tool_jail` from the server side, so the sim's stand-in for it must also stop answering "in use" from afar. Run the jail scenarios in `tools/llm_crew/security.ts`.
- A round: fill Cell 1 by hand, have an officer arrest someone far from the brig, and check in `game.log` that it walks to the brig first and then to a free cell's timer.
