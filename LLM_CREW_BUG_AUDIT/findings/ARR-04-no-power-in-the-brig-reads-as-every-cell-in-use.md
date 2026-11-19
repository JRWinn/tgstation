---
id: ARR-04
title: With the brig's power out every cell reads as in use, and the officer stands where it made the arrest holding its prisoner, telling nobody
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1081, code/modules/llm_crew/crew_npc_security.dm:1119, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:671, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1190
fix: Have tool_jail say no_power apart from no_cell, walk the prisoner to the brig to wait, and tell whoever keeps the list once
---

## What is wrong

`free_cell` passes over a cell whose timer has no power. When every timer is dead it returns null, and `tool_jail` answers "Every cell is in use" with reason `no_cell`, without the body taking a step. The window notes `noCellAt` and waits 30 seconds, then asks again, for ever. Three things are wrong with that:

- The officer waits wherever it made the arrest: the bar, a hallway. The plan (`LLM_CREW_PLAN_SECURITY.md:293`) says "it waits in the brig with the prisoner". Only the other failure (`cellTries`, a cell that would not take them) walks back to the brig.
- Nobody is told. "I cannot get them into a cell" is sent only when `cellTries` reaches the number of cells, and `no_cell` never adds to `cellTries`. The Head of Security's list goes on reading "in cuffs and on the way to a cell", and the Captain waits.
- What the officer thinks, and would say if asked, is false: "every cell in the brig is in use. You are waiting for one to come empty."

The plan calls a full brig "rare enough to leave". A full brig is rare. A brig with no power is not: the owner's memory notes say test rounds lose station power about 15 minutes in, and nobody runs the engine yet.

One concrete case: power fails at minute 15 and the brig's APC runs flat a few minutes later. At minute 25 the officer cuffs Pun Pun in the Bar Lounge and sends `jail(5, 1)`. The answer is `ok: false, reason: 'no_cell'`. The plan is "waiting" for 30 seconds, then `jail(5, 2)`, the same answer, and so on. The officer stands in the Bar Lounge with the monkey by the arm for the rest of the round, or until something breaks its hold. A player in the same place has a minute of standing still in which to work the cuffs off. Nothing is reported but "I have Pun Pun in cuffs".

The same happens, more rarely, when every cell really is in use.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1081`, in `free_cell`:

    		if(isnull(timer) || timer.timing || timer.z != body.z || (timer.machine_stat & (NOPOWER|BROKEN)))
    			continue

`crew_npc_security.dm:1117`, in `tool_jail`:

    	jail_cell = free_cell(prisoner)
    	var/obj/machinery/status_display/door_timer/timer = jail_cell?.timer_ref?.resolve()
    	if(isnull(timer))
    		action_result(CREW_TOOL_JAIL, FALSE, "Every cell is in use.", list("reason" = "no_cell", "prisoner" = prisoner.name))
    		return

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:671`, in `serveStep`:

    if (
      warrant.noCellAt !== undefined &&
      brain.now - warrant.noCellAt < NO_CELL_WAIT_DS
    ) {
      return {
        ready: false,
        wait: true,
        step: `You have ${name} by the arm, and every cell in the brig is in use. You are waiting for one to come empty.`,
      };
    }

`arrests.ts:1190`, in `beatAfterActing`:

    if (reason === 'no_cell') {
      warrant.noCellAt = brain.now;
      return;
    }

`arrests.ts:421`, in `syncBeat`, the only place a cell that cannot be used is reported:

    if (holds(brain, warrant) && (warrant.cellTries ?? 0) >= cells) {
      cannot(warrant.name, 'I cannot get them into a cell');
    }

## How it was found

Read from the code. Not seen in a round: no arrest has been made after the power went.

## How to fix it

1. Server, `free_cell` and `tool_jail`: tell the two cases apart. In `tool_jail`, when `free_cell` gives nothing, look once more over `crew_npc_brig_cells()`: if no cell on this level has a timer with power, answer "No cell's timer has power." with `"reason" = "no_power"`. Otherwise keep `no_cell`. The body knows this only if it can see a timer, strictly: `security_state` already gives a cell's state only when it is in view. To keep to "senses only", have the body walk to the brig first (step 2) and answer `no_power` only when it is standing there. From elsewhere, answer `no_cell` as now and let the window take them to the brig.
2. Window, `serveStep`: when `noCellAt` is set and the officer is not in the brig (`brigPlace(brain)`), the step is `go_to` the brig with the prisoner, as the `cellTries` branch does a few lines down. In the brig it waits (`wait: true`) and tries again every 30 seconds as now.
3. Window, `beatAfterActing` and `syncBeat`: count the `no_cell` and `no_power` answers on the warrant (`noCellTries`). After the second, call `cannot(warrant.name, 'every cell is in use')` or `cannot(warrant.name, 'the cells have no power')`, once, through the same `cannotTold` map. `outcomeLine` already carries any `why`, and the Head of Security passes it to the Captain.
4. Fix the step text so that it says which: in use, or no power.
5. The owner's question: how long does an officer stand holding a prisoner it has no cell for? The warrant gives minutes in a cell. One answer in keeping with the rest: after the minutes on the warrant have gone by with the prisoner held in the brig, the time is served, and it lets them go and reports "X is free". Another: it holds them until told. As built it holds them for ever.

What must keep working: a cell that comes empty is used at the next try. A cell passed over for two minutes after it refused a prisoner (`cell_refused`) is still tried again when there is no other.

## How to test the fix

- Type check, lint, server compile to a side copy.
- Simulator: the `badcell` scenario is the nearest. Add one where every `jail` answers `ok: false, reason: 'no_cell'`. Check that the officer walks to the Brig, that one "I cannot bring in X: ..." reaches the Head of Security, and that `jail` goes on being tried about every 30 seconds.
- In a round: cut the brig's APC, have someone arrested, and look in `pda.log` for the "cannot bring in" line and in `game.log` for the officer standing in the Brig, not where the arrest was made.
