---
id: CORE-01
title: A walk given while another walk is under way is never walked, the body carries on to the old spot and the new walk is then failed
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:94, code/modules/llm_crew/crew_npc_tools.dm:397, code/datums/ai/movement/ai_movement_navmap_astar.dm:45, code/datums/ai/generic_behaviors/move_to_target.dm:44, code/modules/llm_crew/crew_npc_cargo.dm:241
fix: In start_walk, when a different walk is already running, clear BB_CREW_NPC_WALK_TARGET before setting the new one, so the decorator cancels the old walk leaf and the next tick sets it up afresh with the new target and the right required_dist
---

## What is wrong

`start_walk` sets the walk target key to a new turf or person while an older walk may still be running. The code expects the base game to turn the running walk towards the new target:

    // Told to walk to someone else mid-walk; the parent retargets, we restart the clock.

It does not. For crew NPCs the movement type is `navmap_astar`, and its `update_movement_target` only re-plans the route of the loop that is running. It never changes the loop's `target`. The other movement types do (`ai_movement_dumb.dm:20` and `ai_movement_basic_avoidance.dm:23` both do `loop.target = new_target`); navmap does not. So after a mid-walk retarget:

- the body goes on walking to the **old** spot, re-planning the route to the old spot each time;
- the walk leaf checks arrival against the **new** target, which the body is not walking to;
- `required_dist` is also left from the old target (it is only worked out in `setup`, and `setup` does not run again, see below), so a walk to a turf that took over from a walk to a person stops one tile short, and the other way round asks to stand on the person's own tile.

The walk then ends one of two ways: the body reaches the old spot, the route from there to there is empty, every step is a `MOVELOOP_FAILURE`, and after `max_pathing_attempts` (20) the movement fails and the new walk is reported as `CREW_NPC_NO_WAY`; or the time limit runs out ("it was taking too long"). Either way `walk_finished` treats it as a real failure to reach the new place: a `go_to` writes the room into `blocked_places` (left alone for five minutes, and the window then says "there is no way in for me"), a no-way-through adds to `blocked_tries`, calls `note_way_out_failed` (one is enough to set `shut_in` and `wants_out` when the body has a trail), and may start `clear_the_way`.

Why the leaf is not set up again: the walk decorator is `bb_key_set` with `BT_ABORT_BOTH`. When the key goes from one value to another, the condition stays TRUE, so `ABORT_SELF` does not fire, and `ABORT_LOWER_PRIORITY` only fires when a lower-priority node is running. The walk leaf itself is running, so nothing aborts and `setup` is not called again (`_ai_bt_decorators.dm:166`).

### One concrete case, which comes up whenever a body has a post

1. A cargo technician has drifted more than `CREW_NPC_POST_LEASH` tiles from its post spot in the Cargo Bay. The idle wander calls `return_to_post`, which 0.1 s later calls `start_walk(post_turf, CREW_TOOL_RETURN, ...)`. A move loop to `post_turf` starts.
2. The window does not count a return walk as walking (`"walking"` in `ui_data` leaves out `CREW_TOOL_RETURN`), so the driver is free to give the next step. The Quartermaster's PDA message has just come in: go to the Warehouse. The window sends `go_to` "Warehouse".
3. `tool_go_to` calls `start_walk(warehouse_spot, CREW_TOOL_GO_TO, "Warehouse", CREW_NPC_TRAVEL_TIMEOUT)`. `walk_tool` becomes `go_to`, the key becomes the Warehouse spot.
4. The leaf's `perform` sees a new target, resets `started_at`, and the base `perform` calls `start_moving_towards`, which finds a loop already running and only calls `update_movement_target`. The loop keeps `target = post_turf`.
5. The technician walks back to its counter and stands there. The route is empty, 20 failed steps later the movement fails, and the brain is told "You stop on the way to Warehouse: there is no way through. You are in Cargo Bay." The Warehouse goes into `blocked_places` and `blocked_tries`.

