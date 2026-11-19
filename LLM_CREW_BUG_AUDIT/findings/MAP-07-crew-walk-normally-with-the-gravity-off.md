---
id: MAP-07
title: With the station's gravity off the crew walk about as if it were on, which no player can do
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:59, code/modules/llm_crew/crew_npc_motor.dm:39, code/controllers/subsystem/movement/movement_types.dm:215, code/modules/mob/mob_movement.dm:94
fix: Give every crew step the check a player's step gets (no gravity and nothing to push off means no step), in an allowed_to_move override on the crew movement type and in the idle shuffle, and tell the brain the body is floating
---

## What is wrong

A player's step goes through `client/Move`, which refuses it when the mob has no gravity and nothing to push off from (`if(!mob.Process_Spacemove(direct))`, `code/modules/mob/mob_movement.dm:94`). Without gravity a player drifts, can only move by pushing off a wall or a thing beside them, and cannot stop in the middle of a room.

A crew body's steps do not go through `client/Move`. The walk leaf uses the base navmap move loop, which calls `moving.Move(...)` directly (`movement_types.dm:215` and the other loop types); the idle shuffle calls `living_pawn.Move(destination_turf, move_dir)` itself (`crew_npc_motor.dm:39`). `/atom/movable/Move` and `/mob/living/Move` do not look at gravity. So with the gravity off, a crew body walks across open floor at its usual pace, turns corners, stops where it likes and hauls crates by pulling them, which the game would not let a player do. (`Move_Pulled` does check `Process_Spacemove`, so a pulled crate may stop following while the body goes on: that part is the game's.)

This is not rare. "Gravity Generator Blackout" fired in 4 of the logged test rounds (`grep "Random Event triggering" data/logs/.../game.log`), and the change log of 2026-11-18 says "A random event turned the gravity generator off at 30 minutes, and nothing turns it back on." So for the last part of that round every crew member walked as normal with no gravity aboard. The brain was never told anything was different.

The rule this breaks is the owner's first one: a crew body acts only as a player could.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:59`, the walk leaf's movement (no step check added):

    /datum/ai_movement/navmap_astar/crew_npc/start_moving_towards(datum/ai_controller/controller, atom/current_movement_target, min_distance, delay_override)
    	var/datum/move_loop/loop = ..()
    	...
    	if(loop)
    		RegisterSignal(loop, COMSIG_MOVELOOP_NAVMAP_FINISHED_PATHING, PROC_REF(route_planned), override = TRUE)

`code/modules/llm_crew/crew_npc_motor.dm:39`, the idle shuffle:

    	living_pawn.Move(destination_turf, move_dir)

`code/controllers/subsystem/movement/movement_types.dm:215` (base game, a move loop's step):

    	moving.Move(get_step(moving, direction), direction, FALSE, !(flags & MOVEMENT_LOOP_NO_DIR_UPDATE))

`code/modules/mob/mob_movement.dm:94` (base game, what a player's step has and the crew's does not):

    	if(!mob.Process_Spacemove(direct))
    		return FALSE

## How it was found

Read from the code: the base move loops and `/mob/living/Move` were read for any gravity check, and there is none outside `client/Move` and `Move_Pulled`. The gravity event is in the round logs. In `data/logs/2026/11/18/round-15.09.26/` it fired at 21:38:44 (`game.log` line 1259) and the round's brain log ends at 21:49:26; in those ten minutes `crew_brain.log` has bodies told "You arrive in" Engineering (three times), the Cargo Bay, Medbay Central, the Courtroom, the Chapel Funeral Room and four maintenance tunnels. The event calls the generator's `blackout()`, which calls `disable()` at once (`code/modules/power/gravitygenerator.dm:459`), and the AI movement's own pre-step check, `allowed_to_move`, has no gravity test. What each body felt was not checked step by step in the log.

## How to fix it

1. Override `allowed_to_move` on `/datum/ai_movement/navmap_astar/crew_npc` (the base proc, `code/datums/ai/movement/_ai_movement.dm:49`, is called before every step by `pre_move` and checks mobility, being pulled and the like, but not gravity). Call the parent, then: if the pawn is a mob with no gravity (`!pawn.has_gravity()`) and has nothing to push off from (`!pawn.get_spacemove_backup(direction of the next step)`), return FALSE. The base proc is `SHOULD_BE_PURE`, so use `get_spacemove_backup` rather than `Process_Spacemove`, which pushes the thing pushed off. A step refused here counts as a pathing failure in the base code, which ends the walk; with a wall or a thing beside it the step is allowed, as it is for a player pushing off.
2. In `try_random_step`, do not shuffle at all while the body has no gravity.
3. Let the body drift: once a step is taken without gravity, the game's own newtonian drift takes over; do not fight it with a new step every tick. A skipped step ends a walk by the timeout or `movement_failed`; give that its own reason, "you are floating, with nothing to push off from", so the brain does not count it as a shut door (`note_way_out_failed` must not count it).
4. Say it in the senses: add `floating` (no gravity where the body is) to the state sent to the brain, and a line in the situation text, so the voice can say so and the plan can wait rather than send the body about.
5. The cure belongs to engineering (GAP-19: the engineer turns the gravity generator's breaker back on). Until that is built, the crew stand where they are with no gravity, which is what players would mostly do too.

## How to test the fix

- Server compile.
- In a round, turn the gravity generator off with an admin (or wait for the event) and send a janitor across the Cargo Bay: it should not cross open floor, and `game.log` should give the floating reason.
- With gravity on nothing changes: run the usual walks and compare the "walk failed" count with the last round.
