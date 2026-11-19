---
id: KNA-29
title: A fire door shut by the next room's pulled alarm is reported as shut by a real alarm in the body's own room, so nobody resets it and the officer was held in its office for the rest of the round
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:721, code/modules/llm_crew/crew_npc_doors.dm:694, code/game/machinery/doors/firedoor.dm:379
fix: In fire_door_report take the room whose alarm was raised by hand over one it only spread to, as the fault display on a fire alarm shows, and say the room the alarm is in
---

## What is wrong

The change log entry of 2026-11-18, 19:38 to 20:00, "Seen and left alone", has: "Pun Pun, let out with a grudge, went on to set off a fire alarm in the Brig at 19:50:15 ... There is no warrant on it, so nobody did anything, which is as built." What it did not see is what that alarm did to the officer, in the same round.

From 19:50:34 to the end of the round at 19:58:47 the officer, Nova Aultman, could not leave the Security Office. Every one of its seven walks (its rounds to the Security Post - Cargo Bay, the Prison Shower, the Prison Work Room, the Visitation Area, the Brig, Security Medical, Security Post - Medbay) stopped on the same square, (116,169), in front of the office's door to the Brig. And its brain was told why, wrongly:

    [19:50:34] You stop on the way to Security Post - Cargo Bay: there is no way through. The fire doors are shut in Security Office. You are in Security Office.
    ...
    The fire doors are shut in Security Office because something is wrong with the air there. You are keeping out until they open.

(`data/logs/2026/11/19/round-19.33.50/crew_brain.log`, the officer's prompt at 01:56:40 log time.) Nothing was wrong with the air. The alarm was pulled by hand, in the Brig. The officer was told it was a real alarm in the room it was standing in, so the reset step in `driver.ts` (which goes only for `fire.pulled`) never fired, and it waited for doors that only a reset would open.

**Why the wrong room.** The fire door at (116,168) stands on Security Office floor and borders the Brig. Its `affecting_areas` are both. When the Brig's alarm is pulled, `firealarm/alarm()` activates every fire door in `brig.firedoors`, this one included. `activate` calls `add_as_source`, which adds the door to the `active_firelocks` of **every** area it borders, and in each area where it is the first, calls `set_fire_effect(TRUE, AREA_FAULT_AUTOMATIC, name)`. So the Security Office now has `fire` set, with `fault_status = AREA_FAULT_AUTOMATIC`. Only the Brig gets `AREA_FAULT_MANUAL`, set by `alarm()` after.

`fire_door_report` then walks the door's `affecting_areas` and takes the **first** with `fire` or active firelocks. `get_adjacent_open_areas(src) | get_area(src)` puts the office first for this door. `crew_npc_alarm_was_pulled(Security Office)` reads `AREA_FAULT_AUTOMATIC` and answers FALSE.

So the rule fails for any fire door that stands on the near room's side of a doorway whose far room's alarm was pulled: the near room has caught the alarm from the shared door, and is named. Which side a door is listed on is down to the map. This is apart from KNA-15 (whether the body may know an alarm was pulled at all) and DOOR-16 (a fire door blamed that is not on the way): here the fire door is the right one and the room is wrong.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:720`, `fire_door_report`:

    	// The door may stand between two rooms. The one whose alarm is on is the one that shut it.
    	var/area/alarmed
    	for(var/area/place as anything in nearest.affecting_areas)
    		if(place.fire || LAZYLEN(place.active_firelocks))
    			alarmed = place
    			break
    	alarmed ||= get_area(nearest)
    	var/alarmed_name = format_text(alarmed.name)
    	details["fire_doors"] = alarmed_name
    	details["alarm_pulled"] = crew_npc_alarm_was_pulled(alarmed)

`crew_npc_doors.dm:694`, `crew_npc_alarm_was_pulled`:

    	if(!(room.fire || LAZYLEN(room.active_firelocks)) || room.fault_status != AREA_FAULT_MANUAL)
    		return FALSE

Base game, `code/game/machinery/doors/firedoor.dm:379`, `add_as_source`, which raises the alarm in each room the door borders:

    	for(var/area/place in affecting_areas)
    		LAZYADD(place.active_firelocks, src)
    		if(LAZYLEN(place.active_firelocks) != 1)
    			continue
    		//if we're the first to activate in this particular area
    		place.set_fire_effect(TRUE, AREA_FAULT_AUTOMATIC, name) //bathe in red

and `code/game/machinery/firealarm.dm:251`, `alarm()`, which sets `AREA_FAULT_MANUAL` on its own area only.

## How it was found

Seen in a round log, then traced in the code. `game.log` of `data/logs/2026/11/19/round-19.33.50`: "Pun Pun ... triggered a fire alarm. (Brig (98,172,2))" at 01:50:15, then seven "walk failed ... Stopped at Security Office (116,169,2)" lines to 01:58:24; `crew_brain.log` for the words the brain was given; no "reset" line for any alarm in that round. The map (`MetaStation.dmm`) has a fire door and the "Security Office" airlock at (116,168) and (117,168) on Security Office floor, the Brig to the south.

## How to fix it

1. In `fire_door_report`, choose among `nearest.affecting_areas` that are alarmed: first one whose `fault_status == AREA_FAULT_MANUAL` (where an alarm was raised by hand), then one that is not the area the body stands in, then any. A player at the door can tell the same: the fire alarm on the wall of a room shows "The fault location display is X (Manual Trigger)" or "(Automatic Detection)" when examined (`firealarm.dm:563`), and the alarm that rings (`soundloop`) is the pulled one. If the owner rules KNA-15's way (the body may not know pulled from real), keep this ordering for the room's name alone, so the body at least goes to the right room's alarm.
2. When the alarmed room is not the room the body is in, word it that way: "The fire doors between here and the Brig are shut: the Brig's alarm is on."
3. Consider also the office's own alarm: a fire alarm's reset (`firealarm/reset`) resets every fire door in its own area's `firedoors`, which includes the shared door. So a body shut in by spill-over can reset the alarm on its own side, as a player would. `tool_reset_alarm` refuses that today, because `crew_npc_alarm_was_pulled(office)` is FALSE. Allow a reset of a room whose only fault is spill-over from a neighbour whose alarm was pulled (`AREA_FAULT_AUTOMATIC` with every active firelock also in a `MANUAL` neighbour's list), and keep refusing where the air itself set it off.
4. Keep the rest as it is: the reset still goes only to an alarm the body can walk to, and fire doors that shut again at once still mark the room to be left alone (`ALARM_CAME_BACK_MS` in `brain.ts`).

## How to test the fix

Server compile to a side copy. The simulator has no fire doors. In a round, an admin or the Captain pulls the Brig's fire alarm with the officer in the Security Office: `crew_brain.log` should show "The fire doors are shut in Brig" (or the new wording), and `game.log` a reset of an alarm, followed by the officer's walk going through. Grep `game.log` for "Stopped at" lines with the same square several times running.
