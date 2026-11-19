---
id: HAND-08
title: An errand target one tile off through a wall or a window counts as reached at once, so the body gives up on it without a step, every time
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_storage.dm:200, code/datums/ai/generic_behaviors/move_to_target.dm:50, code/modules/llm_crew/crew_npc_hands.dm:195, code/modules/llm_crew/crew_npc_hands.dm:429
fix: In crew_npc_reach count arrival only when can_reach_target_now is true, and when get_dist is within reach but a wall or window is between, walk to an open tile beside the target from which it can be reached
---

## What is wrong

Every errand walk and every storage walk uses the leaf `crew_npc_reach`, a `move_to_target`. That leaf counts the walk as done the moment `get_dist(pawn, target) <= required_dist`. `get_dist` counts tiles and nothing else: a wall, a window, a grille or a windoor between the two makes no difference to it. `required_dist` is 1 for everything but a mess on open floor.

So when the target is one tile off on the far side of a wall or a window (or diagonally past a wall corner), the walk ends on its first tick without a step. `do_errand` then finds `can_reach_target_now` false (it uses `Adjacent`, which does respect walls and windows) and returns "You could not get to it." The body has not looked for a way round. Asked again, it is standing in the same spot, and the same happens. The storage leaf does the same: `look_inside` returns `"unreached"` and the locker is skipped.

The errands this hits: `pick_up` of a thing just the other side of glass, `give` and `hand_mail` to someone across a window, every crate haul (`unload`, `recycle`, `stow`, `release`, `collect`, `take_back`, `put_clear`) for a crate on the other side of a wall or the shuttle's hull, `reset_alarm`, `door`, `tidy`, `machine`, and a mess on a blocked tile (a mess under a table or a rack is reached from beside it). A crate errand that fails this way does not even count against the crate (`entry.unreachable` is only raised in `crew_npc_fail_errand`, which does not run).

One concrete case. A janitor wants its bucket (`pick_up bucket`). The bucket was left on the floor of a room, on the tile just inside a full-tile window, and the janitor is standing in the hallway on the other side of that window. The room's door, four tiles along the hallway, opens for it.

1. `tool_pick_up("bucket")`: the bucket is in `oview`, nearest. `start_errand(bucket, ...)`.
2. `crew_npc_reach/setup`: `required_dist = 1`. First `perform`: `get_dist(janitor, bucket)` is 1. `AI_BEHAVIOR_SUCCEEDED`.
3. `crew_npc_do_errand` → `do_errand`: `can_reach_target_now(bucket)` → `body.Adjacent(bucket)` is FALSE (the window is in between). "You could not get to it."
4. The brain retries after its backoff. The janitor has not moved. Same again.

A player would have walked round through the door.

## Where

`code/datums/ai/generic_behaviors/move_to_target.dm:50` (base), the arrival test the leaf inherits:

    	if(finish_on_arrival && get_dist(controller.pawn, target) <= required_dist)
    		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED

`code/modules/llm_crew/crew_npc_storage.dm:193`, `crew_npc_reach`, which adds only a time limit:

    /datum/bt_node/ai_behavior/move_to_target/crew_npc_reach/setup(datum/ai_controller/controller)
    	var/datum/ai_controller/crew_npc/crew_controller = controller
    	required_dist = crew_controller.reach_distance(controller.blackboard[target_key])
    ...
    /datum/bt_node/ai_behavior/move_to_target/crew_npc_reach/perform(seconds_per_tick, datum/ai_controller/controller)
    	if(world.time - started_at > time_limit)
    		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
    	return ..()

`code/modules/llm_crew/crew_npc_hands.dm:195`, `do_errand`, which then finds it cannot reach:

    	if(QDELETED(target) || QDELETED(body) || !can_reach_target_now(target))
    		return list(FALSE, "You could not get to it.")

`code/modules/llm_crew/crew_npc_hands.dm:429`, `can_reach_target_now`:

    	return get_turf(body) == get_turf(target) || body.Adjacent(target)

The walk leaf for people (`crew_npc_walk`, `crew_npc_motor.dm`, `required_dist` 1 for a person) has the same test, so `walk_to` someone across a window ends at once with "You arrive next to X." That one is mostly harmless (talk carries through glass), but a `give` that follows it fails as above.

## How it was found

Read from the code, the leaf and its base. Not seen in a round. In `game.log` it would show as "could not get to it" with no "walk failed" line before it, the body standing one tile from the target.

## How to fix it

1. In `crew_npc_reach/perform`, before calling `..()`: if `required_dist >= 1` and `get_dist(pawn, target) <= required_dist` and `!crew_controller.can_reach_target_now(target)`, the body is beside it but cut off. Do not let the base call it arrived.
2. In that case, pick a tile to stand on: the open, unblocked turfs within one tile of the target (`get_adjacent_open_turfs` or a `range(1, target)` loop) from which the target is `Adjacent` (test with `target.Adjacent` from that turf's side, or `turf.Adjacent(target)`), nearest to the body by path if cheap, else by distance. Keep it on the leaf (`var/turf/stand_at`).
3. If there is one, call `controller.ai_movement.start_moving_towards(controller, stand_at, 0)` and keep running; the leaf succeeds when the body stands on `stand_at` and `can_reach_target_now(target)`. If there is none, fail (`AI_BEHAVIOR_FAILED`), so that `crew_npc_fail_errand` runs and the target is noted as not reached.
4. The same for the mess case, where `reach_distance` is 1 because the mess's tile is blocked.
5. Leave `crew_npc_walk` alone for people being walked up to for talk, or apply the same test only when the walk is the start of a hand-over. **Question for the owner:** should "walk up to" someone across a window walk round to their side, or is in earshot enough? Today the code and the comment in `walk_finished` say near enough to talk is enough.

Keeps the rules: the body only walks.

## How to test the fix

- Server compile to a side copy.
- In a round: leave a bucket just inside a window, stand a janitor outside it, and give it `pick_up bucket`. `game.log` must show it walk round through the door and pick the bucket up, not "could not get to it" at once.
