---
id: JAN-14
title: A sink that has run dry is still taken as water to hand, and a wetting whose click never landed is reported as the sink having run dry
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:122, code/modules/llm_crew/crew_npc_cleaning.dm:83, code/modules/llm_crew/crew_npc_cleaning.dm:89, code/game/objects/structures/water_structures/sink.dm:166, code/game/objects/items/mop.dm:50
fix: Take a sink as water only with 5 units or more in it, as a mop bucket is taken only with water in it, and in wet_mop tell a click that could not be made from a sink with no water
---

## What is wrong

Two small faults in the same few lines.

**A dry sink.** `water_to_hand` and `water_for_bucket` take a mop bucket, cart or water tank only if it has water in it (`reagents?.total_volume >= 1`), but take any sink. A sink holds 100 units and refills at 0.5 a second (`sink.dm`: `capacity = 100`, `reclaim_rate = 0.5`). Each wetting of a mop takes 15 and each bucket fill up to 70, so the Custodial Closet's sink, used by every janitor, can be drained. A drained sink is still `sink_in_view`, the brain still plans "Your mop is dry and there is a sink right here", and each `clean` goes to it, clicks, and gets what has trickled back in that second or two: half a unit, a unit. A mop with half a unit counts as wet in `can_clean_with` (`>= 0.1`), but the game's mop washes nothing with less than 1 unit of a cleaning reagent on it (`should_clean` returns `CLEAN_NO_WASH`), so the next scrub cleans nothing and the mess is written off as stubborn (half of the way to writing off its kind in the room).

**A missed click.** In `wet_mop` (and `fill_bucket`), if `click_as_body` returns FALSE on the first go, because the body was pulled or bumped out of reach in the one second gap, or is stunned, or cuffed, the loop breaks and the answer is "You could not wet your mop at the sink: it has run dry." That is not the reason. The brain passes that wording to the model and the LLM may say it, and the plan repeats the same `clean` to the same sink anyway.

Concrete case: three janitors wet their mops and fill their buckets at the closet sink in the first ten minutes: two buckets (70 each, but the sink has 100) and one mop. The sink is empty. The third janitor's mop runs dry nearby; it goes to the sink, clicks, gets 0.5 units, then 0.5 more on the next click, and so on to four clicks: 2 units. It cleans two messes, comes back. Or, in the half unit case, it scrubs a mess, nothing comes off, and the mess is written off.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:122`, in `water_to_hand` (and the same at `:138` in `water_for_bucket`):

    	for(var/obj/structure/sink/sink in in_sight)
    		if(get_dist(pawn, sink) < nearest_distance)

against the check the mop bucket gets, at `:117`:

    		if(tub.reagents?.total_volume >= 1 && get_dist(pawn, tub) < nearest_distance)

`code/modules/llm_crew/crew_npc_cleaning.dm:83` and `:89`, in `wet_mop`:

    		if(!click_as_body(source, one_go ? "right=1" : null))
    			break
    	...
    	if(!can_clean_with(mop))
    		return list(FALSE, "You could not wet your mop at the [source_name]: it has run dry.", TRUE)

`code/game/objects/items/mop.dm:50`, the game's own test:

    	if(reagents.total_volume < 0.1)
    		cleaner.balloon_alert(cleaner, "mop is dry!")
    		return CLEAN_BLOCKED
    	if(reagents.has_reagent(amount = 1, chemical_flags = REAGENT_CLEANS))
    		return CLEAN_ALLOWED
    	return CLEAN_ALLOWED|CLEAN_NO_XP|CLEAN_NO_WASH

## How it was found

Read from the code and the base game's sink and mop. Not seen in a round.

## How to fix it

1. In `water_to_hand` and `water_for_bucket`, take a sink only if `sink.reagents?.total_volume >= 5` (one click's worth). A sink that is "dry" for now is then not water to hand; `sink_in_view` goes FALSE; the brain's existing dry-mop step looks for water elsewhere.
2. In `can_clean_with`, for a mop, use the game's own rule: `tool.reagents?.has_reagent(amount = 1, chemical_flags = REAGENT_CLEANS)` (also JAN-02 step 2). A mop with half a unit is dry.
3. In `wet_mop` and `fill_bucket`, keep a flag for "no click was made" and answer "You could not reach the [source_name]." in that case. Say "it has run dry" only when a click was made and nothing came, and the source is really empty (`source.reagents.total_volume < 1`).
4. Fit this with JAN-04 (water seen through a window): both are rules for which water counts as to hand, and belong in one helper used by `look_around`, `tool_clean` and the two finders.

## How to test the fix

- Server compile to a side copy.
- In a round: empty the closet sink (fill buckets from it as a player), then dry a janitor's mop there. It should go for other water or say the mop is dry, not stand clicking the empty sink.
