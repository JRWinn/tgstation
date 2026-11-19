---
id: LIFE-01
title: A walk cut short because the body was knocked down marks the room it was going to as one with no way in, for five minutes
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_tools.dm:484, code/modules/llm_crew/crew_npc_motor.dm:139, code/datums/ai/_ai_controller.dm:590, code/datums/ai/_ai_behavior.dm:137, tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:93
fix: Give a walk that ends because the controller stopped running its own reason, and only mark blocked_places for a walk that found no way or ran out of time
---

## What is wrong

When a body on a `go_to` walk is stunned, paralysed or knocked out, the walk is ended by the base controller, not by the walk itself. The walk leaf is reset with no reason set, `walk_finished` is called with `reason = null`, and the body is told "You stop on the way to X: you were interrupted." That much is only vague. But `walk_finished` also writes the room down in `blocked_places`, the list of rooms it "lately failed to find a way into", whatever the reason the walk ended. The window reads that list (`blocked_places` in `ui_data`) and from then on, for five minutes (`CREW_NPC_BLOCKED_PLACE_TIME`), treats the room as one there is no way into:

- `jobs/orders.ts`: a "go and look at that room" order is finished with the finding "I could not get in: there is no way in for me.", which goes back to whoever gave the order.
- `jobs/janitor.ts`: a mess there is left alone (`noWayIn`).
- `jobs/rounds.ts`: the room is noted as looked in on and dropped.
- `jobs/arrests.ts`: a sighting in that room is not followed.
- `options.ts`: the room is not offered as somewhere to go.

None of that is true. The body fell over. The way in is as open as it was.

The chain, read from the code:

1. The body is walking (`tool_go_to` ends in `start_walk`, the `crew_npc_walk` leaf is running).
2. Pun Pun tackles it (`attack_paw`, `Paralyze(40)`), or it is batoned, or it slips on something that paralyses. `TRAIT_INCAPACITATED` comes on and `COMSIG_MOB_INCAPACITATE_CHANGED` fires.
3. `update_able_to_run` (registered by the crew controller's `setup_able_to_run`) finds `get_able_to_run` returns `AI_UNABLE_TO_RUN`, calls `ai_movement.fail_movement`, then `set_ai_status(AI_STATUS_OFF, AI_UNABLE_TO_RUN)`. That flag does not include `AI_PREVENT_CANCEL_ACTIONS`, so `cancel_current_plan()` runs, then `reset_bt_tick_states()`.
4. The running walk leaf's `reset_tick_state` calls `finish_action(controller, FALSE)`. `crew_npc_walk/finish_action` reads `fail_reason`, which is still null (it is only set inside `perform`, which has not run since), and calls `walk_finished(target, FALSE, null)`.
5. In `walk_finished`, `why` becomes "you were interrupted". The target is still the blackboard's, so the early return does not fire. The body is not in the room yet, so `succeeded` stays FALSE. Then `blocked_places[goal] = world.time`.

The same happens when the body dies or is knocked out cold (`on_stat_changed` → `reset_ai_status` → OFF), and when a player or admin takes the body over (`on_sentience_gained`).

The null reason does harm on other walks too. A walk to put someone out of a room (`CREW_TOOL_EVICT`) cut short this way ends in `put_out(FALSE, null)`, which says "You could not get [name] out of [post]: they got away from you." The window's `WOULD_NOT_GO` pattern in `jobs/wanted.ts` reads "could not get" as the stranger refusing to go (see API-01), and a trespass warrant follows for someone who only stood by while Pun Pun tackled the one walking them out. And a haul cut short this way is reported as "you lost your grip on it" (`crate_released`, `crate_collected`, `crate_taken_back`, `freight_hauled`), with the body still lying beside the crate.

A Captain who tells the HoP "go and see what is going on in the Bar", while Pun Pun is loose in the Bar's doorway, gets back "I could not get in: there is no way in for me", from a HoP that was tackled on the way.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:484`, in `walk_finished`:

    	else
    		// A room it cannot find a way into is left alone for a while: a locked door does not open for asking twice.
    		if(tool == CREW_TOOL_GO_TO && goal)
    			blocked_places[goal] = world.time
    			if(reason == CREW_NPC_NO_WAY)
    				blocked_tries[goal]++

`code/modules/llm_crew/crew_npc_motor.dm:139`, where the reason is lost:

    /datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/finish_action(datum/ai_controller/controller, succeeded)
    	var/atom/finished_target = walking_to_ref?.resolve()
    	var/reason = fail_reason

`code/datums/ai/_ai_controller.dm:590` (base), which ends the walk from outside it:

    /datum/ai_controller/proc/update_able_to_run()
    	SIGNAL_HANDLER
    	var/run_flags = get_able_to_run()
    	if(run_flags & AI_UNABLE_TO_RUN)
    		able_to_run = FALSE
    		ai_movement.fail_movement(src)
    	else
    		able_to_run = TRUE
    	set_ai_status(get_expected_ai_status(), run_flags)

`code/datums/ai/_ai_behavior.dm:137` (base): a reset leaf is finished as failed.

    /datum/bt_node/ai_behavior/reset_tick_state()
    	if(running)
    		finish_action(owning_controller, FALSE)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:93`, what the window makes of it:

    } else if (
      brain.location !== task.place &&
      brain.blockedPlaces.includes(task.place)
    ) {
      // Not being able to get in is a finding too, and whoever gave the order wants to hear it.
      task.found = 'I could not get in: there is no way in for me.';

## How it was found

Read from the code, following the base controller's stun path into the crew walk leaf. Not seen in a round log. A grep of `game.log` for `walk failed (go_to` with `: you were interrupted.` would show it.

## How to fix it

1. In `crew_npc_walk/finish_action` (`crew_npc_motor.dm`), when `fail_reason` is null and the walk did not succeed, say why from what the body can feel: if the controller is not `able_to_run` or its `ai_status` is `AI_STATUS_OFF`, set the reason to a new define, say `CREW_NPC_KNOCKED_DOWN` ("you were knocked off your feet"). Leave null for the other cases (a newer walk or errand, which `walk_finished` already returns early on).
2. In `walk_finished` (`crew_npc_tools.dm`), mark `blocked_places[goal]` only when `reason == CREW_NPC_NO_WAY` or the walk timed out ("it was taking too long"). A walk cut short by the body going down is not a finding about the room.
3. Do the same in the other places the null reason flows on to: `note_way_out_failed` is already only for "there is no way through", which is right; `finish_haul` and the crate reports pass `reason` through, so with step 1 they will say "you were knocked off your feet" where they said "you were interrupted" or "you lost your grip on it". `put_out` must use it too, and in words that do not match `WOULD_NOT_GO` ("You were knocked off your feet before you had [name] out of [post]."), so that no trespass warrant comes of it.
4. Leave the window alone: it already treats an `ok: false` result as a failure to back off from. If the owner wants the body to try again as soon as it is up, that is a window change (a "knocked down" reason that is not counted by `fail`), and a question for the owner.

## How to test the fix

- Simulator: a scenario where the body is mid `go_to` and the fake server sends the action result with the new reason; check `blocked_places` stays empty in the next state and the order task is not finished with "I could not get in".
- Compile with the DM compiler.
- Next round: `grep "walk failed (go_to" game.log` and look for "knocked off your feet". After one, the next `go_to` to the same room should be sent within a minute, not five.
