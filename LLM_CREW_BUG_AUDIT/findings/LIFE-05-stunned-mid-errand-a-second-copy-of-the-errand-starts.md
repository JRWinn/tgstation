---
id: LIFE-05
title: A body stunned in the middle of a long errand starts a second copy of the same errand when it gets up, while the first is still running
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_hands.dm:384, code/datums/ai/_ai_behavior.dm:105, code/datums/ai/_ai_behavior.dm:137, code/datums/ai/_ai_controller.dm:658, code/modules/llm_crew/crew_npc_cleaning.dm:519, code/modules/llm_crew/crew_npc_security.dm:936
fix: Keep a per-controller flag that an errand run is in flight, cleared however the run ends, and have crew_npc_do_errand and the errand's crew_npc_reach wait on it instead of starting a second run or walking against the first
---

## What is wrong

See also: SEC-03 (a called-off errand keeps running) and SEC-01 (a stunned officer keeps stepping). This is a third way the same long procs go wrong, and the fix SEC-03 proposes does not catch it: here the errand is not called off and `errand_serial` does not change.

`crew_npc_do_errand` runs the errand (`do_errand`, which can sleep for many seconds) in an async run, `start_async` → `perform_async`. The leaf knows a run is in flight only by its own `async_running` flag. When the controller is switched off, every running leaf is reset, and the base `reset_tick_state` calls `finish_action`, which clears `async_running`. The run itself is not stopped: it is asleep in a `sleep`, a `get_path_to` or a `do_after`, and wakes and goes on.

Being stunned switches the controller off: the crew controller's `get_able_to_run` says it cannot run while incapacitated, `update_able_to_run` sets `AI_STATUS_OFF`, and `set_ai_status` calls `cancel_current_plan()`. The errand blackboard key is not touched, and `errand_serial` does not change.

When the stun wears off, the controller comes back on, and the tree runs from the top. The errand key is still set, so the errand branch runs: the reach leaf finds the body beside the target (or walks it back), and `crew_npc_do_errand/perform` sees `async_running` false and no result, and calls `start_async()` again. A second `do_errand` starts on the same target, with the same `errand_serial`, while the first is still at work.

From then on two copies of one errand are working the body's hands at once: two `draw_item`s, two `click_as_body` loops, two sets of steps. Both read and write the same controller state (`baton_stopped`, `draw_stopped`, `jail_cell`, `arrested`, `forcing_place`). Whichever finishes first calls `finish_errand`, which reports to the brain and calls `cancel_errand()`. The other runs on to its end (SEC-03) and its outcome is dropped.

There is a second, smaller fault in the same lines. The first copy, ending, calls `async_still_valid()`, which is now true again because the second copy's `start_async` set `async_running`. So the first copy marks the leaf finished (`finish_async`), and the tree moves on as if the errand were over, with the second copy still running.

It happens only when the first run is **still going when the body is up again**. A run that ends during the stun does no harm: its `finish_async` is a no-op, but `errand_serial` is unchanged, so it calls `finish_errand`, which calls `cancel_errand()` and clears the errand key, and there is nothing left for the tree to start again. Many steps do end at once on a stun: `do_after` fails the moment `TRAIT_INCAPACITATED` is added (`code/datums/timed_actions.dm:79`), `click_as_body` returns FALSE through `can_perform_action`, and the stun's `TRAIT_PULL_BLOCKED` makes the body let go of what it pulls (`code/modules/mob/living/init_signals.dm:207`), which `put_in_cell` and the hauls notice. What outlasts a stun is a wait or a walk that checks nothing: the 8-second scrub wait in `clean_mess`, `sleep(CREW_NPC_BATON_WAIT)` between baton hits, and `close_with` and `walk_steps`, whose `body.Move` works on a stunned body (`/mob/living/Move` does not check `TRAIT_IMMOBILIZED`; SEC-01).

One concrete case:

1. A janitor is scrubbing a mess: `clean_mess` clicks the mop on it and then waits in the loop at `crew_npc_cleaning.dm:519` until `CREW_NPC_CLEAN_TIME` (8 seconds) is up, waking every half second and checking only that the mess and the body are not deleted.
2. Two seconds in, it is stunned for about two seconds (an electrified grille or door, a `Paralyze` from anything else). The controller goes off, the `crew_npc_do_errand` leaf is reset, `async_running` is cleared. The mop's `do_after` fails at once; the wait loop sleeps on.
3. At four seconds the body is up. The controller comes back on. The errand key still holds the mess. The reach leaf (`move_to_target/perform`, `code/datums/ai/generic_behaviors/move_to_target.dm:51`) succeeds at once because the body is beside it, and `crew_npc_do_errand` starts a second `clean_mess`, which clicks the mess again.
4. The first copy, still in its wait, now stays on while `body.do_afters` is not empty, sees the mess go and returns "You clean up", calls `finish_async` on the leaf the second copy owns, and reports. If the second scrub takes longer than the first copy's `last_chance`, the first instead writes the mess off as stubborn and reports failure while the second is still scrubbing it (LIFE-02).

