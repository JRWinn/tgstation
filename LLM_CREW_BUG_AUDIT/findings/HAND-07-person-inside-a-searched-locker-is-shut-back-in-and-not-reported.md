---
id: HAND-07
title: A person found inside a locker it searches tumbles out, is shut back in 0.8 seconds later, and the brain is told only what items were inside
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_storage.dm:111, code/modules/llm_crew/crew_npc_hands.dm:271, code/game/objects/structures/crates_lockers/closets.dm:509, code/game/objects/structures/crates_lockers/closets.dm:524
fix: In look_inside and take_from_container note any living mob that came out on opening, leave the container open if one is on its tile, and tell the brain who was inside
---

## What is wrong

See also: TRC-01, whose step 5 notes in passing that these two procs shut what they opened without looking for a person on the tile. This finding is the case TRC-01 does not describe, a person who was inside the container to begin with, and the second half of the fault: the body is never told.

Opening a closet or crate tips everything in it onto its tile, people included (`dump_contents` moves every movable in it to `drop_location()`). Shutting it takes everything on the tile back in (`take_contents`). `look_inside` and `take_from_container` open the container, count only `/obj/item` that are new on the tile, sleep 0.8 seconds, and shut it.

So when a person is inside (stuffed there by an attacker, hiding, or put there knocked out), the search lets them out and then shuts them back in. A locker takes a person whether they stand or lie (`horizontal = FALSE`); a crate takes one who is lying down, which a person knocked out is. And the brain hears "You look inside the locker in Dormitories: a towel, a pair of shoes." Nothing about the person. No player opens a locker, sees a crewmate fall out of it, and shuts them back in without a word.

One concrete case. A traitor has beaten a crewmate unconscious and pushed them into a locker in the Dormitories. A cargo technician (any job explores) is sent to explore and arrives there.

1. `walk_finished` for the explore calls `start_search` on the storage in view; the locker is in the list.
2. `look_inside`: not open, so `already_there` is noted and `container.open(body)` runs. `dump_contents` puts the unconscious crewmate and the locker's items on the tile.
3. `inside` counts the items only (`for(var/obj/item/thing in spill)`).
4. `sleep(CREW_NPC_LOOK_TIME)`. Then `container.close(body)`: `can_close` passes (a locker is not `horizontal`), `take_contents` inserts the crewmate and the items.
5. `report_storage` sends "You look inside the locker in Dormitories: ...". The technician walks on. The crewmate is back in the locker.

The same happens in `take_from_container` when a janitor fetches soap from a locker someone has hidden in; there the person even stands up and is shut in again, since a locker takes a standing person.

## Where

`code/modules/llm_crew/crew_npc_storage.dm:111`, `look_inside`:

    	var/atom/spill = container.drop_location()
    	var/list/already_there = list()
    	for(var/obj/item/thing in spill)
    		already_there[thing] = TRUE
    	if(!container.open(body))
    		return list("state" = "locked")
    	var/list/inside = list()
    	for(var/obj/item/thing in spill)
    		if(!already_there[thing])
    			inside[format_text(thing.name)]++
    	sleep(CREW_NPC_LOOK_TIME)
    	if(!QDELETED(container) && container.opened)
    		container.close(body)

`code/modules/llm_crew/crew_npc_hands.dm:298`, `take_from_container`, the same close:

    	if(!was_open && container.opened)
    		container.close(body)

Base, `code/game/objects/structures/crates_lockers/closets.dm:509`, `dump_contents`, and `:524`, `take_contents`:

    	var/atom/L = drop_location()
    	for(var/atom/movable/AM in src)
    		AM.forceMove(L)
    ...
    	for(var/atom/movable/AM in location)
    		if(AM != src && insert(AM, mapload) == LOCKER_FULL) // limit reached

## How it was found

Read from the code and the base closet code. Not seen in a round.

## How to fix it

1. In `look_inside` and `take_from_container`, before opening, note the living mobs already on the container's tile, as is done for items. After opening, any `mob/living` on the tile that was not there before came out of it.
2. If any living mob is on the tile after the look (one that came out, or one that stepped on meanwhile), do not shut the container. Leave it open. This is TRC-01's step 5 and the same test as its `wants_shutting` fix; one helper (`crew_npc_person_on(turf)`) can serve both.
3. Tell the brain who came out: add `"people" = list(name, ...)` to the details of the storage sense, and put it in the words, "Inside the locker in Dormitories you find Joe Bloggs, out cold." Use the name the body would see (`name`, not `real_name`) and their state as seen (`stat`, lying down).
4. What the brain does about it (call for medical, call security, say something) is the owner's to decide. **Question for the owner:** should a crew member who finds someone out cold in a locker raise the alarm (PDA to security or medical), or only say so aloud? Today there is no step for either. Until it is decided, step 3 at least puts it in front of the model, which will say something, and in `game.log`.
5. Log it: `log_game("Crew NPC ... found [person] inside the [container] at [AREACOORD]")`.

Keeps the rules: the body only leaves a door open and says what it saw.

## How to test the fix

- Server compile to a side copy.
- In a round: put a monkey or a second player (unconscious, by an admin) in a locker and send a crew NPC to search the room. The locker must stay open, `game.log` must have the "found ... inside" line, and the brain's storage sense must name them.
