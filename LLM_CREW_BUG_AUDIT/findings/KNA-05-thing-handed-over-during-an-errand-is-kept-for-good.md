---
id: KNA-05
title: A thing pushed into a hand while the body is on any errand is taken for its own and carried for the rest of the shift
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 6cbf2eeb8e8, 64afbbe6e12
found_by: Fable 5.2
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:567, code/modules/llm_crew/crew_npc_security.dm:1001
fix: During an errand, count a thing as its own only if the errand is one that picks things up and the thing is what it went for, and queue the rest to be put down
---

## What is wrong

The bar's monkey hands people what it is holding. `on_item_in_hand` was built so that a crew member looks at its hand and puts such a thing down. But it returns at once whenever the body is on an errand of any kind, on the grounds that the thing "is what it went for". An errand is most of what a body does: walking up to arrest someone, opening a door for someone, going to a console, hauling a crate. A thing that lands in a hand during any of them is never noted, so `put_down_unasked_item` is never queued, and the body keeps it for good.

Listed in the change log, entry of 2026-11-18, 20:53 to 21:05, under Known and not fixed: "Things that land in its hand during an errand are still taken for its own doing. Before the baton they are now dropped. Before the cuffs alone they are not." And in "Why": "The brain's step at 20:51:59 has the officer 'holding airlock electronics', which it had not picked up. They came into its hand while the try with the cuffs was under way."

The case, by the code: the officer is told `arrest` (quiet). `start_errand` sets `errand_tool = CREW_TOOL_ARREST`. While it walks up, Pun Pun puts a space beer in its left hand. `on_item_in_hand` sees `errand_tool` set and returns. The cuffs go on or do not; either way the errand ends with the beer still held and nothing queued. The officer carries the beer on its rounds. With a second gift in the other hand, `put_cuffs_on` calls `draw_item`, which calls `empty_clicking_hand`, which calls `free_a_hand`, and the beer goes into its bag (by `equip_to_storage`, see KNA-04) and is never seen again. That is how "The revolver went into the officer's bag" (19:38 entry).

