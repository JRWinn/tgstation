---
id: SEC-10
title: The attack_paw edit is heard once, as meant, but it also wakes base-game listeners that never heard a monkey before, and a tackle is told as a shove
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: code/modules/mob/living/carbon/human/human_defense.dm:149, code/datums/elements/relay_attackers.dm:13, code/datums/ai/monkey/monkey_controller.dm:137, code/modules/religion/sparring/sparring_datum.dm:110, code/modules/llm_crew/crew_npc_security.dm:1524
fix: Keep the edit, but send it only after the combat-mode and pacifism checks a bite or tackle passes, and tell a monkey's right-click as a tackle, not a shove; the owner to say whether monkeys fighting monkeys back is wanted
---

## What is wrong

Already in part on record: the change log entry of 19:38 to 20:00, "Added at 20:00", says "A monkey bitten by another monkey may now turn on it, where it did not before", and under "Seen and left alone", "A tackle is told to the brain as shoves you". What this file adds: the sparring match and the stealth suits, that the friendly touch is now sent too, a way to send it only for a real attack, and the answers to the two questions below.

The scope asked two questions about the base-game edit in `human_defense.dm`. The answers, from the code:

**Is anything now told of a paw attack twice?** No. `/mob/living/carbon/human/attack_paw` now sends `COMSIG_ATOM_ATTACK_PAW` first. On the bite path it calls `..()` into `/mob/living/carbon/attack_paw`, which calls `..()` into `/mob/living/attack_paw`, and that one does not call `..()`: `/atom/attack_paw`, the only other sender, is never reached from a human. The right-click (tackle) path and the non-combat path return before any `..()` that could send it again. An alien's attack goes through `attack_alien`, which sends its own `COMSIG_MOB_ATTACK_ALIEN` and does not reach `attack_paw`. So `relay_attackers` relays each paw attack once.

**Does returning TRUE on a cancelled chain change what a monkey can do to a person?** Not today. Nothing registered on a human for `COMSIG_ATOM_ATTACK_PAW` returns `COMPONENT_CANCEL_ATTACK_CHAIN`: the listeners that can sit on a human are `relay_attackers`, the sparring match (`paw_interference`), and the ninja and infiltrator MOD stealth (`unstealth`), and none of them returns it. The ones that do cancel (`storage`, `singularity`, `supermatter_crystal`) are on objects. So the `return TRUE` is dead for now, and harmless.

What the edit does change, beyond the officer:

1. **Monkeys now fight back against monkeys.** Every monkey with the monkey AI has `relay_attackers` (`monkey_controller.dm:76`) and `on_attacked` adds the attacker to its enemies (`MONKEY_RETALIATE_PROB`). Monkeys are humans, so a monkey biting or tackling another monkey went through this same proc and was never relayed. Now it is: a monkey that bites Pun Pun becomes Pun Pun's enemy. That is new base-game behaviour on every map, in every round, with or without crew NPCs.
2. **A chaplain's sparring match is ended by any monkey's touch.** `paw_interference` does not look at combat mode, and the signal is now sent before the `if(!user.combat_mode)` branch, so a monkey that only shakes a sparring partner (the friendly click) flubs the match.
3. **A monkey's touch breaks a stealth suit** (`modules_ninja.dm`, `modules_antag.dm` `unstealth`), again even the friendly one.

And one thing in our own code: a monkey's right-click is a tackle (`Knockdown(30)`, or `Paralyze(40)` if already down: "pins you down"). `relay_attackers` sends any right-click as `ATTACKER_SHOVING`, and `on_struck` tells the brain "Pun Pun shoves you." The brain treats a shove like a hit, so the arrest side is not wrong, but the words are, and the model is told it was shoved when it was knocked flat.

## Where

`code/modules/mob/living/carbon/human/human_defense.dm:145`:

    /mob/living/carbon/human/attack_paw(mob/living/carbon/human/user, list/modifiers)
        // Crew NPC change: ...
        if(SEND_SIGNAL(src, COMSIG_ATOM_ATTACK_PAW, user, modifiers) & COMPONENT_CANCEL_ATTACK_CHAIN)
            return TRUE
        ...
        if(LAZYACCESS(modifiers, RIGHT_CLICK)) //Always drop item in hand, if no item, get stunned instead.
            ...
                    Knockdown(30)
            return TRUE
        if(!user.combat_mode)
            ..() //shaking
            return FALSE

`code/datums/ai/monkey/monkey_controller.dm:137`:

    /datum/ai_controller/monkey/proc/on_attacked(datum/source, mob/attacker)
        SIGNAL_HANDLER
        if(prob(MONKEY_RETALIATE_PROB))
            retaliate(attacker)

`code/modules/religion/sparring/sparring_datum.dm:110`:

    /datum/sparring_match/proc/paw_interference(datum/source, mob/living/attacker)
        SIGNAL_HANDLER
        if(attacker == chaplain || attacker == opponent)
            return
        INVOKE_ASYNC(src, PROC_REF(flub), attacker)

`code/datums/elements/relay_attackers.dm`, `on_attack_generic`:

    if(LAZYACCESS(modifiers, RIGHT_CLICK))
        relay_attacker(target, attacker, ATTACKER_SHOVING, get_dir(target, attacker))
        return

`code/modules/llm_crew/crew_npc_security.dm:1524`, `on_struck`:

    tell_struck(attacker, (attack_flags & ATTACKER_SHOVING) ? "shove" : "hit")

## How it was found

Read from the code: the three `attack_paw` procs on the way up from a human, `/atom/attack_paw`, `attack_alien`, and every `RegisterSignal` on `COMSIG_ATOM_ATTACK_PAW` in `code/`. Not seen in a round. Whether monkeys fighting monkeys back has shown up in the test rounds was not checked in `attack.log`.

## How to fix it

1. The edit is the right idea and should stay: the officer has to know it is bitten. It is a base-game file, so keep it as small as it is.
2. To keep the friendly touch out of it, move the `SEND_SIGNAL` line below the point where a real bite or tackle is certain: send it inside the right-click branch, and after `if(!user.combat_mode)` for the bite. `relay_attackers` already ignores a non-combat touch, so the officer loses nothing; the sparring match and the stealth suit go back to how they were for the friendly click.
3. Monkeys fighting monkeys back cannot be avoided by our edit without a special case; it follows from the signal being sent at all. **Question for the owner:** keep it (it is arguably what the base game meant), or limit our listening to our own bodies by registering a crew-only signal of our own in that proc (for example `COMSIG_HUMAN_PAW_ATTACKED`, defined in our files and sent beside the base one), and drop the base `COMSIG_ATOM_ATTACK_PAW` send. The second leaves the base game exactly as it was.
4. In our code, tell a monkey's tackle as what it is: in `on_struck`, if the attacker is not an advanced tool user (`!ISADVANCEDTOOLUSER(attacker)`) and the flag is `ATTACKER_SHOVING`, use `how = "tackle"` and the words "[name] tackles you to the floor." The window reads `struck_name`, not `how`, so nothing there breaks.

## How to test the fix

- Server compile on a side copy.
- In a round: have Pun Pun bite and then tackle an officer. `game.log` should show one "was laid hands on by Pun Pun ... hit" and one "... tackle", each once per three seconds at most, as now.
- With step 3's second choice: two monkeys in the genetics pen, one made to bite the other with the player's monkey form; the bitten one must not turn on it (as before the edit).
