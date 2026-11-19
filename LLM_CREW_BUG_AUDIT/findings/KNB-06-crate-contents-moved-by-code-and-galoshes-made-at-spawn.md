---
id: KNB-06
title: Two cheats from the no-cheats plan are still in - a crate is unpacked by forceMove onto the tiles round it, and a janitor's galoshes are made at spawn
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:570, code/modules/llm_crew/crew_npc_spawn.dm:19, LLM_CREW_PLAN_NO_CHEATS.md:142
fix: Unpack by opening the crate with a click and leaving its contents on its own tile, and delete the galoshes swap from create_crew_npc
---

## What is wrong

These are the two smaller cheats that `LLM_CREW_PLAN_NO_CHEATS.md` names and that nobody came back to. The change log's last line ("Earlier work") says "Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute)". The water cheat in the same table was taken out in the 13:30 entry. The door and the shuttle are KNB-04 and KNB-05. They are written as one finding because each is a few lines and the plan fixes them side by side (sections 4.5 and 4.6).

1. **Unpacking.** When someone collects a crate, `tip_out` takes each item out of it and `forceMove`s it to one of the up to eight tiles round the crate, dealt out in turn. No player can do that. Opening a crate drops everything on the crate's own tile.
2. **Galoshes.** `create_crew_npc` deletes the shoes the janitor's outfit gave it and makes a pair of galoshes on its feet. That is `new` and `qdel` on a body's kit, and it also breaks the rule "Supplies come through cargo, never at spawn". The reason it was done (a janitor slipping on its own wet floor) was dealt with on 2026-11-18 by `mind_its_step`, which walks across slippery tiles, and the owner agreed "Is walking enough in place of galoshes? Yes for now."

Concrete case for 1: a head collects "1 Janitorial Supplies Crate". The crate is hauled to it, `tip_out` runs, and a mop, a bucket, three rags and the rest appear spread over the tiles round the crate, some of them on the far side of a table. Concrete case for 2: every janitor in every round starts in galoshes it never fetched, and `data/logs/.../game.log` has no line for it because nothing is logged.

One thing the galoshes hide: a janitor is the only crew body that does not slip on a floor that is "only wet from a mop", which the 09:40 entry says every body "does not know of, and slips on like anyone, unless its shoes grip". With the galoshes gone the janitor will slip on its own mopping unless wet floor is treated as known to the one who wetted it. See step 4.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:556`, `tip_out`:

    	for(var/obj/item/thing as anything in crew_npc_crate_holds(crate))
    		index++
    		thing.forceMove(spots[((index - 1) % length(spots)) + 1])
    		names |= format_text(thing.name)
    	return names

`code/modules/llm_crew/crew_npc_spawn.dm:13`, in `create_crew_npc`:

    	// A janitor works on floors it has just made wet. In ordinary shoes it slips on them, falls, and
    	// drops what it is holding. A real janitor puts on the galoshes from the wardrobe; this one starts in them.
    	if(ispath(outfit_type, /datum/outfit/job/janitor))
    		var/obj/item/ordinary_shoes = npc.get_item_by_slot(ITEM_SLOT_FEET)
    		if(ordinary_shoes)
    			qdel(ordinary_shoes)
    		npc.equip_to_slot_or_del(new /obj/item/clothing/shoes/galoshes(npc), ITEM_SLOT_FEET)

## How it was found

Read from the code, against the plan's table at `LLM_CREW_PLAN_NO_CHEATS.md:79` ("Galoshes | `crew_npc_spawn.dm` | Deletes a janitor's shoes at spawn and creates galoshes on it.") and `:80` ("Unpacking | `tip_out` | Moves a crate's contents by code onto the tiles round it."). Not seen in a round as a fault.

## How to fix it

Unpacking (plan 4.6):

1. In `tip_out`, open the crate the way a click does: `click_as_body(crate)` from beside it. `/obj/structure/closet/crate` opens and its contents land on its own tile. Read the names of what came out from that tile. Delete the `forceMove` loop and the `spots` list.
2. A crate that will not open for the body (locked to another department) is reported as it is: "The crate will not open for you." Do not open it by code.
3. The plan then has the body pull the open crate one tile clear and shut it before it is taken back. `tool_take_back` already hauls the crate away: add the shut (one more click) before the haul.
4. Whoever the things are for picks them up from the one tile. `tool_pick_up` already walks to a thing it knows of, so nothing changes there. Check `more_to_tidy`-style code does not take a pile on one tile for litter.

Galoshes (plan 4.5):

5. Delete the `if(ispath(outfit_type, /datum/outfit/job/janitor))` block. The janitor starts in the shoes of its outfit.
6. Before doing so, decide the wet-floor question, because it changes what a janitor does every minute of its shift. The owner ruled that a body does not know a floor is "only wet from a mop". A janitor did the mopping and does know. Proposed: `wet_mop`/`clean_mess` add the tile just mopped to the body's own `slippery_seen` (`remember_slippery` in `crew_npc_senses.dm`) for as long as a mopped tile stays wet, so `mind_its_step` walks it across. That is something its own body did, so it is not outside its senses.

Question for the owner: with the galoshes gone, may a janitor remember the tiles it has just mopped itself as slippery? Without that it will fall over on its own work.

## How to test the fix

- Server compile to a side copy.
- Simulator: unpacking is `collect` in `sim.ts`, which only lists names. No scenario changes. Run `crew` and `qm` to see nothing else moved.
- A round: after a collection, everything from the crate should lie on one tile. A janitor should spawn in ordinary shoes (examine it), and `game.log` should have no "slipped" for a janitor on a tile it mopped.
