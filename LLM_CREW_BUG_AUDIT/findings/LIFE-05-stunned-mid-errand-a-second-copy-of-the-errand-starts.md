---
id: LIFE-05
title: A body stunned in the middle of a long errand starts a second copy of the same errand when it gets up, while the first is still running
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_hands.dm:384, code/datums/ai/_ai_behavior.dm:105, code/datums/ai/_ai_behavior.dm:137, code/datums/ai/_ai_controller.dm:658, code/modules/llm_crew/crew_npc_security.dm:936
fix: Keep a per-controller flag that an errand run is in flight, have crew_npc_do_errand wait on it instead of starting another run, and give each run its own number that the long errands check after every sleep
---

## What is wrong

See also: SEC-03 (a called-off errand keeps running) and SEC-01 (a stunned officer keeps stepping). This is a third way the same long procs go wrong, and the fix SEC-03 proposes does not catch it: here the errand is not called off and `errand_serial` does not change.

`crew_npc_do_errand` runs the errand (`do_errand`, which can sleep for many seconds) in an async run, `start_async` → `perform_async`. The leaf knows a run is in flight only by its own `async_running` flag. When the controller is switched off, every running leaf is reset, and the base `reset_tick_state` calls `finish_action`, which clears `async_running`. The run itself is not stopped: it is asleep in a `sleep`, a `get_path_to` or a `do_after`, and wakes and goes on.

Being stunned switches the controller off: the crew controller's `get_able_to_run` says it cannot run while incapacitated, `update_able_to_run` sets `AI_STATUS_OFF`, and `set_ai_status` calls `cancel_current_plan()`. The errand blackboard key is not touched, and `errand_serial` does not change.

When the stun wears off, the controller comes back on, and the tree runs from the top. The errand key is still set, so the errand branch runs: the reach leaf finds the body beside the target (or walks it back), and `crew_npc_do_errand/perform` sees `async_running` false and no result, and calls `start_async()` again. A second `do_errand` starts on the same target, with the same `errand_serial`, while the first is still at work.

From then on two copies of one errand are working the body's hands at once: two `draw_item`s, two `click_as_body` loops, two sets of steps. Both read and write the same controller state (`baton_stopped`, `draw_stopped`, `jail_cell`, `arrested`, `forcing_place`). Whichever finishes first calls `finish_errand`, which reports to the brain and calls `cancel_errand()`. The other runs on to its end (SEC-03) and its outcome is dropped.

There is a second, smaller fault in the same lines. The first copy, ending, calls `async_still_valid()`, which is now true again because the second copy's `start_async` set `async_running`. So the first copy marks the leaf finished (`finish_async`), and the tree moves on as if the errand were over, with the second copy still running.

One concrete case, the fight round-19.33.50 had:

1. A security officer is arresting Pun Pun with force: `make_arrest` → `baton_hits`, a loop that can run for 15 seconds of chase.
2. Pun Pun tackles it. `attack_paw` → `Paralyze(40)`: `TRAIT_INCAPACITATED` for four seconds. The controller goes off, the `crew_npc_do_errand` leaf is reset, `async_running` is cleared. `baton_hits` is asleep between swings and goes on (SEC-01 says how it keeps stepping meanwhile).
3. Four seconds later the officer is up. The controller comes back on. The errand key still holds Pun Pun. The reach leaf succeeds at once (it is next to the monkey), `crew_npc_do_errand` starts a second `make_arrest`.
4. Now two `make_arrest`s swing, chase and cuff together. Each counts its own swings and its own 15 seconds, so the fight runs up to twice as long as `CREW_NPC_BATON_CHASE` allows, and each calls `hold_arrested` and `being_arrested` on the monkey. Each tackle in the fight starts another copy.

The same holds for every errand that sleeps long enough to be stunned in: `force_door_open` (some fifteen seconds of tools in the door), `put_in_cell`, `set_free`, `take_kit`, `work_machine`, and `clean_mess` (8 seconds). For cleaning the second copy clicks the mess again while the first waits on; the first then writes it off (LIFE-02).

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

Read from the code: the base behaviour's async procs, the controller's status change, and the crew leaf. Not seen in a round log as such; in `game.log` it would show as two "hit ... with its baton" lines a fraction of a second apart, or a forcing log line written twice for one door.

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
