---
id: CHEAT-15
title: Crew bodies see people, messes and things in pitch darkness, because view() in this codebase ignores light and nothing else checks it
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:161, code/modules/llm_crew/crew_npc_senses.dm:55, code/modules/lighting/lighting_object.dm:37, code/modules/mob/mob.dm:1346
fix: Filter what look_around and the other view() calls return by the light on each tile (turf.get_lumcount against LIGHTING_TILE_IS_DARK), keeping the tiles next to the body and anything lit, unless the body has night vision
---

## What is wrong

Every crew sense of sight is a BYOND `view()` or `oview()` from the body: `look_around` (`oview(CREW_NPC_VISION_RANGE, body)`, which fills `people_in_view`, `things_in_view`, messes, storage, sinks, doors), `knows_slippery` (`oview(1, pawn)`), `security_state`, `engineering_state`, `tool_get_kit`, `tool_clean`, the arrest's "in view" tests and more.

In this codebase `view()` does not leave out dark tiles. BYOND hides a tile only if it and everything on it have no luminosity, and /tg/station sets every turf's `luminosity` to 1 for good when its lighting object is made ("Default to fullbright, so things can 'see' if they use view() before we update"), and back to 1 when the lighting object goes. Darkness is drawn by the lighting plane on the client; it does not change what `view()` returns.

So a crew body standing in a room with the lights out sees everything a player would see with the lights on, to the full vision range. A player there sees a tile or two round them, and whatever a light falls on.

The change log knows the assumption was untested: 2026-11-18 (the mail chute work), "None of this has been seen in the game. In particular: ... that `oview(1)` leaves out a tile that is too dark to see". The comment in `knows_slippery` relies on it: "The tile in front of it is in plain sight, unless it is too dark to see." By the code above, it never leaves one out.

Concrete case, and a common one: the owner's own note says test rounds lose power about fifteen minutes in. From then on the lights are out across most of the station. A janitor walking a dark hallway is told "Pun Pun comes into view 7 tiles away", sees every oil stain in the room and is sent to clean them, and an officer spots the person on its wanted list across a dark Bar. A player in the same place would need a flashlight.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:161`, in `look_around`:

    	var/list/in_sight = oview(CREW_NPC_VISION_RANGE, body)
    	things_in_view = notable_things(in_sight)

`:54`, in `knows_slippery`:

    		// Not seen before. The tile in front of it is in plain sight, unless it is too dark to see.
    		in_reach ||= oview(1, pawn)

`code/modules/lighting/lighting_object.dm:37`:

    	affected_turf.lighting_object = src
    	// Default to fullbright, so things can "see" if they use view() before we update
    	affected_turf.luminosity = 1

The game's own light test, `code/modules/mob/mob.dm:1346`, `has_light_nearby(light_amount = LIGHTING_TILE_IS_DARK)`, and `/turf/proc/get_lumcount` in `code/modules/lighting/lighting_turf.dm:20`.

## How it was found

Read from the code: the crew's senses, and the base lighting code that sets turf luminosity. Not run.

## How to fix it

1. One proc, `crew_npc_visible(list/in_view, mob/living/viewer)`: keeps from `in_view` each atom whose turf is within 1 tile of the viewer, or has `get_lumcount() > LIGHTING_TILE_IS_DARK`, or is itself lit (`light_range` and `light_on`, a lit PDA or a flashlight held by someone). If the viewer has night vision (`viewer.lighting_cutoff` high, or `has_nightvision()`), keep everything.
2. Use it in `look_around` on `in_sight` straight after the `oview`, and in the other places that test "in view" for sight (`security_state`, `engineering_state`, `tool_get_kit`, `tool_clean`, `got_away_details`, `make_arrest`'s "in view" reasons, `fire_door_report`, `remember_messes`). A shared cached copy per look keeps it cheap.
3. `knows_slippery`: a tile in front of the body counts as seen only if it is lit or adjacent: adjacent always is, so the walk-on-oil guard still works one step ahead.
4. Tell the brain the room is dark: add `"dark" = !body.has_light_nearby()` to `ui_data`, so the prompt can say "It is dark here" and jobs can decide (a janitor does not set out to clean what it cannot see).
5. Later, the honest way round darkness is a light: a PDA's flashlight is a click on the PDA (`toggle_flashlight`). That is a new action and the owner's to decide.

What must keep working: speech is not sight; `on_pre_hear` is unaffected. Knowing who is beside you in the dark (adjacent) still works.

Question for the owner: should crew in a dark room switch on their PDA light, as most players do, or work in the dark with what is next to them?

## How to test the fix

- Server compile.
- Throwaway check in a round: turn the lights off in a room (break the APC) with a janitor inside and a mess four tiles away. Before the fix `things_in_view` in the Crew Brain window lists the mess; after, it does not until the janitor is next to it.
- After a power failure, the "comes into view" events in the Crew Brain window (and in the contexts written to `crew_brain.log`) should fall off sharply away from lit areas.
