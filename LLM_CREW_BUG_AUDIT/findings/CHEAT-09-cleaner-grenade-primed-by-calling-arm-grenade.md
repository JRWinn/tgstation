---
id: CHEAT-09
title: A janitor primes a cleaner grenade by calling arm_grenade, skipping the use-in-hand checks, and can prime a spent or already live one
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

Concrete cases:

1. A janitor finds a cleaner grenade casing lying in the Custodial Closet after one has gone off (chem grenades stay as casings: `detonate` sets `active = FALSE` and leaves the object). The janitor picks it up, since `trade_tool_types` counts `/obj/item/grenade/chem_grenade/cleaner` as its own, and `held_grenade()` finds it. Later `tool_grenade` primes it with `arm_grenade`: an admin "primed a grenade" message and a priming sound for a dud. A player using it in hand would get nothing.
2. A grenade some player has already primed and pushed into the janitor's hand. `arm_grenade` runs on it again: two detonation timers.

`best_grenade_spot` and `grenade_messes` also treat any held `cleaner` grenade as live, so the brain is told there is a grenade's worth of mess to throw at, for a spent casing.

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

1. In `held_grenade()`, only count a grenade that is ready: `istype(grenade) && grenade.stage == GRENADE_READY && !grenade.active` (and, if `dud_flags` is set, not ready). That keeps a spent casing out of `best_grenade_spot` and `grenade_messes`.
2. In `throw_grenade`, make the grenade's hand the active one (already done), then prime it the player's way: `body.activate_hand()` if that is the proc the "use item in hand" key reaches on this codebase, or `grenade.attack_self(body)` after the same `can_perform_action` test `click_as_body` makes. Wait a click gap first (`CREW_NPC_CLICK_GAP` in `crew_npc_machines.dm`).
3. Check `grenade.active` after. If it is not active and the grenade is still in hand, return "The grenade will not prime." and do not throw. If it was fumbled (active, and the body is clumsy), the throw still goes ahead, which is the best a player could do.
4. Throw as now: `throw_item` is what the throw key and a click reach.

## How to test the fix

- Server compile.
- A round: give a janitor a spent cleaner grenade casing and a big mess: it must not be offered as a grenade. Give it a fresh one: the mess foams, and `attack.log` or `game.log` shows one priming.
