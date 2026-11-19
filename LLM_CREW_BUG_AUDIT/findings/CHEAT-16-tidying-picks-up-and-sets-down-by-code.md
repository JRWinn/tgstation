---
id: CHEAT-16
title: Tidying picks a thing up with put_in_hands and sets it on a table with transferItemToLoc, not by the clicks a player makes
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_tidying.dm:244, code/modules/llm_crew/crew_npc_tidying.dm:233, code/modules/llm_crew/crew_npc_tidying.dm:227, code/modules/llm_crew/crew_npc_tidying.dm:212, code/modules/llm_crew/crew_npc_tidying.dm:36
fix: Pick up with click_as_body on the thing with an empty hand, put down with click_as_body on the table or bin with it in the active hand, shut a locker with a click, and skip flipped tables
---

See also: KNA-04 (step 3, `take_item`) and GAP-07 (its table). Since they were checked, both name the pick-up at `crew_npc_tidying.dm:244`, with the same fix; neither has the other three places here (table, bin, locker). This file keeps all four together. Also JAN-05 and JAN-11 (other tidying faults), TRC-01 and SUP-10 (what is shut).

## What is wrong

`tidy_step` does all of its work by direct calls:

- picking up: `body.put_in_hands(thing)`. A player clicks the thing with an empty active hand, which goes through the item's `attack_hand` and its pickup checks. `put_in_hands` also has a side effect SUP-03 found: with no hand free it drops the thing on the floor rather than refuse. `tool_tidy` checks for a free hand first, but only at the start of the errand, not after the walk.
- setting down on a table or rack: `body.transferItemToLoc(carried, get_turf(target))`. A player clicks the table with the thing in the active hand (`/obj/structure/table` item interaction), which refuses in combat mode and places it where the click lands. `put_down_unasked_item` in `crew_npc_hands.dm` already does this honestly with `body.ClickOn(surface)`.
- putting in a bin: `bin.place_item_in_disposal(carried, body)`, the bin's inner proc. A player clicks the bin with the thing in hand (`/obj/machinery/disposal/item_interaction`), which refuses an `ABSTRACT` item and in combat mode, and adds a fingerprint.
- shutting a crate or locker: `container.close(body)`. A player clicks it with an empty hand.

None of them waits for a click: a body puts away one thing a step, but with no click gap between picking it up and the errand to the table.

How far each strays (checker's note). The pick-up and the table are the real ones: `put_in_hands` skips `attempt_pickup` (`items.dm:546`: the `INTERACT_ITEM_ATTACK_HAND_PICKUP` flag, `MOBILITY_PICKUP`, the slow pick-up in heavy gravity, the item's `pickup()` and the attack-hand signals), and `transferItemToLoc` skips `table_place_act` (`tables_racks.dm:387`) and the rack's `base_item_interaction` (:1382). The bin and the locker are mild: `place_item_in_disposal` is what the bin's `item_interaction` calls after its fingerprint and combat-mode tests, and `close(body)` is what a click reaches through `closet/attack_hand` -> `toggle`.

Concrete cases:

1. A flipped table. A player's click puts nothing on it (`base_item_interaction` returns at `if(is_flipped)`). `crew_npc_free_surface` (`crew_npc_tidying.dm:36`) does not test `is_flipped`, so it is chosen, and `transferItemToLoc` puts the thing on its tile anyway.
2. A rolling table. Placing by click calls `AfterPutItemOnTable`, which ties the thing to the table so it rolls with it (`tables_racks.dm:491`). Put there by `transferItemToLoc`, the thing is left behind when the table is pushed.
3. A technician carries a crowbar to a table and its other hand filled during the walk (the bar's monkey hands people things). `transferItemToLoc` puts the crowbar down whichever hand is active. That is the right thing put down, but no hand was chosen; a click would put down what is in the active hand, so the honest fix must choose the hand.

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

1. Pick up: `empty_clicking_hand()` (`crew_npc_machines.dm:296`), then `click_as_body(thing)` (`:259`; it waits the click gap and checks reach), then `body.is_holding(thing)`. Fail with "You cannot pick up the X." if not. The same three steps are already used for kit in `crew_npc_security.dm` (KNA-04 points at them). Do not use `put_in_hands` as a fallback: when no hand is free it drops the thing at the body's feet (SUP-03), moving it a tile.
2. Put down: `hand_to(carried)` (`crew_npc_security.dm:285`) to make its hand the active one, then `click_as_body(target)` for a table, rack or bin. Check the thing left the hand and, for a table or rack, is on its tile; for a bin, is inside it. If it is still in hand, keep the existing "You cannot let go of the X." / bin failure path and `tidy_skipped`.
3. Shut: keep the `container.opened` test first (a click on a shut closet opens it), then `empty_clicking_hand()` (a click with something in hand puts it inside), `click_as_body(container)`, check `!container.opened`.
4. In `crew_npc_free_surface`, skip a table with `is_flipped` set, so a flipped table is never chosen.
5. Keep the existing `tidy_skipped` handling on each failure.

`tidy_step` runs inside `do_errand`, which may sleep, so the click waits are allowed there; `put_down_unasked_item` (`crew_npc_hands.dm:620-623`) already sets things on tables by `ClickOn` the same way.

## How to test the fix

- Server compile.
- No simulator case changes: the sim stands in for the body's tidy step; the window side sends the same `tidy` tool.
- A round: drop a few things in the Cargo Bay and watch a technician tidy. The things should land on tables at the table's centre, the work-done count (`work_put_away`) should rise as before, about a second slower per item. Flip a table in the bay: nothing is put on it. Put a rolling table in the bay, let it be tidied onto, push the table: the things go with it.

## Check

Checked by Opus 5.5. The four quotes are what `crew_npc_tidying.dm` says today, at :244, :233, :227 and :212, all in `tidy_step` (:205), reached from `do_errand` (`crew_npc_hands.dm:245-246`) after its reach test. Read the base procs: `put_in_hands` (`inventory.dm:293`) skips `attempt_pickup` and drops the thing on failure; `table_place_act` and the rack's `base_item_interaction` are skipped by `transferItemToLoc`, and with them the flipped-table refusal and the rolling table's `AfterPutItemOnTable`; the bin and closet procs are the ones a click reaches, so those two places are mild. Nothing in `LLM_CREW_CHANGELOG.md` or `LLM_CREW_PLAN_NO_CHEATS.md` chose this or fixed it. Not a duplicate: KNA-04 and GAP-07 now name the pick-up line (added by their checker), not the other three. Mended the "see also" line, added the flipped and rolling table cases (the crowbar case was weak: the current code does put down the right thing) and the flipped-table step. Severity high stands on the no-cheats rule; effort small, about 25 lines in one file.
