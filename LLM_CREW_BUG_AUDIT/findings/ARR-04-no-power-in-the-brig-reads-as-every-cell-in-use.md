---
id: ARR-04
title: With the brig's power out every cell reads as in use, and the officer stands where it made the arrest holding its prisoner, telling nobody
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: bc5dda1b405
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1081, code/modules/llm_crew/crew_npc_security.dm:1119, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:671, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1190
fix: Have tool_jail say no_power apart from no_cell, walk the prisoner to the brig to wait, and tell whoever keeps the list once
---

## What is wrong

See also: SEC-08 (its third part, "a new prisoner cannot be put anywhere", is this same fault; build the two together), SEC-14 (a prisoner held standing still works the cuffs off), CHEAT-03 (`free_cell` reads every cell from anywhere)

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

The walk in step 2 drags the prisoner along, as the `cellTries` branch already does, so nothing new is needed on the server for it. Step 1 is the only server change; steps 2 to 4 are window only and would mend the standing still and the silence on their own.

What must keep working: a cell that comes empty is used at the next try. A cell passed over for two minutes after it refused a prisoner (`cell_refused`) is still tried again when there is no other.

## How to test the fix

- Type check, lint, server compile to a side copy.
- `tools/llm_crew/security.ts`: cases for `beatAfterActing` with `jail` answered `no_cell` twice: `noCellTries` is 2 and one `cannot` outcome is pushed; and for `serveStep` with `noCellAt` set and `brain.location` not the Brig: the act is `go_to` the Brig.
- Simulator: the `badcell` scenario is the nearest. Add one where every `jail` answers `ok: false, reason: 'no_cell'`. Check that the officer walks to the Brig, that one "I cannot bring in X: ..." reaches the Head of Security, and that `jail` goes on being tried about every 30 seconds.
- In a round: cut the brig's APC, have someone arrested, and look in `pda.log` for the "cannot bring in" line and in `game.log` for the officer standing in the Brig, not where the arrest was made.

## Check

Checked by Opus 5.5. Confirmed.

Read `free_cell` and `tool_jail` (`crew_npc_security.dm:1075-1124`): the quotes are as the code is today. A timer with `NOPOWER` is passed over; with none left `free_cell` returns `refused` (null when no cell was refused lately), and `tool_jail` answers `no_cell` before `start_errand`, so the body takes no step. The door timer is a `status_display` with `use_power = IDLE_POWER_USE` (`status_display.dm:1020`), so it does get `NOPOWER` when the area's equipment power goes. Read `beatAfterActing` (`arrests.ts:1188-1193`): `no_cell` sets `noCellAt` and returns before `cellTries` is touched. Read `serveStep` (`:671`): the `noCellAt` branch is a plain wait with no walk, and the walk back to the Brig is only in the `cellTries` branch. Read `syncBeat` (`:422`): the only "cannot" for a cell is on `cellTries`. So the officer stands where it cuffed them, says nothing, and tries `jail` every 30 seconds (`NO_CELL_WAIT_DS = 300`), with nothing else to end it.

The change log's H10 entry (`LLM_CREW_CHANGELOG.md:317`) built the walk back and the report for refused cells only; `LLM_CREW_PLAN_SECURITY.md:293` asks for waiting in the brig with all cells in use, which was not built. Nothing fixes it later. SEC-08 part 3 is the same fault, found separately and not yet checked; this file has the fuller fix for that part. Added the cross-references and window-side cases to test. Severity medium and effort medium kept.

## Fix so far

Group m-secsrv, commit bc5dda1b405, built with CHEAT-03 (compile, tables and simulator; not played). Steps 1 to 4: the officer walks to the brig to look (CHEAT-03), answers `no_power` there when every cell on the level is dark, else `no_cell` (`no_cell_answer`); the window takes the prisoner to the brig to wait, the step says which, and the second answer in a row tells the list once ("every cell is in use" / "the cells have no power"). Table: `tools/llm_crew/arrests3-nocell.ts`. Left: step 5, the owner's question of how long a prisoner with no cell is held.

Round M3 (group m3-window, 7d0f4503c52; tables and simulator, not played): the fault the `nocell` scenario found is fixed. While the officer waits in the brig with its prisoner for a cell (`waitingWith` in `jobs/arrests.ts`), its other word on them is ranked with the wait (`syncTasks`, `jobs/officer.ts`), so "Joan, I have Pun Pun in cuffs." goes out and the Captain is told. Step 5 is still the owner's question.

## Fix so far (step 5, owner's answer A, window part)

Built on branch `a-secwin`. `serveTimeInBrig` in `jobs/arrests.ts`, run from `syncBeat`: the clock starts when the officer first waits with its prisoner in the brig for a cell (`waitsForCell`, standing in `brigPlace`), and runs while it holds them (kept as `brigSince` on the warrant, a local type; it belongs on `BeatWarrant` in `types.ts`). Once the warrant's minutes are up (with five more for resisting, `minutesFor`), the warrant is dropped from its beat as served and the prisoner put on `toFree` (marked `served`), so the usual let-go step lets them go ("there was no cell for them, and they have served their time with you in the brig"), and the existing "freed" outcome sends "Joan, X is free." to whoever keeps the list. The desk (`deskOutcome`, `jobs/desk.ts`), told "free" of someone whose warrant is still on its list, strikes the warrant off, as for a cell that has run out (nothing more is passed to the Captain, as for a cell that ran out). Table `tools/llm_crew/secwin-answers.ts`. Not played.
