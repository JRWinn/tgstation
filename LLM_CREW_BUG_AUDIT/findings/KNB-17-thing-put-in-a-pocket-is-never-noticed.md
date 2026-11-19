---
id: KNB-17
title: A thing Pun Pun puts in a crew member's pocket is never noticed or put down, only one put in a hand is
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:569, code/datums/ai/generic_behaviors/give.dm:76
fix: Let on_item_in_hand also take the two pocket slots, and have put_down_unasked_item take the thing out of the pocket by a click before it sets it down
---

## What is wrong

Listed in the 2026-11-18 12:00 entry ("eleven faults from the 09:12 round"), under "Not built": "A thing put in a pocket is not noticed." Nobody came back to it.

The 12:00 entry found that "The cause was Pun Pun, not the crew. The game's monkey behaviour puts what it holds into the hand or pocket of whoever is near (`code/datums/ai/generic_behaviors/give.dm`; Pun Pun's chance is 30)." It then built `on_item_in_hand` and `put_down_unasked_item`, so that a body that finds something in its hand it did not pick up puts it down. The signal handler throws away every slot but the hands, so the pocket half of the same behaviour is not seen.

The base proc, `try_to_give_item` in `code/datums/ai/generic_behaviors/give.dm:76`, puts the thing in a pocket half the time, and every time the target has no free hand:

    	if(!has_valid_hand || prob(50))
    		target.equip_to_slot_if_possible(held_item, (!has_left_pocket ? ITEM_SLOT_RPOCKET : (prob(50) ? ITEM_SLOT_LPOCKET : ITEM_SLOT_RPOCKET)))
    	else
    		INVOKE_ASYNC(target, TYPE_PROC_REF(/mob, put_in_hands), held_item)

A janitor carrying a mop and a bucket has no free hand, so for it every gift goes to a pocket. For anyone else, one gift in two does. The fix built on 12:00 sees at most half of them.

What follows is small but real:

- The body is not told. It does not know it carries the thing, and its event list says nothing.
- The pocket stays full. Nothing in crew code puts things in pockets today, but a player's or a later tool's `equip_to_slot` would find it taken.
- The thing is carried off. The change log's own example is a salt shaker; a pocketed one leaves the room with whoever has it.
- `tool_pick_up` does look in pockets for something it is asked to pick up by name (`stowed != body.l_store && stowed != body.r_store` is the test that keeps them in), so a body asked for "a shaker" would take out Pun Pun's and think it its own.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:567`, `on_item_in_hand`:

    /datum/ai_controller/crew_npc/proc/on_item_in_hand(mob/living/carbon/human/body, obj/item/item, slot)
    	SIGNAL_HANDLER
    	if(!(slot & ITEM_SLOT_HANDS) || (item.item_flags & ABSTRACT))
    		return

`code/modules/llm_crew/crew_npc_hands.dm:590`, `put_down_unasked_item`, which only acts on a thing still held:

    	if(QDELETED(body) || QDELETED(item) || !(item in body.held_items))
    		unasked_item = null
    		return

## How it was found

Read from the code and the base `give.dm`. Not seen in a round: nothing logs a thing put in a pocket.

## How to fix it

1. In `on_item_in_hand`, accept `ITEM_SLOT_LPOCKET` and `ITEM_SLOT_RPOCKET` as well as the hands, with the same tests (not its own doing, not handed over by the crew, not a tool of its trade).
2. In `put_down_unasked_item`, if the thing is in a pocket, first take it into a free hand the way a player would, by a click on the pocket slot. If there is no clean way to click an inventory slot as the body, ask the owner whether `put_in_hands` from a pocket is acceptable here: it is the same direct call `tool_pick_up` already makes for things in pockets and bags (KNA-04 lists that call). Then set it down as for a thing found in a hand.
3. Word the event for a pocket: "You find a salt shaker in your pocket that you did not put there."

## How to test the fix

Compile. The simulator has no Pun Pun. In a round, give a crew member something with an empty pocket free (as a player, with the give action, or by leaving Pun Pun near it), and grep `game.log` for "in its pocket that it did not" and "put down the".
