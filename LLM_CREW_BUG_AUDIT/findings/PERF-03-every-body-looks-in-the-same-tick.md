---
id: PERF-03
title: Every body of a crew spawned together looks round in the same tick each second, so the whole crew's sight work and every sighting it raises land in one tick
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:18, code/modules/llm_crew/crew_npc_spawn.dm:114, code/modules/llm_crew/crew_npc_senses.dm:161
fix: Start each body's looping look timer after a random first wait of up to one second, so the crew's looks are spread across the twenty ticks of each second
---

## What is wrong

`start_senses` starts each body's `look_around` on a looping timer of `CREW_NPC_LOOK_INTERVAL` (1 second). `spawn_test_crew` makes every body in one loop in one proc, so every body's timer starts at the same `world.time`. A looping timer is put back at `now + wait` each time it fires, so they stay together for the whole round: every second, the whole crew looks in one tick, and in the other nineteen ticks of that second (TICKLAG is 0.5 in config/config.txt) nobody does.

What one look does: one `oview(7)` (up to 224 tiles and everything on them), then seven or eight full passes over that list (`notable_things`, `water_to_hand` with two typed loops, `storage_to_search`, `remember_messes` and a pass over up to 300 remembered messes, `remember_slippery` with a `GetComponent` for every object in sight, `messes_to_clean`, and the loop over people), and for each person in view eleven fields worked out on the spot (`get_assignment`, `get_area_name`, `belongs_in_post` with its walk of the brig cells and the post's doors, `crew_npc_is_command`, `answers_to` with two `crew_npc_job_of`, `crew_npc_person_down`). Today that is eleven of those in one tick. At forty, forty in one tick.

And every person who has newly come into view is an `emit_sense`, which is a full rebuild and send of the whole crew's state at once (PERF-02). When the Captain walks into a room where eight crew stand, all eight see them in the same tick, and that tick also does eight full rebuilds of the whole crew.

The timer subsystem checks the tick between callbacks, so a crowded tick spills its last looks into the next one rather than hanging, and a look that spilled is put back at `world.time + wait` from the later tick, so a heavily loaded crew drifts apart a little by itself. But until the server is already overloaded nothing spreads them, the spill delays every other timer due in that tick too, and the crowding comes back every second.

A body spawned later by hand with the "Spawn Crew NPC" verb has its own phase, but a standing crew of forty spawned at round start would all be in step.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:18`, `start_senses`:

    	look_timer = addtimer(CALLBACK(src, PROC_REF(look_around)), CREW_NPC_LOOK_INTERVAL, TIMER_LOOP | TIMER_STOPPABLE)

`code/modules/llm_crew/crew_npc_spawn.dm:114`, `spawn_test_crew`, one proc, no wait between bodies:

    	for(var/list/entry as anything in crew)
    		...
    		for(var/number in 1 to entry[3])
    			create_crew_npc(spot, entry[1], owner.ckey)

and `create_crew_npc` makes the controller, whose `TryPossessPawn` calls `start_senses`, in the same call.

`code/controllers/subsystem/timer.dm` (base): a `TIMER_LOOP` timer is re-inserted with `timer.timeToRun = world.time + timer.wait` after it fires, so timers started in one tick and fired in one tick stay in one tick.

## How it was found

Read from the code. The cost of one look was not measured: the server's `perf-*.csv` has no column for it (see PERF-04). What is certain is that the looks all fall in one tick; how long that tick runs at forty crew is not known.

## How to fix it

1. In `start_senses`, start the loop after a random first wait: `look_timer = addtimer(CALLBACK(src, PROC_REF(start_looking)), rand(1, 20) * world.tick_lag, TIMER_STOPPABLE)` (one to twenty ticks), and in `start_looking` (check `QDELETED(src)` and that `pawn` is still the body) do `look_timer = addtimer(CALLBACK(src, PROC_REF(look_around)), CREW_NPC_LOOK_INTERVAL, TIMER_LOOP | TIMER_STOPPABLE)` and one `look_around()` at once.
2. `stop_senses` already does `deltimer(look_timer)`; since `look_timer` always holds whichever timer is live, that still works. Check that `stop_senses` run between the two calls leaves nothing running (the `start_looking` callback must check that the senses have not been stopped, for instance a `senses_on` flag set in `start_senses` and cleared in `stop_senses`).
3. Optional, for forty and more: move the looks off timers onto a small processing subsystem (`SSprocessing`-style, `wait = 1 SECONDS`, `MC_TICK_CHECK` between bodies), which spreads them by itself and shows its cost in the MC's own stats (see PERF-04).

## How to test the fix

- Server compile.
- In a round, `world.time % 10` at the top of `look_around`, logged for each body once at the start: the values should differ.
- The simulator does not run server code, so it does not test this.
