---
id: CHEAT-06
title: Cargo staff are told whether the shuttle has docked, what is waiting in the bay and the lobby, and where each held crate is, wherever they are standing
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_freight.dm:260, code/modules/llm_crew/crew_npc_tidying.dm:112, code/modules/llm_crew/crew_npc_tidying.dm:139, code/modules/llm_crew/crew_npc_held.dm:150, code/modules/llm_crew/crew_brain_link.dm:150
fix: Fill freight, tidy and held from what the body last saw, refreshed only while it is in the bay or lobby or can see the place, and keep the last sight with its time
---

## What is wrong

Three things go to every cargo body's brain on every update (`ui_data` in `crew_brain_link.dm`), and none of them looks at where the body is:

1. **`freight_state`**: `shuttle_docked`, `to_unload`, `empties_aboard`, `mail_crate`, `empty_crates`, `misplaced`. Worked out from `SSshuttle.supply` and from every crate in the bay, the lobby and the shuttle's areas.
2. **`tidy_state`** and **`next_to_tidy`**: the count of things lying about in the work area, and which one to fetch next, from every item and open closet in those rooms, seen or not.
3. **`held_state`**: each held crate's number, who it is for, and `place`, the room the crate is in now (`get_area_name(entry.crate_ref.resolve())`), however it got there.

`supply_run_step` was written to keep the senses rule ("The body learns of it the way a person would: it is in the bay and sees the shuttle dock. Anywhere else, it finds out when it next gets back."), but `freight_state` tells the brain the same thing from anywhere.

Concrete cases:

- A technician is at the Head of Personnel's staff meeting in the Bar. The shuttle docks with two crates. Its brain is told `shuttle_docked: true, to_unload: 2` within a couple of seconds, and the job's plan can send it back to unload before anyone has said a word.
- A player drags a held crate out of the lobby to Medbay. Every cargo body's `held_state` shows it in "Medbay Central" at once; one could tell the person who ordered it exactly where it went.
- Someone drops a cigarette butt in the far corner of the Cargo Bay behind a stack of crates. `tidy_state` counts it, and `tool_tidy` walks the body to it, from the Delivery Office next door.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:260`, `freight_state`, has no test of where the body is:

    	if(!works_in_cargo() || isnull(post_turf))
    		return null
    	if(freight_cache && world.time - freight_cached_at < CREW_NPC_FREIGHT_CHECK)
    		return freight_cache

`code/modules/llm_crew/crew_npc_tidying.dm:116`, `next_to_tidy`:

    	for(var/area/room as anything in tidy_rooms())
    		for(var/obj/structure/closet/container in room)
    ...
    		for(var/obj/item/thing in room)

`code/modules/llm_crew/crew_npc_held.dm:163`, in `held_state`:

    			"place" = get_area_name(entry.crate_ref.resolve(), TRUE),

`code/modules/llm_crew/crew_brain_link.dm:150` and `:157`, `:159`: the three sent every update.

## How it was found

Read from the code. GAP-06 is about the held-crate list being shared between workmates; this is about each body's view of the bay, the shuttle and the crates not needing the body to be there.

## How to fix it

1. Add `freight_seen` and `freight_seen_at` to the controller. In `freight_state`, work it out afresh only when the body is in one of `freight_rooms()` or in the shuttle's area (or can see into the bay through the counter: `post_turf in view(...)`). Otherwise return the last seen copy with `"seen_at" = freight_seen_at`, and `shuttle_docked` as it was last seen. The brain treats an old copy as old: the job plans already do "go back and look" for held crates, so the same step serves.
2. `next_to_tidy` and `tidy_state`: only things in view (`oview(CREW_NPC_VISION_RANGE, body)`) or remembered from a look in that room, like `remembered_messes`. A small `remembered_litter` beside `remember_messes` in `look_around` does it.
3. `held_state` `place`: the room where the body last saw the crate, kept on the entry per body (or on the controller by number). A crate it has not seen since it was put out stays "in the Cargo Lobby", as far as the body knows.
4. `crew_npc_held_crates()` and `crew_npc_crate_lost`: "no longer aboard the station" and "destroyed" should be found out by going to look and not finding it, not by reading the crate's turf. `look_over_held` is the natural place: a crate not found where it was left is lost to that body.

Question for the owner: the shuttle docking is loud and the cargo console says it; is a technician anywhere in the cargo department (the Delivery Office, the Warehouse) allowed to know it has docked, or only one in the bay?

## How to test the fix

- Server compile.
- Simulator: the sim plays `freight` and `held_crates` as the server would send them. Add a scenario where the technician is away at a meeting when the shuttle docks: it must not set off to unload until it is back in the bay or is told.
- A round: drag a held crate out of the lobby while the technicians are in the bay; `held_state` shown in the Crew Brain window must still say the lobby until one of them goes and looks.
