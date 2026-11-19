---
id: HAND-01
title: A click the game throws away for coming too soon is counted as made, so the cuffs never go on after a third baton hit
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 30ba8eafafe
found_by: Fable 5.2
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_machines.dm:259, code/modules/llm_crew/crew_npc_security.dm:1013, code/modules/llm_crew/crew_npc_security.dm:974, code/_onclick/click.dm:120, code/_onclick/item_attack.dm:203
fix: In click_as_body wait out the body's own next_move before a plain click, and return FALSE if the game would still drop it
---

## What is wrong

See also: RT-01 (the same missing wait in `clean_mess`, which calls `ClickOn` itself and not through `click_as_body`).

`click_as_body` sleeps for its gap, calls `body.ClickOn(target)` and returns TRUE. It never looks at whether the game let the click through. The game drops a plain click, without a word, when the body's click cooldown has not run out (`next_move`), and every use of a held thing on a person sets that cooldown to 0.8 seconds (`CLICK_CD_MELEE`). So a click made less than 0.8 seconds after a baton swing or a try with the cuffs does nothing at all, and the caller is told it was made.

The default gap is 1 second, which is longer than the cooldown, so the old callers never met this. The two short gaps added for arrests are both shorter: `CREW_NPC_STRIKE_GAP` is 0.2 seconds and `CREW_NPC_KIT_GAP` is 0.4.

The case that always fails: an arrest by force of someone who is still on their feet after two baton hits.

1. `baton_hits` lands hit one and waits 2.5 seconds, lands hit two and waits 2.5 seconds. The person is still standing, so it swings a third time and that lands too. `landed` is now 3, which is `most`, so there is no wait: `baton_hits` returns at once. The body's `next_move` is 0.8 seconds off.
2. `make_arrest` calls `put_cuffs_on` straight away. The cuffs are in the other hand already. `close_with` returns at once (they are beside it). `click_as_body(person, null, CREW_NPC_STRIKE_GAP)` sleeps 0.2 seconds and clicks. `ClickOn` reaches `if(next_move > world.time) return` and returns. No cuffing begins. `click_as_body` returns TRUE.
3. The wait loop needs `length(body.do_afters)`, which is 0, so it does not wait. If the person is down, the second go is made: another 0.2 seconds, 0.4 in all, still inside the 0.8. Dropped again. If they are still up, `put_cuffs_on` gives up after the first go.
4. `put_cuffs_on` returns FALSE. The brain is told "You could not get the cuffs on X: they would not stay still." with the reason "moved". They may be lying still at its feet.
5. The window (`jobs/arrests.ts`, around line 1123) counts that as a failed try: `warrant.force = true` and `warrant.tries += 1`. Three of those (`ARREST_TRIES`) and it leaves them be for 30 seconds (`REST_DS`) and tells whoever keeps the list "they will not stand still for the baton or the cuffs" (`WILL_NOT_STAND`).

Who gets a third hit: the security baton knocks a person down 2 seconds after each hit (`apply_stun_effect_end`, `baton.dm:704`) unless they have `TRAIT_BATON_RESISTANCE`, and `baton_hits` looks 2.5 seconds after the second hit. So the third hit is for the baton-resistant and stun-proof, which is rare. Someone down after it is usually cuffed on the next try (the "down already" path in `make_arrest` has no baton click before it). Someone who stays up gets three hits and dropped cuffs on every try, for good.

The same thing can waste a baton swing, but only after a swing that went into `/mob/living/attackby` (which sets the cooldown) and used no charge, such as one blocked by a shield (`attacked_by` returning `ATTACK_FAILED`, `item_attack.dm:256`). The body sleeps 0.5 seconds and swings again 0.2 seconds later, 0.7 in all: dropped, counted in `swings`, and logged as "its baton did nothing when it touched them". The commoner "did nothing", a baton not ready again (its own 2.5 second wait, or `TRAIT_IWASBATONED`), is stopped in the baton's `pre_attack` (`baton.dm:141-161`) before `attackby`, sets no cooldown, and so does not lose the next swing.

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

