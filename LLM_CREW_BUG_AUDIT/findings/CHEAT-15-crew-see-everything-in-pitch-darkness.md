---
id: CHEAT-15
title: Crew bodies see people, messes and things in pitch darkness, because view() in this codebase ignores light and nothing else checks it
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:161, code/modules/llm_crew/crew_npc_senses.dm:55, code/modules/mob/mob_defines.dm:23, code/modules/lighting/lighting_object.dm:37, code/modules/mob/mob.dm:1346
fix: Build a set of lit turfs once per look (turf.check_lumcount_above(LIGHTING_TILE_IS_DARK)) and keep from each sight list only what stands on a lit turf or next to the body, unless the body has night vision
---

## What is wrong

Every crew sense of sight is a BYOND `view()` or `oview()` from the body: `look_around` (`oview(CREW_NPC_VISION_RANGE, body)`, which fills `people_in_view`, `things_in_view`, messes, storage, sinks, doors), `knows_slippery` (`oview(1, pawn)`), `security_state`, `engineering_state`, `tool_get_kit`, `tool_clean`, the arrest's "in view" tests and more.

In this codebase `view()` does not leave out dark tiles, for two reasons that each would be enough. Every mob has `see_in_dark = 1e6` (`code/modules/mob/mob_defines.dm:23`, "we never want to hide a turf because it's not lit / We can rely on the lighting plane to handle that for us"), and `oview(range, body)` uses the body's own sight settings. And every turf keeps `luminosity = 1` for good (`code/game/turfs/turf.dm:9`, set again when its lighting object is made or goes, `lighting_object.dm:38` and `:53`); `lighting_object/update()` only sets the lighting object's own `luminosity`, never the turf's. Darkness is drawn by the lighting plane on the client; it does not change what `view()` returns.

So a crew body standing in a room with the lights out sees everything a player would see with the lights on, to the full vision range. A player there sees a tile or two round them, and whatever a light falls on.

The change log knows the assumption was untested: 2026-11-18 (the mail chute work), "None of this has been seen in the game. In particular: ... that `oview(1)` leaves out a tile that is too dark to see". The comment in `knows_slippery` relies on it: "The tile in front of it is in plain sight, unless it is too dark to see." By the code above, it never leaves one out.

Concrete case, and a common one: the owner's own note says test rounds lose power about fifteen minutes in. Each working light then goes to its emergency cell (`low_power_mode` in `code/modules/power/lighting/light.dm`), at a quarter of its range, and the cell lasts about ten minutes (`/obj/item/stock_parts/power_store/cell/emergency_light`). So from about fifteen minutes in most of each room is dark, and from about twenty-five minutes in nearly all of the station is. A janitor walking a dark hallway is told "Pun Pun comes into view 7 tiles away", sees every oil stain in the room and is sent to clean them, and an officer spots the person on its wanted list across a dark Bar. A player in the same place would need a flashlight.

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

