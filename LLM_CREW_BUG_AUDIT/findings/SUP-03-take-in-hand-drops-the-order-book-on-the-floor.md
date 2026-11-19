---
id: SUP-03
title: With both hands full the Quartermaster drops its clipboard, sheet or pen on the floor when it only meant to check for a free hand
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: quartermaster
files: code/modules/llm_crew/crew_npc_quartermaster.dm:87, code/modules/llm_crew/crew_npc_quartermaster.dm:104, code/modules/llm_crew/crew_npc_quartermaster.dm:258, code/modules/mob/inventory.dm:293
fix: Make take_in_hand look for an empty hand first and return FALSE without touching the thing when there is none
---

## What is wrong

`take_in_hand` is meant to say "no" when the body has no free hand: "Returns FALSE if it has no hand free for it." It calls the game's `put_in_hands`, and that proc does not just say no. When both hands are full it **takes the thing out of wherever it is and drops it on the floor**, then returns FALSE.

So when the Quartermaster's hands are both full:

- `ready_to_write` takes the clipboard (with the order book on it) out of the bag and drops it at its feet, then answers "Your hands are full, so you cannot get your clipboard out to write in it."
- `take_paper` does the same to the clipboard before it has even taken a sheet (`if(board && !take_in_hand(board))`), then puts the new sheet in the bag.
- With no clipboard, `ready_to_write` drops the loose sheet, or the pen.

The order book counts only sheets that are on the body (`order_book_sheets` checks `get_atom_on_turf(sheet) == pawn`). Once the clipboard is on the floor the Quartermaster has no book. `order_book_lines()` returns null, the window takes it that there is nothing to write on, and the body is sent for paper again. Every order written so far is on a clipboard it has walked away from.

The case that loops for good, with no clipboard (a player has taken it, which the design allows: "Anyone who takes the clipboard can read the book, and without it the Quartermaster has no book"):

1. The Quartermaster fetches a sheet. `take_paper` puts it in the bag. The first `tool_note` takes the sheet into one hand and the pen into the other (`ready_to_write`, the `else if(!take_in_hand(pen))` branch). Both hands are now full, and stay full.
2. Some ten orders later the sheet has less than `CREW_NPC_NOTE_ROOM` (1212) characters left. `sheet_to_write_on()` is null, `tool_note` answers "There is no room left on the sheet ... You need another."
3. `tool_get_paper`, `take_paper`: no clipboard, so the new sheet goes in the bag and `add_book_sheet` names it "order book, sheet 2".
4. `tool_note` again. `sheet_to_write_on()` is the new sheet. `ready_to_write(new sheet)` calls `take_in_hand(sheet)`. Both hands are full (old sheet, pen). `put_in_hands` drops the new sheet on the floor and returns FALSE. The body is told its hands are full, with `no_paper = TRUE`.
5. The new sheet is no longer on the body, so `sheet_to_write_on()` is null again ("no room left"). Back to step 3, for the rest of the round: a trail of blank sheets named "order book, sheet N" on the floor, and no order is ever written down again.

The case with a clipboard needs the clipboard in the bag and both hands full at once. The test crew starts with the clipboard in the bag (`crew_npc_spawn.dm` puts held things away), so it is open from round start until the first sheet is fetched, and again whenever anything puts the clipboard back in the bag. Nothing in crew code does that today (`free_a_hand` leaves a clipboard alone, it is a cargo trade tool), so this half is rare.

## Where

`code/modules/llm_crew/crew_npc_quartermaster.dm:87`:

    /// Takes something the body has on it into a hand, if it is not in one already. Returns FALSE if it has no hand free for it.
    /datum/ai_controller/crew_npc/proc/take_in_hand(obj/item/thing)
    	var/mob/living/carbon/human/body = pawn
    	if(body.is_holding(thing))
    		return TRUE
    	return body.put_in_hands(thing)

The base proc, `code/modules/mob/inventory.dm:290`:

    //Puts the item our active hand if possible. Failing that it tries other hands. Returns TRUE on success.
    //If both fail it drops it on the floor (or nearby tables if germ sensitive) and returns FALSE.
    //This is probably the main one you need to know :)
    /mob/proc/put_in_hands(obj/item/I, del_on_fail = FALSE, merge_stacks = TRUE, forced = FALSE, ignore_animation = TRUE, visuals_only = FALSE)
    ...
    	// Failed to put in hands - drop the item
    	var/atom/location = drop_location()

The callers, `crew_npc_quartermaster.dm:104` in `ready_to_write`:

    	var/obj/item/held = board || sheet
    	if(!take_in_hand(held))
    		return "Your hands are full, so you cannot get your [held.name] out to write in it."
    ...
    	else if(!take_in_hand(pen))
    		return "Your hands are full, so you cannot hold a pen to write with."

and `:258` in `take_paper`:

    	// A sheet is clipped to a clipboard that is in the hand. With no hand free for it, the sheet goes in the bag.
    	if(board && !take_in_hand(board))
    		board = null

A smaller fault in the same lines: when the pen is dropped by that last `take_in_hand(pen)`, the proc returns before `kept_in.inserted_item = null`, so the PDA still lists a pen that is lying on the floor.

## How it was found

Read from the code, with the base proc read to check what it does on failure. Not seen in a round. The change log's Quartermaster entry says "With no free hand, or no pen, nothing is written", which is the intent. It does not list the drop.

## How to fix it

1. Change `take_in_hand` so it never calls `put_in_hands` without a free hand:

       /datum/ai_controller/crew_npc/proc/take_in_hand(obj/item/thing)
       	var/mob/living/carbon/human/body = pawn
       	if(body.is_holding(thing))
       		return TRUE
       	if(!length(body.get_empty_held_indexes()))
       		return FALSE
       	return body.put_in_hands(thing)

   `get_empty_held_indexes` is already used this way in `free_a_hand` (`crew_npc_hands.dm`).
2. In `ready_to_write`, for a loose sheet with no clipboard: the body needs one hand for the sheet and one for the pen, and it may already be holding an older sheet of the book. Before `take_in_hand(held)`, put any other sheet of the book it is holding back in the bag (`body.equip_to_storage(old_sheet, ITEM_SLOT_BACK, indirect_action = TRUE)`), which is what a player would do with a full page. That ends the loop in the case above.
3. In `ready_to_write`, clear `kept_in.inserted_item` (and call `kept_in.update_appearance()`) as soon as the pen has left the PDA, on every path, not only on success.
4. Consider calling `free_a_hand()` once before giving up in `ready_to_write` and `take_paper`: it puts away whatever the body holds that is not a tool of its trade. That is the general rule the rest of the crew code uses before picking something up.

What must keep working: with the clipboard already in a hand nothing changes (`is_holding` is checked first). With one hand free the clipboard comes out of the bag as now.

## How to test the fix

- Server compile to a side copy.
- No simulator case: this is server code. `tools/llm_crew/book.ts` is unaffected.
- In a round: give the Quartermaster something in each hand before its first trip to the paper bin (hand it two items as the Captain), then watch. The clipboard should stay in its bag, not appear on the floor. Take its clipboard away, let it fill a sheet (or shorten `MAX_PAPER_LENGTH` for the test), and check that the second sheet is written on and not dropped. `game.log` lines "wrote in its order book" should go on after the first sheet is full.
