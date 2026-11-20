---
id: HOLE-18
title: A hand that is lost or disabled is counted as a free hand, so a one-handed body walks to every thing it is sent for and fails to pick it up, for good
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:15, code/modules/llm_crew/crew_npc_hands.dm:108, code/modules/llm_crew/crew_npc_hands.dm:263, code/modules/llm_crew/crew_npc_tidying.dm:193, code/modules/mob/inventory.dm:130, code/modules/mob/inventory.dm:293, code/modules/surgery/bodyparts/helpers.dm:96
fix: Count a hand as free only when has_hand_for_held_index says it works, in one helper used by every free-hand test, put things into that working hand by its index, and tell the brain when a hand stops working
---

## What is wrong

Every test the crew make for "is a hand free" asks the base game for the empty hand slots, `get_empty_held_indexes()`. That proc only looks at whether anything is in each slot of `held_items`:

	/mob/proc/get_empty_held_indexes() as /list
		. = list()
		for(var/i in 1 to held_items.len)
			if(!held_items[i])
				. += i

A human keeps two hand slots whether or not it still has two working hands. An arm that is cut off, or one the game has disabled (a mangled or broken arm from a bad wound, a nerve injury, a paralysed limb), leaves its slot empty for ever. The game itself checks for that before it puts anything in a hand: `can_put_in_hand` asks `has_hand_for_held_index(hand_index)`, which for a carbon is false when the arm is missing or `bodypart_disabled`.

So a body with one working hand that holds something in it:

