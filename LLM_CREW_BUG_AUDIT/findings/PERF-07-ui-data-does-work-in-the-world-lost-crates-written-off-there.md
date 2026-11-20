---
id: PERF-07
title: Building the window's data does work in the world - a lost crate is written off, said aloud and owed a PDA message from inside ui_data, and shuttle crates and held crates are marked there
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_held.dm:150, code/modules/llm_crew/crew_npc_held.dm:92, code/modules/llm_crew/crew_brain_link.dm:150, code/modules/llm_crew/crew_npc_freight.dm:272, code/modules/llm_crew/crew_npc_held.dm:72
fix: Move write_off_lost_crates and the held-crate and shuttle-crate marking into the cargo body's once-a-second look, and leave held_state and freight_state reading only
---

## What is wrong

See also: TRA-03, which notes in passing that the write-off "runs inside `held_state`, on every state update", for what the line does to a collector who hears it. This is the fault in where it runs.

`ui_data` is meant to describe the bodies for the window. One of its fields, `"held_crates" = npc.held_state()`, does work in the world:

- `held_state` calls `write_off_lost_crates()`, the **only** caller of it anywhere. For a cargo body at a post, that takes each lost crate of its post off the global list, writes a game.log line, says aloud "Crate 12 for X is lost: ... I will send word." (`speak_plainly`, which also starts the say cooldown and stands the body still), and adds a PDA notice owed.
- `held_state` calls `crew_npc_held_crates()` (twice: once on its own and once for its loop), which sets `held_since` on crates that have left the shuttle and moves crates found lost from the held list to the lost list.
- `freight_state` sets `crate.crew_npc_came_by_shuttle = TRUE` on every crate aboard that is not yet empty.

So all of this happens when, and only when, the window happens to be rebuilt: on every sense event of any body, every ack, every tool call, and once every 0.9 seconds (PERF-02). What follows from that:

1. **A body speaks from inside `ui_data`.** The line is heard by everyone near, which is an `emit_sense` for each crew NPC hearer, which calls `SStgui.update_uis`, which runs a second, nested `ui_data` and send before the first has finished building its list. Nothing breaks (the window keeps its own `lastSeq`), but it is a send in the middle of a send, and one more full rebuild per hearer.
2. **The time a crate has waited is counted from when the window first rebuilt after it left the shuttle**, not from when it left. With updates several times a second that is close, but it is not what the comment says, and the simulator, which does not run this code, cannot show it.
3. **The work is done for every rebuild, by every cargo body.** `crew_npc_held_crates()` resolves and tests every held crate (`crew_npc_crate_lost`: a `get_turf`, a station-level check, and `crew_npc_crate_spent`, which looks inside the crate) twice per cargo body per update. Few crates are held at once, so this is small; but it is the shape that makes `ui_data` cost what it does.
4. A runtime in any of it stops every update to the window for every body (CORE-04).

## Where

`code/modules/llm_crew/crew_brain_link.dm:150`, in `ui_data`:

    			"held_crates" = npc.held_state(),

`code/modules/llm_crew/crew_npc_held.dm:150`:

    /datum/ai_controller/crew_npc/proc/held_state()
    	var/list/held = list()
    	var/cargo = works_in_cargo()
    	// Looking over what is held is when one that has been lost is found to be.
    	crew_npc_held_crates()
    	write_off_lost_crates()
    	for(var/datum/crew_npc_held_crate/entry as anything in crew_npc_held_crates())

`code/modules/llm_crew/crew_npc_held.dm:92`, `write_off_lost_crates`, the part that acts:

    		entry.written_off_by = body.real_name
    		GLOB.crew_npc_lost_crates -= entry
    		log_game("Crew NPC [key_name(body)] ... wrote off held crate #[entry.number] ...")
    		speak_plainly("Crate [entry.number][entry.for_name ? " for [entry.for_name]" : ""] is lost: [entry.lost]. I will send word.")
    		if(entry.for_name)
    			notices_owed += list(list("to" = entry.for_name, "kind" = CREW_NOTICE_LOST, ...))

`grep -n "write_off_lost_crates\|held_state()" code/modules/llm_crew/*.dm` gives only the definition, this call, and the one in `ui_data`.

`code/modules/llm_crew/crew_npc_freight.dm:272`, in `freight_state` (also only called from `ui_data`):

    		// It came in with something in it: when it is empty, it is one that goes back.
    		crate.crew_npc_came_by_shuttle = TRUE

## How it was found

Read from the code, following every proc `ui_data` calls for whether it changes anything. Not seen in a round log: no crate was lost in `round-20.43.32` (`grep -c "wrote off held crate" game.log` gives 0).

## How to fix it

1. Add to `look_around` (after `note_place`), for a body that `works_in_cargo()` and has a `post_turf`: `crew_npc_held_crates()` once, then `write_off_lost_crates()`. That is once a second per cargo body, while it can sense, whether or not the window is being rebuilt; `write_off_lost_crates` already checks `can_sense()`.
2. In `held_state`, drop both calls at the top and loop over `GLOB.crew_npc_held_crates` directly: it becomes a read.
3. Move the `crew_npc_came_by_shuttle` marking out of `freight_state` into the same place as step 1 (a loop over `crates_aboard()` for cargo bodies at the post), or into `tool_unload` where a crate is actually hauled off. `freight_state` then only counts.
4. Question for the owner, from CHEAT-06: should a technician find a crate lost from anywhere at all? If not, step 1 should only write off a crate whose spot, or the post, is in the body's sight. That belongs to CHEAT-06's fix.

## How to test the fix

- Server compile.
- In a round, admin-delete a held crate in the bay with a technician at the counter: the "Crate N ... is lost" line and the game.log "wrote off held crate" line come once, within about a second, with the window open; and also with the window closed and reopened later (with the fix it no longer waits for the window).
- The simulator does not run server code.
