---
id: HAND-13
title: A fetch from a locker takes the first thing of that name, an empty spray bottle included, though every other pick up passes empty ones over
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:284, code/modules/llm_crew/crew_npc_hands.dm:30, code/modules/llm_crew/crew_npc_hands.dm:43
fix: Skip is_spent things in take_from_container as tool_pick_up does, and count them in what the locker holds
---

## What is wrong

`tool_pick_up` passes over a spray bottle with nothing left in it, both in the body's own bag ("A janitor after a full space cleaner took its own empty one out of its bag ... and did it again every three seconds") and lying in sight. `take_from_container`, the third way it fetches a thing, does not: it takes the first thing in the locker whose name matches.

So when a locker holds an empty space cleaner and a full one, the fetch can come back with the empty one: "You take the space cleaner out of the janitorial closet." The brain counts it as done. The janitor has nothing to clean with, and the full bottle is still in the locker. The next `pick_up space cleaner` goes back to the locker (the memory still lists the full one), and this time takes it, or takes the other empty one if there are two. Each go is a walk, an open and a shut.

How an empty one gets into a locker: anyone can put one back there, and our own code sweeps one in. `free_a_hand` drops a spent spray at the body's feet when its bag is full, and a body that opens and shuts a locker (`look_inside`, `take_from_container`, tidying) takes in everything lying on its tile when it shuts it.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:281`, `take_from_container`:

    	// Take the first thing that came out of it with the right name, and note what else was inside.
    	var/obj/item/found
    	var/list/inside = list()
    	for(var/obj/item/thing in spill)
    		if(was_open || already_there[thing])
    			continue
    		if(isnull(found) && name_matches(thing.name, errand_item))
    			found = thing
    			continue

and the two other paths in `tool_pick_up`, which do check:

    		if(is_spent(stowed))
    			continue
    ...
    		if(!name_matches(candidate.name, wanted) || is_spent(candidate))
    			continue

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `take_from_container`, change the test to `if(isnull(found) && name_matches(thing.name, errand_item) && !is_spent(thing))`. A spent one then falls through to `inside` like any other thing and is remembered as there.
2. Better still, remember it as spent: in `inside`, name it "empty [name]" (`is_spent` → `"empty " + format_text(thing.name)`), so the window's `knownSupply` does not offer it as a supply. Check `CLEANING_SUPPLY` in `janitor.ts` does not match "empty space cleaner"; if it does, anchor it or test for the word "empty".

## How to test the fix

- Server compile to a side copy.
- In a round: put an empty and a full space cleaner in a locker a janitor has searched, take its spray, and let it fetch one. It must come back with the full one.
