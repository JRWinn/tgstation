---
id: GAP-05
title: Fire doors, the owner's chain to engineering is not built, and the server still tells every body whether an alarm is real
kind: gap
severity: high
effort: large
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:694, code/modules/llm_crew/crew_npc_doors.dm:729, code/modules/llm_crew/crew_npc_doors.dm:749, code/modules/llm_crew/crew_npc_doors.dm:778, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:263, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:630, LLM_CREW_PLAN_ROUND_1428_SECURITY.md:139
fix: Drop crew_npc_alarm_was_pulled, reset once and leave the room if the doors shut again, and build the ask up the chain to an engineer who pries the door
---

## What is wrong

See also: DOOR-11 (the same `reset_fire_alarm` reports a reset that did not happen; its right-click step is the same as step 2 below), KNA-04 item 6 (the direct `reset()` call). KNA-15 is a duplicate of the cheat half of this one.

Two things, one decision. `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, H7, records the owner's direction of 2026-11-18:

- "**Decided:** whoever is stopped asks engineering to open the door."
- "**Decided:** the asking goes up the chain and back down... **Decided:** the Captain is copied in."
- "**Decided: the engineer does not know whether an alarm is real.**" The owner: "thats cheating".
- "**Decided: the door shutting itself is the answer.**" Pry once; if it shuts again, flag the room unsafe and leave it.
- "**Decided:** a room whose alarm is pulled again straight away is left alone for ten minutes."

**Not built (the gap).** Nothing asks engineering about fire doors. The plan's Status line says "Not built: ... H7". The door-forcing chain built at 18:50 (`jobs/forcing.ts`, `force_door`) is for a locked airlock with a warrant behind it, and `tool_force_door` works on airlocks, not fire doors. In `round-14.28.06` the Starboard Primary Hallway was sealed from 14:44 to at least 14:53, the officer went to the alarm four times and two janitors five, all told "You could not get to it", and the Captain's PDA to the Chief Engineer ("There is a firelockout in the kitchen that needs to be opened") got no answer.

**Contradicts the decision (the cheat).** Every body stopped by fire doors is still told by the server whether the alarm was pulled by hand, and resets only one that was. That is knowledge the body has no sense for: it comes from `area.fault_status` and each fire door's `alarm_type`. The owner ruled exactly this out for engineers. The plan says "Proposed: drop the server's say-so... Not built: it is the owner's to say", and the change log's 15:40 entry lists it under "Short of the no-cheats rule".

One case: a monkey pulls the alarm in a hallway. A janitor outside is stopped. `fire_door_report` sends `alarm_pulled = TRUE`, and the driver's step text says "Someone pulled the fire alarm there, and nothing is wrong with the air", from the far side of a shut fire door. If the same doors had shut for a plasma leak the janitor would be told "something is wrong with the air there" and would never walk at them. A player gets no such word. (From KNA-15: the same answer is used twice, to tell the brain, and again at the alarm, `tool_reset_alarm` at `:749` and `reset_fire_alarm` at `:778`, to decide whether to reset.)

The server's answer is not even reliable. A pulled alarm calls `activate(FIRELOCK_ALARM_TYPE_GENERIC)` on every fire door of the room (`firealarm.dm`, `alarm()`), so each has `alarm_type` GENERIC and `active`. If the air then turns bad, `process_results` in `code/game/machinery/doors/firedoor.dm` stops at `if(alarm_type) // If you've already got an alarm, go away`, and `start_activation_process` returns at `if(active)` before it would set `AREA_FAULT_AUTOMATIC`. So a room whose alarm was pulled and which then catches fire is still `AREA_FAULT_MANUAL` with only GENERIC doors, and `crew_npc_alarm_was_pulled` says TRUE. What actually protects the body in that case is the honest test: the body's own tile (`crew_npc_safe_turf`) and the doors shutting again three seconds after the reset (`crack_open` then `release_constraints`), which the window already reads as "came straight back".

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

