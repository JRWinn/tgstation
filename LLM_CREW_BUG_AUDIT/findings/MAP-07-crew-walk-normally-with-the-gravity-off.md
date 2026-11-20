---
id: MAP-07
title: With the station's gravity off a crew body can push off from nothing and set itself moving in open floor, which no player can do (after that the game's own drift carries it)
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: 4317defc134, 5f5db05afb4
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:59, code/modules/llm_crew/crew_npc_motor.dm:39, code/controllers/subsystem/movement/movement_types.dm:215, code/modules/mob/mob_movement.dm:94
fix: Give every crew step the check a player's step gets (no gravity and nothing to push off means no step), in an allowed_to_move override on the crew movement type and in the idle shuffle, and tell the brain the body is floating
---

## What is wrong

A player's step goes through `client/Move`, which refuses it when the mob has no gravity and nothing to push off from (`if(!mob.Process_Spacemove(direct))`, `code/modules/mob/mob_movement.dm:94`). Without gravity a player drifts, can only move by pushing off a wall or a thing beside them, and cannot stop in the middle of a room.

A crew body's steps do not go through `client/Move`. The walk leaf uses the base navmap move loop, which calls `moving.Move(...)` directly (`movement_types.dm:215` and the other loop types); the idle shuffle calls `living_pawn.Move(destination_turf, move_dir)` itself (`crew_npc_motor.dm:39`). `/atom/movable/Move` and `/mob/living/Move` do not look at gravity before the step. So with the gravity off, a crew body standing in open floor with nothing within a tile to push off can take a step a player could not. (`Move_Pulled` does check `Process_Spacemove`, so a pulled crate may stop following while the body goes on: that part is the game's.)

**Correction by the checker:** the body does *not* then walk on as if gravity were on. After any step, `/atom/movable/Moved` calls `newtonian_move` (`code/game/atoms_movable.dm:932-933`), which, with no gravity and no backup, makes a `/datum/drift_handler` whose loop has `MOVEMENT_SPACE_PRIORITY` (100, `drift_handler.dm:32`). That beats the AI walk loop's default priority 10 in `contest_running_loop` (`code/datums/move_manager.dm:107-125`), so the walk loop is paused and the body drifts in a straight line until it is next to something to hold (`drift_handler.dm` `after_move`), as a player would. Beside a wall, or with tables and lockers within a tile, every step is one a player could also take by pushing off. What is left is the push from nothing: about once per body each time the gravity goes (a body caught mid-room, or at rest at a post in open floor), and an idle shuffle taken mid-room. Each starts a drift the body should not have been able to start.

This is not rare. "Gravity Generator Blackout" fired in 4 of the logged test rounds (`grep "Random Event triggering" data/logs/.../game.log`), and the change log of 2026-11-18 says "A random event turned the gravity generator off at 30 minutes, and nothing turns it back on." So for the last part of that round the crew moved with no gravity aboard: by the reading above, along walls and by drifting, with an unearned push now and then. The brain was never told anything was different, so a walk cut short by a drift reads to it as an ordinary failed walk.

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

Read from the code: the base move loops and `/mob/living/Move` were read for any gravity check, and there is none outside `client/Move` and `Move_Pulled`. The gravity event is in the round logs. In `data/logs/2026/11/18/round-15.09.26/` it fired at 21:38:44 (`game.log` line 1259) and the round's brain log ends at 21:49:26; in those ten minutes `crew_brain.log` has bodies told "You arrive in" Engineering (three times), the Cargo Bay, Medbay Central, the Courtroom, the Chapel Funeral Room and four maintenance tunnels. The event calls the generator's `blackout()`, which calls `disable()` at once (`code/modules/power/gravitygenerator.dm:459`), and the AI movement's own pre-step check, `allowed_to_move`, has no gravity test. What each body felt was not checked step by step in the log. (Checker: arriving in rooms is what bodies moving along walls and drifting would also do, so these arrivals do not show the bodies walked as with gravity.)

## How to fix it

