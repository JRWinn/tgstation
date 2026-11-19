---
id: CHEAT-09
title: A janitor primes a cleaner grenade by calling arm_grenade, skipping the use-in-hand checks, and counts a spent casing as a live grenade
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: code/modules/llm_crew/crew_npc_cleaning.dm:686, code/game/objects/items/grenades/_grenade.dm:133, code/game/objects/items/grenades/chem_grenade.dm:111
fix: Prime it the way a player does, by using it in the active hand (activate_hand or attack_self as the body), and check it is active before throwing
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

A related fault the honest path does not fix by itself: after a cleaner grenade goes off its casing stays (`detonate` sets `GRENADE_USED` and `active = FALSE`; the object remains). `trade_tool_types` counts `/obj/item/grenade/chem_grenade/cleaner` as a janitor's own and `held_grenade()` finds a spent casing as readily as a live one, so `best_grenade_spot` and `grenade_messes` tell the brain there is a grenade to throw, and it is thrown as a dud. Step 1 of the fix covers that.

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

1. In `held_grenade()`, only count a grenade that can still go off: not `active` and `!(grenade.dud_flags & GRENADE_USED)`. The body can tell a spent casing by looking (its sprite and examine text change). That keeps a spent casing out of `best_grenade_spot` and `grenade_messes`.
2. In `throw_grenade`, make the grenade's hand the active one (already done), then prime it the player's way: `body.mode()` (`code/modules/mob/mob.dm:779`, what the use-in-hand key reaches), which calls the held item's `attack_self`. Wait a click gap first (`CREW_NPC_CLICK_GAP` in `crew_npc_machines.dm`).
3. Check `grenade.active` after. If it is not active and the grenade is still in hand, return "The grenade will not prime." and do not throw. If it was fumbled (active, and the body is clumsy), the throw still goes ahead, which is the best a player could do.
4. Throw as now: `throw_item` is what the throw key and a click reach.

## How to test the fix

- Server compile.
- A round: give a janitor a spent cleaner grenade casing and a big mess: it must not be offered as a grenade. Give it a fresh one: the mess foams, and `attack.log` or `game.log` shows one priming.
