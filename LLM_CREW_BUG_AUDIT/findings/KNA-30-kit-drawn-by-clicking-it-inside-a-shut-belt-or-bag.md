---
id: KNA-30
title: Baton, cuffs and an engineer's tools are drawn by clicking them where they lie inside a belt or bag that was never opened, which a player cannot click
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_security.dm:324, code/modules/llm_crew/crew_npc_forcing.dm:300, code/game/objects/items.dm:564
fix: In draw_item, when the thing is inside a storage that is not open to the body, click that storage first to open it, then click the thing
---

## What is wrong

Listed in the change log entry of 2026-11-18, 16:50 to 17:35, Known and not fixed: "Taking a baton out of a belt held in the other hand is a click on the baton. A player has to open the belt first." The 17:35 addition put the belt on the officer, and the 18:50 and 19:38 work made `draw_item` the way every kit item and tool is taken out. The fault went with it to every caller, worn belts and bags included.

`draw_item` frees a hand and then clicks the thing itself, wherever it is: in a worn belt, in the backpack, inside a box in the backpack. The base game's pick-up takes a thing out of any storage it is in when it is clicked (`attempt_pickup`, `remove_single`). A player can only make that click on something they can see on screen, which for a belt or bag means opening it first (a click on the belt or bag, or the hotkey). So the body takes out its baton, cuffs, screwdriver, multitool and crowbar one click short of a player, and from storage it has never looked into.

It is small in time (the opening click is 0.4 seconds at `CREW_NPC_KIT_GAP`) but it is against the rule that a body does what a player could do, and KNA-04 holds `draw_item` up as the honest model for the other hand code, so it will be copied.

The case: the officer has its baton in the security belt it is wearing. `baton_hits` calls `draw_item(baton)`. The hand is emptied, 0.4 seconds go by, and `click_as_body(baton)` is made on the baton inside the belt. `attempt_pickup` sees `loc.atom_storage` and calls `remove_single(user, src, user)`, and the baton is in the hand. The belt was never opened.

## Where

`code/modules/llm_crew/crew_npc_security.dm:302`, `draw_item`:

    	for(var/go in 1 to 2)
    		if(!empty_clicking_hand())
    			...
    		sleep(go == 1 ? gap : 0.3 SECONDS)
    		...
    		if(!click_as_body(thing, null, 0))
    			draw_stopped = "it was in no state to reach for it"
    			continue

Its callers: `use_tool_on_door` and `take_door_power` (`crew_npc_forcing.dm:300`, `:375`), `wear_kit_belt` (`crew_npc_security.dm:674`, `:677`), the cuffs (`:901`, `:1003`) and the baton (`:943`).

Base game, `code/game/objects/items.dm:564`, `attempt_pickup`:

    	//If the item is in a storage item, take it out
    	var/outside_storage = !loc.atom_storage
    	...
    	if(loc.atom_storage)
    		...
    		if(!loc.atom_storage.remove_single(user, src, user, silent = TRUE))

## How it was found

Read from the code. Not seen in a round: the logs say only that the baton came out ("has its baton and cuffs"), not how. "Likely" rather than "sure" because I did not trace every check in `ClickOn` for an item two levels inside the body's inventory; `click_as_body` is reported as working on such items by the 17:06 and 19:38 rounds (the baton came out of the worn belt), so the click does go through.

## How to fix it

1. In `draw_item`, before the click on the thing, find the storage it is in: `var/obj/item/holder = thing.loc` while `holder.atom_storage` and `holder != body`. If that storage is not open to the body (`!(body in holder.atom_storage.is_using)`; check the var name in `code/datums/storage/storage.dm`), click the holder first, with the empty hand, and wait the kit gap. For a worn belt or a backpack that click opens it (`open_storage`), as it does for a player. For a box inside the bag, open the bag, then the box.
2. Leave pockets alone: a thing in a pocket slot is on screen and is clicked straight out by a player.
3. Close what it opened when done is not needed (a player often leaves it), but the open window does nothing for a body with no client, so either is fine.
4. Keep the log lines as they are; add "it could not open its X" as a reason for `draw_stopped`.

## How to test the fix

Server compile to a side copy. Next round, `game.log` for the officer's first locker trip and first arrest: the time from "put on the security belt" to the first "with its baton" will be 0.4 seconds longer; the counts should not change. For an engineer, "forced open" lines as before.
