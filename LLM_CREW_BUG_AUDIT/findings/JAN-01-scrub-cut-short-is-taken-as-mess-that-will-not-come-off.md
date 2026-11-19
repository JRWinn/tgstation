---
id: JAN-01
title: A scrub cut short, by the body being sent elsewhere, moved or knocked down, is taken as a mess that will not come off
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:519, code/modules/llm_crew/crew_npc_cleaning.dm:526, code/modules/llm_crew/crew_npc_hands.dm:392, code/datums/components/cleaner.dm:129, code/datums/timed_actions.dm:76, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733
fix: In clean_mess, mark a mess stubborn only if the body stayed on its errand, in reach and fit, and the scrub ran its course, else return a plain could not finish
---

## What is wrong

Also written up as: LIFE-02

See also: RT-01 (a click thrown away by the click cooldown) and HAND-02 (a mess it could not walk to). This is a third way to the same wrong write-off, with a different cause and a different place to fix.

`clean_mess` clicks the mess once and then waits up to 16 seconds for it to be gone. If it is still there at the end, the body decides the mess "will not come off": it goes in `stubborn_messes` for good (until the body holds a different kind of tool), and the second time that kind of mess is beaten in the room, every mess of that kind in the room is written off with it.

But the game's scrub is a `do_after` (`/datum/component/cleaner/proc/clean`), and a `do_after` stops as soon as the body moves, is knocked down, stunned or cuffed (`timed_actions.dm`: it watches the body's loc and `TRAIT_INCAPACITATED`). Nothing in `clean_mess` looks at any of that. The mess is left because the scrub was stopped, not because it would not shift, and the body writes it off all the same.

The commonest way in is the brain itself. While `clean_mess` sleeps, a new tool call (a technician's PDA call answered with `go_to`, a head calling a meeting, being told to step aside) runs `cancel_errand` or `start_errand`, the tree walks the body off, and the scrub stops. `perform_async` checks `errand_serial` before `finish_errand`, so the report is not sent; but the write-off has already been made inside `clean_mess`, which never looks at the serial.

One concrete case:

1. A janitor with a wet mop is on a tile of vomit in the Bar, `clean_mess` has clicked the floor, and the mop's 1.5 second scrub has begun.
2. Half a second later the Head of Personnel calls a staff meeting. The brain sends `go_to` the meeting room. `start_errand`/`cancel_errand` bumps `errand_serial` and the body steps off the tile.
3. The `do_after` in `cleaner.dm` sees the body move and fails. The vomit stays.
4. `clean_mess` keeps sleeping until `deadline` (8 seconds), finds the vomit still there, and sets `stubborn_messes[REF(vomit)] = TRUE` and `stubborn_kinds["Bar|/obj/effect/decal/cleanable/vomit"] = 1`.
5. After the meeting it comes back. `messes_to_clean` skips that vomit (`!stubborn_messes[REF(mess)]`). If the same happens once more to another vomit in the Bar, every vomit the janitor remembers in the Bar is written off and it tells the brain what is left "will not come off with what you have".

The same happens if someone walks into the janitor and swaps places with it, pulls it, or it slips and falls while scrubbing.

A second case, from LIFE-02: the window breaks off a scrub on purpose. `driver.ts` drops whatever the body is doing when it has been asked to step aside (`dropToMove`, "scrubbing on at the spot it was asked to move from is no answer"), when told to leave, and for an order from someone it answers to.

1. A janitor in the Bar is scrubbing a cobweb with a rag. `clean_mess` has clicked it, the cleaner's `do_after` (3 seconds at base, `cleaner.dm:20`) is running, and `clean_mess` is in its `sleep(0.5 SECONDS)` loop.
2. The bartender says "excuse me". `asideAsked` is set, `dropToMove` is true, the driver sends `step_aside`.
3. `tool_step_aside` → `start_walk` → `cancel_errand()`. `errand_serial` goes up, the body walks two tiles, the `do_after` breaks, the cobweb stays.
4. `clean_mess` waits on to the deadline, then writes the cobweb into `stubborn_messes` and adds one to `stubborn_kinds["Bar|/obj/effect/decal/cleanable/cobweb"]`. The answer is dropped (serial changed), so the brain is told nothing, but from now on `messes_to_clean` leaves the cobweb out, `beyond_kinds_here` names it as beyond the rag, and a second interruption on a second cobweb there writes off every cobweb in the Bar.

A stun just before the click has the same end: `ClickOn` refuses an incapacitated body outright, so the scrub never starts and the mess is written off after the wait.

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

`code/modules/llm_crew/crew_npc_hands.dm:392`, the leaf that calls it: the serial is checked only after `do_errand` returns, so the write-off inside it stands.

    	var/serial = crew_controller.errand_serial
    	var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])
    	...
    	if(!QDELETED(crew_controller) && crew_controller.errand_serial == serial)
    		crew_controller.finish_errand(outcome)

`code/datums/components/cleaner.dm:129`, the base game's scrub:

    	if(do_after(user, cleaning_duration, target = target))
    		clean_succeeded = TRUE

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:733`, the window breaking off work on purpose:

      // Likewise asked to step aside: scrubbing on at the spot it was asked to move from is no answer.
      const dropToMove = busy && !!brain.asideAsked && !brain.asideAsked.done;

## How it was found

Read from the code, with the base game's `cleaner.dm` and `timed_actions.dm` read to see what stops a scrub. Not seen in a round log: `clean_mess` writes nothing to `game.log` when it writes a mess off, so a round would not show it either (see the test section). What a round would show (from LIFE-02): a `step_aside` or `go_to` sent within a few seconds of a `clean` errand starting, followed later by "What is left there will not come off" for that room.

## How to fix it

1. In `clean_mess`, note `var/serial = errand_serial` and `var/turf/stood = get_turf(body)` before the click.
2. Inside the wait loop, stop waiting (return at once) if `errand_serial != serial`: the body has been given something else to do. Return `list(FALSE, "You stopped cleaning the [mess_name].")` and do not touch `stubborn_messes` or `stubborn_kinds`.
3. After the loop, before the write-off, return the same plain "could not finish" answer, with no write-off, if any of these hold: `get_turf(body) != stood`, `body.incapacitated` (or `INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB)`, the controller's own test in `get_able_to_run`), `body.body_position == LYING_DOWN`, `!can_reach_target_now(mess)` for a mess cleaned from beside it (or the body not on its tile for one cleaned from on top), or the tool is no longer in the body's active hand (`body.get_active_held_item() != tool`).
4. Keep the write-off only for the case the comment describes: the body stood there, fit and holding the tool, for the whole time, and the mess is still there.
5. `finish_errand` counts a two-item failure as `clean_failed_count++`. That is fine for a scrub cut short by a shove; for step 2 it is never reached, because the serial has changed.
6. Write one `log_game` line when a mess is written off (kind, room, tool), so the next round shows how often it happens. The fix for RT-01 touches the same lines: build both together.

## How to test the fix

- Server compile to a side copy (see the README). The simulator runs none of this code.
- In a round: spawn a janitor with a wet mop by some vomit, and while it scrubs, give it a `go_to` from the brain window, or pull it one tile. Then send it back with `clean`: it should clean the vomit, not say it will not come off. Also (from LIFE-02): have it scrub a cobweb with a rag and say "excuse me" to it mid-scrub, then tell it to clean the room again: it should go back to the cobweb.
- Grep `game.log` for the new write-off line. Each one should be a mess that really did not shift (a cobweb under a mop), never a common floor mess.