1. In `click_as_body`, after the gap and the deleted checks, for a click that is plain or a right click (the ones `ClickOn` holds back): if `body.next_move > world.time`, sleep until it has passed (`sleep(body.next_move - world.time)`), capped at about 2 seconds so that a body in cuffs (`CLICK_CD_HANDCUFFED`, 1 second, set again on every click) cannot stall a caller for long, then make the deleted checks and `can_perform_action` again. This is a player waiting for the swing to be ready, nothing more.
2. Also wait one tick if `world.time <= body.next_click`. Steps 1 and 2 are one sleep: until `max(body.next_move, body.next_click + 1)`.
2a. RT-01 needs the same wait in `clean_mess`, which calls `ClickOn` itself. Put the wait in one small proc on the controller (say `wait_to_click()`) and call it from both.
3. If after that the click would still be dropped (`next_move` still ahead, or `body.throw_mode`), return FALSE without clicking. The comment above the proc already promises FALSE "if the body is in no state to reach it".
4. Keep the short gaps as they are: the wait in step 1 only happens when the game would have thrown the click away.
5. In `baton_hits` and `put_cuffs_on` nothing need change once step 1 is in. The "did nothing" branch will then be true when it is logged, and the 0.2 second strike gap still serves the first swing after a step, which is what it was for.
6. This proc is used by every job. Read the other callers (`grep -n click_as_body code/modules/llm_crew/`): none should depend on a dropped click, since a dropped click does nothing, but a caller with a deadline of its own should allow for up to 2 seconds more.

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code. `tools/llm_crew/security.ts` does not cover this.
- In a round: put a warrant on someone who shrugs off two baton hits (a second player given `TRAIT_BATON_RESISTANCE` through View Variables, Modify Traits, or set `most` to 1 hit for a test build so the cuffs follow the last hit at once). `game.log`: "hit X with its baton 3 times" (or "1 time") must be followed by "arrested X ... after 3 baton hits", not by a second "hit X with its baton" line a few seconds later, and the brain must not report "would not stay still".
- For a test build only, log `body.next_move - world.time` just before `body.ClickOn` in `click_as_body`. With the fix it must never be above 0 for a plain click.

## Check

Checked by Opus 5.5. Confirmed. Kept as the main write-up; SEC-06 is the same fault and is marked its duplicate. The window's count of failed tries, the cap's reason (`CLICK_CD_HANDCUFFED`), the `next_click + 1` form and the "check the other callers" step were taken from SEC-06.

- `click_as_body` (`crew_npc_machines.dm:259-269`) is as quoted, and nothing in `code/modules/llm_crew/` reads `next_move` or `next_click`.
- `ClickOn` (`code/_onclick/click.dm:72-133`) drops a plain click at `if(next_move > world.time)`. Modifier clicks return earlier and are not affected.
- The cuffs: the baton's `pre_attack` lets a ready, charged swing through, `/mob/living/attackby` (`item_attack.dm:197-201`) calls `changeNext_move(attack_speed)`, 8 deciseconds for a baton (no override in `baton.dm`). `baton_hits` returns with no sleep when `landed == most` (`crew_npc_security.dm:980`). `make_arrest` goes straight to `put_cuffs_on` (line 915); `draw_item` returns `hand_to` at once (the cuffs were drawn at line 901); `close_with` returns at once when in reach. So the cuffs click comes about 0.2 seconds after the hit and is dropped. Handcuffs also go through `attackby` (their `attack` override, `handcuffs.dm:80`), so the cuffs set the cooldown too.
- Corrected in the body: the "did nothing" baton swing that is lost is only one that reached `attackby` and used no charge (a block); a swing stopped because the baton was not ready sets no cooldown. Added who gets a third hit, and that for someone still standing it fails on every try.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions the click cooldown; the entry that added `CREW_NPC_STRIKE_GAP` and `CREW_NPC_KIT_GAP` (around line 133-139) does not consider it. Not fixed, not chosen.
- Severity medium stands: a rare target, but for that target the arrest never happens. Effort small: one proc, under 20 lines. Not run in a game.
