---
id: JAN-11
title: Tidying takes anything off the floor with no thought for whose it is, things a person has just put down, is standing on, or that fell from someone lying hurt
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_tidying.dm:48, code/modules/llm_crew/crew_npc_tidying.dm:112, code/modules/llm_crew/crew_npc_tidying.dm:244
fix: In wants_tidying leave alone a thing on or next to a tile with a living person other than the body, and ask the owner whether a fresh drop should be left a minute
---

## What is wrong

`wants_tidying` takes every item lying on the floor of the body's work area that is not bulky, anchored, pulled, a shard, named mail, on a table, rack or conveyor, or beside an open crate. It never asks whether a person is there. So a cargo technician:

- picks up a thing the Captain has just put down in the Cargo Lobby to free a hand, while the Captain is standing on it or beside it, and walks off with it to a table;
- picks up what fell out of the hands of someone lying on the floor, stunned, hurt or dead: an officer's baton and cuffs in the middle of an arrest, a weapon by a body (that moves evidence too);
- picks up things a person is laying out on the floor to sort or hand over.

The things go on the nearest table in the room, which is not stealing, but a player technician would not lift something from under someone's feet, or from beside someone lying hurt, without a word.

Concrete case: the Captain stands at the lobby counter holding an order form and a pen, drops the pen to take a crate's paper, and turns to speak. Within the tidy check (`CREW_NPC_TIDY_CHECK`) the technician's `tidy_state` counts the pen, the brain sends `tidy`, `next_to_tidy` picks the pen as nearest, and the technician walks up to the Captain's feet, picks it up and carries it to the lobby table.

The Cargo Bay and Cargo Lobby are the only work areas now (`learn_starting_places` in `crew_npc_cargo.dm` gives `work_area` only to cargo technicians), so this is a cargo matter for now; but `work_area` is meant to be general.

## Where

`code/modules/llm_crew/crew_npc_tidying.dm:48`, `wants_tidying`:

    	if(!isturf(thing.loc) || thing.anchored || thing.pulledby || (thing.item_flags & ABSTRACT) || thing.w_class >= WEIGHT_CLASS_BULKY)
    		return FALSE
    	...
    	if((locate(/obj/structure/table) in spot) || (locate(/obj/structure/rack) in spot) || (locate(/obj/machinery/conveyor) in spot))
    		return FALSE
    	...
    	return TRUE

`code/modules/llm_crew/crew_npc_tidying.dm:244`, `tidy_step`, picking it up:

    	if(!body.put_in_hands(thing))

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `wants_tidying`, return FALSE if any `/mob/living/carbon/human` other than the body stands or lies on the thing's tile or a tile next to it (`for(var/mob/living/carbon/human/person in range(1, spot))`). That covers the person who just put it down and the person lying hurt. It is cheap: the loop is over a 3 by 3.
2. Ask the owner: should a thing that was dropped only a moment ago be left a while, in case its owner comes back for it? If yes, keep a "first seen lying here" time per thing in `tidy_skipped`'s style and skip it for a minute. If no, step 1 alone is enough.
3. Ask the owner: should a thing that is evidence (lying by a body, or near an officer making an arrest) be left for security? Step 1 already leaves most of it.

## How to test the fix

- Server compile to a side copy.
- In a round: stand in the Cargo Lobby and drop a pen at your feet. The technician should not take it while you stand there, and should once you have walked off.