(Checker's note: this case needs the `go_to` to land in the few seconds a return walk takes, since `return_to_post` only fires within the post's own room and `CREW_NPC_POST_LEASH` is 2. The cases below are the more common ones: in each the driver issues the new walk straight on top of the old one, with no stop sent first, `driver.ts` around line 733.)

The same happens for every other walk that is replaced by a walk: being asked to step aside while walking (`dropToMove` in `driver.ts`), an order from someone it answers to that drops the walk it is on (`orderToDrop`), being told to leave the room (`dropToLeave`), and an officer whose patrol walk is dropped for a sighting when the next step is a walk.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:94`, in `crew_npc_walk/perform`:

    	var/atom/target = controller.blackboard[target_key]
    	if(!QDELETED(target) && target != walking_to_ref?.resolve())
    		// Told to walk to someone else mid-walk; the parent retargets, we restart the clock.
    		walking_to_ref = WEAKREF(target)
    		started_at = world.time

`code/modules/llm_crew/crew_npc_motor.dm:86`, `required_dist` is set in `setup` only:

    	required_dist = isturf(controller.blackboard[target_key]) ? 0 : 1

`code/datums/ai/generic_behaviors/move_to_target.dm:44` (base):

    	if(target != tracked_target)
    		controller.ai_movement.start_moving_towards(controller, target, required_dist)

`code/datums/ai/movement/_ai_movement.dm:11` (base), `start_moving_towards` with a loop already running:

    	if(old_movement_target)
    		if(old_movement_target == current_movement_target)
    			return FALSE
    		else
    			update_movement_target(controller, current_movement_target)
    			return FALSE

`code/datums/ai/movement/ai_movement_navmap_astar.dm:45` (base), which re-plans but keeps the loop's old `target`:

    /datum/ai_movement/navmap_astar/update_movement_target(datum/ai_controller/controller, atom/new_target)
    	. = ..()
    	var/datum/move_loop/has_target/navmap_astar/loop = GLOB.move_manager.processing_on(controller.pawn, SSai_movement)
    	if(loop)
    		INVOKE_ASYNC(loop, TYPE_PROC_REF(/datum/move_loop/has_target/navmap_astar, recalculate_path))

`code/controllers/subsystem/movement/movement_types_navmap.dm:144`, `recalculate_path` plans to the loop's own `target`:

    	var/turf/goal = get_turf(target)

`code/modules/llm_crew/crew_npc_tools.dm:397`, `start_walk`, which sets the key with nothing stopping the old walk:

    	cancel_search()
    	cancel_errand()
    	set_blackboard_key(BB_CREW_NPC_WALK_TARGET, target)

## How it was found

Read from the code: `start_walk`, the walk leaf, the base `move_to_target`, `_ai_movement.dm`, `ai_movement_navmap_astar.dm`, `movement_types_navmap.dm` and the `bb_key_set` decorator's abort rules. Not seen in a round log. I did not grep a round's `game.log` for a `walk failed (go_to, ...)` line logged right after a `return_to_post` walk; that is the cheapest way to see it.

## How to fix it

1. In `start_walk` (`crew_npc_tools.dm`), before `set_blackboard_key`, if `blackboard_key_exists(BB_CREW_NPC_WALK_TARGET)` and the target is a different one, end the old walk properly so the leaf is set up again for the new one. The simplest way that keeps the leaf's bookkeeping right: `clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)` first. The decorator's `ABORT_SELF` then cancels the plan, the leaf's `finish_action` stops the move loop and calls `walk_finished`, which returns early because the key no longer holds the old target (so nothing is reported for the old walk, as now). Then set the new key, and the next tick runs `setup` with the new target and the right `required_dist`.
2. `start_walk` sets `walk_tool`, `walk_goal` and `walk_timeout` before the key. With step 1 the old walk's `walk_finished` runs after those are already the new walk's; it returns at its first line, so this is safe, but move the three assignments after the clear to make it plain.
3. Drop the comment in `crew_npc_walk/perform` that says the parent retargets, and the retarget branch with it, since a new target now always means a fresh `setup`. Keep the `started_at` reset in `setup`.
4. Do not change the base `navmap_astar/update_movement_target`: the base mobs that use it rely on re-planning to the same moving target.

## How to test the fix

- Server compile.
- In a round, stand a cargo technician two tiles beyond its leash, wait for it to set off back to its post, and at once tell it by PDA to go to the Warehouse. Before the fix it walks to its counter and `game.log` has `walk failed (go_to, to Warehouse): there is no way through`. After, it turns and goes to the Warehouse.
- Grep `game.log` for `walk failed (step_aside` and `walk failed (go_to` and compare counts across a round before and after.
- The simulator does not run server code, so it cannot test this.

## Check

Confirmed, by reading the code; nothing was run (it is all server code and base movement).

- `start_walk` (`crew_npc_tools.dm:397`) only sets the key. `walk_finished` (`:409`) returns early for a replaced walk, so nothing else stops the old one.
- The BT leaf (`_ai_behavior.dm`, `tick`) runs `setup` only while `running` is FALSE. The walk decorator is `bb_key_set` with `BT_ABORT_BOTH` (`crew_npc.bt.json:7`). On a change from one target to another, `on_observed_change` (`_ai_bt_decorators.dm:166`) sees the condition still TRUE, so no `ABORT_SELF`; `ABORT_LOWER_PRIORITY` needs the active index to be past the decorator's `last_execution_index`, and the active index is the walk leaf itself, so no abort. The leaf stays running.
- The leaf's `perform` then reaches base `move_to_target/perform` (`move_to_target.dm:44`), which calls `start_moving_towards`. With a loop already running, `_ai_movement.dm:11` only calls `update_movement_target`. The navmap override (`ai_movement_navmap_astar.dm:45`) sets `moving_controllers[controller]` and the blackboard, then re-plans; `recalculate_path` (`movement_types_navmap.dm`) plans to `get_turf(target)`, the loop's own target, which nothing changes. The crew type `navmap_astar/crew_npc` (`crew_npc_motor.dm:57`) has no override.
- At the old spot the path is empty, `move()` returns `MOVELOOP_FAILURE`, `post_move` counts it, and after `max_pathing_attempts` (20) `fail_movement` sends `COMSIG_MOB_AI_MOVEMENT_FAILED`, which the leaf turns into `CREW_NPC_NO_WAY`. Also, `moving_controllers[controller]` now holds the new target, so the base `else if(!moving_controllers[controller])` restart never fires either.
- The driver does issue a walk on top of a walk: `drive` in `driver.ts` lets `orderToDrop`, `dropToLeave` and `dropToMove` through a busy body and goes straight to `issue(step.act)` with no stop first. CORE-07 and JOBS-06 lean on this finding, and the code bears them out.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions retargeting a walk; not a known or chosen behaviour.

On the fix: I changed the fix line to match "How to fix it" step 1. Stopping only the move loop (the old fix line) would let `perform` start a fresh loop, but with the old `required_dist`, since `setup` would still not run. Clearing the key works: `clear_blackboard_key` fires the decorator, `ABORT_SELF` calls `cancel_current_plan` → `reset_bt_tick_states` → the leaf's `reset_tick_state` (`_ai_behavior.dm:137`) calls `finish_action(FALSE)`, which stops the move loop and calls `walk_finished`, which returns at once because the key is empty. The reset also unregisters the decorator's observers, so setting the new key in the same proc does no second cancel, and the next tick runs `setup` with the new target. Only do the clear when the new target differs from the old one; with the same target nothing is wrong today. Severity high stands: an order from the Captain to a walking body ends in a false "no way through", a room in `blocked_places` and possibly `shut_in`.
