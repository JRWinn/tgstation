---
id: GAP-05
title: Fire doors, the owner's chain to engineering is not built, and the server still tells every body whether an alarm is real
kind: gap
severity: high
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:694, code/modules/llm_crew/crew_npc_doors.dm:729, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:267, LLM_CREW_PLAN_ROUND_1428_SECURITY.md:139
fix: Drop crew_npc_alarm_was_pulled, reset once and leave the room if the doors shut again, and build the ask up the chain to an engineer who pries the door
---

## What is wrong

Two things, one decision. `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, H7, records the owner's direction of 2026-11-18:

- "**Decided:** whoever is stopped asks engineering to open the door."
- "**Decided:** the asking goes up the chain and back down... **Decided:** the Captain is copied in."
- "**Decided: the engineer does not know whether an alarm is real.**" The owner: "thats cheating".
- "**Decided: the door shutting itself is the answer.**" Pry once; if it shuts again, flag the room unsafe and leave it.
- "**Decided:** a room whose alarm is pulled again straight away is left alone for ten minutes."

**Not built (the gap).** Nothing asks engineering about fire doors. The plan's Status line says "Not built: ... H7". The door-forcing chain built at 18:50 (`jobs/forcing.ts`, `force_door`) is for a locked airlock with a warrant behind it, and `tool_force_door` works on airlocks, not fire doors. In `round-14.28.06` the Starboard Primary Hallway was sealed from 14:44 to at least 14:53, the officer went to the alarm four times and two janitors five, all told "You could not get to it", and the Captain's PDA to the Chief Engineer ("There is a firelockout in the kitchen that needs to be opened") got no answer.

**Contradicts the decision (the cheat).** Every body stopped by fire doors is still told by the server whether the alarm was pulled by hand, and resets only one that was. That is knowledge the body has no sense for: it comes from `area.fault_status` and each fire door's `alarm_type`. The owner ruled exactly this out for engineers. The plan says "Proposed: drop the server's say-so... Not built: it is the owner's to say", and the change log's 15:40 entry lists it under "Short of the no-cheats rule".

One case: a monkey pulls the alarm in a hallway. A janitor outside is stopped. `fire_door_report` sends `alarm_pulled = TRUE`, and the driver's step text says "Someone pulled the fire alarm there, and nothing is wrong with the air", from the far side of a shut fire door. If the same doors had shut for a plasma leak the janitor would be told "something is wrong with the air there" and would never walk at them. A player gets no such word.

A third small thing in the same code: `tool_reset_alarm` answers "The fire alarm in X is off already" from `room.fire` wherever the body stands, and `reset_fire_alarm` calls `alarm.reset(body)` instead of the right-click a player makes.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:694`:

    /proc/crew_npc_alarm_was_pulled(area/room)
        if(!(room.fire || LAZYLEN(room.active_firelocks)) || room.fault_status != AREA_FAULT_MANUAL)
            return FALSE
        for(var/obj/machinery/door/firedoor/door as anything in room.firedoors)
            if(door.alarm_type && door.alarm_type != FIRELOCK_ALARM_TYPE_GENERIC)
                return FALSE
        return TRUE

`code/modules/llm_crew/crew_npc_doors.dm:729`, in `fire_door_report`:

    details["alarm_pulled"] = crew_npc_alarm_was_pulled(alarmed)

`code/modules/llm_crew/crew_npc_doors.dm:749` and `:778`, in `tool_reset_alarm` and `reset_fire_alarm`:

    if(!crew_npc_alarm_was_pulled(room))
        action_result(CREW_TOOL_RESET_ALARM, FALSE, "The alarm in [known] is not one that someone pulled: something is wrong with the air there. You leave it alone.", list("real_alarm" = known))

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:272`:

    text: `The fire doors are shut in ${fire.place} and are in your way. Someone pulled the fire alarm there, and nothing is wrong with the air. You are going to the alarm to reset it.`,

and `situation.ts:130`, which tells the LLM the same.

## How it was found

Read from the plan and the code. The sealed hallway is in the plan from `data/logs/2026/11/18/round-14.28.06`. I did not reread that log.

## How to fix it

Part 1, the cheat (small, server and window):

1. Delete `crew_npc_alarm_was_pulled` and the `alarm_pulled` and `real_alarm` details. `fire_door_report` keeps `fire_doors` (the room's name is on the door and the alarm's light can be seen).
2. `tool_reset_alarm`: go to the alarm if one can be reached, whatever set it off, but keep the test on the body's own tile (`crew_npc_safe_turf(get_turf(body))`): a body standing in bad air knows it. Reset with a right-click on the alarm as the body (`click_as_body(alarm, "right=1")`), not `alarm.reset(body)`.
3. The window already has "the alarm coming straight back" (`brain.ts:103` to `:105`, a room left alone when a reset alarm shuts again). Make that the only test, and make the leave-alone time ten minutes, as decided. Change the step texts in `driver.ts:272` and `situation.ts:130` to say only what is seen: "The fire doors are shut in X and are in your way. You are going to the alarm to reset it." and, after a reset that came back, "The fire doors in X shut again after you reset the alarm. The air there is bad. You are keeping out."

Part 2, the chain (large, mostly window, modelled on `jobs/forcing.ts` which is the same chain for a locked door):

4. A body that is stopped and has been told "You cannot get to a fire alarm for X" (`alarm_out_of_reach`, already sent) tells its head, once for a room in ten minutes: "Joan, the fire doors are shut in the X and I cannot get to the alarm." A head that is stopped itself starts at step 5. This is a shared duty, beside `jobs/meetings.ts` and `jobs/wanted.ts`, not one job's.
5. The head sends the Chief Engineer a PDA message and the Captain a copy. The Chief Engineer answers "Noted: the fire doors in the X." Several heads asking about one room make one job. Reuse `askEngineering` and the `forcingReads` readers by adding a second kind of job (fire doors) to `jobs/forcing.ts` rather than a new file.
6. The Chief Engineer gives it to its engineer, to its face or by PDA. With no engineer it goes itself (as built for doors).
7. Server: a new errand, or a branch in `tool_force_door`, for a shut fire door of the named room: draw the crowbar (`draw_item` in `crew_npc_forcing.dm`), click the door, step through, walk to the alarm, right-click it. If the door is shut again when it looks back, report "staying shut: the air in there is bad".
8. Word back the same way to each head that asked, and from each head to its waiting staff, who drop the room from the list of rooms they are keeping out of.
9. The engine comes first: the engineer's task ranks under lighting the engine (`jobs/engineer.ts`).

Questions for the owner:

- May part 1 go in now? The plan left it as "the owner's to say". It changes what janitors do today: they will try to reset an alarm set off by real bad air once, from outside, if they can reach it.
- A room whose own doors are locked to engineering (the Bar): the plan notes it cannot be got into by its doors. Leave it, or chain it to the door-forcing job?

## How to test the fix

- `tools/llm_crew/security.ts` has the cases for the door chain: add the fire-door lines beside them.
- Simulator: a scenario with a sealed hallway, an alarm on the far side, a head, a Chief Engineer and an engineer. Check one ask per room, the Captain's copy, and that the staff member walks on after "are open". A second scenario where the door shuts again and the room is left for ten minutes.
- Server compile. In a round, pull an alarm in a hallway and `grep -n "fire" game.log pda.log`.
- `grep -rn "alarm_was_pulled\|alarm_pulled\|real_alarm" code/modules/llm_crew tgui/packages/tgui/interfaces/CrewBrain tools/llm_crew` should print nothing.
