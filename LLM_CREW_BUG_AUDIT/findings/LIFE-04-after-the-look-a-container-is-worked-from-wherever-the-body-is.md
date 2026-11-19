---
id: LIFE-04
title: After the look into a locker or crate the body takes things out and shuts it from wherever it now is, awake or not
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:291, code/modules/llm_crew/crew_npc_storage.dm:121, code/modules/llm_crew/crew_npc_freight.dm:525, code/game/objects/structures/crates_lockers/closets.dm:612
fix: After the sleep in take_from_container, look_inside and take_mail, go on only if the errand is the same one and the body can still reach the container and act, else leave it as it is
---

## What is wrong

Three errands open a container, `sleep(CREW_NPC_LOOK_TIME)` (0.8 seconds) to stand for the look, and then go on to work the container. After the sleep each checks only that the body and the container still exist. None checks that the body is still beside the container, still awake and able to use its hands, or still on the same errand.

What they then do does not check either:

- `obj/structure/closet/close(user)` checks only `can_close` (nothing in the way). It does not look at where `user` is or what state it is in.
- `equip_to_storage(..., indirect_action = TRUE)` moves the item into the bag from wherever it lies.
- `put_in_hands` does refuse a body without `MOBILITY_PICKUP` (stunned, down, dead), but not one that is standing two tiles off.

So in that 0.8 seconds:

- A cargo technician taking the mail out (`take_mail`) is taken by the arm by the Head of Security (`being_arrested` cancels its errand and makes it let go, but cannot stop the proc that is asleep) and pulled a tile away. It wakes, stuffs the addressed letters from the crate's tile into its own bag, drops the junk, and shuts the crate, from two tiles off and in custody.
- A janitor fetching soap (`take_from_container`) is tackled by Pun Pun and paralysed. It wakes on the floor and shuts the locker it is lying beside. Or it is pushed a tile off and shuts it from there.
- A body looking through a room's storage (`look_inside`) is sent elsewhere by its brain (`cancel_search` clears the storage key and the leaf, but the proc is asleep) and has walked a step or two: the closet shuts behind it at a distance.

None of these is a player's click. No player can shut a locker from across the room, or put mail in a bag from a crate they are not standing at, or do either out cold.

A smaller wrong in the same lines: the outcome text of `take_from_container` reads `errand_item` after the sleep. If a new errand started meanwhile, that is the new errand's item, not the one looked for. The text is thrown away in that case (`errand_serial` has moved on), so nobody sees it; it is noted only so that a fix does not lean on it.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:291`, in `take_from_container`:

    	sleep(CREW_NPC_LOOK_TIME)
    	if(QDELETED(body) || QDELETED(container))
    		return list(FALSE, "You could not get to it.")

    	var/taken = !QDELETED(found) && body.put_in_hands(found)
    	if(!taken && found)
    		inside[format_text(found.name)]++
    	if(!was_open && container.opened)
    		container.close(body)

`code/modules/llm_crew/crew_npc_storage.dm:121`, in `look_inside`:

    	sleep(CREW_NPC_LOOK_TIME)
    	if(!QDELETED(container) && container.opened)
    		container.close(body)
    	return list("state" = "looked", "contents" = inside)

`code/modules/llm_crew/crew_npc_freight.dm:525`, in `take_mail`:

    	sleep(CREW_NPC_LOOK_TIME)
    	if(QDELETED(body) || QDELETED(crate))
    		return list(FALSE, "You could not get to it.")
    	...
    		if(body.equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE))
    	...
    	if(crate.opened)
    		crate.close(body)

`code/game/objects/structures/crates_lockers/closets.dm:612` (base):

    /obj/structure/closet/proc/close(mob/living/user)
    	if(!opened || !can_close(user))
    		return FALSE

## How it was found

Read from the code, and the base `close`, `put_in_hand_check` and `equip_to_storage` read to see what they check. Not seen in a round; the window is short.

## How to fix it

1. Add one helper on the controller, say `still_at(atom/thing, serial)`: TRUE if `errand_serial == serial`, the body can reach the thing now (`can_reach_target_now`), and it is not incapacitated (`!INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB)`, the controller's own test).
2. In each of the three procs, note `var/serial = errand_serial` before the sleep (for `look_inside` there is no errand serial, so use the storage target still being `container` in the blackboard instead), and after the sleep return early, leaving the container open, unless `still_at(container, serial)`.
3. For `take_from_container`, return `list(FALSE, "You were stopped before you could take anything out.")`; for `take_mail`, the same; for `look_inside`, `list("state" = "unreached")` so the search moves on without a false report.
4. Better still, and in line with KNA-04 and GAP-07: replace `close(body)` with `click_as_body(container)` and the mail's `equip_to_storage` with a click of each letter and a click on the bag. `click_as_body` already checks `can_perform_action`, which is reach and state together. Then step 1 is needed only for the errand serial.

## How to test the fix

- Compile.
- In a round: have a cargo technician take mail from a crate and pull it away by hand the moment it opens the crate. The crate should stay open and the letters stay in it. Before the fix they go into its bag and the crate shuts.
