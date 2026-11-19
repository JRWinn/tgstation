---
id: HAND-01
title: A click the game throws away for coming too soon is counted as made, so the cuffs never go on after a third baton hit
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: hands
files: code/modules/llm_crew/crew_npc_machines.dm:259, code/modules/llm_crew/crew_npc_security.dm:1013, code/modules/llm_crew/crew_npc_security.dm:974, code/_onclick/click.dm:120, code/_onclick/item_attack.dm:203
fix: In click_as_body wait out the body's own next_move before a plain click, and return FALSE if the game would still drop it
---

## What is wrong

`click_as_body` sleeps for its gap, calls `body.ClickOn(target)` and returns TRUE. It never looks at whether the game let the click through. The game drops a plain click, without a word, when the body's click cooldown has not run out (`next_move`), and every use of a held thing on a person sets that cooldown to 0.8 seconds (`CLICK_CD_MELEE`). So a click made less than 0.8 seconds after a baton swing or a try with the cuffs does nothing at all, and the caller is told it was made.

The default gap is 1 second, which is longer than the cooldown, so the old callers never met this. The two short gaps added for arrests are both shorter: `CREW_NPC_STRIKE_GAP` is 0.2 seconds and `CREW_NPC_KIT_GAP` is 0.4.

The case that always fails: an arrest by force of someone who is still on their feet after two baton hits.

1. `baton_hits` lands hit one and waits 2.5 seconds, lands hit two and waits 2.5 seconds. The person is still standing, so it swings a third time and that lands too. `landed` is now 3, which is `most`, so there is no wait: `baton_hits` returns at once. The body's `next_move` is 0.8 seconds off.
2. `make_arrest` calls `put_cuffs_on` straight away. The cuffs are in the other hand already. `close_with` returns at once (they are beside it). `click_as_body(person, null, CREW_NPC_STRIKE_GAP)` sleeps 0.2 seconds and clicks. `ClickOn` reaches `if(next_move > world.time) return` and returns. No cuffing begins. `click_as_body` returns TRUE.
3. The wait loop needs `length(body.do_afters)`, which is 0, so it does not wait. The person is down (three hits), so the second go is made: another 0.2 seconds, 0.4 in all, still inside the 0.8. Dropped again.
4. `put_cuffs_on` returns FALSE. The brain is told "You could not get the cuffs on X: they would not stay still." with the reason "moved". They were lying still at its feet.

The same thing wastes baton swings: after a swing that reached them and did nothing, the body sleeps 0.5 seconds and swings again 0.2 seconds later, 0.7 in all. That swing is dropped, counted in `swings`, and logged as "its baton did nothing when it touched them".

It also gives wrong reasons everywhere a caller trusts the TRUE: `switch_emitter` says "it does not answer", `draw_item` says "the click on it did not bring it to hand".

## Where

`code/modules/llm_crew/crew_npc_machines.dm:259`, `click_as_body`:

    if(gap > 0)
    	sleep(gap)
    if(QDELETED(body) || QDELETED(target) || QDELETED(src))
    	return FALSE
    if(!body.can_perform_action(target, target.interaction_flags_click | SILENT_ADJACENCY))
    	return FALSE
    body.face_atom(target)
    body.ClickOn(target, modifiers)
    return TRUE

`code/_onclick/click.dm:72`, `/mob/proc/ClickOn`:

    if(world.time <= next_click)
    	return
    next_click = world.time + 1
    ...
    if(next_move > world.time) // in the year 2000...
    	return

`code/_onclick/item_attack.dm:200`, `/mob/living/attackby` (a baton swing and a try with the cuffs both come through here):

    user.changeNext_move(attacking_item.attack_speed)
    return attacking_item.attack(src, user, modifiers, attack_modifiers)

`code/modules/llm_crew/crew_npc_security.dm:978`, `baton_hits` (no wait after the last hit):

    landed++
    baton_stopped = null
    if(landed < most)
    	sleep(CREW_NPC_BATON_WAIT)
    continue

`code/modules/llm_crew/crew_npc_security.dm:1013`, `put_cuffs_on`:

    if(click_as_body(person, null, CREW_NPC_STRIKE_GAP))
    	var/waited = 0
    	while(waited < CREW_NPC_CUFF_WAIT && ... && isnull(person.handcuffed) && length(body.do_afters))

`start_pulling` also sets the cooldown (`changeNext_move(CLICK_CD_GRABBING)`, 1 second, `code/modules/mob/living/living.dm:413`), so a short-gap click straight after taking hold of someone or something is dropped the same way.

## How it was found

Read from the code, with the base procs read (`ClickOn`, `/mob/living/attackby`, `changeNext_move`, `CLICK_CD_MELEE` = 8 in `code/__DEFINES/combat.dm:97`). Not seen in a round: the change log's one played arrest took two hits, which is the path that waits 2.5 seconds and so works. The clicks with a key held (ctrl, alt) return before the cooldown test and are not affected.

## How to fix it

1. In `click_as_body`, after the gap and the deleted checks, for a click that is plain or a right click (the ones `ClickOn` holds back): if `body.next_move > world.time`, sleep until it has passed (`sleep(body.next_move - world.time)`), capped at about 2 seconds, then make the deleted checks and `can_perform_action` again. This is a player waiting for the swing to be ready, nothing more.
2. Also wait one tick if `world.time <= body.next_click`.
3. If after that the click would still be dropped (`next_move` still ahead, or `body.throw_mode`), return FALSE without clicking. The comment above the proc already promises FALSE "if the body is in no state to reach it".
4. Keep the short gaps as they are: the wait in step 1 only happens when the game would have thrown the click away.
5. In `baton_hits` nothing need change once step 1 is in. The "did nothing" branch will then be true when it is logged.

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code. `tools/llm_crew/security.ts` does not cover this.
- In a round: put a warrant on someone who shrugs off two baton hits (a second player who drinks coffee or wears armour, or set `most` to 1 hit for a test build so the cuffs follow the last hit at once). `game.log`: "hit X with its baton 3 times" must be followed by the cuffs going on, not by "could not get the cuffs on".
