---
id: KNA-04
title: The list of cheats a helper reported in older code was never checked - all of it is true and still in the code
kind: bug
severity: high
effort: large
confidence: sure
status: found
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:308, code/modules/llm_crew/crew_npc_hands.dm:105, code/modules/llm_crew/crew_npc_hands.dm:33, code/modules/llm_crew/crew_npc_hands.dm:263, code/modules/llm_crew/crew_npc_hands.dm:276, code/modules/llm_crew/crew_npc_doors.dm:592, code/modules/llm_crew/crew_npc_doors.dm:780, code/modules/llm_crew/crew_npc_freight.dm:601, code/modules/llm_crew/crew_npc_quartermaster.dm:114
fix: Replace each direct call with the click a player makes, starting with hand_over, which puts things into a player's hand
---

## What is wrong

The change log entry of 2026-11-18, 18:05 to 19:12 says: "The helper also listed places in older code that break the no-cheats rule, which I have not checked against `LLM_CREW_PLAN_NO_CHEATS.md`: `hold_door_for` and `let_door_close` call a door's `open()` and `close()` directly; `reset_fire_alarm` calls the alarm's `reset()`; `take_from_container` opens a container and puts the thing in the hand; `hand_over` uses `forceMove`; `tool_pick_up` and `free_a_hand` use `put_in_hands` and `equip_to_storage`." The entry of 19:38 adds: "`free_a_hand` puts a thing away with `equip_to_storage` ... The revolver went into the officer's bag that way."

I checked each against the code. Every one is there. Only the door is in the plan (`LLM_CREW_PLAN_NO_CHEATS.md`, section 3 table and 4.8, step 5 of section 5, not built). The rest are in no plan. Two more of the same kind turned up beside them.

Worst first:

1. **`hand_over` puts what the body holds straight into another person's hand, whoever they are.** A player is given no offer to take or refuse. With their hands full the thing is moved to the floor at their feet by `forceMove`. The Captain is a player: `give` to the Captain plants the item in the Captain's hand. A player gives with the offer action (the other clicks the alert to take it) or puts the thing down. `hand_mail_over` does the same with letters.
2. **`hold_door_for` sets a var of the door by hand** (`door.autoclose = FALSE`) and calls `door.open()`; `let_door_close` sets it back and calls `close()`. A player cannot stop an airlock from closing itself without wiring. The check before it (`door.allowed(body)`) is honest; the opening is not a click or a bump.
3. **`free_a_hand` moves a held thing into the bag with `equip_to_storage`**, with no click on the bag, whatever the thing is and whether or not the bag is one the body could open with a hand full. `tool_pick_up` takes a thing out of a bag or pocket with `put_in_hands`.
4. **`take_item` picks a thing up with `put_in_hands`**, not a click on it. The game's own checks on picking up (what `attack_hand` on an item runs: the item's `pickup` refusals, a thing that burns the hand, a thing too heavy) are skipped.
5. **`take_from_container` calls `container.open(body)` and `container.close(body)`** and then `put_in_hands`. `open(user)` does run the closet's own lock check, so this is the mildest.
6. **`reset_fire_alarm` calls `alarm.reset(body)`.** The game's reset is a right-click (`attack_hand_secondary` in `code/game/machinery/firealarm.dm:295`). Note for the fix: a plain click on a fire alarm pulls it (`attack_hand` calls `alarm(user)`), so the honest version must be a right-click, not `ClickOn` with no modifiers.
7. **`use_order_book` moves the pen into the clipboard with `forceMove`** and sets `board.pen` by hand (`crew_npc_quartermaster.dm:114`, and again at `:266` to `:300` when it puts the book away). A player clicks the clipboard with the pen.

The case for 1: the Head of Personnel is told `give("p2")` with a salt shaker in hand and the Captain (a player) standing by with both hands free. The salt shaker is in the Captain's hand the same tick.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:308`, `hand_over`:

    if(!body.temporarilyRemoveItemFromInventory(held))
    	return list(FALSE, "You cannot let go of the [held_name].")
    ...
    if(person.put_in_hands(held))
    	return list(TRUE, "You hand the [held_name] to [person.name].")
    // Their hands were full, so it ends up at their feet.
    held.forceMove(person.drop_location())

`code/modules/llm_crew/crew_npc_freight.dm:599`, `hand_mail_over`:

    if(!person.put_in_hands(letter))
    	letter.forceMove(person.drop_location())

`code/modules/llm_crew/crew_npc_doors.dm:592`, `hold_door_for`, and `:800`, `let_door_close`:

    door.autoclose = FALSE
    if(door.density && !door.open())
    	door.autoclose = TRUE
    ...
    door.autoclose = TRUE
    if(!door.density)
    	INVOKE_ASYNC(door, TYPE_PROC_REF(/obj/machinery/door, close))

