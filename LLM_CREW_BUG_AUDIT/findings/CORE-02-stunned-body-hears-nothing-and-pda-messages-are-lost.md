---
id: CORE-02
title: A body that is stunned or paralysed for a moment is treated as senseless, so what is said to it is not heard and a PDA message that comes in then is lost for good
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_senses.dm:101, code/modules/llm_crew/crew_npc_controller.dm:313, code/datums/ai/_ai_controller.dm:475, code/modules/llm_crew/crew_npc_cargo.dm:805, code/modules/llm_crew/crew_npc_senses.dm:384
fix: Make can_sense depend on the body (alive, conscious, no player in it), not on ai_status; add can_act for doing things and for the window's awake; keep PDA messages that come while it cannot sense to read when it can
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

1. Split the one test into two. Keep `can_sense()` for "can this body perceive anything": the body exists, is not dead, is not unconscious, and has no player in it (`isnull(body.client)`, which is the base's own reason to turn it off, `_ai_controller.dm`, `get_expected_ai_status`). Do not look at `ai_status` or `able_to_run`. (There is no `forced_off` var on the controller; do not invent one.)
2. Add `can_act()` for "can this body do anything": `can_sense() && able_to_run && ai_status != AI_STATUS_OFF`. Use it in `handle_tool_call` where the "Your body is not responding." refusal is given (`crew_npc_tools.dm:16`), so a stunned body still refuses to walk or pick things up; let `CREW_TOOL_SAY` through on `can_sense()` and the body's own `can_speak()`, since a stunned person can still talk.
2a. Send `can_act()`, not `can_sense()`, as `"awake"` in `crew_brain_link.dm:92`. The window (`driver.ts`, `drive`, `!brain.awake`) uses it to hold back steps; on `can_sense()` it would send steps to a stunned body, each refused and put in back-off as a failure.
3. Leave `look_around` on `can_sense()`. A stunned body then goes on seeing who is about.
4. For PDA messages that arrive while the body is unconscious: in `on_pda_message`, if the PDA is on the body but `can_sense()` is FALSE, keep `list(sender, job, message)` in a new list on the controller. At the top of `look_around`, once `can_sense()` is TRUE again, emit each as an ordinary `CREW_SENSE_PDA_MESSAGE` with the words "While you were out, your PDA got a message from ...". Cap the list at, say, ten. This is a player looking at their PDA when they come to, not a hidden channel.
5. Check the callers of `can_sense()` one by one after the split (grep `can_sense()` in `code/modules/llm_crew/`). Seeing and hearing stay on `can_sense()`: `look_around` (`crew_npc_senses.dm:129`), `on_pre_hear`, `on_pda_message`, the knock heard (`crew_npc_doors.dm:689`), the looks in `crew_npc_engineering.dm:74` and `crew_npc_security.dm:1590`, and the look in `action_result`. Doing moves to `can_act()`: `handle_tool_call`, `start_search` (`crew_npc_storage.dm:53`), `write_off_lost_crates` (`crew_npc_held.dm:93`, it speaks aloud and changes records; speech alone would do, but it is part of the work), and `awake` above.
6. `look_around` runs on its own looping timer (`crew_npc_senses.dm:18`), not on the controller's tick, so step 4's catch-up runs even while `ai_status` is off.

## How to test the fix

- Server compile.
- In a round, use the admin Paralyze on a crew NPC for ten seconds and, while it is down, send it a PDA message and say something beside it. With the fix the window shows both events, and the PDA message is acted on. Grep `crew_brain.log` for the message text.
- Knock one out (the admin Sleep) and send a PDA message: with the fix it is read once it wakes, with the "While you were out" words.

## Check

Checked by Opus 5.5. The quotes match the code. Traced it: `crew_npc_controller.dm` `setup_able_to_run` registers `COMSIG_MOB_INCAPACITATE_CHANGED` to the base `update_able_to_run` (`_ai_controller.dm:590`), which calls the crew `get_able_to_run`; `INCAPACITATED_IGNORING(... RESTRAINTS|STASIS|GRAB)` is true under stun and paralyse (both add `TRAIT_INCAPACITATED`, `debuffs.dm:62` and `:108`) and in stamina crit, so `able_to_run` goes FALSE and `get_expected_ai_status` returns `AI_STATUS_OFF` (`_ai_controller.dm:475`); `set_ai_status` stores it. `can_sense()` then returns FALSE, and `on_pda_message` (`crew_npc_cargo.dm:805`) returns without storing the message anywhere; nothing in `code/modules/llm_crew/` reads the PDA's chats later. Knockdown alone (a water slip) adds only `TRAIT_FLOORED` and does not trigger this; a baton into stamina crit, a tackle's `Paralyze` and lube do. Nothing in the change log or plans chose this. Kept medium: it comes up mainly in arrests and fights, and loses an order or an answer for good. Effort raised to medium: the split touches `crew_npc_senses.dm`, `crew_npc_tools.dm`, `crew_npc_cargo.dm`, `crew_brain_link.dm`, `crew_npc_storage.dm` and `crew_npc_held.dm`. Mended the fix: there is no `forced_off` var, and the window's `awake` must follow `can_act()` or the window sends steps to a stunned body.

## Fix so far

Group m-senses, 2026-11-19. Done the other way round from step 1, so that no caller outside the senses changes meaning: `can_sense()` keeps meaning "can act" (now `can_perceive() && ai_status != AI_STATUS_OFF`, the same answer as before), and the new `can_perceive()` (body alive, not unconscious, not `forced_off`, no player in it, on a turf; not `ai_status`) is the test for perceiving. (There is a base `forced_off` var after all, and it is kept.) In `crew_npc_senses.dm`: `look_around` and `on_pre_hear` use `can_perceive()`, so a stunned body goes on seeing and hearing; `drop_disguise` in the look is gated on `can_sense()`. `keep_missed_pda(computer, sender, job, message)` keeps up to ten messages, and `look_around` reads them, once the body perceives again, as ordinary `pda_message` events worded "While you were out, your PDA got a message from ..." (with `missed: TRUE`), if that PDA is still on it. `"awake"` in `ui_data` stays on `can_sense()`, so the window holds steps while it is stunned (step 2a).

Held (other files):
- `crew_npc_cargo.dm`, `on_pda_message`: replace `if(!can_sense() || !crew_npc_carries(computer)) return` with: return if `!crew_npc_carries(computer)`; after the literacy test and the `message`/`sender` lines, `if(!can_perceive()) { keep_missed_pda(computer, sender, "[sender_job]", message); return }`. Until this is done a message to a stunned body is still lost, but one to an unconscious body is lost as before too.
- Seeing and hearing elsewhere to `can_perceive()`: the knock heard (`crew_npc_doors.dm`, about :714 and the `their_controller.can_sense()` at :756), the looks in `crew_npc_engineering.dm:74` and `crew_npc_security.dm` (`can_look`), and the look in `action_result` (`crew_npc_tools.dm:138`). The doing callers (`handle_tool_call`, `start_search`, `write_off_lost_crates`, the errand serial checks) stay on `can_sense()` as they are. Letting `CREW_TOOL_SAY` through while stunned (step 2) is left: `handle_tool_call` is not mine.
Compile only; not played.

Round M2 (g-srv-c, compile only): the looks in `crew_npc_security.dm` (`can_look` in `free_cell` and `security_state`, the keepers by ID when the body has no PDA, a prisoner's look at its cell's timer in `put_in_custody`) and in `crew_npc_engineering.dm` (`engineering_state`) now use `can_perceive()`, so a stunned officer or engineer still sees the cells, its baton and the machines. The doing callers in those files stay on `can_sense()`.
