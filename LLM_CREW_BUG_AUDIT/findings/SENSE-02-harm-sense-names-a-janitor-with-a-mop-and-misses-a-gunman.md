---
id: SENSE-02
title: The harm sense, once switched on, names a janitor with a mop as the one standing over a victim, misses a gunman, and misses a beating spread over seconds
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_danger.dm:96, code/modules/llm_crew/crew_npc_danger.dm:84, code/modules/llm_crew/crew_npc_danger.dm:41, code/modules/llm_crew/_defines.dm:251, code/game/objects/items/mop.dm:10, code/modules/projectiles/gun.dm:21
fix: Judge a weapon by what it is (sharp, a gun, a baton, combat mode) not by force alone, look further than one tile for a gun, and compare health against the look of a few seconds ago, not one second ago
---

## What is wrong

See also: GAP-13 (the harm senses are off, and its step 1 proposes calling `watch_for_harm` from `look_around`). This finding is about what that code says once it is called. It is dead code today, so nothing in a round goes wrong yet; it goes wrong the day GAP-13's step 1 is built.

`watch_for_harm` tells the brain who is "right beside" someone who has come to harm, and what they are "holding". It picks that person with `who_is_beside`, which takes the first adjacent person whose held item has `force >= CREW_NPC_WEAPON_FORCE` (8), or else anyone adjacent in combat mode. Three faults:

1. **A mop is a weapon.** A mop's `force` is 8, exactly the bar. A janitor mopping next to someone who slips, faints or is shot from across the room is reported: "Rae has just collapsed. Finn Hale is right beside them, holding a mop." The window has nothing else to go on; a security officer acting on that would suspect the janitor. Toolboxes, wrenches, extinguishers and crowbars, carried by every engineer, are over the bar too.
2. **A gun is not.** `/obj/item/gun` has `force = 5`. Someone who shoots a crew member from three tiles off is never named (only tile-adjacent people are looked at, `get_dist(other, person) > 1` is skipped), and one who shoots them point blank is named only if in combat mode, and then with no weapon: "is right beside them."
3. **A beating is missed.** `health_seen[key]` is overwritten at every look, one second apart (`CREW_NPC_LOOK_INTERVAL`). The hurt test is `before[1] - person.health >= CREW_NPC_HARM_NOTICED` (8), so it compares one second with the next. Fists do a few points a blow and land about once a second: a beating of 5 or 6 a second, which takes someone down in under twenty seconds, never trips it. `health` also falls from suffocation and poison, which nobody can see, so a person choking in a room full of smoke "has just been hurt", with whoever is beside them named.

One concrete case. A janitor is mopping the Bar. Pun Pun is shot by the Captain from the doorway. Pun Pun is human (monkey species), falls into crit, and `watch_for_harm` runs `CREW_HARM_COLLAPSED`. `who_is_beside` finds the janitor one tile off holding a mop, force 8, and returns it at once. The danger event reads "Pun Pun has just collapsed. Bea Sola is right beside them, holding a mop." The Captain, with a gun, is not mentioned.

## Where

`code/modules/llm_crew/crew_npc_danger.dm:96`:

    /datum/ai_controller/crew_npc/proc/held_weapon(mob/living/carbon/human/person)
    	for(var/obj/item/held in person.held_items)
    		if(held.force >= CREW_NPC_WEAPON_FORCE)
    			return held

`code/modules/llm_crew/crew_npc_danger.dm:84`, `who_is_beside`:

    		if(other == person || other == pawn || other.stat == DEAD || get_dist(other, person) > 1)
    			continue
    		if(held_weapon(other))
    			return other

`code/modules/llm_crew/crew_npc_danger.dm:25` and `:41`, the look a second ago, overwritten each time:

    	var/list/before = health_seen[key]
    	health_seen[key] = list(person.health, person.stat, IS_UNCONSCIOUS(person), world.time)
    ...
    	else if(before[1] - person.health >= CREW_NPC_HARM_NOTICED)

`code/modules/llm_crew/_defines.dm:251`: `#define CREW_NPC_WEAPON_FORCE 8`. `code/game/objects/items/mop.dm:10`: `force = 8`. `code/modules/projectiles/gun.dm:21`: `force = 5`.

## How it was found

Read from the code and the base item values. Not seen in a round: nothing calls `watch_for_harm`.

## How to fix it

Do this when GAP-13 step 1 is built, not before.

1. `held_weapon`: count a held item as a weapon if it is a gun (`isgun(held)`), a baton (`istype(held, /obj/item/melee/baton)`), or sharp (`held.sharpness`), or has force well above tool level (say 15). Leave plain tools and mops out. A player standing by would think the same: a mop is not a weapon, a pistol is.
2. `who_is_beside`: also look for anyone within `CREW_NPC_VISION_RANGE` in sight with a gun in hand pointed the victim's way (`get_dir(other, person) & other.dir`), and prefer that person over one merely adjacent. Keep the adjacent test for melee.
3. `watch_for_harm`: keep the health of a few seconds back, not the last look. Store the health and time only when the stored one is older than `CREW_NPC_HARM_REPORT_GAP` (4 s), and compare against that. The test then catches 8 points over four seconds.
4. Use `person.getBruteLoss() + person.getFireLoss()` for "hurt" in place of `health`, which also counts oxygen and toxin damage nobody can see.

## How to test the fix

No sim scenario can see this until the window reads `danger` events. With GAP-13 built: a DM unit test, or a round with a janitor mopping beside a person who is shot from range, and `crew_brain.log` should show the shooter named, not the janitor. Compile.
