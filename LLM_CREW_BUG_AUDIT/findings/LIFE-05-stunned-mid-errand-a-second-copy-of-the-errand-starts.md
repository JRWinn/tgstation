---
id: LIFE-05
title: A body stunned in the middle of a long errand starts a second copy of the same errand when it gets up, while the first is still running
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: b74dd0e831d
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

1. On `/datum/ai_controller/crew_npc` (`crew_npc_controller.dm`, beside `errand_serial` at line 234), add `var/errand_in_flight = FALSE`.
2. In `crew_npc_do_errand/perform`, after `handle_async()`: if `crew_controller.errand_in_flight`, return `AI_BEHAVIOR_DELAY` and wait. Do not start another run while one is out. When that run ends it either calls `finish_errand` (which clears the key, and the `bb_key_set` decorator aborts the branch) or, if the errand was changed meanwhile, leaves the new errand's key set, and the next `perform` sees the flag clear and starts the new errand's run.
3. In `perform_async`, set `errand_in_flight = TRUE` before `do_errand` and `FALSE` straight after it, before `async_still_valid()` and `finish_errand`. Clear it however the run ends: wrap the call as `try` / `catch(var/exception/e)` that clears the flag and then `throw e`, so a runtime in `do_errand` does not leave every later errand waiting for good. Do not clear it in `start_errand` or `cancel_errand`: an old run that is still out when a new errand is given is exactly the case to wait for.
4. In `move_to_target/crew_npc_reach/perform` (`crew_npc_storage.dm:200`), when `target_key` is `BB_CREW_NPC_ERRAND_TARGET` and `errand_in_flight` is set, call `controller.ai_movement.stop_moving_towards(controller)` and return `AI_BEHAVIOR_DELAY`, so the tree's walking does not pull the body against the old run's own steps. Do not count that wait against `time_limit` (set `started_at` again when it ends) or the reach fails the errand.
5. `async_still_valid()` in `perform_async` is then right again, because only one run is ever out; leave it as it is.

What this costs: a new errand given while an old run is still out (SEC-03) now starts only when the old run ends, which can be some seconds for an arrest. SEC-03's own fix (the long procs stop once `errand_serial` changes) and SEC-01's (they stop while the body cannot act) shorten that wait, and with both built this flag is the safety net, not the main fix. A question for the owner, only if SEC-01 is built to stop the run on a stun: should the body then start the errand over when it is up? With this flag alone it carries on with the same run.

## How to test the fix

- Compile.
- The simulator cannot show it (no server code runs there).
- In a round: while a janitor is two seconds into a scrub, or an officer is in `baton_hits` with the target a few tiles off, use the admin proc call on the body to run `Paralyze(2 SECONDS)`. Watch the Crew Brain window and `game.log`. Before the fix, the janitor clicks the mess a second time and the officer logs two "hit ... with its baton" lines for one errand; after, one run each. A temporary `log_game` line at the top of `perform_async` (taken out before commit) makes the count plain.
- Give a body a new errand while an old arrest run is still out, and check the new one starts when the old one ends, not never.

## Check

Confirmed, at medium, not high. Read today's code at each quoted place. The quotes match.

- The chain holds. `COMSIG_MOB_INCAPACITATE_CHANGED` calls `update_able_to_run` (`crew_npc_controller.dm:307`). `get_able_to_run` returns `AI_UNABLE_TO_RUN` for a stunned body (`:316`). `get_expected_ai_status` gives `AI_STATUS_OFF` when `!able_to_run` (`_ai_controller.dm:475`). `set_ai_status` calls `cancel_current_plan` (`:658`), and `reset_bt_tick_states` (`:542`) walks every node, so the running leaf's `reset_tick_state` calls `finish_action`, which clears `async_running` (`_ai_behavior.dm:105`, `:137`). Nothing touches the errand key or `errand_serial`. On waking, the tree runs again: the reach leaf succeeds at once when the body is within `required_dist` (`move_to_target.dm:51`), and `crew_npc_do_errand/perform` finds `handle_async()` empty and calls `start_async()` again. The first run's later `async_still_valid()` then reads the second run's flag. Nothing in `LLM_CREW_CHANGELOG.md` or the plans touches `start_async`, `async_running` or a stun during an errand.
- The worked case was wrong, and I replaced it. A monkey's right-click knocks the baton out of the active hand before it can pin (`human_defense.dm:154`), so `baton_hits` stops at `!body.is_holding(baton)` well before the officer is up. A Paralyze lands only on a body that is already down with an empty active hand.
- Narrower than the write-up said. Many errands end during the stun on their own: `do_after` fails on `TRAIT_INCAPACITATED` (`timed_actions.dm:79`), `click_as_body` fails through `can_perform_action`, and `TRAIT_PULL_BLOCKED` drops a pull (`init_signals.dm:207`). Those then report and clear the key, so no second copy starts. The fault needs a wait or walk that outlasts the stun: the `clean_mess` wait (`crew_npc_cleaning.dm:519`), the baton waits, and `close_with` and `walk_steps`. Those are real, but a stun during one is not a most-rounds event, so medium.
- The fix needed mending. The draft said to clear the flag in `start_errand` or `cancel_errand`. That would let a called-off old run and the new one run together again. Clearing it with try/catch avoids that. The draft also missed that `crew_npc_reach` walks the body against the old run's own steps before `crew_npc_do_errand` is reached. I dropped `errand_run`: with one run out at a time it tells nothing apart.
- Not run: no script, compile or round. Everything above is read from the code.
