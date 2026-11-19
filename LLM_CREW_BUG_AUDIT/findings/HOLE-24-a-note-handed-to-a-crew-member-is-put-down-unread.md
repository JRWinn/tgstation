---
id: HOLE-24
title: A paper note, form or order handed to a crew member is put down unread as something that is not its own, so writing is no way to reach the crew, not even when speech and PDAs fail
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_hands.dm:567, code/modules/llm_crew/crew_npc_hands.dm:600, code/modules/llm_crew/crew_npc_quartermaster.dm:137
fix: When a sheet of paper with writing on it comes into a crew hand from someone, read it the way the Quartermaster reads its own book and pass the text to the same readers a PDA message from that person goes to, then put it down or keep it as the job says
---

## What is wrong

In the game, paper is one of the ordinary ways people pass word: a note handed over at a counter, a written list of what to order, a stamped form, a note slid under a door, the orders a Captain writes when the comms are down. A player who cannot make a crew member understand them by speech, or whose PDA is not sending (HOLE-06), will write it down and hand it over.

No crew member ever reads a paper it is given. The only reading of paper in our code is the Quartermaster reading its own order book (`order_book_lines`, `crew_npc_quartermaster.dm:137`).

What happens when a player puts a written sheet in a crew member's hand:

1. `on_item_in_hand` (`crew_npc_hands.dm:567`) sees something in the hand that it did not pick up. A sheet of paper is not one of its trade tools, so it is kept as `unasked_item`.
2. `put_down_unasked_item` tells the brain "You find a paper in your hand that you did not pick up. <name>, standing by you, must have put it there. It is not yours, and you will put it down." (`:600`), and sets it on the nearest table or at its feet.
3. What is written on it is in no event, no prompt and no log. The voice is told the paper is not its own, so it answers along the lines of "That's not mine", to the person who has just handed it a note.

Concrete case: the PDAs have stopped (about 26 minutes into a test round, per the owner's notes). The Captain writes "Order two janitorial supplies crates for the janitors" on a sheet and hands it to the Quartermaster at its desk. The Quartermaster says the paper is not its, puts it on the desk, and nothing is ordered. The same for a stamped request form handed to a cargo technician at the counter, or a written "Warrant: Pun Pun, 10 minutes" handed to the Head of Security.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:567`, `on_item_in_hand`:

    	if(is_trade_tool(item, trade_tool_types()))
    		return
    	unasked_item = WEAKREF(item)
    	unasked_item_waits = 0
    	addtimer(CALLBACK(src, PROC_REF(put_down_unasked_item), TRUE), CREW_NPC_UNASKED_NOTICE)

`:600`, in `put_down_unasked_item`:

    		emit_sense(CREW_SENSE_KNOWLEDGE, "You find a [item_name] in your hand that you did not pick up.[giver ? " [giver.name], standing by you, must have put it there." : ""] It is not yours, and you will put it down.", list("item" = item_name))

`code/modules/llm_crew/crew_npc_quartermaster.dm:137`, the one place paper is read, which shows the way to do it:

    		for(var/datum/paper_input/written as anything in sheet.raw_text_inputs)
    			for(var/line in splittext(written.raw_text, "\n"))

## How it was found

Read from the code: `grep raw_text code/modules/llm_crew/` finds only the order book. Not seen in a round. Nothing in the plans or the change log mentions crew reading paper.

## How to fix it

1. In `put_down_unasked_item`, on the first look, if the item is `/obj/item/paper` (or a clipboard or folder with paper in it, or `/obj/item/paper/fluff` and the like) and has writing, read it as a player would: only if the body can see (`!is_blind()`), is literate (`HAS_TRAIT(body, TRAIT_ILLITERATE)` false) and there is light to read by (`turf.get_lumcount()` above the level the game uses for reading). Put the text together from `raw_text_inputs` as `order_book_lines` does, and note any stamps (`raw_stamp_data`).
2. Emit a sense event of a new kind, `note_read`, with `speaker` = the giver's name as seen (the person standing by it, as the code already works out), `job` from their worn ID, the text, and whether it is stamped.
3. In the window, send a `note_read` through the same readers a PDA message goes through (`readSummons`, `readPickup`, `readWanted`, then `jobFor(brain.job).readsMessage`), with the giver as the sender. Those readers already check rank by job. Wake the voice for it as for speech said to the body, with the text, so it can say "I'll see to it" or "I can't read this".
4. After reading, put the paper down as now, or hand it back to the giver (`tool_give`), whichever the owner prefers. Change the line "It is not yours" for a paper that was read: "<name> has handed you a note. It says: ...".
5. Keep the text off the floor of the prompt budget: cut it to the same length a PDA message is cut to (`CREW_NPC_MESSAGE_MAX_LENGTH`).
6. Question for the owner: should a stamp count for anything (a stamped request form as the head's approval), or is the writer's own job enough?

## How to test the fix

- Server compile.
- In a round: write a line on a sheet with a pen, hand it to the Quartermaster, and read `game.log` for the read line and the brain log for the reader's step. Then try the same in the dark, and blind, and check it is not read.
- Simulator: add a `note_read` event to the stand-in and a table case that it reaches the Quartermaster's order reader as a PDA message would.
