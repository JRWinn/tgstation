---
id: HOLE-16
title: A crew member locked in a brig cell by the Captain or any player does not know it is a prisoner, goes on with its work from the cell and asks to be let out
kind: gap
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1416, code/modules/llm_crew/crew_npc_security.dm:1372, code/modules/llm_crew/crew_npc_security.dm:265, code/modules/llm_crew/crew_npc_tools.dm:20, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:440
fix: In look_around, when the body stands in a brig cell whose timer is running and it is in no custody, put it in custody of that cell the way put_in_custody does, with nobody named, so the existing cell phase holds it and lets it go when the timer stops
---

## What is wrong

The crew have a full idea of being a prisoner, but only when their own security made the arrest. `custody_phase` is set in two places, `being_arrested` and `put_in_custody`, and both are called only by the crew officer's arrest and jail tools. Once it is set, the body is told "X has put you in Cell 2 for 5 minutes", every tool but `say` is refused with "You are in Cell 2 until your time is up.", the prompt gets "Security has locked you in Cell 2 in the brig. You cannot leave, or work, until your time is up or the Captain pardons you" (`wantedCues`), and `custody_tick` lets it go when the cell's timer stops.

The Captain is the human player, and the base game gives him, and any player security officer, a brig to use. Someone the Captain cuffs, drags into a cell and puts on the timer is, to the crew code, a free person who happens to be in a small room:

1. `custody_phase` is null. `in_custody()` is false.
2. `handle_tool_call` refuses nothing: only `in_hand_until` stops tools, and that is set by `hold_in_custody` alone.
3. Its job goes on. A janitor's next mess is elsewhere; it sets off, the walk fails at the cell's glass door, and after failing more than once it counts as shut in, and the shut-in steps begin: knocking, and PDA messages to door keepers asking to be let out. (A cell door is a window door, not an airlock, and on MetaStation the cells are part of the Brig room, so who the door keepers come out as, by `trail_door`'s nearest airlock of the room, I did not work through: most likely security staff, asked to let it out of the Brig.) A head goes on calling and holding staff meetings by PDA from the cell. A technician asks for its crate errands. None of that is refused, since `message` is only barred under custody.
4. Its prompt says nothing of a cell or of being held, so to the Captain who has just jailed it the model answers as if it had wandered in: "I need to get back to the Bar, could you open the door?"
5. When the timer runs out the cell opens and it walks out, which is right, but by luck of the walk working again.

The same holds for a crew member who is cuffed and jailed by a player officer, which is the commoner case once a friend is aboard as security.

Seeing where it is is not a cheat: the body was dragged in, saw the door shut, and the cell's timer display is on the wall in front of it.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1416`, the only way into the cell phase:

	/// The cell this body was walked into has been shut on it.
	/datum/ai_controller/crew_npc/proc/put_in_custody(datum/crew_npc_brig_cell/cell, minutes, mob/living/carbon/human/by)
		var/was_held = in_custody()
		arrested_by = WEAKREF(by)
		arrested_by_name = by.name
		custody_phase = CREW_CUSTODY_CELL
		custody_timer = cell.timer_ref
		custody_cell = cell.name

Its callers are the crew's jail tool only (`grep -n "put_in_custody(" code/modules/llm_crew/` finds the definition and one call in the jailing code).

`code/modules/llm_crew/crew_npc_security.dm:1459`, the cell phase holds on the timer alone, whoever started it, so it would work for a player's jailing as it is:

	if(CREW_CUSTODY_CELL)
		var/obj/machinery/status_display/door_timer/timer = custody_timer?.resolve()
		held = !QDELETED(timer) && timer.timing

`code/modules/llm_crew/crew_npc_security.dm:265`, the helper that already finds a person in a running cell, used today only so security do not question their own prisoners:

	/proc/crew_npc_cell_holding(mob/living/person)

`code/modules/llm_crew/crew_npc_tools.dm:20`:

	// Someone has it by the arm and is walking it out of a room. It can still speak, and that is all.
	if(world.time < in_hand_until && tool != CREW_TOOL_SAY && tool != CREW_TOOL_HOLD)

## How it was found

Read from the code: every assignment of `custody_phase`, the cell phase of `custody_tick`, and the tool gate. Not seen in a round; no round so far has had a crew member jailed by a player. HOLE-11 (a body cuffed by a player never works the cuffs off) is the nearest finding; this one is the cell, and is fixed apart from it.

## How to fix it

1. In `look_around`, after the body is known to be on a turf, add: if `isnull(custody_phase)` and `crew_npc_cell_holding(body)` returns a cell, call a new `found_in_cell(cell)`.
2. `found_in_cell(datum/crew_npc_brig_cell/cell)`: set `custody_phase = CREW_CUSTODY_CELL`, `custody_timer = cell.timer_ref`, `custody_cell = cell.name`, `arrested_by = null`, `arrested_by_name = null`; cancel the search, errand and walk the way `being_arrested` does; call `hold_in_custody()`; emit `CREW_SENSE_KNOWLEDGE` "You are locked in [cell.name] in the brig, and its timer is running." with `in_cell`; `log_game` it; start `custody_tick` if it was not already held. Do not try to read the minutes off the timer for the text: "until its time is up" is enough.
3. Check that `custody_words()` and `hold_in_custody()` read well with `arrested_by_name` null (`in_hand_of` becomes null; `stand_still(..., null)` must accept null).
4. Leave the crew's own jailing as it is: `put_in_custody` sets `custody_phase` first, so step 1 never fires for it.
5. Owner's question: should a crew member jailed by a player, not by its own security, tell its head by PDA that it is in the brig (it would have to do so before its PDA is barred, or the bar on `message` be lifted for that one line)? Its head otherwise calls it to meetings and counts it absent.

## How to test the fix

- Simulator: a scenario where the stand-in server reports the janitor in a running cell with no arrest (needs `custody` sent without an arrest event). Pass when the janitor takes no walk and sends no PDA message until `custody` clears.
- DM compile.
- In a round: as the Captain, cuff a janitor, put it in a cell and start the timer for one minute. Grep `game.log` for "locked in" and "is free to go", and check the janitor sends nothing on `pda.log` while inside.
