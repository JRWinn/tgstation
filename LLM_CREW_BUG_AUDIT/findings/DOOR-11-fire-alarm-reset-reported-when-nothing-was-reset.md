---
id: DOOR-11
title: Resetting a fire alarm is reported as done when the alarm has no power or cannot be reset
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:773, code/game/machinery/firealarm.dm:272
fix: Reset the alarm by the right click a player uses, then look at the room and answer by whether its alarm is in fact off
---

## What is wrong

`reset_fire_alarm` calls the alarm's `reset()` and then tells the brain "You reset the fire alarm in X. The fire doors there are opening." It does not look at whether anything happened. The base game's `reset()` does nothing at all, and says nothing, when the alarm is not working or is of a kind that cannot be reset:

    /obj/machinery/firealarm/proc/reset(mob/user, silent = FALSE)
    	if(!is_operational || !can_reset)
    		return

`is_operational` is FALSE for an alarm with no power or one that is broken.

So the body reports a reset that did not happen. It also writes "reset the fire alarm" to `game.log`, clears the rooms it had given up on (`ways_reopened()`) and zeroes `ways_out_failed`.

One concrete case, and it fits the test rounds. The station loses power about fifteen minutes in (the owner's notes). Someone has pulled a fire alarm in a hallway, or pulls one after. A body stopped by the shut fire doors is told `alarm_pulled` and goes to reset it. The alarm has no power. `reset()` returns at its first line. The body is told it reset the alarm and that the doors are opening. It sets off again, is stopped by the same fire doors, is told again that the alarm was pulled, and goes back to reset it again. Each lap is a success as far as the brain can tell, so nothing ever says "this is not working" and nobody is asked for help. (How the window spaces the laps was not traced. `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` section on fire doors has a body that "has tried the alarm and cannot get to it" tell its head: an alarm that will not reset never reaches that step.)

Calling `reset()` straight from code, and not by a click, is already listed as a cheat to look at (`LLM_CREW_CHANGELOG.md`, the paragraph beginning "The helper also listed places in older code that break the no-cheats rule"). The wrong answer is not listed.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:773`:

    /datum/ai_controller/crew_npc/proc/reset_fire_alarm(obj/machinery/firealarm/alarm)
    	var/mob/living/carbon/human/body = pawn
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

## How it was found

Read from the code, with the base proc read in `code/game/machinery/firealarm.dm`. Not seen in a round. Round logs were not searched for repeated `reset the fire alarm` lines: that is the thing to grep for.

## How to fix it

1. Do it the way a player does, which mends the cheat as well: a right click on the alarm with an empty hand. Use `empty_clicking_hand()` and then `click_as_body(alarm, "right=1")` (both are in `crew_npc_machines.dm` and are what `turn_machine` and `switch_emitter` use). The base game's `attack_hand_secondary` on a fire alarm calls `reset(user)`. If the click could not be made, answer FALSE, "You cannot reach the fire alarm in X."
2. After the click, look at the room again: if `room.fire || LAZYLEN(room.active_firelocks)` is still true, it did not reset. Answer FALSE with the reason a player would see: if `alarm.machine_stat & NOPOWER`, "The fire alarm in X has no power. It will not reset."; if broken, "The fire alarm in X is broken."; otherwise "The fire alarm in X would not reset." Put the reason in the details (`"alarm_dead" = known`) so the window can stop trying and tell someone. Check first whether `my_area.fire` is cleared in the same tick as `reset()`: if the alarm manager clears it a moment later, wait a second (`sleep`, then re-check that the body and alarm still exist) before looking.
3. Only on a real reset: write the log line, call `ways_reopened()` and zero `ways_out_failed`.
4. On a failed reset, add the alarm to `fire_alarms_failed` (as `crew_npc_fail_errand` does for one that could not be reached) so that `tool_reset_alarm` tries the room's next alarm and, when none is left, answers `alarm_out_of_reach`, which the window already knows how to pass on.
5. In the window, treat the new reason like `alarm_out_of_reach`: tell the head, once for a room.

## How to test the fix

- Server compile. Type check if the window is touched.
- In a round: cut the power to a hallway (or wait for the station to lose it), pull its fire alarm, and send a body through. `game.log` must not show `reset the fire alarm in` for that hallway, and the body must end by telling someone, not by walking back and forth.
