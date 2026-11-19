---
id: LIFE-02
title: A scrub broken off because the janitor was sent elsewhere, moved or knocked down writes the mess off as one that will not come off
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:515, code/modules/llm_crew/crew_npc_hands.dm:392, code/datums/components/cleaner.dm:129, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733
fix: In clean_mess, after the wait, mark a mess stubborn only if the errand is still the same one and the body stayed beside the mess and able to act throughout, else return an interrupted outcome
---

## What is wrong

See also: RT-01 (the same write-off, from a click the game threw away). This is a second way in, with a different cause and a different fix.

`clean_mess` clicks the mess once and then waits up to 8 seconds (`CREW_NPC_CLEAN_TIME`), longer while a `do_after` is still running. If the mess is still there at the end, it is written into `stubborn_messes` for good (until the body holds another kind of tool), and a second one of the same kind in the room writes off every mess of that kind there (`stubborn_kinds`).

A mop, a rag and soap all clean through `/datum/component/cleaner`, which is a `do_after` of about three seconds (`cleaner.dm:129`). A `do_after` breaks if the body moves, is moved, or is stunned. When it breaks, the mess stays. `clean_mess` does not look at why the mess is still there. It goes on waiting out the 8 seconds and then writes the mess off.

`clean_mess` runs on in its sleep after the errand it belongs to has been replaced: `crew_npc_do_errand/perform_async` only throws its answer away when `errand_serial` has moved on. The write-off happens inside `clean_mess`, before that check, so it stands.

The commonest way for this to happen is one the window asks for on purpose. `driver.ts` drops whatever the body is doing when it has been asked to step aside ("scrubbing on at the spot it was asked to move from is no answer"), and when told to leave or given an order from someone it answers to:

1. A janitor in the Bar is scrubbing a cobweb with a rag. `clean_mess` has clicked it, the cleaner's `do_after` is running, `clean_mess` is in its `sleep(0.5 SECONDS)` loop.
2. The bartender says "excuse me". `asideAsked` is set, `dropToMove` is true, the driver sends `step_aside`.
3. `tool_step_aside` → `start_walk` → `cancel_errand()`. `errand_serial` goes up, the errand key is cleared, the body walks two tiles. The `do_after` breaks. The cobweb is still there.
4. `clean_mess` wakes every half second, sees the cobweb, and waits on to the deadline. Then `stubborn_messes[REF(cobweb)] = TRUE` and `stubborn_kinds["Bar|/obj/effect/decal/cleanable/cobweb"]++`.
5. The answer is dropped (serial changed), so the brain is told nothing of it. But from now on `messes_to_clean` leaves the cobweb out, `beyond_kinds_here` names it as beyond the rag, and the janitor reports the Bar as done what it can. A second interruption on a second cobweb there writes off every cobweb in the Bar.

The same happens when a staff meeting is called mid-scrub (an emergency order the driver drops work for), when someone walks into or pulls the janitor, and when the janitor is tackled or slips (paralysed, the `do_after` breaks; `ClickOn` refuses an incapacitated body outright, so a stun just before the click has the same end).

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:513`, in `clean_mess`:

    	body.ClickOn(target)

    	var/deadline = world.time + CREW_NPC_CLEAN_TIME
    	// Still scrubbing when the time is up, it is let finish, within reason. A mess given up a moment
    	// before it came off was reported as beyond the body, and then, seconds later, as cleaned up.
    	var/last_chance = deadline + CREW_NPC_CLEAN_TIME
    	while(!QDELETED(mess) && (world.time < deadline || (length(body.do_afters) && world.time < last_chance)))
    		sleep(0.5 SECONDS)
    		if(QDELETED(body))
    			return list(FALSE, "You could not get to it.")
    	if(QDELETED(mess))
    		return list(TRUE, "You clean up the [mess_name].")
    	// Some messes do not yield to scrubbing at all. Remember this one so the body stops trying it.
    	stubborn_messes[REF(mess)] = TRUE

`code/modules/llm_crew/crew_npc_hands.dm:392`, where the errand's answer is dropped only after `clean_mess` has already written the mess off:

    /datum/bt_node/ai_behavior/crew_npc_do_errand/perform_async(datum/ai_controller/controller)
    	var/datum/ai_controller/crew_npc/crew_controller = controller
    	var/serial = crew_controller.errand_serial
    	var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])

`code/datums/components/cleaner.dm:129` (base), the scrub that breaks on a move:

    	if(do_after(user, cleaning_duration, target = target))

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733`, the window breaking off work on purpose:

      // Likewise asked to step aside: scrubbing on at the spot it was asked to move from is no answer.
      const dropToMove = busy && !!brain.asideAsked && !brain.asideAsked.done;

## How it was found

Read from the code. Not seen in a round log. In `game.log` it would show as a `step_aside` (or `go_to`) sent within a few seconds of a `clean` errand starting, followed later by "What is left there will not come off" for that room.

## How to fix it

1. At the top of `clean_mess`, note `var/serial = errand_serial` and `var/turf/stood_at = get_turf(body)`.
2. In the wait loop, stop waiting as soon as the errand is no longer this one (`errand_serial != serial`), the body is not where it stood, it can no longer reach the mess (`!can_reach_target_now(mess)` for a mess cleaned from beside it, or not on its tile for one cleaned from on top), or it is incapacitated (`INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB)`, the controller's own test in `get_able_to_run`).
3. In any of those cases return `list(FALSE, "You were stopped before you were done with the [mess_name].")` and do not touch `stubborn_messes` or `stubborn_kinds`. Only a mess the body scrubbed at, standing by it, for the whole time, and that is still there, is written off.
4. Keep the rest: the mess deleted is still success, and the "let it finish" stretch for a `do_after` still running stays.
5. Together with RT-01's fix (wait out the click cooldown, and do not count a click that never landed), the write-off is then only ever for a mess that was really worked on.

## How to test the fix

- Compile.
- Simulator: there is no server-side scrub in `sim.ts`, so this needs a round, or a unit test on the DM side if the owner wants one.
- In a round: have a janitor scrub a cobweb with a rag and walk into it, or say "excuse me" to it, mid-scrub. Then tell it to clean the room again: it should go back to the cobweb. Before the fix it says the cobweb will not come off.
