---
id: HAND-02
title: A mess the body could not walk to once is put with those that will not come off, for the rest of the round, and it says its mop will not shift it
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: e06819156d6, 62f33bc557c, 23621968840
found_by: Fable 5.2
checked_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_hands.dm:409, code/modules/llm_crew/crew_npc_hands.dm:375, code/modules/llm_crew/crew_npc_cleaning.dm:268, code/modules/llm_crew/crew_npc_cleaning.dm:393, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:459
fix: Keep messes it could not get to in a list of their own with the time, try them again after a few minutes, and tell the brain could not get to it apart from would not come off
---

## What is wrong

See also: JAN-01 (a scrub cut short is written off the same way, in `clean_mess`: a different cause and a different place to fix).

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
3. Add a proc `mess_given_up(mess)` that returns TRUE if the mess is in `stubborn_messes`, or is in `unreached_messes` with the same object behind the weak reference and less than `CREW_NPC_TIDY_GIVE_UP` (5 minutes) ago. Use it at the three places that read `stubborn_messes` (`messes_to_clean`, `remembered_mess_in`, `workable_mess_places`). An entry that is older or whose object is gone is removed there. Keep a count of tries with each entry, as `blocked_tries` does for rooms, and after the second failure keep it out for `CREW_NPC_BLOCKED_PLACE_LONG`. Otherwise a mess behind a counter in the room the janitor works is walked at every five minutes, and a walk that fails by running out of time costs three minutes each time.
4. Make `stubborn_messes` hold a weak reference as well and compare the object, so a recycled ref is not taken for the old mess.
5. In `finish_errand`, count the two apart: keep `clean_failed_count` for the limit on one go, add `clean_unreached_count`. Send `"unreached" = TRUE` in the details when what is left was only out of reach, and say "What is left there you could not get to." in place of "will not come off".
6. In `janitor.ts`, where `beyondIt` picks the words, use the new detail: "I have done what I can in the Bar. I could not get to the rest." The fallback line must stay a plain one so a dead model changes nothing.
7. `ways_reopened()` (called when a door is opened for the body or fire doors lift) should empty `unreached_messes`.

Keeps the rules: nothing is done to the world, only what the body remembers and says.

## How to test the fix

- Type check and server compile to a side copy.
- Simulator: `sim.ts` plays the server, so add to a cleaning scenario one clean result with `beyond: true, unreached: true` and check the PDA line says "could not get to" and not "cannot shift".
- In a round: spill something behind the bar counter with the windoor shut and call a janitor. `game.log` should show the clean, and `pda.log` the "could not get to" line. Open the windoor, wait five minutes, call again: it should go to the mess.

## Check

Confirmed. The quotes match the code today (`crew_npc_hands.dm:407-425`, `crew_npc_cleaning.dm:268-275`, `crew_npc_hands.dm:371-375`, `janitor.ts:457-459`).

- `crew_npc_fail_errand` is the selector's second branch in the errand subtree (`crew_npc.bt.json`). It runs when `crew_npc_reach` fails: no path, or the `3 MINUTES` time limit. It writes `stubborn_messes[REF(target)] = TRUE` with no time. Then it calls `finish_errand(list(FALSE, "You could not get to it."))`, which adds one to `clean_failed_count`.
- `stubborn_messes` is read at `remembered_mess_in` (288), `workable_mess_places` (334) and `messes_to_clean` (393), and cleared only by `mind_what_it_holds` on a change of tool type. `ways_reopened` (314) clears `blocked_places` only. So a door opened or fire doors lifted do not bring the mess back.
- In the window, `messy.has(place) && !workable.has(place)` makes `beyondIt`. With no scrubbing kinds in `beyondKinds`, `whatIsLeft` gives "The rest would not come off with my mop." That is false for a mess it never touched.
- `fire_alarms_failed` and `tidy_skipped` hold a time and are tried again (`crew_npc_doors.dm:760`, `crew_npc_tidying.dm:52`). The mess has no such time.
- The point about recycled refs holds. tg's `REF` is `text_ref` for a datum without `DF_USE_TAG`, and BYOND reuses ref ids after deletion. A new decal can come back as stubborn. That is the smaller half.

Nothing in the change log or plans chooses a write-off for the round. The comment in `fail_errand` says it, but no entry backs it. The fire-alarm case in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md:143` shows walks failing on fire doors, which is one way in.

I set effort to medium. The fix touches a new list, a helper used at three places, `finish_errand`'s counting and a detail sent to the window, plus one line in `janitor.ts`. That is more than about 20 lines in one file. I added a count of tries to step 3. The rest of the fix is sound and keeps the rules: only memory and words change.

Read only. Nothing was run.

## Fix so far

Server, `crew_npc_hands.dm` only (group m-hands). Done:

- `crew_npc_fail_errand` no longer writes a mess it could not walk to into `stubborn_messes` for good. `note_unreached_mess` keeps it in a new list, `unreached_messes` (REF to weak reference, time, tries in a row), logs "could not get to the X ... passed over for a while", and marks it in `stubborn_messes` as `"unreached"` so the readers in `crew_npc_cleaning.dm` still pass it over for this visit as before.
- `mess_given_up(mess, key)`: TRUE for a mess that would not come off (a `TRUE` or a weak reference to the same mess in `stubborn_messes`), or one not got to less than 5 minutes ago (`CREW_NPC_TIDY_GIVE_UP`), or less than 15 minutes ago after two tries running (`CREW_NPC_BLOCKED_PLACE_LONG`). An entry whose ref now names another object is dropped.
- `forget_unreached()`: empties the not-got-to entries with fewer than two tries.
- `finish_errand` counts "You could not get to it." apart (`clean_unreached_count`, reset at a job's first failure). The report says "What is left there you could not get to." when that is all that is left (or "Some ... will not come off ..., and some you could not get to."), and sends `"unreached" = TRUE` in the clean result's details.

Left (held, needs files m-hands does not own):

- `crew_npc_cleaning.dm`: in `remembered_mess_in`, `workable_mess_places` and `messes_to_clean`, replace the `stubborn_messes[key]` / `stubborn_messes[REF(mess)]` tests with `mess_given_up(mess, key)` (after the mess is resolved). Until then a mess not got to is still passed over for the round, as before. In `ways_reopened()`, call `forget_unreached()`. Where `clean_mess` writes `stubborn_messes[REF(mess)] = TRUE`, write `WEAKREF(mess)` instead (step 4; `mess_given_up` reads both). The PLAY-13 "not landed" case in `clean_mess` could call `note_unreached_mess(mess)` in place of its stubborn write.
- `jobs/janitor.ts`: read `details.unreached` on a clean result; when it is true say "I have done what I can in the X. I could not get to the rest." in place of the beyond-the-tool words, and do not take the room as beyond the tool.
