---
id: SENSE-04
title: A body that is blinded or shut in a locker forgets what it saw but keeps an open door and water to hand in view, and its people stay just seen for fifteen seconds
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:129, code/modules/llm_crew/crew_npc_senses.dm:138, code/modules/llm_crew/crew_npc_cleaning.dm:51, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:223
fix: Put the clearing of sight in one helper that also resets open_door_in_view, sink_in_view, water_from and bucket_to_fill, and call it from both early returns in look_around
---

## What is wrong

`look_around` has two early returns for a body that cannot see: one for a body that cannot sense or is blind, one for a body not standing on a floor (in a locker, a crate, the disposal pipes). Both clear `people_in_view`, `things_in_view`, `storage_here`, `cleanable_messes` and `grenade_messes`. Neither clears the other things sight sets later in the same proc:

- `open_door_in_view` ("door_open" to the window),
- `sink_in_view`, `water_from`, `bucket_to_fill`.

So these keep the value from the last look before the body went blind or into the locker, for as long as it stays there. The window and the server both act on them:

- The driver, shut in with `doorOpen`, goes for the door (`driver.ts:223`, up to `OPEN_DOOR_TRIES` tries) while the body is in a locker or blinded and the door may long since have shut.
- On the server, `cleaning.dm:51` lets a dry mop count as the tool to clean with while `sink_in_view` is true, and `brain_link` sends `dry_mop` and `water_from` from it. A janitor flashed beside a sink still has water "in view".

Separately, `last_seen_at` is left alone, so `recently_saw` stays true for everyone seen in the last `CREW_NPC_SIGHT_MEMORY` (15 s). Tools that check `recently_saw` (`tool_throw_out`, `tool_hold`, the door tool) accept a person for 15 s after the body was blinded. That is a small window and partly fair (it saw them a moment ago); it is noted here because the comment on `recently_saw` says "in view".

One concrete case. A cargo technician is shut in the Warehouse (`shut_in`). Someone opens the Warehouse door; the next look sets `open_door_in_view = TRUE`. Before the technician reaches it, Pun Pun pushes it into the Warehouse locker and shuts it. Each look now takes the "not on a floor" return: the lists are cleared, `open_door_in_view` stays TRUE, and the window keeps sending the walk out through the door, which fails each time ("You are not standing on a floor"-type failures from the walk), until the tries run out.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:129`:

    	if(!can_sense() || body.is_blind())
    		people_in_view = list()
    		things_in_view = list()
    		storage_here = 0
    		cleanable_messes = list()
    		grenade_messes = 0
    		return

`code/modules/llm_crew/crew_npc_senses.dm:138`, the same five lines again for a body off the floor, then `return`.

Set only further down, past both returns:

    	sink_in_view = !isnull(water)
    	water_from = water ? format_text(water.name) : null
    	bucket_to_fill = bucket_wants_filling() && !isnull(water_for_bucket(in_sight))
    ...
    	open_door_in_view = FALSE

`code/modules/llm_crew/crew_npc_cleaning.dm:51`:

    	return proper_tool() || (sink_in_view ? dry_mop() : null) || cleaning_tool()

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. Add `/datum/ai_controller/crew_npc/proc/forget_sight()` that sets all nine values to their empty state: the five already cleared, plus `open_door_in_view = FALSE`, `sink_in_view = FALSE`, `water_from = null`, `bucket_to_fill = FALSE`.
2. Call it in both early returns of `look_around` in place of the five lines each.
3. Leave `last_seen_at` as it is unless the owner wants "seen" to mean "in view this second"; if so, clear it in the blind branch only (a body in a locker can still hear who is outside, and the handle should keep working for speech).

## How to test the fix

- Sim: a scenario where a shut-in body sees an open door and is then put in a locker (the server state `off_floor` with `door_open` true before). After the fix `door_open` is false while it is off the floor, and the driver sends no walk to the door.
- Compile.