1. One proc, `crew_npc_visible(list/in_view, mob/living/viewer)`: first build a set of lit turfs from the turfs in `in_view` (`for(var/turf/T in in_view) if(T.check_lumcount_above(LIGHTING_TILE_IS_DARK)) lit[T] = TRUE`: once per turf, not once per atom, since a furnished room has several hundred atoms on about 200 turfs). Then keep each atom whose turf is in that set or within 1 tile of the viewer. `check_lumcount_above` already counts moving lights (a lit flashlight or PDA, someone's held light) and returns TRUE in areas with no lighting object (space, fullbright areas), so no separate "is itself lit" test is needed. If `viewer.has_nightvision()` (meson or night-vision glasses, `mob.dm:1295`), keep everything.
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

## Check

Checked by Opus 5.5. Read `look_around` and `knows_slippery` in `crew_npc_senses.dm` (the quotes are as the code is today), and the base lighting code. Mob `see_in_dark` is `1e6` with the comment that turfs are never to be hidden for want of light (`mob_defines.dm:23`), and turf `luminosity` is 1 by default and never set to 0 (grep of `luminosity =` over `code/`: only areas, the lighting object itself, cameras and closets set it). So BYOND's `view()` and `oview()` return every tile in line of sight whatever the light. No crew code calls `get_lumcount`, `check_lumcount_above`, `has_light_nearby` or `is_softly_lit` (grep of `code/modules/llm_crew/`), and the only blindness test is `is_blind()`. The change log's mail-chute entry lists the dark tile as unseen in game; no later entry deals with it. The fault stands. I mended the write-up: the main reason is `see_in_dark`, not only turf luminosity, and power loss does not put the lights out at once (emergency cells, about ten minutes at a quarter range). Severity medium, in line with the other "knows what it could not see" findings. Effort medium: one helper, but about ten call sites across senses, security, engineering and cleaning. The fix's test is per turf with `check_lumcount_above`, which is cheaper than `get_lumcount` and already includes held lights. Not run.

## Fix so far

Group m-senses, 2026-11-19. Done in `crew_npc_senses.dm` and `crew_brain_link.dm`: `crew_npc_visible(in_view, viewer)` keeps only what stands on a lit tile (`check_lumcount_above(LIGHTING_TILE_IS_DARK)`, asked once per tile) or within one tile of the body, and everything for a body with `has_nightvision()`. `look_around` runs its `oview` through it, so people, things, messes, storage, water, grenade spots, slippery things and open doors are all seen only where lit. `knows_slippery` needed no change (adjacent is always seen); its comment is mended. `ui_data` sends `"dark"` (no light where the body stands, no night vision); the window does not read it yet.

Left (other files): run `crew_npc_visible` over the other sight lists: `security_state` and the arrest's in-view tests (`crew_npc_security.dm`), `engineering_state` (`crew_npc_engineering.dm`), `tool_get_kit`, `tool_clean`, `got_away_details`, `fire_door_report` (wherever each lives). The window's use of `dark` (prompt line, a janitor not setting out to clean what it cannot see), and step 5 (the PDA light) is the owner's question. Compile only; not played.

Round M2 (g-srv-c, compile only): `crew_npc_sees(thing, viewer)` (`crew_npc_senses.dm`) is the one-thing form of `crew_npc_visible`, by the same rule. Now by light as well as line of sight: in `crew_npc_security.dm`, `close_with`'s "still in sight" test, `tool_get_kit`'s look for a baton or cuffs on the floor, the arrest's "can still see them" test (no_way or lost) and its "moved" or "lost" reasons, `got_away_details`, the people whose IDs give the keepers of a room with no PDA, `tool_free`'s look for whom to let go, and in `security_state` the baton seen, who is inside a seen cell, and the people in other rooms whose keepers are listed; `engineering_state`'s machines seen (`crew_npc_engineering.dm`); and in `crew_npc_cleaning.dm` `tool_clean` (messes, sinks, water), `more_to_clean`, `look_at_mess_spot` and `tool_grenade`'s spot. **Left as they were, on purpose:** whether a cell is seen at all (`sees_cell` in `free_cell` and `security_state`): a working timer shows by its own display, and a dark cell must still be seen as dark or `free_cell` would send the officer to it again and again (CHEAT-03). The prisoner's own look at its cell timer (`put_in_custody`), for the same reason. The grenade's check for bystanders (`range`, a safety test, not sight). **Held:** `fire_door_report` is in `crew_npc_doors.dm` (another group's): its look at the fire doors between should use `crew_npc_visible` or `crew_npc_sees` the same way.
Round M2 (g-brain): the window reads `dark`. `types.ts` has `dark?: BooleanLike` (server) and `dark?: boolean` (brain); `ingest` sets `brain.dark = !!npc.dark`; `describeSituation` (`situation.ts`) adds one line, "It is dark here: you see only what is right beside you.", only while it is set. Cases in `tools/llm_crew/brain4-ingest.ts`. Not built: a janitor not setting out to clean what it cannot see; step 5 (the PDA light) is the owner's.

## Fix so far (SENSE-08 / CHEAT-15, owner's answer A, window part)

Built on branch `a-secwin`, `beatAfterActing` in `jobs/arrests.ts`: an arrest the server refuses with reason `captain_known` (a Captain known by face, card or no card; the server part is a-secsrv's) is taken as reason `captain` is: no try counted, the person passed over a while by handle, and whoever keeps the list told once, in its own words: "Joan, I cannot bring in X: they are the Captain: I know their face, and nobody lays a hand on the Captain." (`CAPTAIN_FACE`; no full stop inside, so the Head of Security reads it back whole and passes it on). A stop refused so is still word for the list. Table `tools/llm_crew/secwin-answers.ts`. Not played.
