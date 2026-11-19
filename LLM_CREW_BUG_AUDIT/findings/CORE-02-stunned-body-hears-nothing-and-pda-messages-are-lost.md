---
id: CORE-02
title: A body that is stunned or paralysed for a moment is treated as senseless, so what is said to it is not heard and a PDA message that comes in then is lost for good
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_senses.dm:101, code/modules/llm_crew/crew_npc_controller.dm:313, code/datums/ai/_ai_controller.dm:475, code/modules/llm_crew/crew_npc_cargo.dm:805, code/modules/llm_crew/crew_npc_senses.dm:384
fix: Make can_sense depend on the body (alive, conscious, no player in it), not on ai_status, and keep PDA messages that come while it cannot sense to read when it can
---

## What is wrong

`can_sense()` is the gate for every sense: hearing (`on_pre_hear`), PDA messages (`on_pda_message`), the look around each second, and whether a tool call is taken at all. It says the body cannot sense whenever the controller's `ai_status` is `AI_STATUS_OFF`:

    if(QDELETED(body) || ai_status == AI_STATUS_OFF)
    	return FALSE

But the controller is switched off for reasons that have nothing to do with senses. The crew controller's own `get_able_to_run` returns `AI_UNABLE_TO_RUN` whenever the body is incapacitated (stunned, paralysed, in stamina crit), and the base `get_expected_ai_status` turns that into `AI_STATUS_OFF`. A stunned or paralysed person in the game still sees and hears, and can read their PDA once they are up. The crew NPC, for those seconds, is deaf, blind and its PDA does not reach it.

Speech heard then is simply gone. PDA messages are worse: `on_pda_message` returns at once and the message is never put to the brain, though it sits on the PDA. Nothing goes back for it later. A player who was knocked down reads the message when they get up.

One concrete case. Pun Pun tackles the Head of Personnel in the Bar (`attack_paw`, `Paralyze(40)`: four seconds). In those four seconds the Captain sends it a PDA order: "Go and see what is wrong in the kitchen". `COMSIG_MODULAR_PDA_MESSAGE_RECEIVED` fires, `on_pda_message` finds `can_sense()` FALSE and returns. The HoP gets up and never does it, and never answers. The Captain sees nothing to say why. The same for an officer batoned into stamina crit by someone resisting, who does not hear "I give up", and for a worker who is told "noted" by PDA while slipped on lube.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:101`:

    /datum/ai_controller/crew_npc/proc/can_sense()
    	var/mob/living/carbon/human/body = pawn
    	if(QDELETED(body) || ai_status == AI_STATUS_OFF)
    		return FALSE
    	return body.stat != DEAD && !IS_UNCONSCIOUS(body)

`code/modules/llm_crew/crew_npc_controller.dm:313`:

    /datum/ai_controller/crew_npc/get_able_to_run()
    	var/mob/living/living_pawn = pawn
    	// Cuffed or grabbed crew can still shuffle about and talk; stunned or unconscious crew cannot.
    	if(INCAPACITATED_IGNORING(living_pawn, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB))
    		return AI_UNABLE_TO_RUN

`code/datums/ai/_ai_controller.dm:475` (base), in `get_expected_ai_status`:

    	if(!able_to_run)
    		return AI_STATUS_OFF

`code/datums/status_effects/debuffs/debuffs.dm:62` and `:108` (base): stun and paralyse both add `TRAIT_INCAPACITATED`, which is what `incapacitated` is built from.

`code/modules/llm_crew/crew_npc_cargo.dm:805`, `on_pda_message`:

    	if(!can_sense() || get_atom_on_turf(computer) != pawn)
    		return

`code/modules/llm_crew/crew_npc_senses.dm:384`, `on_pre_hear`:

    	if(speaker == body || !can_sense() || HAS_TRAIT(body, TRAIT_DEAF))
    		return

## How it was found

Read from the code, following `COMSIG_MOB_INCAPACITATE_CHANGED` through `update_able_to_run` to `set_ai_status`. Not seen in a round log. I did not check how long Pun Pun's tackle and a stun baton keep a body down in practice.

## How to fix it

1. Split the one test into two. Keep `can_sense()` for "can this body perceive anything": the body exists, is not dead, is not unconscious, has no player in it (`isnull(body.client)`), and the controller has not been forced off (`!forced_off`). Do not look at `ai_status` or `able_to_run`.
2. Add `can_act()` for "can this body do anything": `can_sense() && able_to_run`. Use it in `handle_tool_call` where the "Your body is not responding." refusal is given, so a stunned body still refuses to walk or pick things up. `tool_say` can stay on `can_sense()` plus the body's own `can_speak()`, since a stunned person can still talk.
3. Leave `look_around` on `can_sense()`. A stunned body then goes on seeing who is about.
4. For PDA messages that arrive while the body is unconscious: in `on_pda_message`, if the PDA is on the body but `can_sense()` is FALSE, keep `list(sender, job, message)` in a new list on the controller. At the top of `look_around`, once `can_sense()` is TRUE again, emit each as an ordinary `CREW_SENSE_PDA_MESSAGE` with the words "While you were out, your PDA got a message from ...". Cap the list at, say, ten. This is a player looking at their PDA when they come to, not a hidden channel.
5. Check the callers of `can_sense()` one by one after the split (grep `can_sense()` in `code/modules/llm_crew/`). Most are fine on either meaning; any that stand for "the body can act" move to `can_act()`.

## How to test the fix

- Server compile.
- In a round, use the admin Paralyze on a crew NPC for ten seconds and, while it is down, send it a PDA message and say something beside it. With the fix the window shows both events, and the PDA message is acted on. Grep `crew_brain.log` for the message text.
- Knock one out (the admin Sleep) and send a PDA message: with the fix it is read once it wakes, with the "While you were out" words.
