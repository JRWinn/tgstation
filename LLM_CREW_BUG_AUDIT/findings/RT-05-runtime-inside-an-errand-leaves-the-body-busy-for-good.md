---
id: RT-05
title: A runtime error anywhere inside an errand or a storage look leaves the body counted as busy for the rest of the round, and the window never sends it anything again
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_hands.dm:391, code/modules/llm_crew/crew_npc_storage.dm:218, code/datums/ai/_ai_behavior.dm:105, code/modules/llm_crew/crew_brain_link.dm:195, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:726
fix: Wrap do_errand and look_inside in try-catch in their perform_async so a thrown error still closes the errand with a failed result, and give the window a limit on how long it believes a body is walking
---

## What is wrong

Every errand (pick up, give, order, open a door, clean a mess, take kit, put in a cell, haul a crate, and the rest: about thirty of them, all through `do_errand`) and every look inside a locker runs in an async leaf. The leaf marks itself running, starts `perform_async` with `INVOKE_ASYNC`, and from then on answers "still running" on every tick until `perform_async` calls `finish_async`. Nothing else ever clears that.

If any proc under `do_errand` hits a runtime error, `perform_async` stops at that line. `finish_async` is never called and neither is `finish_errand`. So:

1. The leaf answers `AI_BEHAVIOR_DELAY` on every tick for good (`handle_async` sees `async_running` still TRUE).
2. `BB_CREW_NPC_ERRAND_TARGET` is never cleared, because only `finish_errand`/`cancel_errand` clear it.
3. `ui_data` therefore sends `"walking" = TRUE` for the body on every update ("an errand" counts as walking).
4. The window's driver treats a walking body as busy and takes no step for it: `const busy = brain.walking || ...` and then `if (... (busy && !dropFor && !dropToLeave && !dropToMove) ...) return null;`. The one safety net, the lost-step timeout, is written to wait until the body stops walking: `now - brain.lastAct.at > LOST_ACT_MS && !brain.walking && !brain.doing`.
5. No `action_result` ever comes for the errand.

The body stands where it is, with its work undone, for the rest of the round. It comes back only if the errand's target is deleted (the blackboard key is then cleared, see RT-02), if a superior gives it an order the driver drops work for (`orderToDrop`), if it is told to leave or asked to step aside, or if it is stunned long enough for the controller to switch off, which resets the leaf (LIFE-05) and then runs the same errand again into the same error.

The same holds for the storage leaf: a runtime under `look_inside` leaves `BB_CREW_NPC_STORAGE_TARGET` set, which also reads as walking.

