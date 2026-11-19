---
id: JAN-06
title: A locked engine air alarm never unlocks for an engineer, because the game checks the ID of usr and the body's click carries none
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: engineering
files: code/modules/llm_crew/crew_npc_machines.dm:408, code/modules/llm_crew/crew_npc_machines.dm:259, code/modules/atmospherics/machinery/air_alarm/air_alarm_interact.dm:70, code/modules/llm_crew/crew_npc_forcing.dm:348
fix: Make the click in click_as_body as the body with world.push_usr, as work_wires and work_timer already do
---

## What is wrong

`set_alarm_drawing` unlocks a locked air alarm the way a player does, by a right click with an empty hand (`click_as_body(alarm, "right=1")`). The game's `togglelock` then asks `src.allowed(usr)`, not `allowed(user)`. `usr` is whoever started the proc chain. The body's click is made from the AI subsystem's tick (`start_async` runs `perform_async` by `INVOKE_ASYNC` from the controller's processing), where there is no player and `usr` is null. `allowed(null)` returns FALSE for any alarm that needs access (`access.dm`: "if(isnull(accessor)) return FALSE"). So the unlock is always "Access denied", whatever ID the engineer wears, and the brain is told "The engine air alarm is locked, and will not unlock for you."

The same code already knows about this. `work_wires` in `crew_npc_forcing.dm` and `work_timer` in `crew_npc_security.dm` both wrap their call in `world.push_usr(body, ...)` because the base game "asks who is using it". `click_as_body` and `work_window` in `crew_npc_machines.dm` do not.

Why it is low: the engine air alarm starts unlocked. Its map helper (`give_engine_access`) sets `locked = FALSE`, and rounds on disk show "worked the engine air alarm ... draw_all" lines from 16:50, 17:12 and later on 2026-11-18. It bites only when someone has locked it, which a player at the alarm can do with one right click and an ID.

Concrete case: an engineer player locks the engine air alarm (right click with their ID). Later the Chief Engineer NPC is told to set it to draw everything out. It stands at the alarm with its CE's ID on, right clicks, `togglelock` runs `allowed(usr)` with `usr` null, prints "Access denied" to the body, and `set_alarm_drawing` returns FALSE with "will not unlock for you". A CE player would have unlocked it.

## Where

`code/modules/llm_crew/crew_npc_machines.dm:408`, in `set_alarm_drawing`:

    	if(alarm.locked)
    		if(!empty_clicking_hand() || !click_as_body(alarm, "right=1") || QDELETED(alarm) || alarm.locked)
    			return list(FALSE, "The engine air alarm is locked, and will not unlock for you.", FALSE)

`code/modules/llm_crew/crew_npc_machines.dm:259`, `click_as_body`:

    	body.face_atom(target)
    	body.ClickOn(target, modifiers)
    	return TRUE

`code/modules/atmospherics/machinery/air_alarm/air_alarm_interact.dm:70`, the base game:

    /obj/machinery/airalarm/proc/togglelock(mob/living/user)
    	...
    		if(src.allowed(usr) && !wires.is_cut(WIRE_IDSCAN))
    			locked = !locked

`code/modules/llm_crew/crew_npc_forcing.dm:348`, how it is done elsewhere:

    	var/taken = world.push_usr(body, CALLBACK(wires, TYPE_PROC_REF(/datum, ui_act), action, params || list(), window, window.state))

## How it was found

Read from the code and the base game's `togglelock` and `allowed`. That `usr` is null in an AI subsystem tick is from how BYOND sets `usr` (only a client's verb or Topic sets it, and procs inherit it from their caller); it was not checked in a running game, hence `likely`. Round logs show the alarm worked while unlocked; none shows a locked one.

## How to fix it

1. In `click_as_body`, make the click with `usr` set to the body: `world.push_usr(body, CALLBACK(body, TYPE_PROC_REF(/mob, ClickOn), target, modifiers))`. This puts every body click on the same footing as `work_wires`, and also mends every other base proc reached by a body's click that reads `usr` (some `investigate_log` lines in atmos machines name `usr`).
2. In `work_window`, wrap the `ui_act` call the same way, as `work_timer` does.
3. Check no caller relies on `usr` being the owner's mob. None in `crew_npc_machines.dm` or `crew_npc_cleaning.dm` does.

## How to test the fix

- Server compile to a side copy.
- In a round: lock the engine air alarm as a player with an engineering ID, then have the Chief Engineer set it to draw everything out. `game.log` should show "worked the engine air alarm (alarm) ... draw_all", not "could not work the engine air alarm ... will not unlock for you".