An officer is the worse case: stunned between hits in `baton_hits` while its target steps away, the first copy keeps chasing with `close_with` through the stun, and once the officer is up a second `make_arrest` starts beside it, so two loops swing, count their own 15 seconds of `CREW_NPC_BATON_CHASE`, and cuff.

Not this way: a monkey (Pun Pun) does not set it off in an arrest. `monkey_attack` only right-clicks someone holding a weapon (`code/datums/ai/monkey/monkey_bt_nodes.dm:255`), and the right-click in `human/attack_paw` (`human_defense.dm:154`) first knocks the item out of the active hand, which is the baton during `baton_hits`; the loop then stops at `!body.is_holding(baton)`. Only a body already knocked down with an empty active hand gets `Paralyze(40)`, and by then the run has ended. An earlier draft of this file gave that fight as the case; it was wrong.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:384`:

    /datum/bt_node/ai_behavior/crew_npc_do_errand/perform(seconds_per_tick, datum/ai_controller/controller)
    	var/async_flags = handle_async()
    	if(async_flags)
    		return async_flags
    	if(QDELETED(controller.blackboard[target_key]))
    		return AI_BEHAVIOR_DELAY | AI_BEHAVIOR_FAILED
    	return start_async()

    /datum/bt_node/ai_behavior/crew_npc_do_errand/perform_async(datum/ai_controller/controller)
    	var/datum/ai_controller/crew_npc/crew_controller = controller
    	var/serial = crew_controller.errand_serial
    	var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])
    	if(async_still_valid())
    		finish_async(AI_BEHAVIOR_SUCCEEDED)
    	...
    	if(!QDELETED(crew_controller) && crew_controller.errand_serial == serial)
    		crew_controller.finish_errand(outcome)

`code/datums/ai/_ai_behavior.dm:137` and `:97` (base), where a reset forgets the run:

    /datum/bt_node/ai_behavior/reset_tick_state()
    	if(running)
    		finish_action(owning_controller, FALSE)
    ...
    /datum/bt_node/ai_behavior/proc/finish_action(datum/ai_controller/controller, succeeded)
    	SHOULD_CALL_PARENT(TRUE)
    	running = FALSE
    	async_running = FALSE

`code/datums/ai/_ai_controller.dm:658` (base), a stun turning the controller off and resetting the plan:

    	if(ai_status == AI_STATUS_OFF)
    		if(!(additional_flags & AI_PREVENT_CANCEL_ACTIONS))
    			cancel_current_plan()

`code/modules/llm_crew/crew_npc_controller.dm:313`, why a stun turns it off:

    /datum/ai_controller/crew_npc/get_able_to_run()
    	var/mob/living/living_pawn = pawn
    	// Cuffed or grabbed crew can still shuffle about and talk; stunned or unconscious crew cannot.
    	if(INCAPACITATED_IGNORING(living_pawn, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB))
    		return AI_UNABLE_TO_RUN

## How it was found

Read from the code: the base behaviour's async procs, the controller's status change, and the crew leaf. Not seen in a round log. In `game.log` it would show as two "hit ... with its baton" lines for one errand a fraction of a second apart.

## How to fix it

1. On the controller, add `var/errand_in_flight = FALSE` and `var/errand_run = 0`.
2. In `crew_npc_do_errand/perform`, after `handle_async()`: if `crew_controller.errand_in_flight`, return `AI_BEHAVIOR_DELAY` and wait. Do not start another run while one is out.
3. In `perform_async`, set `errand_in_flight = TRUE` and `var/run = ++crew_controller.errand_run` before `do_errand`, and set `errand_in_flight = FALSE` after it, before `finish_errand`. (A runtime inside `do_errand` would leave the flag set for good; wrap the call so the flag is cleared whatever happens, or clear it in `cancel_errand` and `start_errand` as well, which every new errand goes through.)
4. Replace `if(async_still_valid()) finish_async(...)` with a check that this run is still the leaf's run: since step 2 means only one run is ever out, `async_still_valid()` is then right again.
5. Use `errand_run` with SEC-03's `errand_over(serial)`: a long errand checks after each sleep that `errand_serial` is unchanged (it was not called off) and that the body is able to act (SEC-01). With step 2 there is no second copy to tell apart, so `errand_run` is only needed if the owner prefers the old run to bail on a stun and a fresh one to start when the body is up. The question for the owner: when a body is knocked down mid-errand, does it carry on with the same go once it is up (step 2), or start the errand over? Step 2 is the smaller change and keeps what the old run had done.

## How to test the fix

- Compile.
- The simulator cannot show it (no server code runs there).
- In a round with Pun Pun: set an officer on Pun Pun with force, let the monkey tackle it, and grep `game.log` for the officer's baton lines. Before the fix, after each tackle the lines come in pairs; after, one at a time, and the fight ends within `CREW_NPC_BATON_CHASE` of its start.