1. Delete `crew_npc_alarm_was_pulled` and the `alarm_pulled` detail, and the `real_alarm` detail at `:750`. Keep a detail for the own-tile case at `:753` ("The air where you stand is not right"), which is honest and must still make the window leave the room alone: keep `real_alarm` for that one case only, or rename it (for example `bad_air_here`) and add the new name to the list at `brain.ts:642`. `fire_door_report` keeps `fire_doors` (the room's name is on the door and the alarm's light can be seen).
2. `tool_reset_alarm`: go to the alarm if one can be reached, whatever set it off, but keep the test on the body's own tile (`crew_npc_safe_turf(get_turf(body))`): a body standing in bad air knows it. In `reset_fire_alarm`, drop the test at `:778` and reset with a right-click on the alarm as the body (`empty_clicking_hand()`, then `click_as_body(alarm, "right=1")`), not `alarm.reset(body)`; then look at the room before saying it worked (DOOR-11 has those steps).
3. The window already has "the alarm coming straight back" (`brain.ts:633` to `:639`: stopped by the same room's doors within `ALARM_CAME_BACK_MS`, one minute, of a reset, and the room is left alone for `FIRE_CLOSED_MS`, which is already ten minutes, `brain.ts:103`). Make that the only test. In `driver.ts:263` drop `fire?.pulled &&`; drop `pulled` from `brain.ts:630` and `types.ts:1185`. Change the step texts in `driver.ts:272` and `situation.ts:128` to `:131` to say only what is seen: "The fire doors are shut in X and are in your way. You are going to the alarm to reset it." and, after a reset that came back, "The fire doors in X shut again after you reset the alarm. The air there is bad. You are keeping out." The line at `situation.ts:137` ("which someone had pulled for no reason you could see") becomes "You have just reset the fire alarm in X."
   - KNA-15 offered a middle way, "judge by sight": the lights on a fire door show its `alarm_type` to a player (`firedoor.dm:658`, the `hazards` overlay), so the `alarm_type` of the nearest shut door in view would be a fair thing to send. It is not worth much: as shown above a door stays GENERIC when bad air comes after a pull. The owner's "the door shutting itself is the answer" is the better test.
   - What this changes in play: a janitor will now reset an alarm the air set off, if it can reach it and its own tile is fine. The room's doors open for about three seconds and then shut again (`crack_open`, `release_constraints` in `firedoor.dm`). A player does the same.

Part 2, the chain (large, mostly window, modelled on `jobs/forcing.ts` which is the same chain for a locked door):

4. A body that is stopped and has been told "You cannot get to a fire alarm for X" (`alarm_out_of_reach`, already sent) tells its head, once for a room in ten minutes: "Joan, the fire doors are shut in the X and I cannot get to the alarm." A head that is stopped itself starts at step 5. This is a shared duty, beside `jobs/meetings.ts` and `jobs/wanted.ts`, not one job's.
5. The head sends the Chief Engineer a PDA message and the Captain a copy. The Chief Engineer answers "Noted: the fire doors in the X." Several heads asking about one room make one job. Reuse `askEngineering` and the `forcingReads` readers by adding a second kind of job (fire doors) to `jobs/forcing.ts` rather than a new file.
6. The Chief Engineer gives it to its engineer, to its face or by PDA. With no engineer it goes itself (as built for doors).
7. Server: a new errand, or a branch in `tool_force_door`, for a shut fire door of the named room: draw the crowbar (`draw_item`, which is in `crew_npc_security.dm:302`; `tool_force_door` in `crew_npc_forcing.dm` looks only at `/obj/machinery/door/airlock`), click the door, step through, walk to the alarm, right-click it. If the door is shut again when it looks back, report "staying shut: the air in there is bad".
8. Word back the same way to each head that asked, and from each head to its waiting staff, who drop the room from the list of rooms they are keeping out of.
9. The engine comes first: the engineer's task ranks under lighting the engine (`jobs/engineer.ts`).

Questions for the owner:

- May part 1 go in now? The plan left it as "the owner's to say". It changes what janitors do today: they will try to reset an alarm set off by real bad air once, from outside, if they can reach it.
- A room whose own doors are locked to engineering (the Bar): the plan notes it cannot be got into by its doors. Leave it, or chain it to the door-forcing job?

## How to test the fix

- `tools/llm_crew/security.ts` has the cases for the door chain: add the fire-door lines beside them.
- Simulator: a scenario with a sealed hallway, an alarm on the far side, a head, a Chief Engineer and an engineer. Check one ask per room, the Captain's copy, and that the staff member walks on after "are open". A second scenario where the door shuts again and the room is left for ten minutes.
- Server compile. In a round, pull an alarm in a hallway and `grep -n "fire" game.log pda.log`.
- `grep -rn "alarm_was_pulled\|alarm_pulled" code/modules/llm_crew tgui/packages/tgui/interfaces/CrewBrain tools/llm_crew` should print nothing (and `real_alarm` only for the own-tile case, if that name is kept). `tools/llm_crew/sim.ts:580` and `:594` send `alarm_pulled: 1` today: take it out, and the existing fire door scenario (a janitor resets an alarm a monkey pulled) must still pass.
- Part 1 alone, in a round: pull an alarm in a hallway and see a body reset it once; then, with a heat source or a plasma leak in a hallway, see a body that reaches the alarm reset it once, the doors shut again within seconds, and the body keep out of that room for ten minutes (no second `reset the fire alarm in` line for it in `game.log` inside that time).

## Check

Opus 5.5, 2026-11-19. Read `crew_npc_doors.dm:693-786` (the quotes match today's code, line numbers right), `crew_npc_hands.dm:240-242` and `:404-417`, `brain.ts:625-648` and its constants at `:102-105`, `driver.ts:92-95`, `:262-276` and `:992-998`, `situation.ts:126-140`, `jobs/forcing.ts` (`askEngineering` at `:152`, `forcingReads` at `:192`), `crew_npc_forcing.dm` (airlocks only), and in the base game `firealarm.dm` (`alarm()`, `reset()`, `attack_hand_secondary`) and `firedoor.dm` (`activate`, `process_results`, `start_activation_process`, `crack_open`, `release_constraints`, `remove_as_source`, the `hazards` overlay). Searched `LLM_CREW_CHANGELOG.md` and the plans: the change log's 15:40 entry lists the cheat as "found in older code, not changed" and H7 as not built; `LLM_CREW_PLAN_ROUND_1428_SECURITY.md:175` records the owner's "thats cheating" for engineers and `:181` leaves the janitors' half to the owner. Nothing later fixed either. The cheat breaks the "Senses only" and no-cheats rules, so high stands; the chain needs both sides, so large stands (part 1 alone is small to medium). Confirmed. Kept as the main write-up over KNA-15, which is the same cause and the same change for its cheat half; KNA-15's own points (the reset gate at `:749`/`:778`, the "judge by sight" option) are copied in above. Corrected: the ten-minute leave-alone is already `FIRE_CLOSED_MS`; `draw_item` is in `crew_npc_security.dm`; the own-tile `real_alarm` detail must be kept in some form; the simulator sends `alarm_pulled`. Added that the server's test is wrong as well as unfair when bad air follows a pull.
