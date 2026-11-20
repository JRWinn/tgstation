---
id: RT-02
title: An errand whose target is deleted while the body is still walking to it ends without a word to the brain
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_hands.dm:392, code/modules/llm_crew/crew_npc_hands.dm:161, code/modules/llm_crew/crew_npc_storage.dm:218, code/datums/ai/_ai_controller.dm:1009, code/datums/ai/_ai_bt_decorators.dm:167
fix: Override sig_remove_from_blackboard on the crew controller so that a lost errand or storage target is closed off and reported a moment later
---

## What is wrong

A body sets off on an errand: to a mess, a crate, an item, a person. If the thing is deleted before the body gets there, the errand simply stops. `finish_errand` is never called, so the brain gets no `action_result`, `errand_tool` and `clean_queue` are left as they were, and the rest of a cleaning job is dropped. The brain window holds the body as busy (`brain.lastAct` is still set) until 12 seconds have passed since the step was sent (`LOST_ACT_MS` in `driver.ts`, counted from `lastAct.at`, so after a walk longer than that it gives up as soon as the walk is cleared), then counts the step as failed and leaves it alone for 20 seconds or more (`RETRY_MS` times the count).

The code already deals with a target that vanishes while the errand is being done. It does not deal with one that vanishes during the walk.

One concrete case. Two janitors are in the same hallway.

1. Janitor A's `tool_clean` builds `clean_queue` nearest first and `next_mess()` calls `start_errand(mess, CREW_TOOL_CLEAN, null)`. The mess is put in `BB_CREW_NPC_ERRAND_TARGET` and A starts walking (`crew_npc_reach`).
2. Janitor B, nearer, cleans that mess. The decal is deleted.
3. A's controller tracks the blackboard target, so `sig_remove_from_blackboard` runs: it takes the key out of the blackboard and sends `COMSIG_AI_BLACKBOARD_KEY_CLEARED`.
4. The tree's `bb_key_set` decorator has `observer_abort` set to both. Its `on_observed_change` sees the condition lost with a child running and calls `controller.cancel_current_plan()`. Every running leaf is reset with `finish_action(FALSE)`.
5. `crew_npc_do_errand` never ran, and `crew_npc_fail_errand` never runs either: the decorator's condition is false, so the whole errand branch is skipped from then on.
6. A stands where it is, or idles about (the idle walk leaf runs next). `errand_tool` is still `clean`. The other messes in `clean_queue` are not gone on to. The brain hears nothing, waits 12 seconds, and puts cleaning that room in backoff.

The same holds for a crate deleted on the way to it (unload, recycle, stow, release, collect, take back), an item that is deleted before pick up, and a container deleted during a storage search (`BB_CREW_NPC_STORAGE_TARGET`: `storage_done` and `finish_search` are never called, so `search_tool` stays set and an explore that ended in a search is never reported).

A second, smaller effect: `on_item_in_hand` and `put_down_unasked_item` both treat a set `errand_tool` as "its hands are busy". With `errand_tool` left set by a dead errand, something put in the body's hand is never noticed until another errand has run.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:392`, the only place an errand is closed off when its target goes:

    /datum/bt_node/ai_behavior/crew_npc_do_errand/perform_async(datum/ai_controller/controller)
    	var/datum/ai_controller/crew_npc/crew_controller = controller
    	var/serial = crew_controller.errand_serial
    	var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])
    	if(async_still_valid())
    		finish_async(AI_BEHAVIOR_SUCCEEDED)
    	// The thing an errand is about can vanish as the errand is done: a cleaned mess is deleted, which
    	// clears the blackboard key and resets this leaf. The errand must still be closed off and reported,
    	// unless the body has been given something else to do in the meantime.
    	if(!QDELETED(crew_controller) && crew_controller.errand_serial == serial)
    		crew_controller.finish_errand(outcome)

That runs only once the body has arrived. `code/modules/llm_crew/crew_npc.bt.json` puts the walk (`crew_npc_reach`), the errand and `crew_npc_fail_errand` all under one decorator:

    "decorator": "/datum/bt_node/decorator/bb_key_set",
    "vars": {
    	"observer_abort": "BT_ABORT_BOTH",
    	"key": "BB_crew_npc_errand_target"
    },

`code/datums/ai/_ai_controller.dm:1009`, in the base `sig_remove_from_blackboard`:

    			// We found the value that's been deleted, it was an assoc value. Clear it out entirely
    			else if(associated_value == source)
    				next_to_clear -= inner_value
    				SEND_SIGNAL(pawn, COMSIG_AI_BLACKBOARD_KEY_CLEARED(inner_value))

