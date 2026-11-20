---
id: CORE-04
title: One runtime error in ui_data, from any of its forty calls for any one body, stops every update to the window, so every crew member stalls while it lasts
kind: gap
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_brain_link.dm:76, code/modules/tgui/tgui.dm:293, code/controllers/subsystem/tgui.dm:226
fix: Build each body's record in its own proc inside try and catch, and on an error log it once and send a short record for that body with an error field, so the others still get their update
---

## What is wrong

`ui_data` builds one list for all of an owner's bodies in one loop. For each body it calls about forty procs from every part of the crew code: `mess_places`, `door_keepers`, `freight_state`, `tidy_state`, `security_state`, `engineering_state`, `held_state`, `people_on_pda`, `work_area_messes`, `at_door_of`, `crew_npc_clear_of_doors`, `on_top_of_someone`, `order_book_lines`, `locked_rooms` and the rest. Many of them walk turfs, doors, PDAs and areas.

If any one of them hits a runtime error for any one body, `ui_data` stops there. `get_payload` gets nothing, no update is sent, and the window keeps the last data it had. The window drives every body from those updates (`ingest` in `brain.ts`), so every body stops getting new events and the window stops sending steps for them. Because the update is built again on every sense event and every second, a runtime that comes from a lasting state (a body in a locker, in a pipe, dead in an odd place, holding an odd item) fails on every update until the state passes. Nothing in the window says why.

This has already happened. `data/logs/2026/11/18/round-08.26.02/runtime.log` has `list index out of bounds` in `get_turfs_by_zlevel(0)`, reached from `ui data` → `mess places` → `place locked to body` → `locked out of` → `crew npc doors of(..., 0)`, raised by a body that was not standing on a floor. The same runtime shows in four other rounds (17.57.35, 00.56.30, 01.53.17, 09.12.44). That one cause was mended since (`crew_npc_doors_of` and `locked_out_of` now return early for z 0), but nothing stops the next one doing the same: every new field added to `ui_data` is a new way to stall the whole crew.

DRV-06 is the window side of the same weakness (one thrown error in the window code stops every brain). This is the server side.

## Where

`code/modules/llm_crew/crew_brain_link.dm:76`:

    /datum/crew_brain_link/ui_data(mob/user)
    	var/list/data = list()
    	var/list/npc_list = list()
    	for(var/datum/ai_controller/crew_npc/npc as anything in npcs)
    		var/mob/living/carbon/human/body = npc.pawn
    		if(QDELETED(body))
    			continue
    		...
    		npc_list += list(list(
    			"id" = npc.npc_id,
    			...
    			"mess_places" = npc.mess_places(),
    			...
    			"security" = npc.security_state(),
    			...

`code/modules/tgui/tgui.dm:293` (base), where a runtime in `ui_data` leaves the payload unsent:

    	var/data = custom_data || with_data && src_object.ui_data(user)

The call stack in `round-08.26.02/runtime.log`:

    - /datum/ai_controller/crew_npc (/datum/ai_controller/crew_npc): locked out of(the Cargo Bay (/area/station/cargo/storage))
    - /datum/ai_controller/crew_npc (/datum/ai_controller/crew_npc): place locked to body("Cargo Bay")
    - /datum/ai_controller/crew_npc (/datum/ai_controller/crew_npc): mess places()
    - /datum/crew_brain_link (/datum/crew_brain_link): ui data(Zim Fire (/mob/living/carbon/human))

## How it was found

Read from the code, and seen in round logs: the runtime above, from `round-08.26.02` and the four other rounds named. I did not measure how long the window went without updates in those rounds.

## How to fix it

1. Move the body of the loop into a proc, `/datum/crew_brain_link/proc/npc_record(datum/ai_controller/crew_npc/npc)`, that returns the list for one body.
2. In `ui_data`, call it inside DM's `try` / `catch(var/exception/error)` (the base game uses this, for example in `code/datums/json_savefile.dm:54`). On an error:
   - `stack_trace` it once per body per minute (keep a `world.time` per `npc_id` on the link), so `runtime.log` names the field;
   - add a short record for that body instead: `id`, `name`, `awake = FALSE`, `acked_seq`, `events`, and `"error" = "[error]"`. Its events still reach the window, and the others get their full records.
3. In the window, treat a record with `error` set as a body that is not awake for now (no steps sent), and show the error on its card. That is a small change in `ingest` and the card; check `types.ts` for the new optional field.
4. Keep `locked_rooms()` outside the per-body try, in its own try, with a null on error (the window already copes with null: "Null while that is being worked out").

## How to test the fix

- Server compile, type check.
- Add a deliberate `CRASH("test")` to one field's proc behind a debug var, set the var on one body in a round, and check the window keeps driving the others, the broken body's card shows the error, and `runtime.log` has it once a minute, not every second.
- Put a crew NPC in a locker and in a disposal bin in a round, and check `runtime.log` stays clean.