1. Is told by `tool_pick_up` that it has a hand free (`crew_npc_hands.dm:15` passes, since the dead hand's slot is empty), and `free_a_hand` is never called.
2. Walks to the thing, or to the closet that holds it.
3. At the thing, `take_item` calls `body.put_in_hands(item)`, which finds no hand that can hold it, drops the item on the body's own tile (`inventory.dm:331`, "Failed to put in hands - drop the item") and returns FALSE. The brain is told "You cannot pick up the mop bucket."
4. The driver backs the step off and tries it again later, with the same result, for the rest of the round. Taking something out of a closet does the same, and leaves the thing on the floor by the closet each time.

Worse (found on check): the base `put_in_hands` (`inventory.dm:293`) tries the active hand, then only the first empty slot on the left side, then the right side only if the left has none empty. So with a dead, empty left hand that is the active one, the body cannot pick anything up even with its right hand free: the active hand fails, the left side offers the dead slot, that fails, and the item is dropped. A player would swap hands. No crew code does so before `put_in_hands`.

`free_a_hand` has the same fault at its end: `return !!length(body.get_empty_held_indexes())` reports a hand freed when the only empty slot is the dead one.

One concrete case. Pun Pun has broken a janitor's right arm (it has beaten crew unconscious in two logged rounds, and a beating can leave a bone wound that disables the arm). The janitor holds its mop in its left hand. Its job asks for the mop bucket, to carry water (`wants_bucket` is true: a mop held, no bucket). It walks to the bucket, fails, walks back to its work, and is sent for the bucket again whenever its back-off runs out. It never puts the mop down to carry the bucket instead, and it never says its arm is hurt: nothing tells its brain (no crew member but security is told its own health; see the next finding from this reviewer).

Read from the base procs, not seen in a round. Whether a given wound disables the arm depends on the wound: the compound fracture does, lesser fractures do not; a cut-off arm always does. Once a hand is dead the fault cannot be avoided (raised to `sure` on check).

## Where

`code/modules/llm_crew/crew_npc_hands.dm:15`, in `tool_pick_up`:

	if(!length(body.get_empty_held_indexes()) && !free_a_hand())
		action_result(CREW_TOOL_PICK_UP, FALSE, "Your hands are full of things you need. Put something down first.")
		return

`code/modules/llm_crew/crew_npc_hands.dm:108`, the end of `free_a_hand`:

	return !!length(body.get_empty_held_indexes())

`code/modules/llm_crew/crew_npc_hands.dm:263`, in `take_item`:

	if(!body.put_in_hands(item))
		return list(FALSE, "You cannot pick up the [item_name].")

`code/modules/surgery/bodyparts/helpers.dm:96`, the base game's own test for a working hand:

	/mob/living/carbon/has_hand_for_held_index(i)
		if(!i || i > length(hand_bodyparts))
			return FALSE
		var/obj/item/bodypart/hand_instance = hand_bodyparts[i]
		if(hand_instance && !hand_instance.bodypart_disabled)
			return hand_instance
		return FALSE

Other free-hand tests in the crew code should be searched the same way (`grep -n "get_empty_held_indexes\|held_items" code/modules/llm_crew/`); the window's own "hands full" and "wants a bucket" fields are worked out from `held_items` too.

## How it was found

Read from the code and the base procs named above. Not seen in a round. Not checked: every other place the crew code counts free hands (the security kit, hauling, the Quartermaster's book in hand), which a fix should sweep.

## How to fix it

1. Add a helper in `crew_npc_hands.dm`: `/datum/ai_controller/crew_npc/proc/free_hands()` returning the indexes from `get_empty_held_indexes()` for which `body.has_hand_for_held_index(index)` is true.
2. Use it in place of `get_empty_held_indexes()` in `tool_pick_up`, `free_a_hand`, and `crew_npc_tidying.dm:193` (the only three today; grep again before building).
2a. Where the crew code itself picks something up (`take_item`, `take_from_container`, the stowed-item loop in `tool_pick_up`), first `swap_hand` to the first index from `free_hands()` if the active hand is not one of them, so the base `put_in_hands` tries the working hand first. Swapping hands is a click a player makes; the cleaning code already does it (`crew_npc_cleaning.dm:72`).
3. In `free_a_hand`, when the body has one working hand and it is full, the thing in it is the spare unless it is the one tool the job is about to use; let the existing trade-tool rule decide, but on a one-handed body treat a mop held when a bucket is wanted as spare (so the bucket can be carried, and the mop fetched after), or, simpler, have the window stop asking for the bucket: send `working_hands` (0, 1 or 2) in `ui_data` and have `wants_bucket` and the janitor's water plan require two.
4. When the count of working hands drops, emit a knowledge event once: "Your right arm is hurt and will not hold anything." That is a body feeling its own arm, not a cheat.
5. With no working hands at all, tools that need a hand answer at once "You have no hand you can use", so the step is not walked to.

## How to test the fix

- DM compile.
- A throwaway admin test in a round: spawn a janitor, disable its right arm (with View Variables on the arm bodypart, or by taking the arm off with any of the game's ways of doing so), give it a mop in the left hand, and watch `game.log` and its Crew Brain card: it should say the arm will not hold anything and not walk to the bucket again and again.
- Simulator: add `working_hands` to the stand-in server's state and a janitor case with one hand.

## Check

Confirmed. The quotes in `crew_npc_hands.dm` (`tool_pick_up`, `free_a_hand`, `take_item`) are what the code says. Read the base procs: `get_empty_held_indexes` looks only at `held_items`; `can_put_in_hand` refuses a slot when `has_hand_for_held_index` is false, which for a carbon is a missing hand bodypart or `bodypart_disabled`; `/obj/item/bodypart/arm/set_disabled` (`default_parts.dm:198`) drops what the arm held when it goes dead, so the dead slot is always empty and always counted free. An arm is disabled by `TRAIT_PARALYSIS`, which a disabling wound adds (`_wounds.dm:318`, `:426`): the critical blunt wound, the compound fracture (`bones.dm:427`, `disabling = TRUE`), and some burns (`burns.dm`), as well as a cut-off arm. The janitor case follows: `wants_bucket` (`crew_brain_link.dm:119`) stays true while it holds a mop and no bucket, and the janitor's plan (`jobs/janitor.ts:582`) asks for the bucket each time.

Found on check and added above: the base `put_in_hands` tries only the left side's first empty slot before giving up on that side, so a dead left hand that is active stops all picking up, even with the right hand free. Step 2a covers it.

Raised confidence to sure: given a dead hand the fault cannot be avoided. Not seen in a round. Severity medium stands: a disabling wound or a lost arm is not in most rounds, but the body then fails its fetches for good. Effort raised to medium: the helper and the swap are small, but steps 3 to 5 reach `ui_data`, the window and a new knowledge event. The fix keeps the rules (a body feeling its own arm is a sense, swapping hands is a player's click).

## Fix so far

Server, group m-hands (`crew_npc_hands.dm`, `crew_npc_tidying.dm`, `crew_npc_machines.dm`). Done, steps 1, 2, 2a, 4 and 5:

- `free_hands()`: the empty hand indexes for which `has_hand_for_held_index` is true. `working_hand_count()`. `ready_free_hand()`: swaps to an empty working hand if the active one is not one (a player's click), TRUE if one is active.
- Used in `tool_pick_up`, at the end of `free_a_hand`, in `tool_tidy` (`crew_npc_tidying.dm`), and in `empty_clicking_hand` (`crew_npc_machines.dm`), which now swaps to an empty working hand rather than to "the other hand", so an empty dead hand is never the one that clicks (this covers tidying's shut-and-pick-up clicks and the machine clicks).
- `take_item`, `take_from_container` and the stowed-item loop in `tool_pick_up` make a working empty hand active, then `put_in_active_hand`: a thing that will not go into the hand stays where it was instead of being dropped at the body's feet.
- `note_working_hands()`: when fewer hands work than when last counted, a knowledge event, "Your right hand will not hold anything: the arm is hurt, or gone.", and a `log_game` line "has N working hands now, M before". Counted on every `pick_up` and every `empty_clicking_hand`, so the first such step after the injury tells it, not the moment of the injury.
- With no working hand, `pick_up` answers at once "You have no hand you can use."

Left (held):

- `crew_brain_link.dm` `ui_data`: `wants_bucket` uses `length(body.get_empty_held_indexes())`; use `length(npc.free_hands())`. Send `"working_hands" = npc.working_hand_count()` too, and in the window (`jobs/janitor.ts` water plan, `wants_bucket`) ask for a bucket only with two working hands (step 3, the simpler of its two choices).
- `crew_npc_quartermaster.dm:94` loops over `get_empty_held_indexes()` to see if there is a hand free for the order book: use `free_hands()`.
- For the event to come at the moment of the injury, `note_working_hands()` could be called from the sense tick (`crew_npc_senses.dm`), not only from hand use.

Round M2 (g-tasks): the janitor's bucket step (`jobs/janitor.ts`, the CLEAN plan) needs `workingHands(brain) >= 2`, read from `brain.workingHands` through a cast, two when unset. Table: `tools/llm_crew/janitor-hands.ts`. Held: nothing copies `npc.working_hands` into the brain yet: `brain.ts` ingest needs `brain.workingHands = typeof npc.working_hands === 'number' ? npc.working_hands : 2` (and the field in `types.ts`).
