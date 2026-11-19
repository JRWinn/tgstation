---
id: DOOR-11
title: Resetting a fire alarm is reported as done when the alarm has no power or cannot be reset
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:773, code/game/machinery/firealarm.dm:272, code/modules/llm_crew/crew_npc_hands.dm:349, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:994
fix: Reset the alarm by the right click a player uses, then look at the room and answer by whether its alarm is in fact off
---

## What is wrong

See also: GAP-05 (the same proc also gates the reset on `crew_npc_alarm_was_pulled`, which is a cheat; both fixes replace `alarm.reset(body)` with the right-click, so build them together). RT-03 is a duplicate of this one.

`reset_fire_alarm` calls the alarm's `reset()` and then tells the brain "You reset the fire alarm in X. The fire doors there are opening." It does not look at whether anything happened. The base game's `reset()` does nothing at all, and says nothing, when the alarm is not working or is of a kind that cannot be reset:

    /obj/machinery/firealarm/proc/reset(mob/user, silent = FALSE)
    	if(!is_operational || !can_reset)
    		return

`is_operational` is FALSE for an alarm with no power (it is on the room's environment channel, `power_channel = AREA_USAGE_ENVIRON`, so it dies with the APC) or one that is broken. `can_reset` is FALSE when its reset wire has been cut (`code/datums/wires/firealarm.dm:55`), which a saboteur can do.

So the body reports a reset that did not happen. It also writes "reset the fire alarm" to `game.log`, clears the rooms it had given up on (`ways_reopened()`) and zeroes `ways_out_failed`.

One concrete case, and it fits the test rounds. The station loses power about fifteen minutes in (the owner's notes). Someone has pulled a fire alarm in a hallway, or pulls one after. A body stopped by the shut fire doors is told `alarm_pulled` and goes to reset it. The alarm has no power. `reset()` returns at its first line. The body is told it reset the alarm and that the doors are opening. The window takes that at its word (`driver.ts:994` to `:997`): it notes the reset in `alarmResets`, clears `fireDoors`, and clears **every** backoff the body had (`brain.failures.clear()`); the server has already wiped the rooms it gave up on (`ways_reopened()`) and zeroed `ways_out_failed`. It sets off again and is stopped by the same fire doors. It does not go straight back to the alarm: `RESET_AGAIN_MS` (five minutes, `driver.ts:95`) holds off a second reset, and being stopped within a minute of the reset (`ALARM_CAME_BACK_MS`, `brain.ts:633` to `:639`) marks the room left alone for ten minutes, as if the air there were bad. So the wrong result is: one false report and one false `reset the fire alarm` line in `game.log`, one wasted walk at doors it was just told are open, every other thing it had given up on retried at once, the room blamed on bad air, and the same again roughly every ten minutes for as long as the power is off. Nothing ever says "this alarm will not reset", so no one could be asked for help (H7 in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` has a body that "has tried the alarm and cannot get to it" tell its head: an alarm that will not reset never reaches that step).

How a player resets one, `firealarm.dm:296`; a plain left click would set an alarm off instead (`attack_hand` calls `alarm(user)`):

    /obj/machinery/firealarm/attack_hand_secondary(mob/user, list/modifiers)
    	. = ..()
    	if(. == SECONDARY_ATTACK_CANCEL_ATTACK_CHAIN || buildstage != FIRE_ALARM_BUILD_SECURED)
    		return .
    	add_fingerprint(user)
    	reset(user)

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

Read from the code, with the base proc read in `code/game/machinery/firealarm.dm`. Not seen in a round. From RT-03: `game.log` has four "reset the fire alarm" lines in all the rounds on disk (17.38.48, 17.57.35 twice, 15.09.26), none repeated for one room; recounted on 2026-11-19, still four.

## How to fix it

1. Do it the way a player does, which mends the cheat as well: a right click on the alarm with an empty hand. Use `empty_clicking_hand()` and then `click_as_body(alarm, "right=1")` (both are in `crew_npc_machines.dm` and are what `turn_machine` and `switch_emitter` use). The base game's `attack_hand_secondary` on a fire alarm calls `reset(user)`. If the click could not be made, answer FALSE, "You cannot reach the fire alarm in X."
2. After the click, check `QDELETED(src)`, `QDELETED(body)`, `QDELETED(alarm)` (the click sleeps `CREW_NPC_CLICK_GAP` first), then look at the room again: if `room.fire || LAZYLEN(room.active_firelocks)` is still true, it did not reset. No extra wait is needed: `reset()` calls `crack_open()` on each door, whose `remove_as_source()` clears `active_firelocks` and calls `set_fire_effect(FALSE, ...)` in the same tick (`firedoor.dm:443` to `:452`). Answer FALSE with the reason a player would see: if `alarm.machine_stat & NOPOWER`, "The fire alarm in X has no power. It will not reset."; if broken, "The fire alarm in X is broken."; otherwise "The fire alarm in X would not reset." (That last also covers a click lost to the click cooldown, HAND-01; one retry of the click before giving up is fair.)
3. Only on a real reset: write the log line, call `ways_reopened()` and zero `ways_out_failed`.
4. On a failed reset, add the alarm to `fire_alarms_failed` (as `crew_npc_fail_errand` does at `crew_npc_hands.dm:416` for one that could not be reached) so that the next `tool_reset_alarm` tries the room's next alarm and, when none is left, answers `alarm_out_of_reach`.
5. Get the reason to the window. Today it cannot: `finish_errand` passes details only for security tools (`crew_npc_hands.dm:349`, `CREW_NPC_SECURITY_TOOL(tool) ? security_details(tool, outcome) : null`). Have `reset_fire_alarm` return a third element, `list("alarm_dead" = errand_item)`, and in `finish_errand` pass `outcome[3]` for `CREW_TOOL_RESET_ALARM`. In the window add `event.details.alarm_dead` to the list at `brain.ts:642` to `:645`, beside `real_alarm` and `alarm_out_of_reach`, so the room is left alone for `FIRE_CLOSED_MS`. That is one line. (The window does not tell anyone about `alarm_out_of_reach` today; telling the head is GAP-05's chain, not built.)

## How to test the fix

- Server compile. Type check and lint for the one window line.
- In a round: pull a hallway's fire alarm first, then cut that hallway's APC (an alarm with no power cannot be pulled either: `alarm()` also starts with `if(!is_operational ...) return`), and send a body through. `game.log` must not show `reset the fire alarm in` for that hallway; the body's result must say the alarm has no power and carry `alarm_dead`; and the body must keep out of that room for ten minutes instead of walking back at its doors. Repeat with the alarm's reset wire cut and the power on.
- With power on and nothing cut, the alarm must still reset and the walk go through (the right-click path is new).
- Simulator (from RT-03): make the fake server's `reset_alarm` (`tools/llm_crew/sim.ts:789`) able to answer `ok: false` with `alarm_dead`, and check the body does not ask again inside ten minutes.

## Check

Opus 5.5, 2026-11-19. Read `reset_fire_alarm` and `tool_reset_alarm` in `crew_npc_doors.dm:741-786` (quotes match), the errand dispatch at `crew_npc_hands.dm:242`, `finish_errand` at `:327-349` and `crew_npc_fail_errand` at `:404-417`; `click_as_body` and `empty_clicking_hand` in `crew_npc_machines.dm:259` and `:296`; in the base game `firealarm.dm` (`power_channel`, `alarm()`, `reset()`, `attack_hand`, `attack_hand_secondary`), `firedoor.dm` (`crack_open`, `remove_as_source`), `areas.dm` (`set_fire_effect`), `datums/wires/firealarm.dm:55`, and `_onclick/other_mobs.dm` (a right click on an empty hand reaches `attack_hand_secondary`). On the window side `driver.ts:92-95`, `:262-276`, `:986-998` and `brain.ts:102-105`, `:625-648`. `reset()` returns silently when the alarm has no power, is broken or has its wire cut, and `reset_fire_alarm` reports success regardless: the fault cannot be avoided. Searched the change log: the 2026-11-18 paragraph "The helper also listed places in older code that break the no-cheats rule" lists the direct `reset()` call, not the false report; nothing fixed it. Confirmed, medium (it needs a pulled alarm and a dead, broken or cut alarm together; the work does not get done and the body is misled, but it does not loop fast). Effort small: about twenty lines in the server and one in the window. Corrected: the window does not send the body straight back to the alarm (it holds off five to ten minutes), no wait is needed before looking, details do not reach the window from this errand today, and the round test must pull before cutting the power. Kept as the main write-up over RT-03, which is the same cause and the same change; RT-03's player-click quote, left-click warning, round-log count and simulator test are copied in.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 052e671676f.

- DOOR-11 (server part): part done. A fire alarm is reset by a right click with an empty hand, as a player does, two tries at most (reset_fire_alarm, crew_npc_doors.dm). If the room's fire doors are still shut after that, it answers FALSE ('has no power. It will not reset.', 'is broken.', 'would not reset.', or 'You cannot reach the fire alarm in X.') and puts the alarm in fire_alarms_failed. Only a real reset is logged, reopens ways and zeroes ways_out_failed. Left: (1) code/modules/llm_crew/crew_npc_hands.dm, finish_errand: for tool == CREW_TOOL_RESET_ALARM pass outcome[3] as action_result's details (reset_fire_alarm now returns a third element list("alarm_dead" = <room name>) on a failed reset). Today only security tools and force_door pass details, so the detail is dropped. (2) tgui/packages/tgui/interfaces/CrewBrain/brain.ts, near where real_alarm and alarm_out_of_reach are read (about line 642): add event.details.alarm_dead to that list, so the room is left alone for FIRE_CLOSED_MS. (3) sim.ts: let reset_alarm answer ok:false with alarm_dead, and check the body does not ask again inside ten minutes.
