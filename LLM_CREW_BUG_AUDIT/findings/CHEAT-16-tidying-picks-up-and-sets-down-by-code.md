---
id: CHEAT-16
title: Tidying picks a thing up with put_in_hands and sets it on a table with transferItemToLoc, not by the clicks a player makes
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_tidying.dm:244, code/modules/llm_crew/crew_npc_tidying.dm:233, code/modules/llm_crew/crew_npc_tidying.dm:227, code/modules/llm_crew/crew_npc_tidying.dm:212
fix: Pick up with click_as_body on the thing with an empty hand, put down with click_as_body on the table or bin with it in the active hand, and shut a locker with a click
---

See also: KNA-04 (item 4, `take_item`) and GAP-07 (its table). Neither lists the tidying code, which does the same things in four more places, and the fix is the same.

## What is wrong

`tidy_step` does all of its work by direct calls:

- picking up: `body.put_in_hands(thing)`. A player clicks the thing with an empty active hand, which goes through the item's `attack_hand` and its pickup checks. `put_in_hands` also has a side effect SUP-03 found: with no hand free it drops the thing on the floor rather than refuse. `tool_tidy` checks for a free hand first, but only at the start of the errand, not after the walk.
- setting down on a table or rack: `body.transferItemToLoc(carried, get_turf(target))`. A player clicks the table with the thing in the active hand (`/obj/structure/table` item interaction), which refuses in combat mode and places it where the click lands. `put_down_unasked_item` in `crew_npc_hands.dm` already does this honestly with `body.ClickOn(surface)`.
- putting in a bin: `bin.place_item_in_disposal(carried, body)`, the bin's inner proc. A player clicks the bin with the thing in hand (`/obj/machinery/disposal/item_interaction`), which refuses an `ABSTRACT` item and in combat mode, and adds a fingerprint.
- shutting a crate or locker: `container.close(body)`. A player clicks it with an empty hand.

None of them waits for a click: a body puts away one thing a step, but with no click gap between picking it up and the errand to the table.

Concrete case: a technician tidying the Cargo Bay picks up a crowbar from the floor and carries it to a table. If its other hand filled during the walk (the bar's monkey hands people things), `transferItemToLoc` still puts the crowbar down; the thing in the active hand may not be the crowbar at all, since nothing makes the crowbar's hand active. A player clicking the table would put down whatever is in the active hand.

## Where

`code/modules/llm_crew/crew_npc_tidying.dm:244`:

    	if(!body.put_in_hands(thing))
    		tidy_skipped[REF(thing)] = world.time

`:233`:

    		if(!body.transferItemToLoc(carried, get_turf(target)))

`:227`:

    			if(!bin.place_item_in_disposal(carried, body))

`:212`:

    		if(container.opened && !container.close(body))

## How it was found

Read from the code.

## How to fix it

1. Pick up: `empty_clicking_hand()`, then `click_as_body(thing)` (it waits the click gap and checks reach), then `body.is_holding(thing)`. Fail with "You cannot pick up the X." if not.
2. Put down: `hand_to(carried)` (from `crew_npc_security.dm`) to make its hand the active one, then `click_as_body(target)` for a table, rack or bin. Check the thing left the hand and, for a table, is on the table's tile; for a bin, is inside it.
3. Shut: `empty_clicking_hand()`, `click_as_body(container)`, check `!container.opened`.
4. Keep the existing `tidy_skipped` handling on each failure.

## How to test the fix

- Server compile.
- A round: drop a few things in the Cargo Bay and watch a technician tidy. `game.log` should show the same "put away" counts, about a second slower per item.
