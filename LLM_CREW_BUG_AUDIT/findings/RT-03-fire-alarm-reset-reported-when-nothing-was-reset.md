---
id: RT-03
title: A fire alarm with no power is reported as reset when nothing was reset
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:773, code/game/machinery/firealarm.dm:272
fix: Reset the alarm by a right click as the body, then look at the room again before saying it worked
---

## What is wrong

`reset_fire_alarm` calls the alarm's own `reset()` and then tells the brain "You reset the fire alarm in X. The fire doors there are opening." It never looks at whether anything happened. The game's `reset()` does nothing at all when the alarm has no power or is broken, and says so to nobody.

So with the power out, which the test rounds reach about fifteen minutes in, the body is told the fire doors are opening when they are shut and will stay shut. `ways_reopened()` then wipes the rooms it had given up on, and `ways_out_failed` is set to 0, so it walks at the same fire doors again.

One concrete case:

1. Someone pulls the fire alarm in the Central Primary Hallway. The fire doors shut. Later the station loses power.
2. A janitor's walk fails with "there is no way through". `fire_door_report` adds `fire_doors` and `alarm_pulled = TRUE` to the details, and the brain sends `reset_alarm` for that room.
3. The body walks to the alarm. `reset_fire_alarm` finds the alarm still on and pulled by hand, and calls `alarm.reset(body)`.
4. In the game, `reset` starts with `if(!is_operational || !can_reset) return`. The alarm has no power, so it returns. The alarm is still on and the fire doors are still shut.
5. The body logs "reset the fire alarm in Central Primary Hallway" and returns `list(TRUE, "You reset the fire alarm in Central Primary Hallway. The fire doors there are opening.")`.
6. The brain sends the body on its way. The walk fails at the same fire doors, the report again says the alarm was pulled, and the body is sent to reset it again. `fire_alarms_failed` is never set for this alarm, because the errand "worked".

It is also a break of the no-cheats rule in the ordinary case: the alarm's `reset()` is called from code, with none of the checks a click makes. This part is already listed, with no fix, in `LLM_CREW_CHANGELOG.md` (the 2026-11-18 entry that lists "places in older code that break the no-cheats rule": "`reset_fire_alarm` calls the alarm's `reset()`"). The wrong answer to the brain is not listed anywhere.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:773`, in `reset_fire_alarm`:

    	var/area/room = alarm.my_area
    	if(isnull(room) || !(room.fire || LAZYLEN(room.active_firelocks)))
    		return list(TRUE, "The fire alarm in [errand_item] has been reset already.")
    	if(!crew_npc_alarm_was_pulled(room))
    		return list(FALSE, "Something is wrong with the air in [errand_item] after all. You leave the alarm alone.")
    	alarm.reset(body)
    	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) reset the fire alarm in [errand_item].")
    	// The way is open again, so nothing it gave up on because of the fire doors stands.
    	ways_reopened()
    	ways_out_failed = 0
    	return list(TRUE, "You reset the fire alarm in [errand_item]. The fire doors there are opening.")

`code/game/machinery/firealarm.dm:272`:

    /obj/machinery/firealarm/proc/reset(mob/user, silent = FALSE)
    	if(!is_operational || !can_reset)
    		return
    	my_area.alarm_manager.clear_alarm(ALARM_FIRE, my_area)

How a player resets one, `firealarm.dm:296`:

    /obj/machinery/firealarm/attack_hand_secondary(mob/user, list/modifiers)
    	. = ..()
    	if(. == SECONDARY_ATTACK_CANCEL_ATTACK_CHAIN || buildstage != FIRE_ALARM_BUILD_SECURED)
    		return .
    	add_fingerprint(user)
    	reset(user)

## How it was found

Read from the code, with the base proc read. Not seen in a round: `game.log` has four "reset the fire alarm" lines in all the rounds on disk (17.38.48, 17.57.35 twice, 15.09.26), none repeated for one room. The fire alarm is on the area's environment power, so it goes dead with the room's APC.

## How to fix it

1. In `reset_fire_alarm`, replace `alarm.reset(body)` with the click a player makes: `empty_clicking_hand()`, then `click_as_body(alarm, "right=1")`. That is the secondary click on a fire alarm, and it runs the game's own checks. A plain left click must not be used: on an alarm that is off it sets the alarm off.
2. After the click, check `QDELETED(src)`, `QDELETED(body)`, `QDELETED(alarm)`, then look at the room again with the same test as at the top: `room.fire || LAZYLEN(room.active_firelocks)`. The fire doors take a moment to open, so look after a short sleep (half a second), or go by the alarm manager having cleared.
3. If the room is still alarmed: set `fire_alarms_failed[REF(alarm)] = world.time` so the next nearest alarm is tried, do not call `ways_reopened()`, and return `list(FALSE, "The fire alarm in [errand_item] will not reset. It may have no power.")` with a detail the brain can go by, for example `"alarm_dead" = errand_item`.
4. Only on success log the reset, call `ways_reopened()` and zero `ways_out_failed`.
5. Window side: whichever job asks for `reset_alarm` should leave a room alone for a while once it has been told `alarm_dead`. Find it by searching `tgui/packages/tgui/interfaces/CrewBrain/` for `reset_alarm`.

Question for the owner: with the power out, should the crew pry the fire doors with a crowbar, as a player would? That is new behaviour and is not part of this fix.

## How to test the fix

- Compile the server.
- In a round: pull a fire alarm, cut the room's APC (or wait for the power to fail), and send a janitor through. `game.log` should have no "reset the fire alarm" line for that room, and the brain should be told the alarm will not reset.
- With power on, the alarm should still reset and the walk go through.
- Add a simulator scenario in `tools/llm_crew/sim.ts` in which `reset_alarm` answers `ok: false` with `alarm_dead`, and check the body does not ask again at once.
