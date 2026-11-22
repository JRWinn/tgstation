---
id: HAND-08
title: An errand target one tile off across a windoor, a thin window or a wall corner counts as reached at once, so the body gives up on it without a step, every time
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: a331a295d55
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_storage.dm:200, code/datums/ai/generic_behaviors/move_to_target.dm:50, code/modules/llm_crew/crew_npc_hands.dm:195, code/modules/llm_crew/crew_npc_hands.dm:429
fix: In crew_npc_reach count arrival only when can_reach_target_now is true, and when get_dist is within reach but a wall or window is between, walk to an open tile beside the target from which it can be reached
---

## What is wrong

Every errand walk and every storage walk uses the leaf `crew_npc_reach`, a `move_to_target`. That leaf counts the walk as done the moment `get_dist(pawn, target) <= required_dist`. `get_dist` counts tiles and nothing else: a wall, a window, a grille or a windoor between the two makes no difference to it. `required_dist` is 1 for everything but a mess on open floor.

So when the target is one tile off on the far side of something that sits on the edge between two tiles, the walk ends on its first tick without a step. (Corrected on check: a wall or a full-tile window fills a tile of its own, so anything on the far side of one is two tiles off and the walk goes on. What cuts off a target one tile away is a border object, `ON_BORDER_1`: a windoor, a thin directional window, a border firelock that has shut. Or two dense tiles at a corner, diagonally. Windoors are common: the desks of the Head of Personnel, the kitchen, cargo, medbay and the brig front all have one, with things and people on both sides.) `do_errand` then finds `can_reach_target_now` false (it uses `Adjacent`, which does respect walls and windows) and returns "You could not get to it." The body has not looked for a way round. Asked again, it is standing in the same spot, and the same happens. The storage leaf does the same: `look_inside` returns `"unreached"` and the locker is skipped.

The errands this hits: `pick_up` of a thing just the other side of a windoor or a thin window, `give` and `hand_mail` to someone across a desk windoor, a crate haul for a crate on the other side of a windoor or diagonally past a corner, `reset_alarm`, `door`, `tidy`, `machine` or `order` at a console behind a desk windoor, and a mess on a blocked tile (a mess under a table or a rack is reached from beside it). A crate errand that fails this way does not even count against the crate (`entry.unreachable` is only raised in `crew_npc_fail_errand`, which does not run, and even there only for `check_held`, `release` and `stow`).

One concrete case. A janitor wants its bucket (`pick_up bucket`). The bucket was left on the kitchen side of the kitchen's counter windoor, and the janitor is standing on the hallway side of that windoor, on the next tile. The kitchen's door, four tiles along the hallway, opens for it.

1. `tool_pick_up("bucket")`: the bucket is in `oview`, nearest. `start_errand(bucket, ...)`.
2. `crew_npc_reach/setup`: `required_dist = 1`. First `perform`: `get_dist(janitor, bucket)` is 1. `AI_BEHAVIOR_SUCCEEDED`.
3. `crew_npc_do_errand` → `do_errand`: `can_reach_target_now(bucket)` → `body.Adjacent(bucket)` is FALSE (`ClickCross` finds the shut windoor on the border). "You could not get to it."
4. The brain retries after its backoff. The janitor has not moved. Same again.

A player would have walked round through the door. The body need not be standing there to start with: the walk itself can bring it there, since the path is asked only for a tile within one of the target (`minimum_distance` = 1), and the nearest such tile may be on the wrong side of the windoor. Which tile the navmap pathfinder picks was not read (it is native code); JPS (`jps.dm:201`) tests only `diagonally_blocked`, not border objects.

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
- In a round: leave a bucket on the far side of a desk windoor (the kitchen counter or the Head of Personnel's desk), stand a janitor on the near side, on the next tile, and give it `pick_up bucket`. `game.log` must show it walk round through the door and pick the bucket up, not "could not get to it" at once. A full-tile window does not test this: the bucket is then two tiles off and the walk already goes round.
- The same with a person: a technician told to `give` something to someone standing behind the cargo desk windoor should walk round, or fail with "could not get to it" after a walk, not at once.
- A target with no open tile beside it that can reach it (an item in a sealed windoor booth) must fail at once through `crew_npc_fail_errand`, so a crate is counted as unreachable.

## Check

Confirmed, with the case mended. Read `crew_npc_reach` (`crew_npc_storage.dm:186`), its base `move_to_target/perform` (`code/datums/ai/generic_behaviors/move_to_target.dm`: arrival is `get_dist(...) <= required_dist` and nothing else), `do_errand` and `can_reach_target_now` (`crew_npc_hands.dm:183`, `:428`) and `reach_distance` (`:439`). The quotes are what the code says. Read the base `Adjacent` (`code/_onclick/adjacent.dm`): orthogonally it fails only on a dense `ON_BORDER_1` object between the tiles (`ClickCross`), diagonally when both corner tiles are blocked.

What was wrong in the write-up: a wall and a full-tile window each fill a tile (`/obj/structure/window/fulltile` has `flags_1 = PREVENT_CLICK_UNDER_1`, not `ON_BORDER_1`), so a target on the far side of either is two tiles off and the walk goes on. The janitor's case through a full-tile window could not happen. The fault is real for windoors, thin windows and a shut border firelock, and for a diagonal past two dense tiles. Desk windoors are on every map, so severity medium stands. I mended the title, the case and the test.

Nothing in the change log or the plans covers it (the "could not get to it" cases in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md` and `LLM_CREW_PLAN_ROUND_0912.md` have other causes). The fix keeps the rules: the body only walks. Note for whoever builds step 2: `turf.Adjacent(target)` tests from the turf, and `ClickCross` treats a door the body has access to as shut, which is what a player sees too, so a windoor the body could open is still walked round, not through. That is fine. Effort medium stands.

## Fix so far

Server, `crew_npc_storage.dm` (group m-hands), steps 1 to 4: `crew_npc_reach/perform`, when the walk would count as arrived (`required_dist` 1, one tile off) but `can_reach_target_now` is false, picks a square with `spot_to_reach(target)`: the open, unblocked square within one tile of the target, not the body's own, from which the target's turf is `Adjacent` (border objects and corners counted), nearest the body; the thing's own square counts if it can be stood on. It walks there (`stand_at`, minimum distance 0) and succeeds once the target can be touched. The first walk round gets a fresh `CREW_NPC_REACH_TIMEOUT`. With no such square it fails, so `crew_npc_fail_errand` (or `crew_npc_skip_storage`) runs and the target is noted as not reached. Both logged: "is by the X at ... but cut off from it: walking round to ..." and "... and there is nowhere beside it to reach it from." Applies to the errand walk and the storage walk; not to a grenade (thrown from 4 tiles) or an arrest (`make_arrest` closes in itself). `crew_npc_walk` (walking up to someone to talk) is left alone: step 5 is the owner's question.

Not checked: the pathfinder walking round to the chosen square through a door it opens (the navmap code was not read); a windoor the body's card opens is still treated as shut by `Adjacent`, so it walks round, as the check said.
