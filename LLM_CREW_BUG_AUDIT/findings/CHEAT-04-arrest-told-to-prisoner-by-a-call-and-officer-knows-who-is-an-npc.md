---
id: CHEAT-04
title: A crew prisoner is told it is being arrested by a direct call before anything is said or done, and the officer treats it apart because it knows it is an NPC
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:871, code/modules/llm_crew/crew_npc_security.dm:1190, code/modules/llm_crew/crew_npc_security.dm:1363, code/modules/llm_crew/crew_npc_security.dm:1391, code/modules/llm_crew/crew_npc_security.dm:1416
fix: Let the prisoner learn of its arrest from the words it hears and the cuffs and hand it feels, and have the officer judge who stood for it by what they did, not by whether they have a crew controller
---

## What is wrong

Two sides of one channel between controllers that no body could sense.

**The prisoner's side.** `make_arrest` calls `their_controller.being_arrested(body)` on any target that has a crew controller, as its very first step, "before a hand is laid on it". That call cancels the prisoner's errand and walk, makes it let go of what it is pulling, holds it still (`stand_still`), and gives it the sense line "[name] is arresting you. You stand still." Then `put_in_custody` tells it "[name] has put you in Cell 2 for 5 minutes", and `set_free` calls `let_out_of_custody`, "You are free to go." None of these comes from what the prisoner hears, sees or feels: they are function calls. The officer's line "Pun Pun, you are under arrest ... Stand still." is said by the officer's brain (`jobs/arrests.ts`), but the prisoner does not need to hear it: a prisoner that is deaf, behind glass, or out of earshot when the tool runs is held still all the same.

**The officer's side.** In `put_in_cell` the cuffs are taken off a prisoner only if it has a crew controller (`if(istype(their_controller)) take_cuffs_off(prisoner)`). In `set_free`, `let_out_of_custody` is called only for one. `LLM_CREW_PLAN_SECURITY.md` 3.8 has the rule as "A prisoner who stands for it has the cuffs taken off. A crew NPC always does." So the test the plan meant is how the prisoner behaved; the code tests what kind of thing is driving the body, which no player can see. A player officer cannot tell a crew NPC from a player.

Concrete cases:

1. A janitor NPC with its back to the hallway is mopping. An officer with a warrant walks up behind it; `make_arrest` runs once the officer is next to it. The janitor stops dead, drops what it is pulling and is told "is arresting you" the instant the call runs, whether or not the officer's line was said or heard (the line is a separate brain step and may have been dropped by the say cooldown), and even if the janitor is `TRAIT_DEAF`.
2. A player and a crew NPC are both arrested quietly and both stand still. The NPC has its cuffs taken off in the cell; the player is left in them. Same behaviour, different treatment, decided by something the officer cannot see.
3. The prisoner's sense line names the cell and the minutes. A player in a cell can read the timer on the wall outside if they look at it; the prisoner is told without looking, and even if the timer has no power.

## Where

`code/modules/llm_crew/crew_npc_security.dm:871`, in `make_arrest`:

    	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
    	// One of the crew stands for it, and goes along. It is told before a hand is laid on it.
    	if(how != CREW_ARREST_STOP && istype(their_controller))
    		their_controller.being_arrested(body)

`:1190`, in `put_in_cell`:

    	body.stop_pulling()
    	var/datum/ai_controller/crew_npc/their_controller = prisoner.ai_controller
    	if(istype(their_controller))
    		take_cuffs_off(prisoner)

`:1391`, `being_arrested`:

    	cancel_search()
    	cancel_errand()
    	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
    	body.stop_pulling()
    ...
    	emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] is arresting you. You stand still.", list("under_arrest" = TRUE, "by" = by.name))

`:1416`, `put_in_custody`: `emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] has put you in [cell.name] for [minutes] minute\s.", ...)`.

## How it was found

Read from the code and checked against the security plan's 3.7 and 3.8. The going along quietly is decided by the owner (plan 3.7, "until then a crew NPC under arrest goes quietly"); only how it learns of the arrest, and how the officer tells who stood for it, are at fault here.

## How to fix it

1. **The prisoner hears it.** In the prisoner's brain, the arrest line is already fixed, word for word: "[name], you are under arrest[, for ...]. Stand still." Add a reader beside the other word-for-word readers (`jobs/orders.ts` pattern): a heard line from someone whose job is security, naming the body, with "under arrest", starts going quietly. The window then sends a new server tool, `submit` (or reuse `hold`), that does what `being_arrested` does now for the body's own state: stop, let go, stand still, set `custody_phase`.
2. **The prisoner feels it.** On the server, a body whose wrists are cuffed (`COMSIG_CARBON_HANDCUFFED` or the equip signal for the handcuff slot) and who is then pulled by someone in security sets the same custody state, with the line "[name] has cuffed you." This covers the deaf and the far: a player who is cuffed knows it.
3. **The cell.** Drop the minutes from the sense line unless the timer is in view; "[name] has put you in Cell 2." is what the prisoner sees. `custody_tick` already goes by the timer, not by what it was told.
4. **The officer.** Replace `istype(their_controller)` in `put_in_cell` and `set_free` by what the officer saw: did the prisoner stand still for the cuffs (the quiet arrest went through with no baton hits, which `make_arrest` already knows as `hits == 0` with `how == CREW_ARREST_QUIET`). Keep that on `arrested` as `stood_for_it`. Take the cuffs off anyone who did, player or NPC.
5. `let_out_of_custody` on the freed person's controller can go: the freed NPC's own `custody_tick` sees the cuffs off and the hand gone and frees itself.

Question for the owner: should a player who stood for a quiet arrest have the cuffs taken off in the cell too? The plan's wording says yes ("A prisoner who stands for it"), and that is what step 4 does.

## How to test the fix

- Server compile, window type check.
- `tools/llm_crew/security.ts`: add the heard arrest line as a case for the new reader, both with the body's name and with someone else's name (must not trigger).
- Simulator: an arrest of a crew NPC with the officer's line said and heard, and one where it is not heard (the sim can drop the speech): the second must still end in custody once the cuffs are on.
- A round: arrest a janitor NPC; `game.log` "is being arrested by" should come after the officer's say line, not before it.
