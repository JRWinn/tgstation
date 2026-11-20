---
id: HOLE-09
title: A whole station of crew will not fit through one window as built, since every event from any body resends every body's whole state, and the brain log drops records without saying so
kind: gap
severity: medium
effort: large
confidence: likely
status: found
found_by: Fable 5.2
area: design
files: code/modules/llm_crew/crew_brain_link.dm:55, code/modules/llm_crew/crew_brain_link.dm:76, code/modules/llm_crew/crew_brain_link.dm:250, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:219, code/modules/llm_crew/crew_npc_spawn.dm:103
fix: Send each body's slow-changing state on a timer and only its new events at once, count the brain log limit per body and log what is dropped, and measure the payload before adding more crew
---

## What is wrong

See also: PERF-02 (point 1 here, measured, with one update a tick and only new events as its fix), CORE-05 (the ack that makes a second full rebuild, a two-line fix on its own)

The owner wants a whole station of crew. Today there are eleven. These are the things that are sized for eleven, in the order I expect them to give way. None is a fault at eleven.

**1. Every sense event from any body rebuilds and resends everything about every body.**

`emit_sense` calls `brain_link.on_sense_event`, which calls `SStgui.update_uis(src)`. That runs `ui_data` in full: for each of the link's NPCs, about seventy fields, many of them worked out on the spot (`inventory_list`, `mess_places`, `workable_mess_places`, `beyond_kinds_here`, `door_keepers`, `people_on_pda` and `janitors_on_pda`, which each walk every PDA in the world, `work_area_messes`, `held_state`, `engineering_state`, `security_state`, which takes a `view()` and walks the brig's cells), plus that body's last thirty sense events in full.

So the work on the server for one event is in proportion to the number of bodies, and the number of events is in proportion to the number of bodies too (and worse than that for "comes into view" events, since each body reports each other body). Doubling the crew makes about four times the work and four times the data.

Measured from a round with eleven bodies (`data/logs/2026/11/19/round-20.00.21`, about 17 minutes): `href.log` has 1,204 `ack` actions, each of which is the window saying it took in new events for one body, and 940 tool calls, each of which ends in an `action_result` event. That is more than two full rebuilds a second already. The size of one update was not measured: thirty events at a few hundred characters each, a PDA list of everyone aboard, and the rest, comes to something like 15,000 to 25,000 characters a body, so 150,000 to 250,000 characters an update now. With sixty bodies that is over a million characters, several times a second, each `json_encode`d on the server and parsed in the window.

In the window the same shape repeats: each update runs `ingest` over every NPC, and for each one `syncTasks` and `drive`, whether or not anything about it changed.

**2. The brain log's limit is for the whole crew together, and what is over it vanishes.**

`write_brain_log` counts records on the link, not on the NPC: `CREW_NPC_LOG_RECORD_LIMIT` is 40 records in 10 seconds for all of one owner's bodies. Over that it does `return`, with no line anywhere to say a record was dropped. The busiest ten seconds in five recent rounds had 25, 24, 21, 19 and 13 records (counted from the time stamps in `crew_brain.log`), with eleven bodies. At about eighteen bodies the busy moments go over 40, and at sixty most of the log is lost. The busy moments are the ones worth reading. Whoever reads the log afterwards cannot tell a body that did nothing from one whose records were dropped.

**3. One model call at a time, for everyone.**

`pump` in `brain.ts` runs one call, from three queues. That is by design and every line has a plain fallback, so nothing stalls. But talk is first come, first served, with up to 60 seconds allowed for one call (`THINK_TIMEOUT_MS`). With sixty bodies a player who speaks to one may wait behind many greetings between bodies. There is no rule that a line said by a player goes ahead of a remark between two NPCs.

**4. Lists written out by hand.**

- `spawn_test_crew` is a fixed list of eight jobs and counts. The "Spawn Crew NPC" verb has its own copy of the eight.
- `jobs/index.ts` has eight jobs. Any other title gets `CREW`: "a person, free to walk the station", with no post, no work and no head it reports to at meetings. So a bartender or a doctor spawned today explores the station for the whole round.
- `SUPPLIES` in `jobs/head.ts:156` has one line: janitors, the Janitorial Supplies Crate, the Custodial Closet. `orderable_crates` on the server (`crew_npc_cargo.dm:27`) has three crates. No other job can be short of anything.
- A head's staff are picked by job title for three heads in three different ways (`staff` in `jobs/head.ts:176`: technicians only for the Quartermaster, officers only for the Head of Security, the department table for the rest).
- `Department.meetsIn` is set for Service only (`'Bar'`); the server picks the Head of Personnel's meeting room from a list of four area types (`crew_npc_cargo.dm:77`).

