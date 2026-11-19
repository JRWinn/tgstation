---
id: CHEAT-12
title: When the shuttle docks, the technician knows which crate is which order by reading the number off every attached manifest, aboard and in the bay, without touching one
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_cargo.dm:465, code/modules/llm_crew/crew_npc_held.dm:127, code/game/objects/structures/crates_lockers/crates.dm:113, code/modules/cargo/order.dm:132
fix: Learn a crate's number by tearing its manifest off with a click and reading it, one crate at a time as each is unloaded, and only then hold and label it
---

## What is wrong

`order_arrived` runs the moment the body is in the bay with the order docked. It looks at every crate aboard the shuttle and in the bay and the lobby, calls `crew_npc_manifest_number(crate)`, which reads `crate.manifest.order_id` off the manifest paper attached to the crate, matches the numbers against the order, makes a held-crate entry for each, and tells the brain "The supply shuttle has docked with what you ordered ...: crates #12 and #13". The body has not walked onto the shuttle, touched a crate, or read anything.

In the game the number is on the manifest paper (`"shipping manifest - #[id] ([pack.name])"`), and the manifest is attached to the crate. A player reads it by clicking the crate with an empty hand, which tears the manifest off into the hand (`/obj/structure/closet/crate/attack_hand` calls `tear_manifest(user)`), then examining or reading the paper. Opening the crate also tears it off and drops it. Seen from a distance a crate shows only that it has a manifest (an overlay), not its number.

The task this audit was given names this exact case: "what an order's number is before it has seen the manifest".

A second knowledge leak in the same proc: a crate whose manifest is gone is matched "by what it is: its name starts with the name of the pack". That part is fair (the crate's name is visible), but it is applied to crates aboard the shuttle the body has not looked at.

Concrete case: two orders come in on one shuttle, a Janitorial Supplies for the Head of Personnel (#12) and another for the Captain (#13). A player technician would have to go aboard, tear both manifests and read them to know which crate is whose. The NPC knows at once, from the counter, and sends both PDA messages with the right numbers before any crate has moved.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:471`, in `order_arrived`:

    	var/list/aboard = crates_aboard()
    	var/list/about = aboard.Copy()
    	for(var/area/room as anything in freight_rooms())
    		for(var/obj/structure/closet/crate/crate in room)
    			about |= crate
    ...
    	for(var/obj/structure/closet/crate/crate as anything in about)
    		var/number = crew_npc_manifest_number(crate)

`code/modules/llm_crew/crew_npc_held.dm:127`:

    /proc/crew_npc_manifest_number(obj/structure/closet/crate/crate)
    	var/obj/item/paper/fluff/jobs/cargo/manifest/manifest = crate.manifest?.resolve()
    	return QDELETED(manifest) ? null : manifest.order_id

The player's way, `code/game/objects/structures/crates_lockers/crates.dm:113`:

    /obj/structure/closet/crate/attack_hand(mob/user, list/modifiers)
    	if(tear_manifest(user))
    		return TRUE

## How it was found

Read from the code and the base crate and order code.

## How to fix it

1. `order_arrived` says only what the body sees: "The supply shuttle has docked." plus, if it can see crates aboard (in `view()`), how many. No numbers yet. Keep `ordered_numbers` and `ordered_kinds` on the controller, as now, for matching later.
2. Unloading is when numbers are learned. In `haul_freight` for `CREW_TOOL_UNLOAD`, before taking hold of the crate: with an empty hand, `click_as_body(crate)` (tears the manifest off into the hand); read the paper in hand (`istype(held, /obj/item/paper/fluff/jobs/cargo/manifest)` gives `order_id`, which is what reading it shows); then put the paper in the bag (`stow_in_bag`) or keep it with the order book for the Quartermaster.
3. If that number is one of `ordered_numbers`, make the held-crate entry there and then, and stick the label on (the label being honest is GAP-07's question). If the crate had no manifest, fall back to the name match, now that the body is beside it.
4. The PDA message to whoever ordered goes once all the order's crates are in the bay with numbers, or when the shuttle has nothing left to unload: "Your order is in: crates #12 and #13." The brain already waits for `notices_owed`; the notice is added at step 3 instead of in `order_arrived`.
5. `crew_npc_manifest_number` is then only called by code that has the paper in hand, and can be removed.

What must keep working: crates that came on an order are held and are not sent back; a crate a workmate hauled off first still gets its number (the workmate learned it; with GAP-06 that is a shared-list question).

Question for the owner: a torn-off manifest is a stamped form that cargo players hand in to the Quartermaster for a bonus. Should the technician keep the manifests and give them to the Quartermaster, or bin them?

## How to test the fix

- Server compile.
- Simulator: `sim.ts` sends the arrival with numbers today. It must send the dock first and the numbers on unloading; the cargo scenarios then check the PDA message waits for the unload.
- A round: order two crates for two people. `game.log` should show each crate's manifest torn off at the shuttle before its number appears in any PDA message (`pda.log`).
