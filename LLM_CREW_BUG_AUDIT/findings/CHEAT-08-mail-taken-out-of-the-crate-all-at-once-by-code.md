---
id: CHEAT-08
title: Every letter in a mail crate goes into the technician's bag at once by code, with no click on any letter, the crate or the bag
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_freight.dm:520, code/modules/llm_crew/crew_npc_freight.dm:551, code/modules/llm_crew/crew_npc_freight.dm:543, code/modules/mob/inventory.dm:735
fix: For each letter in turn click it into an empty hand and click the bag with it by stow_in_bag, a click gap apart, dropping junk off the crate's tile, and stop if the errand ends or the crate is out of reach
---

## What is wrong

`take_mail` opens the mail crate by calling `crate.open(body)`, waits 0.8 seconds, and then, in one loop with no wait, does for every letter on the crate's tile:

- addressed to someone: `body.equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE)`, straight from the floor into the bag;
- addressed to nobody: `body.put_in_hands(letter)` then `body.dropItemToGround(letter)`, or, if the body stands on the crate's tile or on the shuttle, `equip_to_storage` into the bag as well.

Then `crate.close(body)`. A player does each letter by hand: click the letter with an empty hand (it is picked up), click the backpack with it (it goes in): two clicks a letter. The body's own clicks (`click_as_body`) wait `CREW_NPC_CLICK_GAP`, one second, each. A mail crate holds one letter or more per crew member: with twelve letters that is about twenty-four seconds; the body is done in under one, and its hands never touch a letter it bags.

The base code skipped is real: picking a letter up goes through the item's pickup (`attack_hand` on an item, which can refuse), and a click on a backpack goes through the bag's own `atom_storage` insert with its checks and feedback. `equip_to_storage` (`inventory.dm:735`) calls `attempt_insert(item, src, override = TRUE, force = STORAGE_SOFT_LOCKED, messages = FALSE)` when `indirect_action` is set: a soft-locked bag still takes it, and nothing is said. Its other callers in the base game are spawn and outfit code (`outfit.dm:260`, station traits, quirks), not a hand putting a thing in a bag.

Not listed in `LLM_CREW_PLAN_NO_CHEATS.md`. KNA-04 lists `free_a_hand` and `hand_mail_over`. GAP-07's table now has a `take_mail` row, added by its checker, but GAP-07 is the gap of the missing read-through; this file is the fault itself, with the fix. LIFE-04 is about the same proc waking after its sleep somewhere else; step 3 below covers it for the new loop.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:523`, `take_mail`:

    	if(!crate.opened && !crate.open(body))
    		return list(FALSE, "The [crate_name] will not open.")
    	sleep(CREW_NPC_LOOK_TIME)
    ...
    	for(var/obj/item/mail/letter in crew_npc_crate_holds(crate))
    ...
    				if(may_drop)
    					// With both hands full it goes straight to the floor at its feet, which is where it was going.
    					if(body.put_in_hands(letter))
    						body.dropItemToGround(letter)
    					binned++
    				else if(body.equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE))
    					binned++
    ...
    		if(body.equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE))
    			taken++

## How it was found

Read from the code. (The first write-up also said that a junk letter that cannot go into a full hand stays on the crate's tile and is counted as binned wrongly. That is not so: `put_in_hands` that finds no free hand moves the item to the body's `drop_location()` (`inventory.dm:331` and `transferItemToLoc` at :366), its feet, and that branch is only taken when the feet are not the crate's tile. The comment in the code is right.)

## How to fix it

1. Open the crate with a click as the body (`empty_clicking_hand()` then `click_as_body(crate)`), and check `crate.opened`. GAP-02 makes the same change for unpacking.
2. For each letter, in turn: `empty_clicking_hand()`, `click_as_body(letter)` (picks it up; `click_as_body` waits `CREW_NPC_CLICK_GAP` first), check `body.is_holding(letter)`.
   - Addressed to someone: `stow_in_bag(letter)` from `crew_npc_security.dm`, which clicks the bag with it in hand. If it stays in the hand the bag is full: drop it back (`dropItemToGround`) and count it as left.
   - Addressed to nobody: step off the crate's tile first if standing on it (one `Move`), then `dropItemToGround(letter)`.
3. After each letter check the errand is still current (`errand_serial`) and the body is still next to the crate (`can_reach_target_now`), and stop if not: a twelve-letter crate is now a twenty-second job and the body can be called away.
4. Close the crate with a click.
5. Count a junk letter as binned only if it is no longer on the crate's tile.

What must keep working: change log (24), a mail crate with junk in it must end up truly empty, so the shuttle can fly.

## How to test the fix

- Server compile.
- The simulator does not model letters; this needs a round. Grep `game.log` for the "take ... piece of mail" result and time it against the mail crate's letter count: it should take about two seconds a letter. Watch that the emptied mail crate is put aboard and the shuttle leaves.
