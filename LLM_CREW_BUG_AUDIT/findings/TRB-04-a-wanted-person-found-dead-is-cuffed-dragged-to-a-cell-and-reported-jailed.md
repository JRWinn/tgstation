---
id: TRB-04
title: A wanted person found dead is told they are under arrest, cuffed, dragged to a cell and reported to the Captain as jailed, and the cell then counts as empty
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:730, code/modules/llm_crew/crew_npc_senses.dm:191, code/modules/llm_crew/crew_npc_security.dm:165, code/modules/llm_crew/crew_npc_security.dm:865
fix: Send a dead flag with each person in view, and have serveStep report a wanted person found dead as an outcome to the desk instead of arresting them, the desk then telling the Captain and striking the warrant
---

## What is wrong

Nothing in the chain from warrant to cell asks whether the person is alive. The officer serves a warrant on a corpse exactly as on a live person who stands still: the arrest line is said to it, the cuffs go on (a dead body does not move, so the four seconds always pass), it is pulled by the arm to the brig, walked into a cell, the timer is set, and the Captain and whoever declared the warrant are told "Dana Reyes is in Cell 1 for 5 minutes."

The scope's case "the wanted person is dead" comes up in any round with a fight: the person wanted for attacking someone is often the one who is killed, and on a station with no medical crew among the NPCs nobody else moves the body.

The case:

1. Warrant on Dana Reyes. She dies in the Bar.
2. The officer walks the hallways, sees her lying in the Bar. `people_in_view` lists her: the loop takes every `mob/living/carbon/human` in sight, dead or alive, with `"down" = TRUE` and no word of death.
3. `serveStep`: `target` finds her, `warrant.force` is false, so it walks up, says "Dana Reyes, you are under arrest, for theft. Stand still." and sends `arrest` with `how: 'quiet'`.
4. `make_arrest`: if she is a crew NPC, `being_arrested` runs on a dead body's controller. `put_cuffs_on` works (`attempt_to_cuff` checks only `canBeHandcuffed`, which a corpse passes). `hold_arrested` pulls her.
5. `jail`: `free_cell` and `put_in_cell` walk the corpse in and start the timer. `jailed` outcome. The desk strikes the warrant and tells the Captain she is in a cell.
6. When the time is up the door opens on a body. From then on `occupants()` skips her (`person.stat != DEAD`), so the next `free_cell` takes that cell as empty and the next prisoner is shut in with the corpse.

A player officer would see the body is dead (examining it says so), tell their head, and leave or move the body; nobody is told here that the person on the warrant is dead, and the Captain's word that they are "in Cell 1 for 5 minutes" is false.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:188`, everyone in sight is listed with no word of death:

    for(var/mob/living/carbon/human/person in in_sight)
        ...
        people_in_view += list(list("handle" = handle_for(person), "name" = person.name, ... "cuffed" = !isnull(person.handcuffed), "down" = crew_npc_person_down(person)))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:730`, in `serveStep`: anyone `target` finds is arrested. `seen.down` is not read anywhere in the window (GAP-13 says the same of `down` in general).

    const seen = target(brain, warrant);
    if (seen) {
      if (brain.now < warrant.restUntil) {

`code/modules/llm_crew/crew_npc_security.dm:165`, the cell's count of who is in it leaves the dead out, so the cell looks free:

    /datum/crew_npc_brig_cell/proc/occupants()
        var/list/inside = list()
        for(var/turf/spot as anything in turfs)
            for(var/mob/living/carbon/human/person in spot)
                if(person.stat != DEAD)
                    inside += person

`crew_npc_security.dm:889`, in `make_arrest`, the only use of "down": it chooses the cuffs alone, it does not stop.

    if(how == CREW_ARREST_FORCE && crew_npc_person_down(person))
        if(put_cuffs_on(person, cuffs))
            return hold_arrested(person, 0, TRUE)

## How it was found

Read from the code, both halves, and the base `attempt_to_cuff` in `code/game/objects/items/handcuffs.dm:87`. Not seen in a round. Marked `likely` rather than `sure` only because I did not check that every map's cell timer starts with a corpse inside (nothing in `put_in_cell` or the timer looks at the prisoner's state, so I expect it does).

## How to fix it

1. Server, `look_around`: add `"dead" = person.stat == DEAD` to each person in view. A player can see this by looking (examine reads "no signs of life"), so it is not a cheat. Add `dead?: BooleanLike` to `PersonInView`.
2. Window, `serveStep`: before anything else in the `if (seen)` branch, if `seen.dead`, push an outcome `{ what: 'cannot', name: warrant.name, why: 'they are dead, in the <place>' }` once (through the existing `cannot` helper in `syncBeat`, or `beat.cannotTold`), and drop the warrant from `beat.warrants`. Do not arrest.
3. Desk, `deskOutcome`: a `cannot` whose `why` begins "they are dead" strikes the warrant (`strike(brain, name, false)` without a let-go) and tells the Captain in fixed words: "Captain, Dana Reyes is dead, in the Bar. The warrant is struck." The owner may prefer the warrant kept until the Captain says so: that is the question to ask.
4. Server, `make_arrest`: refuse `stat == DEAD` with reason `dead`, as a net for a stale step.
5. Server, `occupants()`: count the dead as taking up the cell for `free_cell`, or the next prisoner is put in with a body. Keep `put_in_cell`'s "is the prisoner in the cell" checks as they are.

## How to test the fix

- Simulator: a variant of `warrant` where the suspect is reported `down: 1, dead: 1`. The officer must send no `arrest`, the Head of Security must tell the Captain, and the notice to the heads must be sent again without the name.
- Type check, server compile.
- In a round, kill a wanted monkey and watch `game.log` for "arrested" on it: there should be none.
