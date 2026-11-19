---
id: JAN-04
title: A sink or mop bucket seen through a window in a room the body cannot enter is taken as water to hand, and a janitor with a dry mop tries to walk to it every time it is told to clean
kind: bug
severity: high
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:110, code/modules/llm_crew/crew_npc_cleaning.dm:129, code/modules/llm_crew/crew_npc_senses.dm:164, code/modules/llm_crew/crew_npc_hands.dm:407, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:565
fix: Pick water only where the body can get to it - not in a room locked to it, and not one it failed to walk to lately - and remember a water source it could not reach as fire_alarms_failed does
---

## What is wrong

`water_to_hand` and `water_for_bucket` pick the nearest sink, mop bucket, cart or water tank in `view`, by straight-line distance. `view` sees through glass. A sink on the far side of a window, in a room whose doors do not open for the body, is "water to hand".

`look_around` turns that into `sink_in_view = TRUE` and `water_from = "sink"`. The brain then plans "Your mop is dry and there is a sink right here. You are wetting it" and sends `clean` (`jobs/janitor.ts`, the `mopNeedsWater` step). `tool_clean` starts an errand to that sink. The walk finds no way in, `crew_npc_fail_errand` runs, and the brain is told "You could not get to it." Nothing remembers that sink. It is still the nearest water in view, `sink_in_view` is still TRUE, and the next plan is the same `clean`, to the same sink. It goes on until something else moves the body. A reachable sink further off is passed over for good, because the nearest is picked by distance, not by whether it can be walked to.

`crew_npc_fail_errand` remembers failed targets for fire alarms (`fire_alarms_failed`), tidying (`tidy_skipped`) and messes (`stubborn_messes`), but not for water.

Concrete case: a janitor's mop runs dry in the hallway outside Hydroponics on MetaStation. Hydroponics has windows on the hallway and sinks inside, and its doors need Hydroponics access, which a janitor does not have. The sink is 5 tiles away through the glass. `water_to_hand` returns it. `tool_clean` starts the errand, the walk fails, "You could not get to it." The brain sees the same `sink_in_view` and `mopNeedsWater`, and sends `clean` again. The same holds for a kitchen sink seen across the serving counter, a Medbay sink seen from its lobby, and the Bar's sink behind the bar.

The same goes for `bucket_to_fill`: a bucket under half full and a water tank seen through a window sends every `clean` to that tank first.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:110`, in `water_to_hand`:

    	for(var/obj/structure/mop_bucket/tub in in_sight)
    		if(tub.reagents?.total_volume >= 1 && get_dist(pawn, tub) < nearest_distance)
    			...
    	for(var/obj/structure/sink/sink in in_sight)
    		if(get_dist(pawn, sink) < nearest_distance)
    			nearest_distance = get_dist(pawn, sink)
    			nearest = sink
    	return nearest

`water_for_bucket` (line 129) has the same shape for tanks and sinks.

`code/modules/llm_crew/crew_npc_senses.dm:164`, in `look_around`:

    	var/atom/water = water_to_hand(in_sight)
    	sink_in_view = !isnull(water)
    	water_from = water ? format_text(water.name) : null
    	bucket_to_fill = bucket_wants_filling() && !isnull(water_for_bucket(in_sight))

`code/modules/llm_crew/crew_npc_cleaning.dm:430`, in `tool_clean`:

    		var/atom/water = water_to_hand(around)
    		if(water)
    			...
    			start_errand(water.loc == body ? get_turf(body) : water, CREW_TOOL_CLEAN, null)
    			return

`code/modules/llm_crew/crew_npc_hands.dm:407`, `crew_npc_fail_errand`: remembers fire alarms, tidying and messes it could not reach, not water.

## How it was found

Read from the code, window and server. Not seen in a round: errand walks to a sink do not write a "walk failed" line, so `game.log` would not show it (no `walk failed (clean` line is in any round log on disk). Which rooms on which map have a sink in view through glass of a hallway a janitor works was taken from the map layout as remembered, not checked tile by tile; hence `likely`.

## How to fix it

1. Add `var/list/water_failed = list()` to the controller, keyed by `REF(source)` with the time, as `fire_alarms_failed` is.
2. In `crew_npc_fail_errand`, when `errand_tool == CREW_TOOL_CLEAN` and the target is a sink, a `/obj/structure/mop_bucket` or a `/obj/structure/reagent_dispensers`, set `water_failed[REF(target)] = world.time`.
3. In `water_to_hand` and `water_for_bucket`, skip a source with a `water_failed` entry younger than a few minutes (reuse `CREW_NPC_BLOCKED_PLACE_TIME`), and skip one in a room the body is locked out of (`place_locked_to_body(get_area_name(source, TRUE))`, which is cached), unless it is the room the body is in.
4. Pass both procs the same rule, so `sink_in_view`, `bucket_to_fill` and the errand always agree. The brain needs no change: with the unreachable sink dropped, `sink_in_view` goes FALSE and `dry_mop` is sent, and the brain's existing dry-mop step (go to where there is water) takes over.
5. Keep "nearest" by straight-line distance; it is only the choice among reachable ones.

## How to test the fix

- Server compile to a side copy.
- In a round: dry a janitor's mop (empty it at a sink with a right click as a player) and stand it in the hallway in view of the Hydroponics sinks. It should go to a sink it can reach, or say its mop is dry, not stand trying the same sink. Add a `log_game` line in `crew_npc_fail_errand` for a water source it could not reach and grep for it.
