---
id: CHEAT-09
title: A janitor primes a cleaner grenade by calling arm_grenade, skipping the use-in-hand checks, and counts a spent casing as a live grenade
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: code/modules/llm_crew/crew_npc_cleaning.dm:686, code/modules/llm_crew/crew_npc_cleaning.dm:626, code/game/objects/items/grenades/_grenade.dm:133, code/game/objects/items/grenades/chem_grenade.dm:111
fix: Prime it the way a player does, with body.execute_mode() on the grenade in the active hand, throw only if it is then active, and do not count a used casing as a grenade
---

## What is wrong

`throw_grenade` primes the grenade with `grenade.arm_grenade(body)` and throws it. A player primes a grenade by using it in hand, which is `attack_self`. That proc is where the checks are:

- `/obj/item/grenade/chem_grenade/attack_self`: only a grenade at `GRENADE_READY` and not `active` is primed. Otherwise nothing happens (a wired one opens its wires).
- `/obj/item/grenade/attack_self`: a grenade stuck to the hand (`TRAIT_NODROP`) has to be pried off first; one already `active` is left alone; `botch_check(user)` fumbles it for a clumsy user and primes it with a 5 second fuse in their hand instead.

`arm_grenade` itself checks none of that: it sets `active`, plays the sound, logs a bomb priming (`log_grenade`, which messages admins for a live grenade), and starts the detonation timer. Called on a grenade that is already active it starts a second timer.

Concrete cases where the two differ:

1. A grenade some player has already primed and pushed into the janitor's hand (the bar's monkey hands people things; `on_item_in_hand` keeps a trade tool "whoever put it there"). `arm_grenade` runs on it again: a second detonation timer and a second priming log. `attack_self` would have left it alone (`if (active) return`).
2. A clumsy janitor (a clown's mutation, a brain trauma): `botch_check` would fumble it in hand half the time. The body never fumbles.
3. A grenade stuck to the hand with tape: the player has to spend seven seconds prying it off before it will prime; the body primes it at once.

A related fault the honest path does not fix by itself: after a cleaner grenade goes off its casing stays (`detonate` sets `GRENADE_USED` and `active = FALSE`; the object remains). `trade_tool_types` counts `/obj/item/grenade/chem_grenade/cleaner` as a janitor's own and `held_grenade()` finds a spent casing as readily as a live one, so `best_grenade_spot` and `grenade_messes` tell the brain there is a grenade to throw, and it is thrown as a dud. A player can prime a used casing too (its `stage` is still `GRENADE_READY`), and it fizzles at `detonate`'s `if (dud_flags)`; so this part is a wasted step and a false report ("It will foam in a few seconds"), not a cheat. A player would not try: examine says "It looks like they've already been used." Step 1 of the fix covers that.

How often it shows: for an ordinary janitor holding a fresh grenade the result is the same either way. The wrong cases are the ones above, which are rare. It is rated high only because the no-cheats rule is broken every time a grenade is thrown.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:685`, `throw_grenade`:

    	body.face_atom(target)
    	grenade.arm_grenade(body)
    	if(!body.throw_item(target))
    		// Primed and still in hand: get rid of it where it will do least harm.
    		body.dropItemToGround(grenade)

`code/game/objects/items/grenades/chem_grenade.dm:111`:

    /obj/item/grenade/chem_grenade/attack_self(mob/user)
    	if (stage == GRENADE_READY && !active)
    		return ..()

`code/game/objects/items/grenades/_grenade.dm:141`:

    	if (active)
    		return
    	if(!botch_check(user)) // if they botch the prime, it'll be handled in botch_check
    		arm_grenade(user)

## How it was found

Read from the code and the base grenade code.

## How to fix it

1. In `held_grenade()`, only count a grenade that can still go off: `!(grenade.dud_flags & GRENADE_USED)` and `grenade.stage == GRENADE_READY`. The body can tell a used casing by looking (examine says so). Do not leave out an `active` one: a live grenade in hand is one to throw now, not to ignore. This keeps a spent casing out of `best_grenade_spot` and `grenade_messes`. Optionally add a used grenade to `is_spent()` (`crew_npc_hands.dm:111`), so `free_a_hand` puts it down like an empty spray.
2. In `throw_grenade`, make the grenade's hand the active one (`hand_to(grenade)`, `crew_npc_security.dm:285`, does what the three lines there do now). If the grenade is not already `active`, wait a moment (`sleep(1 SECONDS)`: `CREW_NPC_CLICK_GAP` cannot be used here, it is `#undef`'d at the end of `crew_npc_machines.dm:442` and `crew_npc_cleaning.dm` is included before that file), then prime it the player's way: `body.execute_mode()` (`code/modules/mob/mob.dm:783`, what the use-in-hand key reaches through `mode()`; call `execute_mode` itself, since `mode()` may queue it to the next tick). It refuses while incapacitated and calls the held item's `attack_self`. For a grenade stuck to the hand that is a 7 second `do_after` and no priming; `do_errand` may sleep, so that is allowed. Check after the sleep that the body and grenade are still there and still held.
3. Check `grenade.active` after. If it is not active, return list(FALSE, "The grenade will not prime.") and do not throw. If it was fumbled (active on a 5 second fuse, the body clumsy), the throw still goes ahead, which is the best a player could do.
4. Throw as now: `throw_item` is what the throw key and a click reach.

## How to test the fix

- Server compile.
- No simulator case reaches this: the sim stands in for the body, and `grenade_messes` is a plain number from the server (`tools/llm_crew/sim.ts` sends 0). Nothing on the window side changes.
- A round: give a janitor a spent cleaner grenade casing and a big mess: it must not be offered as a grenade (the Crew Brain shows no grenade line). Give it a fresh one: the mess foams, and `game.log` (where `log_bomber` writes) shows one "primed a" line for it, not two. Give it one already primed: it is thrown at once, with no second priming line.

## Check

Checked by Opus 5.5. The quotes are what the code says today: `throw_grenade` at `crew_npc_cleaning.dm:676-690` calls `grenade.arm_grenade(body)` at :686, and `held_grenade` at :624-626 is a bare `locate` in `held_items`. The only path in is `tool_grenade` -> `start_errand` -> `do_errand` (`crew_npc_hands.dm:186-187`), with no prime check on the way. No crew code calls `attack_self` or `execute_mode` anywhere. Read the base procs: `/obj/item/grenade/attack_self` (`_grenade.dm:133-144`) holds the `TRAIT_NODROP` pry, the `active` test and `botch_check`; `/obj/item/grenade/chem_grenade/arm_grenade` (`chem_grenade.dm:250`) checks none of them and adds a second timer if called twice; `chem_grenade/detonate` (:269) keeps the casing, and a second detonation fizzles at `_grenade.dm` `if (dud_flags)`. Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose `arm_grenade` or fixed it. Mended: a used casing thrown is a false report, not a cheat (a player can prime one too); step 1 no longer drops an active grenade; step 2's `CREW_NPC_CLICK_GAP` is out of scope in this file. Severity high stands only on the no-cheats rule; in an ordinary round the outcome is the same. Effort small: one file, about 15 lines.