`code/datums/ai/_ai_bt_decorators.dm:167`, in `on_observed_change`:

    	if(!condition_result && (observer_abort & BT_ABORT_SELF))
    		if(child_active || ticking_child)
    			...
    			controller.cancel_current_plan()

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:670`, what the brain does when nothing comes back:

    	  if (
    	    brain.lastAct &&
    	    now - brain.lastAct.at > LOST_ACT_MS &&
    	    !brain.walking &&
    	    !brain.doing
    	  ) {
    	    fail(brain, brain.lastAct.key);
    	    brain.lastAct = null;
    	  }

A walk to a person does not have this fault: `crew_npc_walk/finish_action` calls `walk_finished`, which says "the person you were heading for is gone".

## How it was found

Read from the code: the crew tree, the base decorator and the base blackboard code. Not seen in a round. No log line is written when it happens, which is why it has not been noticed: look for a `clean` step in `crew_brain.log` followed by 12 seconds of nothing from a janitor with another janitor in the same room.

## How to fix it

1. On `/datum/ai_controller/crew_npc`, override `sig_remove_from_blackboard(datum/source)` (it is a signal handler, so it must not sleep). Before calling the parent, note whether `blackboard[BB_CREW_NPC_ERRAND_TARGET] == source` and whether `blackboard[BB_CREW_NPC_STORAGE_TARGET] == source`. Call the parent. Then, for each that was lost, start a short timer. Not a direct call: the tree is in the middle of resetting itself, the same reason `go_back_for` uses a timer.
2. New proc `errand_target_gone(serial)`: return if `errand_serial != serial`, if `errand_tool` is null, if the errand key is set again, or if the errand is being done right now. For that last check add a var set to TRUE in `crew_npc_do_errand/perform_async` just before `do_errand` and FALSE just after: without it, a mess deleted by the body's own cleaning would be reported twice, once here and once by `perform_async`.
3. In `errand_target_gone`, for `CREW_TOOL_CLEAN` carry on as `finish_errand` does after a mess: neither `cleaned_count` nor `clean_failed_count` goes up, then `next_mess() || more_to_clean()`, and if there is no more, the usual report. For every other tool call `finish_errand(list(FALSE, "It is gone."))`. Hauling tools need nothing more: `finish_errand` reports through `action_result`.
4. For a lost storage target, the timer calls `next_storage()` if `search_tool` is still set and the storage key is not.
5. Add a `log_game` line in `errand_target_gone`, so the next round shows how often it happens.

## How to test the fix

- Compile the server.
- In a round: two janitors in one hallway with a row of dirt. In `game.log` look for the new line, and check that the janitor whose mess was taken goes straight on to the next one and that the brain gets a `clean` result.
- Admin-delete a crate while a technician is walking to unload it: the brain should be told "It is gone." at once, and `describe_doing` should be empty.
- The simulator (`tools/llm_crew/sim.ts`) plays the server and always answers, so it cannot show this fault. A scenario that withholds one `action_result` would show the 12 second wait on the window side.

## Check

Checked by Opus 5.5, from the code. Confirmed.

- The quotes are what the code says today: `crew_npc_do_errand/perform_async` (`crew_npc_hands.dm:392`), the errand and storage decorators in `crew_npc.bt.json`, the base `sig_remove_from_blackboard` (`_ai_controller.dm:1009`) and `on_observed_change` (`_ai_bt_decorators.dm:167`), the lost-step check in `drive` (`driver.ts:670`).
- Traced: `start_errand` uses `set_blackboard_key`, which tracks the target (`TRACK_AI_DATUM_TARGET` registers `COMSIG_QDELETING` to `sig_remove_from_blackboard`). The blackboard is a flat assoc list, so the deleted target is found as an assoc value and `COMSIG_AI_BLACKBOARD_KEY_CLEARED(key)` is sent. `bb_key_set` registers for exactly that signal (`generic_decorators/bb_key_set.dm:6`), its condition is lost while `crew_npc_reach` runs, and `cancel_current_plan` resets every node; `ai_behavior/reset_tick_state` calls `finish_action(FALSE)`, and `crew_npc_reach` has no `finish_action` of its own, so nothing in our code hears of it. `crew_npc_fail_errand` sits under the same decorator and is skipped. No other code notices `errand_tool` set with no errand key: the only readers are `on_item_in_hand`/`put_down_unasked_item` (`crew_npc_hands.dm:572`, `:603`), which treat it as busy, as the finding says. `describe_doing` and `ui_data`'s `walking` both go by the key, so the window sees the body free and the lost-step check fires.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions it.
- Mended: the window's 12 seconds count from when the step was sent, not from when the target vanished (body text fixed). Effort raised to medium: the fix is an override, a new proc, a flag and a timer across the controller, `crew_npc_hands.dm` and `crew_npc_storage.dm`, well over 20 lines. Confidence raised to sure.
- The fix is sound and keeps the rules (it only reports and moves on). A smaller-looking alternative, registering on the pawn for `COMSIG_AI_BLACKBOARD_KEY_CLEARED(BB_CREW_NPC_ERRAND_TARGET)` and checking on a 0-delay timer that `errand_tool` is set, `errand_serial` is unchanged and the key is still empty, does the same job without overriding a base proc; either is fine, but the `errand_serial` check alone does not stop a double report while `do_errand` is still sleeping after its own mess went, so the "doing right now" flag in step 2 is needed in both.
