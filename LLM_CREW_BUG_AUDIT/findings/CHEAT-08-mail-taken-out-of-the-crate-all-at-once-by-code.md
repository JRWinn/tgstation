---
id: CHEAT-08
title: Every letter in a mail crate goes into the technician's bag at once by code, with no click on any letter, the crate or the bag
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_freight.dm:520, code/modules/llm_crew/crew_npc_freight.dm:551, code/modules/llm_crew/crew_npc_freight.dm:543
fix: Open the crate with a click, then for each letter click it into an empty hand and click the bag with it, a click gap apart, and drop junk with the drop key
---

## What is wrong

`take_mail` opens the mail crate by calling `crate.open(body)`, waits 0.8 seconds, and then, in one loop with no wait, does for every letter on the crate's tile:

- addressed to someone: `body.equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE)`, straight from the floor into the bag;
- addressed to nobody: `body.put_in_hands(letter)` then `body.dropItemToGround(letter)`, or, if the body stands on the crate's tile or on the shuttle, `equip_to_storage` into the bag as well.

Then `crate.close(body)`. A player does each letter by hand: click the letter with an empty hand (it is picked up), click the backpack with it (it goes in), and the click cooldown is 0.8 seconds a click. A mail crate holds one letter or more per crew member: with twelve letters a player is at it for about twenty seconds; the body is done in under one, and was never next to the bag's storage UI at all.

The base code skipped is real: picking a letter up goes through the item's pickup (`attack_hand` on an item, which can refuse), and a click on a backpack goes through the bag's own `atom_storage` insert checks with feedback. `equip_to_storage` with `indirect_action = TRUE` is the path the game uses for things like quick-equip, not for a hand putting things in a bag.

Not listed in `LLM_CREW_PLAN_NO_CHEATS.md`. KNA-04 lists `free_a_hand` and `hand_mail_over`, and GAP-07 lists `take_item` and `take_from_container`; `take_mail` is in neither.

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

Read from the code. Note also the comment "With both hands full it goes straight to the floor at its feet": a letter that cannot be put in a hand is counted as binned, though it never moved and still lies on the crate's tile, where `crate.close(body)` takes it back in. The crate then still holds that junk letter and is not empty (the shuttle will not fly with a letter aboard, change log entry (24)).

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
