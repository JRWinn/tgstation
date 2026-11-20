---
id: JAN-12
title: Every tile a janitor mops is left slippery for up to a minute with no caution sign put out, and nothing warns anyone walking in
kind: gap
severity: low
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: code/modules/llm_crew/crew_npc_cleaning.dm:512, code/game/objects/items/mop.dm:68, code/modules/reagents/chemistry/reagents/other_reagents.dm:160, code/modules/cargo/packs/service.dm:37
fix: Ask the owner - put a wet floor sign (obj/item/clothing/suit/caution) down by the mopping when the janitor has one, and pick it up after, or say Wet floor aloud, as a player janitor does
---

## What is wrong

See also: GAP-04, which is about crew bodies themselves walking on a wet floor and janitors being given galoshes. This is the other half: the people the janitor leaves behind it.

The mop wets every tile it cleans. `/obj/item/mop/proc/apply_reagents` exposes the floor to its reagents with a multiplier of 10 (`reagents.expose(cleaned_turf, TOUCH, 10)`), so a mop with even a few units of water on it gives the floor 5 units or more, and water makes a floor slippery for `min(reac_volume * 1.5 SECONDS, 60 SECONDS)`, at least 10 seconds. A hallway mopped tile by tile is a strip of wet floor for a minute.

A player janitor puts out a wet floor sign (`/obj/item/clothing/suit/caution`, three come in every Janitorial Supplies crate, and the janitor's cart holds them), or at least says "wet floor". The crew janitors do neither. Nothing in `crew_npc_cleaning.dm` or `jobs/janitor.ts` knows of caution signs. The Captain, and every crew member in ordinary shoes, slips and drops what they hold.

Concrete case: a janitor mops five dirt decals along the Central Primary Hallway. Each tile it stood on is wet for about a minute. The Captain runs through ten seconds later, slips on the first tile, and is knocked down.

## Where

`code/game/objects/items/mop.dm:68`:

    /obj/item/mop/proc/apply_reagents(datum/cleaning_source, turf/cleaned_turf, mob/living/cleaner, clean_succeeded)
    	if(!clean_succeeded)
    		return
    	reagents.expose(cleaned_turf, TOUCH, 10) //Needed for proper floor wetting.

`code/modules/reagents/chemistry/reagents/other_reagents.dm:160`:

    	if(reac_volume >= 5)
    		exposed_turf.MakeSlippery(TURF_WET_WATER, 10 SECONDS, min(reac_volume*1.5 SECONDS, 60 SECONDS))

`code/modules/llm_crew/crew_npc_cleaning.dm:512`, the mop used on the floor with no sign:

    	var/atom/target = istype(tool, /obj/item/mop) ? get_turf(mess) : mess
    	body.ClickOn(target)

## How it was found

Read from the code and the base game's mop and water. Not seen in a round.

## How to fix it

This is the owner's to decide: it adds a thing to carry, and a step. The question is "should janitors put out wet floor signs, or only say so?"

1. The cheap part, no new carrying: when a janitor starts mopping in a room with someone in view, have the brain say "Mind the wet floor" through the usual voice path, with that line as the plain fallback. Code decides, the model only words it.
2. The full part: treat a caution sign as cleaning gear. If the janitor has one in its bag or a free hand, put it down (a plain drop, `dropItemToGround`, as a player does with the drop key) on the first tile it mops in a room, and pick it up again (`take_item`) when it leaves the room. The signs come from the closet or the Janitorial Supplies crate like the rest: never made at spawn.
3. If GAP-04's galoshes are taken away, the janitor needs the sign or the wet floor walking rule for itself too; do the two together.

## How to test the fix

- Server compile to a side copy, simulator for any brain step added.
- In a round: watch a janitor mop a hallway with the Captain about. A sign should go down and come up again, or the line should be said.