1. Override `allowed_to_move` on `/datum/ai_movement/navmap_astar/crew_npc` (the base proc, `code/datums/ai/movement/_ai_movement.dm:49`, is called before every step by `pre_move` and checks mobility, being pulled and the like, but not gravity). Call the parent, then: if the pawn is a mob with no gravity (`!pawn.has_gravity()`) and has nothing to push off from (`!pawn.get_spacemove_backup(direction of the next step)`), return FALSE. The base proc is `SHOULD_BE_PURE`, so use `get_spacemove_backup` rather than `Process_Spacemove`, which pushes the thing pushed off. A step refused here counts as a pathing failure in the base code (`pre_move` calls `increment_pathing_failures`), and after `max_pathing_attempts` (20 on `navmap_astar`) the walk fails with `COMSIG_MOB_AI_MOVEMENT_FAILED`; with a wall or a thing beside it the step is allowed, as it is for a player pushing off. Copy the side-effect-free part of `/mob/Process_Spacemove` (`mob_movement.dm:264-280`) so a body that is buckled, pulled by someone (`pulledby`), flying or in magboots (`has_gravity` already counts `mob_negates_gravity`) is not stopped. For the direction, `get_dir(pawn, the loop's next path turf)`, or 0, which makes every neighbour a secondary backup.
2. In `try_random_step`, do not shuffle at all while the body has no gravity.
3. Nothing needs to be done to let the body drift: the game's drift loop already takes over from the walk loop by priority (see the correction above). A refused step ends a walk by `movement_failed` or the timeout; give that its own reason, "you are floating, with nothing to push off from", so the brain does not count it as a shut door (`note_way_out_failed` must not count it).
4. Say it in the senses: add `floating` (no gravity where the body is) to the state sent to the brain, and a line in the situation text, so the voice can say so and the plan can wait rather than send the body about.
5. The cure belongs to engineering (GAP-19: the engineer turns the gravity generator's breaker back on). Until that is built, the crew stand where they are with no gravity, which is what players would mostly do too.

## How to test the fix

- Server compile.
- In a round, turn the gravity generator off with an admin (or wait for the event). Spawn a crew body in the middle of an open room, two tiles or more from anything dense, and send it to a far room: it must not move at all, and `game.log` should give the floating reason. Then one beside a wall: it may set off along the wall, and drifts once it steps out into open floor. (Today the first body takes one step and drifts to the far wall: that step is the fault.)
- With gravity on nothing changes: run the usual walks and compare the "walk failed" count with the last round.

## Check

Read `crew_npc_motor.dm` (the idle shuffle and the crew movement type; the quotes are as the code is today), the base `allowed_to_move`/`pre_move` (`code/datums/ai/movement/_ai_movement.dm:49-95`: no gravity test), `/atom/movable/Move`, `/mob/living/Move`, `/mob/living/carbon/Move` and `/mob/living/carbon/human/Move` (none test gravity before the step), and `client/Move` (`mob_movement.dm:94`, the player's `Process_Spacemove` gate). So a crew step is never refused for want of something to push off. That part of the finding stands.

What does not stand is that the body then walks as with gravity. `Moved` calls `newtonian_move` after every step (`atoms_movable.dm:932-933`); with no gravity and no backup that starts a drift loop at `MOVEMENT_SPACE_PRIORITY` (`drift_handler.dm:27-33`), which takes the running slot from the AI's priority-10 walk loop (`move_manager.dm` `contest_running_loop`; "Higher numbers beat lower numbers", `__DEFINES/movement.dm:21`). The drift goes on until `Process_Spacemove(continuous_move = TRUE)` finds a backup within a tile (`drift_handler.dm` `after_move`). From there each step has a backup, which a player could use too. So the cheat is the push from nothing in open floor, not a whole walk: the title, the body and the fix steps 1 and 3 were mended to say so. Nothing crew-side touches drift (`grep drift|inertia|gravity code/modules/llm_crew` finds only a comment). The drift reading is from the code only, not run, so confidence is `likely`.

The change log (line 1039) and `LLM_CREW_PLAN_ENGINEERING.md:180` know of the gravity event and plan the engineer's cure; neither says anything about how bodies move without gravity. Severity: it does break the no-cheats rule, but only by one unearned push per body per blackout (or per idle shuffle mid-room), after which the game's own physics rule; I put it at medium rather than high for that reason. The owner may rank any no-cheats break as high.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 4317defc134.

- MAP-07 (server part): part done. crew_npc_floating (crew_npc_motor.dm) is TRUE with no gravity and nothing within a tile to push off from (get_spacemove_backup). Buckled, pulled, thrown, flying, spacewalk or free-float bodies, and magboots through has_gravity, do not count. The crew move type's allowed_to_move refuses such a step. A walk ended that way says 'you are floating, with nothing to push off from', which writes off no room. The idle shuffle takes no step at all with no gravity. Left: Step 4: code/modules/llm_crew/crew_brain_link.dm ui_data (or crew_npc_senses.dm situation): add 'floating' = crew_npc_floating(body) (or !body.has_gravity()) to the state sent to the window, and a line in the situation text. The window (driver.ts) could hold off walks while it is set.

Round three (branch crew-bug-fixes-medium): 5f5db05afb4. This finishes the parts left above, apart from any step that waits on the owner.
