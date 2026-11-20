---
id: CHEAT-04
title: A crew prisoner is told it is being arrested by a direct call before anything is said or done, and the officer treats it apart because it knows it is an NPC
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:871, code/modules/llm_crew/crew_npc_security.dm:1190, code/modules/llm_crew/crew_npc_security.dm:1363, code/modules/llm_crew/crew_npc_security.dm:1391, code/modules/llm_crew/crew_npc_security.dm:1416
fix: Let the prisoner learn of its arrest from the words it hears and the cuffs and hand it feels, and have the officer judge who stood for it by what they did, not by whether they have a crew controller
---

## What is wrong

Two sides of one channel between controllers that no body could sense.

**The prisoner's side.** `make_arrest` calls `their_controller.being_arrested(body)` on any target that has a crew controller, as its very first step, "before a hand is laid on it". That call cancels the prisoner's errand and walk, makes it let go of what it is pulling, holds it still (`stand_still`), and gives it the sense line "[name] is arresting you. You stand still." Then `put_in_custody` tells it "[name] has put you in Cell 2 for 5 minutes", and `set_free` calls `let_out_of_custody`, "You are free to go." None of these comes from what the prisoner hears, sees or feels: they are function calls. The officer's line "Pun Pun, you are under arrest ... Stand still." is said by the officer's brain (`jobs/arrests.ts`), but the prisoner does not need to hear it: a prisoner that is deaf, behind glass, or out of earshot when the tool runs is held still all the same.

**The officer's side.** In `put_in_cell` the cuffs are taken off a prisoner only if it has a crew controller (`if(istype(their_controller)) take_cuffs_off(prisoner)`). In `set_free`, `let_out_of_custody` is called only for one. `LLM_CREW_PLAN_SECURITY.md` 3.8 has the rule as "A prisoner who stands for it has the cuffs taken off. A crew NPC always does." So the test the plan meant is how the prisoner behaved; the code tests what kind of thing is driving the body, which no player can see. A player officer cannot tell a crew NPC from a player.

Concrete cases:

1. A janitor NPC with its back to the hallway is mopping. An officer with a warrant walks up behind it; `make_arrest` runs once the officer is next to it. The janitor stops dead, drops what it is pulling and is told "is arresting you" the instant the call runs. In the usual run the officer has said its line a step or two away first (`toldAt` is set only once the line is said, `beatAfterSaying`), but the call does not depend on it: it runs just the same for a janitor that is `TRAIT_DEAF`, and for a quiet arrest made within `TOLD_STANDS_DS` of a line said earlier and out of its hearing (45 seconds).
2. A player and a crew NPC are both arrested quietly and both stand still. The NPC has its cuffs taken off in the cell; the player is left in them. Same behaviour, different treatment, decided by something the officer cannot see.
3. The prisoner's sense line names the cell and the minutes. A player in a cell can read the timer on the wall outside if they look at it; the prisoner is told without looking. (The timer must have power: `put_in_cell` cannot start it otherwise, and does not get this far.) `custody_tick` then follows the timer by reference (`custody_timer`) and frees the body when it stops, without the body looking at it; the open door would tell a player the same, so that part is a small matter.

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

## Check

Checked by Opus 5.5, from the code; nothing run.

- The quotes are what `crew_npc_security.dm` says today: `make_arrest` calls `their_controller.being_arrested(body)` first, for any `how` but stop (871-874); `put_in_cell` takes the cuffs off only `if(istype(their_controller))` (1190-1192) and calls `put_in_custody` the same way (1215); `set_free` calls `let_out_of_custody` only for a crew controller (1363-1365); `being_arrested` cancels the errand and walk, lets go, holds still and emits the sense line (1391-1412).
- The owner chose that a crew NPC goes quietly (`LLM_CREW_PLAN_SECURITY.md` line 41 and 3.7: "it stands still when told"), and the change log's line 571 records the built way ("its body is held still the moment the arrest begins"). Neither chose that it learns of the arrest by a call rather than by being told, and the plan's own words, "when told", favour the fix. The cuffs rule in the plan (3.8) is "A prisoner who stands for it has the cuffs taken off"; the code narrowed it to crew NPCs, as the change log records ("A crew NPC has the cuffs taken off first", line 574), without an owner's word on players.
- Mended in the body: case 1 overstated it. The window sets `toldAt` only once the line has been said (`beatAfterSaying`, `jobs/arrests.ts:1008`), so in the usual run the line is said a step or two off before the call. What stays true is that the call does not need it. Case 3 said "even if the timer has no power"; it cannot be, since `put_in_cell` must start the timer first.
- The call in `hold_arrested` (1039), made once the cuffs are on and the body is pulled, stands for something the body feels, and is the honest part; keep it.
- Severity kept at medium (a knowledge channel, as for the other things-known-unseen findings; the player-visible part is case 2). Effort kept at medium, with the fix below.
- A smaller fix for step 1, server only, which I would take over a new window reader and tool: the prisoner's own `on_pre_hear` (`crew_npc_senses.dm:376`) already applies deafness, language and range. Add there: a heard line from someone who works in security that names this body and has "under arrest" in it calls `being_arrested(speaker)`. That is the prisoner's own code deciding to go quietly on what it heard, which the rules allow. Then drop the call in `make_arrest`; leave the one in `hold_arrested`. Check that a deaf NPC that is cuffed and pulled still goes along (by `hold_arrested`), and that `make_arrest`'s quiet try does not count it as "moved" in the moment between the line and the cuffs: the body is held still by `stand_still` once it has heard, so the order is line, hear, stand, cuffs.
- Step 4: `make_arrest` returns `hits` already; storing `stood_for_it = (how == CREW_ARREST_QUIET && hits == 0)` beside `arrested` works. The owner's question in the write-up stays open and must be answered before step 4 is built: a player left uncuffed gets four seconds in an open cell.
- Step 5 holds: `custody_tick` (1442) frees a body with no cuffs and no hand once `CREW_NPC_ARREST_GRACE` has run, so `let_out_of_custody` from `set_free` can go, at the cost of that short delay.

## Fix so far

Group m-secsrv, commit c136092e8fc (compile only; not played). `make_arrest` calls `being_arrested` only when the prisoner `could_hear` the officer (senses, not deaf, within 7 tiles); `heard_arrest_line(speaker, message)` is written for `on_pre_hear` to call. `put_in_custody` names the minutes only with the timer in view. `set_free` no longer calls `let_out_of_custody`. Left: the one-line call from `on_pre_hear` (`crew_npc_senses.dm`), after which the `make_arrest` call can go; step 4 waits on the owner's question.