`code/modules/llm_crew/crew_npc_hands.dm:105`, `free_a_hand`:

    if(!body.equip_to_storage(spare, ITEM_SLOT_BACK, indirect_action = TRUE) && !body.dropItemToGround(spare))

`crew_npc_hands.dm:33`, `tool_pick_up`: `if(body.put_in_hands(stowed))`. `:263`, `take_item`: `if(!body.put_in_hands(item))`. `:276` and `:295`, `take_from_container`: `container.open(body)`, `body.put_in_hands(found)`.

`code/modules/llm_crew/crew_npc_doors.dm:780`, `reset_fire_alarm`: `alarm.reset(body)`.

The honest way exists in the same code and can be copied: `click_as_body` (used by the security and forcing work), `draw_item` in `crew_npc_security.dm` and `crew_npc_forcing.dm` (takes a thing out of a belt or bag by clicks, with a log line for the step that fails), `wear_kit_belt` (puts a thing into a pocket with `attack_ui`), and `put_down_unasked_item` just below `hand_over` (sets a thing on a table with `ClickOn`).

## How it was found

Read from the code, each proc top to bottom. The revolver in the officer's bag is in `data/logs/2026/11/19/round-19.33.50` by the change log's account; I did not reread that log.

## How to fix it

Do them in this order. Each is its own small change and can be compiled and played alone.

1. **`hand_over` and `hand_mail_over`.** To another crew NPC: keep the hand-to-hand, since both ends are ours, but do it as the game's give (`/mob/living/carbon/proc/give` raises an offer; the receiving NPC's controller accepts it by the same call the alert button makes, `take` on the offer). To anyone with a player (`person.client`): raise the offer and wait a few seconds; if it is not taken, put the thing down on a table beside them or at the body's own feet with `dropItemToGround`, and say so. Never `forceMove`. **Question for the owner:** is hand-to-hand between two NPCs good enough as it is, or must that go through the offer as well?
2. **`free_a_hand` and the take-out in `tool_pick_up`.** Use `draw_item`'s way in reverse: with the thing in the active hand, click the bag (`body.back.attackby` reached through `ClickOn(body.back)`), which is what a player does. If the bag will not take it, drop it at its feet as now. Taking out: open the bag's storage and click the item, as `draw_item` does for a belt.
3. **`take_item`.** `ClickOn(item)` with an empty active hand, then check it is held. Keep the "not where you saw it" test.
4. **`take_from_container`.** `ClickOn(container)` to open it (an empty hand), read what spilled as now, `ClickOn(found)` to take it, `ClickOn(container)` to shut it.
5. **`reset_fire_alarm`.** A right-click as the body: `body.ClickOn(alarm, list2params(list(RIGHT_CLICK = "1")))`, or call `alarm.attack_hand_secondary(body, modifiers)` after the same adjacency test a click makes. Then check `room.fire` went off.
6. **The door.** As section 4.8 of `LLM_CREW_PLAN_NO_CHEATS.md` already proposes: open by bumping or clicking it, leave `autoclose` alone, stand by it and open it again if it shuts before they are through, click it shut after. `watch_door` already tracks who it is for; it would re-open instead of holding.
7. **The pen.** Click the clipboard with the pen in hand.
8. The plan's step 10 (a check script in `tools/llm_crew/` that fails on `forceMove`, `put_in_hands`, `equip_to_storage`, `add_reagent`, `.open(`, `.close(`, `moveShuttle` in crew code outside an allowed list) is not built. Build it with this, so that the list cannot grow back. `grep -n "forceMove\|put_in_hands\|equip_to_storage\|moveShuttle" code/modules/llm_crew/*.dm` today also shows the plan's own unbuilt items: `tip_out` (`crew_npc_cargo.dm:570`), the shuttle timers (`crew_npc_cargo.dm:450`, `:461`, `crew_npc_freight.dm:642`, `:653`) and the galoshes made at spawn (`crew_npc_spawn.dm:19`).

## How to test the fix

- Server compile to a side copy.
- The simulator runs none of this. Each needs a round: give a janitor a full pair of hands and a mop to fetch (`game.log` "put away its ... to free a hand" must still appear); have a technician let a janitor in and out (the door opens, and shuts behind them); pull a fire alarm in a hallway with a janitor about ("reset the fire alarm in"); stand by the Head of Personnel as Captain with empty hands after Pun Pun has handed it something, and see that nothing arrives in your hand unasked.
- `attack.log` and `game.log` should show no new runtime errors from clicks made with a full hand: `empty_clicking_hand` in `crew_npc_machines.dm` is the helper that guards that.
