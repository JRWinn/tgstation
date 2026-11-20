---
id: CHEAT-03
title: An officer picks a free brig cell from wherever it makes the arrest, by reading every cell's timer and who is inside, unseen
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1075, code/modules/llm_crew/crew_npc_security.dm:1117, code/modules/llm_crew/crew_npc_security.dm:1583
fix: In tool_jail pick only among cells in view, else walk to the first cell, and in put_in_cell pick again among the cells in view on arrival before answering every cell is in use
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

## Check

Checked by Opus 5.5, from the code; nothing run.

- The quotes are what `crew_npc_security.dm` says today: `free_cell` at 1075 reads `timer.timing`, `machine_stat` and `cell.occupants()` for every cell on the level; `tool_jail` calls it at 1117 before any step and answers `no_cell` "Every cell is in use." at once; `security_state` (1583 on) fills `running`, `left` and `occupants` only for a cell in view and says so in its comment.
- Nothing stops it being asked from afar. The window's `serveStep` (`jobs/arrests.ts`, the `holds(brain, warrant)` branch near 705) sends `jail` the moment it has the prisoner in cuffs and by the arm, wherever that is; there is no walk to the brig first. On `no_cell` the window sets `noCellAt` (`arrests.ts:1191`) and waits where it stands ("every cell in the brig is in use. You are waiting"), which is the Bar in the case above. The plan (`LLM_CREW_PLAN_SECURITY.md` 3.8) has it walk to the brig and wait there.
- Nothing in `LLM_CREW_CHANGELOG.md` chose this; the C2 entry (line 316) only adds the refused-cell skip to `free_cell`.
- Severity kept at medium, as for the other things-known-unseen findings (CHEAT-02, -05, -06): the senses rule is broken, but nothing is done to the world that a player could not do, and in most rounds the cell it walks to is the one it would have picked on looking.
- Effort raised to medium: the server's `tool_jail` and `put_in_cell` change, and the simulator's stand-in for `jail` (`tools/llm_crew/sim.ts:995`) must stop answering `no_cell` from afar too.
- A simpler fix than keeping `cells_seen`, and the one I would build: in `tool_jail`, call `free_cell` only for cells in view (the same test `security_state` uses: the timer or a cell floor tile in `view`). If one is free, go to it as now. If none is in view, choose the first cell by name and walk to its timer without answering; `put_in_cell` already checks the cell on arrival (`timer.timing || length(cell.occupants() - prisoner - body)`), and there, in the brig with the cells in view, it should call `free_cell` once more (in view only) and go to that timer instead of answering "is in use". Only when none in view is free does it answer `no_cell`, and the window's `noCellAt` wait then happens in the brig, as the plan says. `cells_seen` adds little: the brig is one room and the walk there is needed anyway.
- How to test, added: a case in the simulator's jail scenarios with the officer far from the brig and Cell 1 occupied; `game.log` should show it walk to the brig, then to Cell 2's timer, with no "Every cell is in use" before it has reached the brig.
