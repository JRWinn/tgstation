---
id: KNA-30
title: Baton, cuffs and an engineer's tools are drawn by clicking them where they lie inside a belt or bag that was never opened, which a player cannot click
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: ae4c4d4076c
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_security.dm:324, code/modules/llm_crew/crew_npc_forcing.dm:300, code/game/objects/items.dm:564, code/_onclick/click.dm:294
fix: In draw_item, when the thing is inside a storage other than the body, right-click each storage it is in first (outermost first), the open click a player makes, then click the thing
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

1. In `draw_item`, before the click on the thing, list the storages it is in: walk `thing.loc` up while it is an item with `atom_storage` and is not the body. Then, outermost first, make the open click on each with the empty hand and wait the kit gap: `click_as_body(holder, "right=1", gap)`. A right click reaches `COMSIG_ATOM_ATTACK_HAND_SECONDARY`, which every storage registers to `open_storage_on_signal` (`storage.dm:245`), so it is the open click for a worn belt, a held belt, a backpack and a box inside the backpack alike. The handler stops the click there only when the storage has `display_contents` (it returns `COMPONENT_NO_AFTERATTACK`, the same bit as `COMPONENT_CANCEL_ATTACK_CHAIN`); a storage without it lets the right click fall through to `attack_hand`, so skip those (a player cannot open them either).
   - Do **not** use a left click. A left click on a box inside the bag takes the box out (`on_attack`, `storage.dm:924`, only opens what is in the body's own slots or hands), and a left click on a worn thing whose storage has `attack_hand_interact = FALSE` (shoe and clothing pockets, `pockets.dm:24`, `:30`, `:82`) takes the worn thing off (`attempt_pickup`, `loc == user && outside_storage`).
   - Do **not** check whether it opened. `show_contents` returns FALSE for a mob with no client (`storage.dm:1073`), so `is_using` never holds the body, and it is `VAR_PRIVATE` besides. The click is the step a player makes; for a body with no client it shows nothing and changes nothing.
2. Things in the pocket slots (`l_store`, `r_store`) have the body as their `loc`, so step 1 finds no storage and they are clicked straight out, as a player does.
3. Nothing needs closing afterwards: no window was opened.
4. Keep the log lines as they are. The right click on a locked storage (`locked` in `open_storage`) does nothing, and the click on the thing then still takes it out; whether a locked storage should stop the draw is out of scope here.

## How to test the fix

Server compile to a side copy. Next round, `game.log` for the officer's first locker trip and first arrest: the time from "put on the security belt" to the first "with its baton" will be 0.4 seconds longer; the counts should not change. For an engineer, "forced open" lines as before. Also check that no body is seen taking off its belt or a box coming out of its bag when it draws (`attack.log` and the hands shown in the Crew Brain window): that is what a left click in step 1 would do.

## Check

Checked by Opus 5.5. The quoted `draw_item` loop is what `crew_npc_security.dm:311-333` says today, and its callers are the seven named (`grep draw_item(`). Traced the click: `click_as_body` (`crew_npc_machines.dm:259`) calls `ClickOn`; `/mob/living/DirectAccess` is `..() + get_all_contents()` (`code/_onclick/click.dm:294`), so a baton in a worn belt, or anything nested in the backpack, counts as in direct reach and goes to `UnarmedAttack`, `attack_hand`, `attempt_pickup` and `remove_single` (`items.dm:564-570`), with no step that asks whether the storage was open. A player cannot click it: it is on screen only once the storage is opened. The 16:50-17:35 change log entry lists it as known and not fixed (`LLM_CREW_CHANGELOG.md:341`); no later entry fixed it. Confidence raised to sure: the `ClickOn` step the finder had not traced is `DirectAccess`, which settles it. The fix was mended: the finder's `is_using` test can never be true for a body with no client (`show_contents`, `storage.dm:1073`), and a left click on the holder takes a nested box out or a pocketed worn item off, so the open click is a right click and its result is not checked. Severity medium stands: it is a skipped click, not a change to the world outside the game's handlers, and costs 0.4 seconds a storage. Effort small, about 10 lines in one proc.
