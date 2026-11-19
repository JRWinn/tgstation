---
id: HAND-02
title: A mess the body could not walk to once is put with those that will not come off, for the rest of the round, and it says its mop will not shift it
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: cleaning
files: code/modules/llm_crew/crew_npc_hands.dm:409, code/modules/llm_crew/crew_npc_hands.dm:375, code/modules/llm_crew/crew_npc_cleaning.dm:268, code/modules/llm_crew/crew_npc_cleaning.dm:393, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:459
fix: Keep messes it could not get to in a list of their own with the time, try them again after a few minutes, and tell the brain could not get to it apart from would not come off
---

## What is wrong

When the walk to a mess fails (no way found, or the walk ran out of time), `crew_npc_fail_errand` writes the mess into `stubborn_messes`. That list is for messes that were scrubbed at and would not come off. Nothing takes a mess out of it again except the body coming to hold a different kind of cleaning tool (`mind_what_it_holds`). A janitor that keeps its mop all round never tries that mess again.

Passing an unreachable mess over for this visit is meant (`more_to_clean` says so: a room is settled in one visit). Two things about it are wrong:

1. **It is for good, whatever stopped the walk.** A fire door that was down for a minute, someone standing in a one-tile gap, a crate in a doorway, the 3 minute limit running out behind a queue at a door: each writes the mess off for the round. The two other lists filled in the very same proc, `fire_alarms_failed` and `tidy_skipped`, store the time and are tried again after five minutes. Only the mess is permanent.
2. **What is said about it is not true.** The mess counts in `clean_failed_count`, so the report reads "What is left there will not come off with what you have." It is left out of `workable_mess_places()`, so the window marks the room as beyond its tool and sends whoever called it "I cannot shift the mess in the Bar with my mop." It never touched the mess. Whoever reads that sends for soap, or orders it, for nothing.

One concrete case: a janitor with a wet mop is called to the Bar. Blood lies on a tile behind the bar counter, in the Bar's own area, where only the bartender's windoor leads. `messes_to_clean` lists it (it is in sight and in the room). The walk finds no way. `crew_npc_fail_errand` runs: the blood goes into `stubborn_messes`, `finish_errand` gets `list(FALSE, "You could not get to it.")` and adds one to `clean_failed_count`. The janitor cleans the rest and is told "You clean up 3 messes in Bar. What is left there will not come off with what you have." It then sends "I have done what I can in the Bar. The rest would not come off with my mop." Later the bartender leaves the windoor open. The janitor is called again and never goes near the blood.

A second, smaller fault in the same list: it is keyed by `REF(mess)` and holds only TRUE. When a mess is deleted its ref number is free for the next object made. A new mess that is given that number is skipped as stubborn the moment it is seen (`!stubborn_messes[REF(mess)]` in `messes_to_clean`). Blood and footprints are made and deleted all round, so over a long shift some new messes are written off unseen.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:407`, `crew_npc_fail_errand/perform`:

    // A mess it could not get to goes with the ones that would not come off: not tried again.
    var/atom/target = controller.blackboard[BB_CREW_NPC_ERRAND_TARGET]
    if(istype(target, /obj/effect/decal/cleanable))
    	crew_controller.stubborn_messes[REF(target)] = TRUE
    // Likewise something it could not get to in order to put it away.
    // A fire alarm it could not get to is on the far side of the fire doors. The next nearest is tried instead.
    if(crew_controller.errand_tool == CREW_TOOL_RESET_ALARM && !QDELETED(target))
    	crew_controller.fire_alarms_failed[REF(target)] = world.time
    if(crew_controller.errand_tool == CREW_TOOL_TIDY && !QDELETED(target))
    	crew_controller.tidy_skipped[REF(target)] = world.time

`code/modules/llm_crew/crew_npc_cleaning.dm:268`, `mind_what_it_holds`, the only place the list is emptied:

    if(isnull(tool) || tool.type == stubborn_with)
    	return
    if(stubborn_with)
    	stubborn_messes = list()
    	stubborn_kinds = list()
    stubborn_with = tool.type

`code/modules/llm_crew/crew_npc_hands.dm:373`, `finish_errand`:

    var/beyond_it = clean_failed_count > 0 && !more_here
    if(cleaned_count)
    	action_result(tool, TRUE, "You clean up [cleaned_count] mess[cleaned_count == 1 ? "" : "es"] in [place].[beyond_it ? " What is left there will not come off with what you have." : ""]", list("place" = place, "beyond" = beyond_it))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:455`, in `syncTasks`:

    line: task.cleanedSome
      ? `I have done what I can in the ${task.place}. ${whatIsLeft(brain)}`
      : `I cannot shift the mess in the ${task.place} with my ${brain.cleaningTool}.${...}`,

`clean_mess` (`crew_npc_cleaning.dm:526`) feeds the same list after one failed scrub, whatever made it fail. That is the cleaning reviewer's to judge, but any fix here should use the same new list for "tried and interrupted".

## How it was found

Read from the code. Not seen in a round. `LLM_CREW_PLAN_ROUND_0912.md` line 76 has two janitors reporting "You could not get to it." two seconds into a clean, which is this proc running, but what happened to those messes afterwards was not followed in the log.

## How to fix it

1. Add `var/list/unreached_messes = list()` to the controller: `REF` to `list(WEAKREF(mess), world.time)`.
2. In `crew_npc_fail_errand/perform`, write the mess there in place of `stubborn_messes`.
3. Add a proc `mess_given_up(mess)` that returns TRUE if the mess is in `stubborn_messes`, or is in `unreached_messes` with the same object behind the weak reference and less than `CREW_NPC_TIDY_GIVE_UP` (5 minutes) ago. Use it at the three places that read `stubborn_messes` (`messes_to_clean`, `remembered_mess_in`, `workable_mess_places`). An entry that is older or whose object is gone is removed there.
4. Make `stubborn_messes` hold a weak reference as well and compare the object, so a recycled ref is not taken for the old mess.
5. In `finish_errand`, count the two apart: keep `clean_failed_count` for the limit on one go, add `clean_unreached_count`. Send `"unreached" = TRUE` in the details when what is left was only out of reach, and say "What is left there you could not get to." in place of "will not come off".
6. In `janitor.ts`, where `beyondIt` picks the words, use the new detail: "I have done what I can in the Bar. I could not get to the rest." The fallback line must stay a plain one so a dead model changes nothing.
7. `ways_reopened()` (called when a door is opened for the body or fire doors lift) should empty `unreached_messes`.

Keeps the rules: nothing is done to the world, only what the body remembers and says.

## How to test the fix

- Type check and server compile to a side copy.
- Simulator: `sim.ts` plays the server, so add to a cleaning scenario one clean result with `beyond: true, unreached: true` and check the PDA line says "could not get to" and not "cannot shift".
- In a round: spill something behind the bar counter with the windoor shut and call a janitor. `game.log` should show the clean, and `pda.log` the "could not get to" line. Open the windoor, wait five minutes, call again: it should go to the mess.
