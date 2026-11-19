---
id: KNA-05
title: A thing pushed into a hand while the body is on any errand is taken for its own and carried for the rest of the shift
kind: bug
severity: medium
effort: small
confidence: sure
status: found
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
2. Leave the two-second `handed_at` test as it is: a thing one of the crew hands over is kept.
3. In `put_down_unasked_item`, the first look writes one line to the brain for each thing. The 19:38 entry counted "34 lines to the brain in under four minutes". With step 1 there will be more. Say it once a minute at most for each giver (`harm_told_at` is a pattern for that), and always write the `log_game` line.
4. No change to `put_cuffs_on` is then needed: the thing is put down when the try is over. If the owner wants the cuffs to behave as the baton does (drop first), that is one call to `drop_for_weapon()` at the top of `put_cuffs_on`, renamed. **Question for the owner:** drop what it holds for the cuffs too, or only for the baton?

Keeps the rules: the body puts the thing down with a click on a table or drops it, as it does now.

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code.
- Next round with the monkey loose: `game.log` "found a X in its hand that it did not pick up" should now appear for things given during an arrest, each followed by "put down the X it had not picked up". No "put away its X to free a hand" for a thing that is not the body's own. The officer's "holding" line in `crew_brain.log` should not list beers or circuit boards minutes after a fight.