This is the place where any runtime in our errand code turns from one failed step into a body lost for the round. The round logs show that runtimes in our code do happen: seven different ones over fifteen builds (all fixed now, see the list in this reviewer's final note), one of them, `swap_hand` with no number in `empty_clicking_hand`, under `do_errand` → `take_kit`. That one was a `stack_trace`, which does not stop the proc, so it did not freeze the officer. A plain null read in the same place would have.

One concrete case of the chain, with a runtime picked for illustration (any runtime under `do_errand` does the same):

1. A security officer is sent for its kit: `tool_get_kit` → `start_errand(locker, CREW_TOOL_GET_KIT, null)`.
2. It reaches the locker. `crew_npc_do_errand/perform` calls `start_async()`; `async_running = TRUE`.
3. Under `take_kit`, some base-game proc throws, for example a null read on an item deleted during one of the waits in `draw_item`.
4. `perform_async` ends at the error. `finish_async` and `finish_errand` are never reached.
5. Every quarter second the tree ticks; the errand leaf answers DELAY. `errand_tool` stays `get_kit`. The window shows the officer as walking.
6. The driver never gives the officer another step. Warrants, sightings and meetings all wait on a body that will never be free.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:391`, `crew_npc_do_errand/perform_async`:

    /datum/bt_node/ai_behavior/crew_npc_do_errand/perform_async(datum/ai_controller/controller)
    	var/datum/ai_controller/crew_npc/crew_controller = controller
    	var/serial = crew_controller.errand_serial
    	var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])
    	if(async_still_valid())
    		finish_async(AI_BEHAVIOR_SUCCEEDED)
    	...
    	if(!QDELETED(crew_controller) && crew_controller.errand_serial == serial)
    		crew_controller.finish_errand(outcome)

`code/modules/llm_crew/crew_npc_storage.dm:218`, `crew_npc_look_inside/perform_async`, the same shape:

    	var/list/result = crew_controller.look_inside(container)
    	if(!async_still_valid())
    		return
    	finish_async(AI_BEHAVIOR_SUCCEEDED)
    	crew_controller.storage_done(container, result)

`code/datums/ai/_ai_behavior.dm:105`, the base, which waits on the flag with no limit:

    /datum/bt_node/ai_behavior/proc/handle_async()
    	if(async_running)
    		return AI_BEHAVIOR_DELAY

`code/modules/llm_crew/crew_brain_link.dm:195`, `ui_data`:

    			"walking" = (npc.blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) && npc.walk_tool != CREW_TOOL_RETURN) || npc.blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || npc.blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET) || npc.seeing_to_crate,

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:669` and `:726`, `drive`:

      if (
        brain.lastAct &&
        now - brain.lastAct.at > LOST_ACT_MS &&
        !brain.walking &&
        !brain.doing
      ) {
    ...
      const busy = brain.walking || !!brain.doing || !!brain.lastAct;

## How it was found

Read from the code: the async helpers in `_ai_behavior.dm`, both perform_async procs, `ui_data`, and `drive`. The round logs were searched for a runtime under `do_errand` or `look_inside`: none of the 66 rounds has one that stops the proc (the only one under `do_errand`, in round-17.06.14, is a `stack_trace` from `swap_hand`, which returns). So the freeze itself has not been seen; the chain is certain once any such runtime happens.

## How to fix it

Two parts. The first is the one that matters; the second is a backstop for waits that never end.

1. In `crew_npc_do_errand/perform_async`, wrap the call:

        var/list/outcome
        try
        	outcome = crew_controller.do_errand(controller.blackboard[target_key])
        catch(var/exception/error)
        	log_game("Crew NPC [key_name(controller.pawn)] errand [crew_controller.errand_tool] stopped on an error: [error.name] at [error.file]:[error.line].")
        	stack_trace("crew NPC errand [crew_controller.errand_tool]: [error.name]")
        	outcome = list(FALSE, "Something stopped you, and you could not finish.")

   Then go on as now: `finish_async` and `finish_errand(outcome)`. The runtime is still logged (`stack_trace`) so it gets fixed, but the body is free and the brain is told the step failed, which puts it in back-off rather than freezing the body. `do_errand` returns a list in every path, so `outcome[1]`/`outcome[2]` are safe.
2. Do the same in `crew_npc_look_inside/perform_async` around `look_inside`, with `result = list("state" = "unreached")` on error, so `storage_done` moves the search on.
3. Window side: in `drive`, do not let `brain.walking` alone hold off the lost-step timeout for ever. Keep a `walkingSince` time (set when `walking` turns true, cleared when it turns false) and, once it is older than the longest walk the server allows (`CREW_NPC_TRAVEL_TIMEOUT` plus the errand's own longest wait, a few minutes), treat the step as lost: `fail(brain, brain.lastAct.key)`, `lastAct = null`. The server already gives every walk a time limit, so a walk that the window has seen for longer than that is not a walk.

Keep: errands whose proc starts a walk (haul, collect, release, evict) change `errand_serial` and return early on purpose; the try-catch must not change that.

## How to test the fix

- Compile. Add a temporary `CRASH("test")` at the top of `take_paper`, spawn the test crew, and let the Quartermaster fetch paper: `game.log` must show the "stopped on an error" line, the brain must get a failed `get_paper` result, and the Quartermaster must go on to other work. Take the line out again.
- Simulator: the sim plays the server, so add a stand-in tool that never answers while reporting `walking: true`, and check that the driver gives up on it after the new limit and goes on to the next step.
- In the next rounds, grep `game.log` for "stopped on an error": each one is a runtime that would have frozen a body.