**5. The window is one page.**

Five cards a row at 1360 pixels wide. Sixty bodies is twelve rows, with the details and the locked rooms list under them. Nothing is grouped by department or can be filtered. That is only looks, but it is how the owner finds out what went wrong.

## Where

`code/modules/llm_crew/crew_brain_link.dm:55`:

    /datum/crew_brain_link/proc/on_sense_event(datum/ai_controller/crew_npc/npc)
    	SStgui.update_uis(src)

`code/controllers/subsystem/tgui.dm:226` (base game): `INVOKE_ASYNC(ui, TYPE_PROC_REF(/datum/tgui, process), wait * 0.1, TRUE)`, and with `force` set `process` calls `src_object.ui_interact(user, src)`, which sends `ui_data` whole.

`code/modules/llm_crew/crew_brain_link.dm:250`, `write_brain_log`:

    	if(world.time - log_window_started > CREW_NPC_TOOL_WINDOW)
    		log_window_started = world.time
    		log_records_in_window = 0
    	log_records_in_window++
    	if(log_records_in_window > CREW_NPC_LOG_RECORD_LIMIT)
    		return

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:219`, `ingest`: `for (const npc of npcs) { ... syncTasks(brain); ... drive(...) }` on every update.

## How it was found

Read from the code, and two counts from round logs: the `ack` and `tool_call` counts in `href.log` of `round-20.00.21`, and the busiest ten-second bucket of `crew_brain.log` in `round-23.57.07`, `round-19.33.50`, `round-20.00.21`, `round-20.43.32` and `round-14.28.06`. The size of an update and the server time spent in `ui_data` were not measured: that is why this is `likely`.

## How to fix it

Measure first. Then, in this order:

1. **Measure.** Add to `ui_data`, behind a debug flag, the length of `json_encode(data)` and the time `ui_data` took, written to `game.log` once a minute as a highest and an average. One round with eleven bodies gives the baseline.
2. **Log what the log drops.** In `write_brain_log`, count drops, and when the counting window turns over write one line to `crew_brain.log`: `{"kind":"dropped","count":N}`. Move the count from the link to the controller (the per-body tool call limit is already there to copy: `tool_calls_in_window`), so a busy body cannot starve a quiet one.
3. **Stop rebuilding everything on every event.** Two steps:
   - In `ui_data`, send for each body only the events with `seq > acked_seq`, not all thirty. The window already ignores the rest (`if (event.seq <= brain.lastSeq) continue`), except `nearestToSpeaker`, which looks through other bodies' recent events for the same line: have it keep its own short list of lines heard in the last two seconds instead.
   - Split the state. Keep a list on the link of bodies with something new (`dirty`). `on_sense_event` adds the body to it and asks for an update. `ui_data` builds the full record only for dirty bodies, and for the rest sends the last record built, refreshed when it is older than a second or two. `people_on_pda` and `locked_rooms` are the same for every body in a department or on the link: work them out once per update.
4. **Let a player's line go first.** In `startTalk`, take from the queue first any brain whose `pendingSpeakers` has someone who is not one of the crew.
5. **The lists.** These are each a small job, wanted one at a time as each new job is built: make the spawn list data (job, rooms, count) in one place that the verb also reads; give `CREW` in `jobs/index.ts` the shared duties at least (go to its head's meetings, report, take told work), which is the "person, job, shared duty" layering in the owner's notes; make `SUPPLIES` a table by department.
6. **The window.** Group cards by department under a heading that folds, with the colours already there.

Question for the owner: is the aim sixty bodies in one window on one graphics card, or several owners with a dozen each? The brief says the second ("each player can spawn their own NPCs"). The two want different work: the first is steps 1 to 4 here, the second is HOLE-10.

## How to test the fix

- With step 1 in, play one round and read the two numbers. Then spawn a second standing crew with the verb (22 bodies) and read them again: that is the cheapest test of how it grows.
- After step 2, grep `crew_brain.log` for `"kind":"dropped"`.
- The simulator's `crew` scenario is the check that step 3 changes nothing the brains can see: run it four times before and after.
- Type check and server compile.
