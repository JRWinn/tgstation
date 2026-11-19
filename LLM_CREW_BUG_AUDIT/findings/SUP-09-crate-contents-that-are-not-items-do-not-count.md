---
id: SUP-09
title: Only small items count as what a crate holds, so a crate with a filing cabinet or a janitorial cart in it is called empty, "unpacked" with the thing still inside, and sent back to be sold
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_freight.dm:116, code/modules/llm_crew/crew_npc_cargo.dm:558, code/modules/llm_crew/crew_npc_held.dm:63, code/modules/cargo/packs/general.dm:95, code/modules/cargo/packs/service.dm:45
fix: Count everything a crate holds, not only /obj/item, and unpack by opening the crate so that what cannot be lifted comes out too
---

## What is wrong

`crew_npc_crate_holds` lists what is in a crate with `for(var/obj/item/thing in ...)`. Anything that is not an item is not seen: a structure, a machine, an animal. Three procs lean on that list.

- `crew_npc_crate_spent` ("is it empty?") says yes for a crate that holds only such things.
- `tip_out` ("unpack it") moves the items out and leaves the rest inside the shut crate.
- `crew_npc_crate_lost` calls a held crate "emptied", and so lost, when the items are gone.

This already bites one of the three crates cargo can order today. The Bureaucracy Crate (`/datum/supply_pack/misc/paper`, which `orderable_crates` lists) holds a wheeled filing cabinet, `/obj/structure/filingcabinet/chestdrawer/wheeled`, beside its paper and pens.

One case, today:

1. The Head of Personnel has paper ordered. Crate #14 comes in and is held. A janitor is sent for it and hauls it to the office.
2. `crate_collected` calls `tip_out`. The paper bins, pens and labeler are moved to the floor. The filing cabinet is not an item, so it stays in the crate. The body is told it has unpacked the crate and "The empty crate is yours to take back to cargo."
3. `tool_take_back` hauls the crate to the lobby. `misplaced_crates` sees a spent crate there and has it stowed in the bay. `spent_crates` then lists it (`crew_npc_came_by_shuttle` is set, `crew_npc_crate_spent` is TRUE), `tool_recycle` puts it aboard, and the shuttle sells the crate with the cabinet in it.

The worse case is one that is decided and not yet built. `LLM_CREW_PLAN_NO_CHEATS.md` section 6: "Should cargo be able to order the cart crate (800 credits)? Yes, added to what it can order." That pack is `/datum/supply_pack/service/janitor/janicart`:

    	contains = list(/obj/structure/mop_bucket/janitorialcart,
    					/obj/item/clothing/shoes/galoshes,
    ...
    	crate_type = /obj/structure/closet/crate/large

The cart is the whole point of the crate and it is a structure. As the code stands the janitor would haul the crate to the closet, `tip_out` would put a pair of galoshes on the floor, the body would report the crate unpacked, and the cart would go back to cargo inside the "empty" crate and be sold. The janitor would then tell its head it still has nothing to carry water in, and the head would order another.

The large crate has a second problem. A player cannot open it by hand: it is pried open with a crowbar, which breaks the crate into planks (`crowbar_act` in `crates/large.dm`). So for this crate there is no empty crate to take back at all, and the honest unpack planned in section 4.6 ("unpacking is opening the crate, by the same code a click reaches") cannot be `crate.open(body)`.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:116`:

    /proc/crew_npc_crate_holds(obj/structure/closet/crate/crate)
    	var/list/held = list()
    	for(var/obj/item/thing in (crate.opened ? crate.drop_location() : crate))
    		// The manifest is paperwork about the crate, not something that came in it.
    		if(!istype(thing, /obj/item/paper/fluff/jobs/cargo/manifest))
    			held += thing
    	return held
    ...
    /proc/crew_npc_crate_spent(obj/structure/closet/crate/crate)
    	return !length(crew_npc_crate_holds(crate))

`code/modules/llm_crew/crew_npc_cargo.dm:568`, in `tip_out`:

    	for(var/obj/item/thing as anything in crew_npc_crate_holds(crate))
    		index++
    		thing.forceMove(spots[((index - 1) % length(spots)) + 1])
    		names |= format_text(thing.name)

`code/modules/llm_crew/crew_npc_held.dm:63`, in `crew_npc_crate_lost`:

    	if(isnull(entry.collected_by) && crew_npc_crate_spent(crate))
    		return "it has been emptied"

`code/modules/cargo/packs/general.dm:95`, the Bureaucracy Crate:

    	contains = list(/obj/structure/filingcabinet/chestdrawer/wheeled,
    					/obj/item/camera_film,
    					/obj/item/hand_labeler,

## How it was found

Read from the code and the pack lists. Not seen in a round. `tip_out` moving things by code is a known cheat (`LLM_CREW_PLAN_NO_CHEATS.md`, the table in section 3 and section 4.6). What it leaves behind, and what `crew_npc_crate_spent` cannot see, is not listed anywhere I found (`grep` for "filing", "structure" and "non-item" in the change log and plans).

## How to fix it

1. In `crew_npc_crate_holds`, count every movable thing that the crate would hold, not only items. For a shut crate: everything in `crate` that is not the manifest. For an open crate: things on its tile that `crate.insertion_allowed(thing)` would take back in (the base proc, `closets.dm`), leaving out the crate itself and living people standing there. Keep the return a plain list. `take_mail` and `crew_npc_crate_has_mail` filter it by type already (`for(var/obj/item/mail/letter in ...)`, `locate(/obj/item/mail) in ...`), so they are unaffected.
2. `tip_out` is to be replaced under section 4.6 of the no-cheats plan by opening the crate. When that is built, everything comes out by the game's own `dump_contents`, cabinet and all, and this half of the fault goes with it. Until then, change the loop to `for(var/atom/movable/thing as anything in ...)` so that nothing is left inside. (It is still a cheat. It is at least not a cheat that loses the cargo.)
3. For a large crate, which cannot be opened by hand, the owner has to choose. **The question: how does a body with no crowbar unpack a large crate?** The ways I see, all honest:
   - the cart crate is collected by an engineer, or the janitor borrows a crowbar (there is one in every emergency toolbox) and uses it on the crate through the game's tool code, as `force_door_open` does for doors;
   - cargo pries it open in the bay, where there are crowbars, and what was in it is collected instead of the crate (a cart can be pulled);
   - large crates are left off the list of what can be ordered.
   I would take the second: it keeps "cargo delivers nothing" (the janitor still comes for the cart) and needs no new tool for janitors. Either way a pried crate is gone, so `crate_collected` must not set `crate_to_return` for it.
4. Until the owner has answered, do not add the cart crate to `orderable_crates`. Write that into the no-cheats plan's step for it.

What must keep working: a crate with nothing in it but its manifest is still empty. A mail crate with a dead letter in it is still not empty (the fix for fault 24 in the change log's 16:15 entry).

## How to test the fix

- Server compile to a side copy.
- No simulator case: the window only sees counts.
- In a round: have a Bureaucracy Crate ordered and collected by someone other than the Quartermaster. After the unpack the filing cabinet must be out on the floor with the paper, and the crate that goes back to the bay must show as empty when examined. Before the fix the cabinet goes back with it.
