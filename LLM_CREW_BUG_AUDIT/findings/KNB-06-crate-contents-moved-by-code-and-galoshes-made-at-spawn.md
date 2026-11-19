---
id: KNB-06
title: Two cheats from the no-cheats plan are still in - a crate is unpacked by forceMove onto the tiles round it, and a janitor's galoshes are made at spawn
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: 9a5a1f96b62
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:570, code/modules/llm_crew/crew_npc_spawn.dm:19, LLM_CREW_PLAN_NO_CHEATS.md:142
fix: Unpack by opening the crate in place and leaving its contents on its own tile, pull it clear before shutting it, and delete the galoshes swap once the owner has ruled on mopped tiles
---

## What is wrong

See also: GAP-02 (the unpacking alone, with the fuller fix), GAP-04 (the galoshes alone).

These are the two smaller cheats that `LLM_CREW_PLAN_NO_CHEATS.md` names and that nobody came back to. The change log's last line ("Earlier work") says "Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute)". The water cheat in the same table was taken out in the 13:30 entry. The door and the shuttle are KNB-04 and KNB-05. They are written as one finding because each is a few lines and the plan fixes them side by side (sections 4.5 and 4.6).

1. **Unpacking.** When someone collects a crate, `tip_out` takes each item out of it and `forceMove`s it to one of the up to eight tiles round the crate, dealt out in turn. No player can do that. Opening a crate drops everything on the crate's own tile.
2. **Galoshes.** `create_crew_npc` deletes the shoes the janitor's outfit gave it and makes a pair of galoshes on its feet. That is `new` and `qdel` on a body's kit, and it also breaks the rule "Supplies come through cargo, never at spawn". The reason it was done (a janitor slipping on its own wet floor) was dealt with on 2026-11-18 by `mind_its_step`, which walks across slippery tiles, and the owner agreed "Is walking enough in place of galoshes? Yes for now."

Concrete case for 1: a head collects "1 Janitorial Supplies Crate". The crate is hauled to it, `tip_out` runs, and three buckets, a mop, a push broom, three wet floor signs, a rag and the rest (`service.dm:34`) appear spread over the tiles round the crate, some of them on the far side of a table. Concrete case for 2: every janitor in every round starts in galoshes it never fetched, and `data/logs/.../game.log` has no line for it because nothing is logged.

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

1. In `tip_out`, open the crate from beside it. Either `crate.open(body)` (the proc a click reaches through `closet/attack_hand` -> `toggle` -> `open`, with its lock and weld checks; `take_mail` in `crew_npc_freight.dm:523` already does this), or clicks: `empty_clicking_hand()` then `click_as_body(crate)`. Mind that the **first** click on a crate with a manifest does not open it: `/obj/structure/closet/crate/attack_hand` (`crates.dm:113`) tears the manifest off into the hand and stops. A second click is needed, and with the manifest now in the active hand that second click goes to `item_interaction` (`closets.dm:695`), not an open, so the manifest must be put away or the other hand used. `crate.open(body)` avoids all that (`after_open` drops the manifest on the floor). But not on a wooden large crate, which opens only to a crowbar and has no such check in `open()` (see GAP-02 step 1). Its contents land on its own tile. Read the names from `crew_npc_crate_holds(crate)`, which reads the tile once `crate.opened` is set. Delete the `forceMove` loop and the `spots` list.
2. A crate that will not open for the body (locked to another department) is reported as it is: "The crate will not open for you." Do not open it by code.
3. The plan then has the body pull the open crate one tile clear and shut it before it is taken back. Do **not** shut it where it stands: base `close()` (`closets.dm:613`) calls `take_contents()`, which takes back everything lying on the crate's tile, so a crate shut in place before the things are picked up swallows them again. Pull it one step to a clear tile first, then shut it (`crate.close(body)` or a click with an empty hand), then haul. GAP-02 step 3 has the fallback for when no tile beside it is clear.
4. Whoever the things are for picks them up from the one tile. `tool_pick_up` already walks to a thing it knows of, so nothing changes there. Check `more_to_tidy`-style code does not take a pile on one tile for litter.

Galoshes (plan 4.5):

5. Delete the `if(ispath(outfit_type, /datum/outfit/job/janitor))` block. The janitor starts in the shoes of its outfit.
6. Before doing so, decide the wet-floor question, because it changes what a janitor does every minute of its shift. The owner ruled that a body does not know a floor is "only wet from a mop" (change log 09:40 entry, `LLM_CREW_CHANGELOG.md:914`). A janitor did the mopping and does know. Proposed: `clean_mess` notes the tile it has just mopped, with the time, and `knows_slippery` counts that tile while it is fresh (a mopped tile stays wet about 10 to 60 seconds: `MakeSlippery(TURF_WET_WATER, 10 SECONDS, ...)` in `other_reagents.dm:162`). It cannot simply go into `slippery_seen` as it is: `knows_slippery` only looks up the movables lying on the tile, never the turf, and `remember_slippery` prunes by a weakref going null, which a turf never does, so a turf there would be kept for good. A separate list of `turf ref -> time mopped`, read at the top of `knows_slippery` and dropped after a minute, is the small honest way. That is something its own body did, so it is not outside its senses. Walking does stop a water slip: the wet floor component sets `NO_SLIP_WHEN_WALKING` for water (`wet_floor.dm:92`).

Question for the owner: with the galoshes gone, may a janitor remember the tiles it has just mopped itself as slippery? Without that it will fall over on its own work.

## How to test the fix

- Server compile to a side copy.
- Simulator: unpacking is `collect` in `sim.ts`, which only lists names. No scenario changes. Run `crew` and `qm` to see nothing else moved.
- A round: after a collection, everything from the crate should lie on one tile, and the crate should go back shut and empty (nothing swallowed again). A janitor should spawn in ordinary shoes (examine it). Slips are logged by `log_combat` in `carbon_movement.dm:5`, so they are in `attack.log`, not `game.log`: `grep -n "slipped on the" attack.log` should show no janitor slipping on a tile it mopped.

## Check

Checked by Opus 5.5. Both quotes are what the code says today: `tip_out` at `crew_npc_cargo.dm:558-572` with the `forceMove` at :570, its one caller `crate_collected` at `crew_npc_held.dm:418`, and the galoshes block at `crew_npc_spawn.dm:15-19`. `tip_out` never sets `crate.opened` and never calls `open()`, so the lock and weld checks in `can_open` are skipped; the things go by `forceMove` to up to eight tiles. The galoshes are `qdel` plus `new` at spawn. No change log entry after the plan builds 4.5 or 4.6 (searched for galoshes, `tip_out`, unpack); the last line of the change log still lists the plan as not built. `mind_its_step` and the 09:40 entry (`LLM_CREW_CHANGELOG.md:914`) confirm a mopped floor is not known to any body, so the finding is right that removing the galoshes alone makes the janitor slip on its own work.

Mended: fix step 3 said to shut the crate before the haul; shut where it stands, `close()` -> `take_contents()` would take the unpacked things back in, so it must be pulled clear first. Fix step 1 now says the first click on a crate with a manifest only tears the manifest off (`crates.dm:113`). Step 6 now says why the mopped tile cannot go straight into `slippery_seen`. The crate's contents in the case were wrong (three buckets and one rag, not one bucket and three rags). Slips are in `attack.log`.

Not a duplicate: it holds two faults with two separate changes; GAP-02 and GAP-04 each hold one. Severity high stands (the no-cheats rule is broken in every round with a janitor or a collection). Effort medium stands.
