---
id: JAN-04
title: A sink or mop bucket seen through a window in a room the body cannot enter is taken as water to hand, and a janitor with a dry mop or a low bucket tries to walk to it again and again
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: 6d51566bb12
found_by: Opus 5.5
checked_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:110, code/modules/llm_crew/crew_npc_cleaning.dm:129, code/modules/llm_crew/crew_npc_senses.dm:164, code/modules/llm_crew/crew_npc_cleaning.dm:420, code/modules/llm_crew/crew_npc_hands.dm:407, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:565, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:269
fix: Pick water only where the body can get to it - not in a room locked to it, and not one it failed to walk to lately - remember a water source it could not reach as fire_alarms_failed does, and stop the dry-mop step sending it back to a room whose only sink was seen through glass
---

## What is wrong

`water_to_hand` and `water_for_bucket` pick the nearest sink, mop bucket, cart or water tank in `view`, by straight-line distance. `view` sees through glass. A sink on the far side of a window, in a room whose doors do not open for the body, is "water to hand".

`look_around` turns that into `sink_in_view = TRUE` and `water_from = "sink"`. The brain then plans "Your mop is dry and there is a sink right here. You are wetting it" and sends `clean` (`jobs/janitor.ts`, the `mopNeedsWater` step). `tool_clean` starts an errand to that sink. The walk finds no way in, `crew_npc_fail_errand` runs, and the brain is told "You could not get to it." Nothing remembers that sink. It is still the nearest water in view, `sink_in_view` is still TRUE, and the next plan is the same `clean`, to the same sink. A reachable sink further off is passed over for good, because the nearest is picked by distance, not by whether it can be walked to.

(Checker's correction: it is not tried "every time" back to back. `noteResult` in `driver.ts` puts the failed step in backoff, 20 s and then longer up to 2 minutes, and a clean in the task's own room also holds back the whole job (`jobKey`). Meanwhile the body idles, which is a walk round the station. But nothing on either side ever learns that the sink cannot be reached, so each time the backoff runs out with the sink in view, or the body comes back, it is tried again, and no mess in that room is cleaned with the mop while it is dry.)

It is also drawn back. The window files everything in view under the room the body stands in (`observe` in `memory.ts`), so the sink seen through the glass is remembered as a sink in the room outside it. Away from it with a dry mop, `supplyStep` in `jobs/janitor.ts:269` picks the first remembered room with a "sink" in it and walks there "to wet it", which can be that very room, where the sink is in view again and the walk to it fails again.

`crew_npc_fail_errand` remembers failed targets for fire alarms (`fire_alarms_failed`), tidying (`tidy_skipped`) and messes (`stubborn_messes`), but not for water.

Concrete case (checked on the map by the checker; the first draft's Hydroponics case does not hold, its sink at (145,113) is not in sight of a hallway): a janitor's mop runs dry in the Medbay Lobby on MetaStation, standing at (97,108). The sink at (98,106) is in Medbay Central, two tiles off, behind the Medbay's glass airlocks at (97,107) and (98,107), which need medical access a janitor has not got (`trim/job/janitor` in `code/datums/id_trim/jobs.dm`). A glass airlock does not block `view`. `water_to_hand` returns that sink. `tool_clean` starts the errand, the walk fails, "You could not get to it." The brain sees the same `sink_in_view` and `mopNeedsWater`, and sends `clean` again when the backoff is over. The same holds for the kitchen sink at (141,122), four tiles from the service hallway across the kitchen counter, and the kitchen sink at (136,126) seen from the Bar.

The same goes for `bucket_to_fill`, and that one is worse: in `tool_clean` the filling branch (`crew_npc_cleaning.dm:420`) comes before everything, so a janitor with a bucket under half full in the Medbay Lobby cleans nothing there at all, with mop or rag, while the sink is in view.

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
4. Pass both procs the same rule, so `sink_in_view`, `bucket_to_fill` and the errand always agree. With the unreachable sink dropped, `sink_in_view` goes FALSE and `dry_mop` is sent, and the brain's existing dry-mop step (`supplyStep`, go to where there is water) takes over. Note the room test: `place_locked_to_body` goes through `locked_out_of`, which asks whether any door of the room opens for the body; that is the right test here.
5. Keep "nearest" by straight-line distance; it is only the choice among reachable ones.
6. The window part, so the body is not drawn back: in `supplyStep` (`jobs/janitor.ts:269`), when the server reports `dry_mop` (no usable water in view) while the body stands in a room it remembers a sink in, note the room in a small `noWaterHere` record with the time, and have `sinkRoom` skip rooms in it for a few minutes. Deleting "sink" from the room's things does not work: `observe` puts it straight back from `things_in_view` while the sink is in sight. Without this the body can go back and forth between the room outside the glass and wherever it is, each walk a success, until `LOOP_WATCHED` stops it.

## How to test the fix

- Server compile to a side copy.
- In a round on MetaStation: dry a janitor's mop (empty it at a sink with a right click as a player), put a mess in the Medbay Lobby, and send the janitor to it. It should say its mop is dry and go to a sink it can reach (the Custodial Closet's, or the Bar backroom's), not try the Medbay sink behind the glass doors. Do the same with a bucket under half full: it should clean the lobby, not walk at the sink first. Add a `log_game` line in `crew_npc_fail_errand` for a water source it could not reach and grep `game.log` for it; there should be none for the Medbay sink.
- Window: a simulator case (`tools/llm_crew/`) where the body reports `dry_mop` while standing in a room it remembers a sink in: after it leaves, the next step must not be `go_to` that same room.

## Check

Checked by Opus 5.5. Read `water_to_hand`, `water_for_bucket`, `tool_clean`, `messes_to_clean` (`crew_npc_cleaning.dm`), `look_around` and `notable_things` (`crew_npc_senses.dm`), `crew_npc_fail_errand`, `start_errand`, `do_errand` and the errand branch of `crew_npc.bt.json`, `crew_brain_link.dm` for what is sent, and on the window side the `bucketToFill`/`mopNeedsWater` steps and `supplyStep` in `jobs/janitor.ts`, `observe` in `memory.ts`, and `inBackoff`, `fail`, `noteResult` and `keyOf` in `driver.ts`. The quotes are what the code says today. No guard on either side filters water by reachability or by room, and `crew_npc_fail_errand` records nothing for a sink, a mop bucket or a tank. The driver's backoff spaces the retries out (20 s up to 2 minutes, with an idle walk between) but never ends them; I mended the "every time" wording to say so. The change log names `water_to_hand` and `water_for_bucket` only where they were built (the (7) bucket entry); no entry fixes or chooses this.

The first draft's map case was from memory. I parsed `_maps/map_files/MetaStation/MetaStation.dmm` with a throwaway bun script (in the scratchpad, outside the repo) and looked for sinks with a clear line to an open tile of another room within 7 tiles. The Hydroponics sink is in sight only of maintenance, so I replaced the case with the Medbay Lobby one: sink (98,106) two tiles behind `airlock/medical/glass` at (97,107)/(98,107), and the janitor trim in `code/datums/id_trim/jobs.dm` has no medical access. The kitchen sinks seen from the service hallway and the Bar are the same shape; whether the kitchen door opens to a janitor was not checked. Not seen in a round. I added the window's pull back to the room (`supplyStep` picks a room by what was seen from it), which the server fix alone does not mend, and set effort to medium for that second part. Severity stays high: the Medbay Lobby is a room janitors are often sent to, and with a low bucket nothing at all is cleaned there.
