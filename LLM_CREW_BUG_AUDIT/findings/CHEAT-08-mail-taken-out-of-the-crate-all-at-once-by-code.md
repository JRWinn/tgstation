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

Read from the code. (The first write-up also said that a junk letter that cannot go into a full hand stays on the crate's tile and is counted as binned wrongly. That is not so: `put_in_hands` that finds no free hand moves the item to the body's `drop_location()` (`inventory.dm:331` and `transferItemToLoc` at :368), its feet, and that branch is only taken when the feet are not the crate's tile. The comment in the code is right.)

## How to fix it

1. The opening may stay as it is. `crate.open(body)` is the `open()` a click reaches through `toggle()`, with the lock and weld checks, and GAP-02 and KNB-06 both take it as the honest way to open a crate. A click (`empty_clicking_hand()` then `click_as_body(crate)`) also works, but mind GAP-02's note that the first click on a crate with a manifest only tears the manifest off.
2. Keep `var/serial = errand_serial` at the start. For each letter, in turn: `empty_clicking_hand()`, `click_as_body(letter)` (picks it up; `click_as_body` waits `CREW_NPC_CLICK_GAP` first), check `body.is_holding(letter)`; if not, count it as left and go on.
   - Addressed to someone: `stow_in_bag(letter)` from `crew_npc_security.dm`, which clicks the bag with it in hand. If it stays in the hand the bag is full: put it back by clicking the open crate with it (`click_as_body(crate)`; an open closet puts what it is clicked with on its own tile, `transfer_item_to_turf` in `/obj/structure/closet/item_interaction`, `closets.dm:798`), count it and every letter after it as left, and stop. Not `dropItemToGround`: that leaves it at the body's feet, outside the crate, where nobody will pick it up.
   - Addressed to nobody: as now, drop it at its feet only when the feet are neither the crate's tile nor the shuttle (`may_drop`); otherwise `stow_in_bag` it too, as the code does today. A dead letter dropped aboard the shuttle stops it flying (change log (24)).
3. After each letter check the errand is still current (`errand_serial == serial`), the body is still next to the crate (`can_reach_target_now(crate)`) and the crate is still open, and stop if not, reporting what was done so far: a twelve-letter crate is now a twenty-four-second job and the body can be called away or taken by the arm. This is LIFE-04's check, made once a letter.
4. Close the crate as now (`crate.close(body)`), or with a click.
5. The window waits on the result: `LOST_ACT_MS` in `driver.ts` is 12 seconds, but it does not count while `brain.doing` is set, and `describe_doing` reports "going to take the mail out of its crate" while the errand key is held. Check in a round that the window does not give the step up as lost part way through a long crate.

What must keep working: change log (24), a mail crate with junk in it must end up truly empty, so the shuttle can fly.

## How to test the fix

- Server compile.
- The simulator does not model letters; this needs a round. Grep `game.log` for the "take ... piece of mail" result and time it against the mail crate's letter count: it should take about two seconds a letter. Watch that the emptied mail crate is put aboard and the shuttle leaves.
- With a full backpack: the letters that do not fit must be left in the crate and reported as "There was no room for the rest", not dropped on the floor.
- Pull the technician away by the arm half way through: it must stop, and the letters not yet taken must stay in the crate.

## Check

Checked by Opus 5.5, read from the code. The quotes in `take_mail` (`crew_npc_freight.dm:520-560`) are as the code says: `crate.open(body)`, one `sleep(CREW_NPC_LOOK_TIME)`, then a loop with no wait that puts every addressed letter on the crate's tile into the bag with `equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE)` and junk into a hand and straight down. `equip_to_storage` (`inventory.dm:735`) is a direct `attempt_insert` with `override = TRUE`, a soft lock forced open and no messages; the base game uses it only to equip spawning mobs. No click on a letter or the bag happens, so this breaks the no-cheats rule and severity stays high. The proc runs in rounds (change log line 289: "(24) worked for a plain mail crate"). No entry accepts it. I refuted one side claim: a junk letter that finds no free hand is not left on the crate's tile, because `put_in_hands` drops it at the body's feet (`inventory.dm:331-368`) and that branch runs only off the crate's tile, so the old fix step 5 was dropped. I also corrected the click timing (the body's gap is one second, `crew_npc_machines.dm:39`), the base-game claim about quick-equip, and the GAP-07 cross-reference, and put back the shuttle case for junk, which the first fix steps left out, and changed the full-bag step to put the letter back in the open crate by a click (`closets.dm:798`) rather than drop it outside. Effort is medium, not small: the loop with its checks and partial results is more than twenty lines. Nothing was run.
