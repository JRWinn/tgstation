---
id: SEC-13
title: After taking its kit the officer shuts the security locker on anyone standing in it, and leaves it unlocked
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:635, code/game/objects/structures/crates_lockers/closets.dm:493, code/game/objects/structures/crates_lockers/closets.dm:562
fix: Before the closing click in kit_from_locker, leave the locker open if any mob stands on its tile, and lock it again after closing with the click a player uses
---

## What is wrong

See also: TRC-01 (the same base-game behaviour of `close()`, hit by tidying, with a list in its step 5 of other places our code shuts a container; `kit_from_locker` is not on that list).

`kit_from_locker` ends by shutting the locker it opened, with a click: "The locker is shut again after." A locker's `close()` takes in everything on its tile that may go in, people included. `can_close` only stops a locker (not a crate) for an anchored mob, and `insertion_allowed` lets in any unbuckled living mob up to the locker's mob capacity. Nothing in `kit_from_locker` looks at who is on the tile.

So if anyone is standing in the open locker when the officer has taken what it came for (a player fetching their own gear from the same locker, Pun Pun wandering the Security Locker Room, another officer), the officer's click shuts them in. A player officer sees someone in the way and does not shut the door on them.

A smaller thing in the same lines: the officer unlocks a locked locker with its ID to get in, and shuts it without locking it again. The security lockers then stand unlocked for the rest of the round, with whatever kit is left in them. A player often does the same, so this is the owner's call, not a fault; it is noted here because the code's comment ("shut again") reads as if it were put back as it was.

## Where

`code/modules/llm_crew/crew_npc_security.dm:635`, the end of `kit_from_locker`:

    if(!QDELETED(locker) && !QDELETED(pawn) && locker.opened && empty_clicking_hand())
        click_as_body(locker)
    return gained

`code/game/objects/structures/crates_lockers/closets.dm:493`, `can_close`:

    for(var/mob/living/L in T)
        if(L.anchored || horizontal && L.mob_size > MOB_SIZE_TINY && L.density)
            ...
            return FALSE

and `:575`, `insertion_allowed`, which lets a standing person in:

    if(ismob(AM))
        ...
        if(L.anchored || L.buckled || L.incorporeal_move || L.has_buckled_mobs())
            return FALSE

## How it was found

Read from the code and the base closet procs. Not seen in a round.

## How to fix it

1. In `kit_from_locker`, before the closing click: `if(locate(/mob/living) in get_turf(locker))`, do not click; leave it open, as a player would with someone in the way. Log it with `log_kit_step` ("left the locker open: someone is standing in it").
2. Use the same test TRC-01 proposes, so there is one helper (for example `crew_npc_container_has_someone(obj/structure/closet/thing)`), and call it from both places.
3. Optional, the owner's choice: after a successful close of a locker that was locked when the body came to it, lock it again with the click a player uses (right-click on the shut locker, `attack_hand_secondary`, which calls `togglelock`). `click_as_body(locker, "right=1")` is the click. Ask before building: an unlocked locker is also how the next officer gets in without waiting.

## How to test the fix

- Server compile on a side copy.
- In a round: stand in an open security locker as the player while an officer is sent for its kit. The officer must take what it needs and leave the locker open; `game.log` shows the new line. Then step off; the next trip shuts it.
