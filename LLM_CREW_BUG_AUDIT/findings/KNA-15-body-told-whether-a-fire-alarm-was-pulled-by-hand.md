---
id: KNA-15
title: A body stopped by fire doors is told by the server whether the alarm was pulled by hand, which the owner has ruled is cheating
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:694, code/modules/llm_crew/crew_npc_doors.dm:729, code/modules/llm_crew/crew_npc_doors.dm:749, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:262
fix: Drop the server's answer and let the body judge by what it can see at the alarm, the air where it stands and any fire in view, or leave fire doors to engineering as the owner laid out
---

## What is wrong

Listed in the change log entry of 2026-11-18, 15:40, "Short of the no-cheats rule": "Found in older code, not changed: a body stopped by fire doors is told by the server whether the alarm was pulled by hand, for the whole room, and resets only one that was. `crew_npc_alarm_was_pulled` in `crew_npc_doors.dm`. The owner ruled the same knowledge out for engineering on 2026-11-18 ('thats cheating'). The plan proposes dropping it. It is the owner's to say." The same entry lists H7 as not built: "asking engineering to open fire doors, up the chain and back, as the owner laid it out."

It is still in the code, and it is used twice: to tell the brain (`alarm_pulled` in the details of a failed walk), and to decide at the alarm whether to reset it. It reads `room.fault_status == AREA_FAULT_MANUAL` and the `alarm_type` of every fire door in the room. Neither is something a body standing in a hallway can see. A player sees shut fire doors, a ringing alarm on the wall, and has to judge from the air and from whether anything is burning.

The case: Pun Pun pulls the alarm in the Central Primary Hallway. A janitor's walk fails at the fire doors. The answer it gets carries `alarm_pulled = TRUE`, the driver's first rule fires ("Someone pulled the fire alarm there, and nothing is wrong with the air"), and it walks to the alarm and resets it. Had the same doors shut for a breach three rooms along, it would have been told `FALSE` and left them. It knows which without looking.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:694`:

    /proc/crew_npc_alarm_was_pulled(area/room)
    	if(!(room.fire || LAZYLEN(room.active_firelocks)) || room.fault_status != AREA_FAULT_MANUAL)
    		return FALSE
    	for(var/obj/machinery/door/firedoor/door as anything in room.firedoors)
    		if(door.alarm_type && door.alarm_type != FIRELOCK_ALARM_TYPE_GENERIC)
    			return FALSE
    	return TRUE

`crew_npc_doors.dm:729`, `fire_door_report`: `details["alarm_pulled"] = crew_npc_alarm_was_pulled(alarmed)`.

`crew_npc_doors.dm:749`, `tool_reset_alarm`, and `:778`, `reset_fire_alarm`: the same test gates the reset.

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:262`, `nextStep`: `if (fire?.pulled && ...)`.

## How it was found

Read from the code.

## How to fix it

This needs the owner's word, because there are two honest designs and they behave differently.

**Design A, the owner's H7 as laid out in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`:** nobody but engineering touches a fire alarm. A body stopped by fire doors tells its head, the head asks the Chief Engineer, an engineer goes and looks. Then `tool_reset_alarm` is engineering's only, `alarm_pulled` is dropped from `fire_door_report`, and the reflex in `driver.ts` goes. The chain for a forced door (`jobs/forcing.ts`) is the pattern to copy.

**Design B, judge by sight:** keep the reset for everyone, but decide by what the body can sense where it stands and at the alarm: the air on its own tile (`crew_npc_safe_turf(get_turf(body))`, which `tool_reset_alarm` already tests), no fire or smoke in view (`/obj/effect/hotspot` in `view()`), and the temperature and pressure shown on the nearest fire door it can see (a fire door's lights show hot or cold to a player: `alarm_type` of a door in `view()` is fair, of a door out of sight is not). It will sometimes reset an alarm that then shuts again. That is what a player does.

Either way:

1. Delete `details["alarm_pulled"]` from `fire_door_report`, or under B replace it with the in-view test.
2. In `tool_reset_alarm` and `reset_fire_alarm`, replace `crew_npc_alarm_was_pulled(room)` with the in-view test (B) or a job test (A).
3. `reset_fire_alarm` also calls `alarm.reset(body)` directly: see KNA-04, item 6, for the right-click.
4. `driver.ts:262`: read the new field, or remove the block (A).

**The question for the owner:** A or B? The change log says the owner already ruled this knowledge out for engineering, which points at B's test being the only one anyone may use, and at A for who does it.

## How to test the fix

- Server compile.
- `tools/llm_crew/sim.ts` has a fire door scenario (a janitor resets an alarm a monkey pulled: seen working in `round-15.09.26`). Update what the simulator's server sends to match and run it.
- In a round: pull an alarm in a hallway with clean air and see it reset; open a breach (or use a plasma fire) two rooms from a janitor and see that it does not reset that room's alarm from outside without having seen the room.