For the baton this was mended by `drop_for_weapon`. For everything else it stands: the cuffs alone, a technician opening a door, a head walking to a meeting spot.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:567`, `on_item_in_hand`:

    if(!(slot & ITEM_SLOT_HANDS) || (item.item_flags & ABSTRACT))
    	return
    // Its own doing, or handed over by one of the crew.
    if(errand_tool || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET))
    	return

`put_down_unasked_item` just below it already copes with busy hands: it waits six seconds at a time, ten times, while `errand_tool` is set. So the early return is not needed to protect an errand in progress. It is only there to tell a fetched thing from a given one, and it does that by asking whether any errand is on, not whether this errand fetches things.

`code/modules/llm_crew/crew_npc_security.dm:1001`, `put_cuffs_on`: no `drop_for_weapon` here, by design ("Before the cuffs alone they are not").

## How it was found

Read from the code. The round is `data/logs/2026/11/19/round-20.43.32` by the change log's account ("found a ... in its hand that it did not pick up" lines are the ones that did get noticed; the ones during errands write nothing, which is the fault).

## How to fix it

1. In `on_item_in_hand`, replace the blanket test with: is this thing what the errand in hand would bring to hand?
   - `is_trade_tool(item, trade_tool_types())`: its own, as now (move this test above the errand test).
   - `errand_tool` is `CREW_TOOL_PICK_UP` and `name_matches(item.name, errand_item)`: its own.
   - `errand_tool` is `CREW_TOOL_TIDY` and `item == tidy_item?.resolve()`: its own.
   - `errand_tool` is one of `CREW_TOOL_MAIL`, `CREW_TOOL_PAPER`, `CREW_TOOL_GET_KIT`, `CREW_TOOL_OPEN_CRATE`, `CREW_TOOL_FORCE_DOOR`, `CREW_TOOL_MACHINE`, `CREW_TOOL_CLEAN`: its own (these take letters, paper and pen, kit, tools, a bucket). Check each of these in its file before trusting the list.
   - a storage search in progress (`BB_CREW_NPC_STORAGE_TARGET`): looking in a locker takes nothing in hand, so not its own.
   - anything else: note it as `unasked_item` and start the `put_down_unasked_item` timer, as the code below the test does now. That proc will wait for the errand to end.
   **A sturdier way, which I would take (added on check):** the list above has to name every errand that brings something to hand, and one left out makes the body put down what it has just taken, a new fault. Most of those hand-fills are the body's own synchronous calls: `put_in_hands` in `take_item`, `take_from_container` and `tool_pick_up`, and the clicks in `draw_item`/`click_as_body`/`hand_to`. `COMSIG_MOB_EQUIPPED_ITEM` fires inside those calls. So set a controller var, `var/taking_in_hand = FALSE`, to TRUE around each of the body's own takes (a small helper, `take_into_hand(item)` or a wrapper around the click), and have `on_item_in_hand` return when it is TRUE. Then the errand test can go altogether: anything that lands while the body is not taking it, and not within two seconds of `being_handed_something`, is unasked. Grep `put_in_hands\|click_as_body\|ClickOn` in `code/modules/llm_crew/` for the call sites (about 40 lines over 8 files). Trade tools stay kept, as now.
2. Leave the two-second `handed_at` test as it is: a thing one of the crew hands over is kept.
3. In `put_down_unasked_item`, the first look writes one line to the brain for each thing. The 19:38 entry counted "34 lines to the brain in under four minutes". With step 1 there will be more. Say it once a minute at most for each giver (`harm_told_at` is a pattern for that), and always write the `log_game` line.
4. No change to `put_cuffs_on` is then needed: the thing is put down when the try is over. If the owner wants the cuffs to behave as the baton does (drop first), that is one call to `drop_for_weapon()` at the top of `put_cuffs_on`, renamed. **Question for the owner:** drop what it holds for the cuffs too, or only for the baton?

Keeps the rules: the body puts the thing down with a click on a table or drops it, as it does now.

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code.
- Next round with the monkey loose: `game.log` "found a X in its hand that it did not pick up" should now appear for things given during an arrest, each followed by "put down the X it had not picked up". No "put away its X to free a hand" for a thing that is not the body's own. The officer's "holding" line in `crew_brain.log` should not list beers or circuit boards minutes after a fight.

## Check

Confirmed. `on_item_in_hand` (`crew_npc_hands.dm:567`) and `put_down_unasked_item` (`:587`) are as quoted: the first returns on any `errand_tool` or errand/storage blackboard key before the `unasked_item` timer is set, and nothing else in `code/modules/llm_crew/` ever sets `unasked_item`, so a thing that lands during an errand is never looked at again. `put_down_unasked_item` already waits while `errand_tool` is set, so moving the test later does not disturb an errand, as the write-up says. The chain to the bag holds: `put_cuffs_on` (`crew_npc_security.dm:1001`) calls `draw_item`, which calls `empty_clicking_hand` (`crew_npc_machines.dm:296`), which calls `free_a_hand`. `drop_for_weapon` (`crew_npc_security.dm:342`) is the baton's mend. The change log lists the fault as known and not fixed (top entry, 2026-11-18 20:53 to 21:05, the line "Things that land in its hand during an errand are still taken for its own doing"), and no later entry mends it; the finding adds the cause and a fix, so it stands under rule 4.

On the fix: the allow-list in step 1 would work but is fragile. Cuffs, batons and crowbars drawn during an arrest or a forced door are trade tools for security and engineering and so kept, but a non-trade thing the body takes during another errand kind (a book, a prisoner's things, a crate's contents) would be put straight down if its tool is missed. I added a flag-based way, which marks the body's own takes instead of guessing from the errand. Severity medium and effort small stand for step 1; the flag way is closer to medium in lines but still one part of the code. Not run: nothing here can be checked without a round.

## Fix so far (round A1, a-secsrv, compile only)

On the owner's yes to step 4's question: `put_cuffs_on` (`crew_npc_security.dm`) calls `drop_for_weapon("its cuffs")` before it draws the cuffs, unless they are already in its hand, as `baton_hits` does before the baton. Whatever else is in its hands goes on the floor at its feet; `game.log` says "dropped X at ... to draw its cuffs."
