---
id: KNA-29
title: A fire door shut by the next room's pulled alarm is reported as shut by a real alarm in the body's own room, so nobody resets it and the officer was held in its office for the rest of the round
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 6c658fc04bc
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:721, code/modules/llm_crew/crew_npc_doors.dm:694, code/modules/llm_crew/crew_npc_doors.dm:749, code/game/machinery/doors/firedoor.dm:379, code/game/machinery/firealarm.dm:267
fix: Let a body stopped by a fire door that borders its own room reset the alarm on its own side, whose reset opens that shared door, instead of calling its room's spill-over alarm a real one - and build it with GAP-05
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

(Checker's rewrite. The first draft led with naming the Brig. That alone does not free the officer: the Brig's alarm is at (98,172), on the far side of the shut doors, and the officer's own walk to the Brig failed at 19:55:15. Sent to reset it, the walk fails, `fire_alarms_failed` notes it and it is left alone. What frees it is the alarm on its own side, the first draft's step 3.)

The owner has already ruled on the pulled-or-real question: `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, H7, "the engineer does not know whether an alarm is real... thats cheating", and "the door shutting itself is the answer". GAP-05 (confirmed) is the plan to drop `crew_npc_alarm_was_pulled` and reset once, leaving the room if the doors shut again. Build this fix to fit that.

1. In `fire_door_report`, when the shut door's `affecting_areas` include the area the body stands in, report that area (as it does today for this door, since `get_adjacent_open_areas` lists it first here, but on purpose and for every door). That room's alarm is on the body's side and a reset of it opens the shared door: `firealarm/reset` (`firealarm.dm:267`) calls `crack_open` on every door in `my_area.firedoors`, and `CalculateAffectingAreas` puts a shared door in the `firedoors` of every room it borders. After `crack_open`, a door shut by a pulled alarm has `alarm_type` null and stays open (`release_constraints` returns), and the Brig's alarm does not shut it again (`alarm()` returns while `my_area.fire` is set). On MetaStation the office's alarm is at (122,170), inside the office. If the body's room has no fire alarm (`room.firealarms` empty), fall back to the other alarmed room, as today.
2. With GAP-05 built, nothing else is needed: the body resets the alarm in its own room once; if the doors shut again the room is left alone, as decided. Until GAP-05 is built, so the reset is not refused, change `crew_npc_alarm_was_pulled` to count as pulled a room whose `fault_status` is `AREA_FAULT_AUTOMATIC` when every door in its `active_firelocks` has `alarm_type == FIRELOCK_ALARM_TYPE_GENERIC` and also stands in the `active_firelocks` of a neighbour that is `AREA_FAULT_MANUAL`. That tells the body no more than it is told today (GAP-05 is the cheat in that), and keeps refusing where the air set the doors off.
3. Optional, the window's words: when the room named is the body's own but the alarm that shut it was raised next door, the line "something is wrong with the air there" (`situation.ts`) is wrong. With step 2 the details say `alarm_pulled` and the line is the pulled one; no window change is needed for the reset to work.
4. Keep the rest as it is: the reset still goes only to an alarm the body can walk to, and fire doors that shut again at once still mark the room to be left alone (`ALARM_CAME_BACK_MS` in `brain.ts`).

## How to test the fix

Server compile to a side copy. The simulator has no fire doors. In a round on MetaStation, an admin or the Captain pulls the Brig's fire alarm with the officer in the Security Office. `game.log` should show the officer's "reset a fire alarm." (from `firealarm/reset`, via `user.log_message`) at the Security Office alarm (122,170), and then its next walk south through (116,168) going through, with no run of "Stopped at Security Office (116,169,2)" lines. The Brig should still be alarmed afterwards: only the shared doors open. Also pull an alarm in a room with the body inside that room: it must still reset that room's own alarm as today.

## Check

Checked by Opus 5.5. The quotes of `fire_door_report` and `crew_npc_alarm_was_pulled` are what `crew_npc_doors.dm` says today. Read the base procs: `firealarm/alarm()` (activates every door in `my_area.firedoors`, then sets `AREA_FAULT_MANUAL` on its own area only), `firedoor/activate` and `add_as_source` (each bordering area gets `AREA_FAULT_AUTOMATIC` from the first active door), `CalculateAffectingAreas` and `get_adjacent_open_turfs` (north, south, east, west, so a door with the office north and the Brig south lists the office first), `crack_open`, `release_constraints` and `firealarm/reset`. Parsed `MetaStation.dmm` with a throwaway bun script outside the repo: fire doors with security airlocks at (116,168) and (117,168) on Security Office floor, office to the north and east and west, Brig to the south; the office's only fire alarm is at (122,170). Read the round: `game.log` of `round-19.33.50` has Pun Pun's "triggered a fire alarm. (Brig (98,172,2))" at 01:50:15 and six "walk failed ... Stopped at Security Office (116,169,2)" lines after it, and `crew_brain.log` has "The fire doors are shut in Security Office because something is wrong with the air there" in the officer's prompts. So the fault is real and seen.

What I changed: the fix. Naming the Brig would send the officer to an alarm it cannot reach (its walk to the Brig failed in the round); resetting its own room's alarm is what opens the shared doors, by the base game's own rules, so I made that the fix and tied it to GAP-05, because the owner has ruled (H7 in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`) that telling pulled from real is cheating. The first draft's step 1 leaned on `AREA_FAULT_MANUAL` and the alarm's examine text, which a body on the far side of a shut door cannot read. Severity stays high (a body held in a room for the rest of the round whenever a neighbour's alarm is pulled, and monkeys pull them). Effort stays small: one proc and one loop on the server. Not run in a round.
