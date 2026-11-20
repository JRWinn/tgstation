---
id: HAND-11
title: A thing pushed into its hand is kept for good if the body stays busy for a minute, or if a second thing is pushed into the other hand before the first is put down
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:578, code/modules/llm_crew/crew_npc_hands.dm:603, code/modules/llm_crew/crew_npc_controller.dm:214
fix: Keep a list of unasked things, not one, and when busy keep waiting as long as the thing is still held instead of giving up after ten tries
---

## What is wrong

See also: KNA-05 (a thing that lands during an errand is never noticed at all). This is about a thing that is noticed, and is then lost track of anyway.

`on_item_in_hand` remembers one unasked thing, in `unasked_item`, and starts a timer for `put_down_unasked_item`. Two ways it is then never put down:

**1. Busy for more than a minute.** While the body is on an errand, searching storage, or in a `do_after`, `put_down_unasked_item` waits 6 seconds and tries again, ten times. On the eleventh it sets `unasked_item = null` and stops. The thing stays in its hand for the rest of the shift. A janitor cleaning a big room is on an errand for each mess back to back (`next_mess` starts the next one in the same tick the last ends), so a cleaning run of more than a minute is enough. So is a security officer's arrest and trip to the brig, or a long force-door job.

**2. A second thing before the first is put down.** `unasked_item` is overwritten, and `unasked_item_waits` set back to 0. The first thing's timer, when it fires, picks up the second thing from `unasked_item`; nothing remembers the first. Of two things pushed into its hands it puts down at most one. Worse, the first timer to fire calls `put_down_unasked_item(TRUE)` for the second thing well before its own 2 second notice, and the second timer, when it fires, finds `unasked_item` null and returns.

Both end the same way as KNA-05: the body walks about holding a salt shaker, and the next `free_a_hand` puts it in its bag (KNA-04 item 3), where it stays.

One concrete case of 2. The bartender's monkey puts a drink in a janitor's left hand while it stands by the bar; a second later the monkey picks a pen up off the bar and puts that in its right hand too (the monkey is not one of the crew, so `being_handed_something` is never called for it). `on_item_in_hand` for the drink: `unasked_item` = drink, timer A. For the pen: `unasked_item` = pen, timer B. Two seconds after the drink, timer A: resolves the pen, says "You find a pen in your hand", puts the pen on the bar. Timer B: `unasked_item` is null, returns. The drink is kept.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:578`, `on_item_in_hand`:

    	unasked_item = WEAKREF(item)
    	unasked_item_waits = 0
    	addtimer(CALLBACK(src, PROC_REF(put_down_unasked_item), TRUE), CREW_NPC_UNASKED_NOTICE)

`code/modules/llm_crew/crew_npc_hands.dm:602`, `put_down_unasked_item`:

    	// In the middle of something with its hands: it finishes that first.
    	if(errand_tool || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET) || length(body.do_afters))
    		if(unasked_item_waits++ < CREW_NPC_UNASKED_WAITS)
    			addtimer(CALLBACK(src, PROC_REF(put_down_unasked_item)), CREW_NPC_UNASKED_WAIT)
    		else
    			unasked_item = null
    		return

`code/modules/llm_crew/crew_npc_controller.dm:214`, one slot only:

    	var/datum/weakref/unasked_item

## How it was found

Read from the code. Not seen in a round. The change log's 19:38 entry tells of the officer's bag filling with things it was handed; KNA-05 gives the main cause, these are two more.

## How to fix it

1. Make `unasked_item` a list of weak references, `unasked_items`. `on_item_in_hand` adds to it (if not there already) and starts the notice timer for that thing only: pass the weak reference to the callback, `CALLBACK(src, PROC_REF(put_down_unasked_item), item_ref, TRUE)`.
2. `put_down_unasked_item(datum/weakref/item_ref, first_look)` works on the thing it was given, and takes it out of the list when it is put down, gone, or no longer held.
3. When busy, wait and try again for as long as the thing is still in its hand. There is no need to give up: a body is never busy for ever, and a thing it has stowed or dropped meanwhile ends the wait by step 2. If a bound is wanted, make it long (ten minutes), not one minute.
4. Keep the one line to the brain per thing on first look (and see KNA-05 step 3 on how often to say it).

Keeps the rules: it only changes when the body puts a thing down, which it does by a click or a drop as now.

## How to test the fix

- Server compile to a side copy.
- In a round: give a janitor two things in quick succession by admin (put in hands) while it stands idle: both must be put down. Then give it one while it starts cleaning a room with many messes: it must be put down when the cleaning is over, however long that takes.
