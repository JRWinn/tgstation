---
id: TRB-11
title: A pardon for someone in a cell is passed only to the officer, so with the officer down or gone nobody opens the cell, though the Captain is told at once that it is done
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:259, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:182, code/modules/llm_crew/crew_npc_security.dm:1288, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:419
fix: When the desk strikes someone it knows to be in a cell, have whoever keeps the list free them itself if the officer does not say they are free in a minute or two, going to the brig and stopping the cell it was told of
---

## What is wrong

The Head of Security keeps, in `desk.held`, who is in which cell: it is told by its officer ("Joan, Dana Reyes is in Cell 1 for 5 minutes"). When the Captain pardons someone in a cell, `strike` sends the officer "Hale, Dana Reyes is to be let go: the Captain has pardoned them." and calls `dropWarrant` on itself. Its own `dropWarrant` frees only someone it holds, sees in cuffs, or put in a cell itself (`beat.jailed`), so for a prisoner the officer put away it does nothing. And the Captain is answered "Captain, Dana Reyes is pardoned." on the spot.

So the pardon is carried out only if the officer gets the word and acts. If the officer is knocked out, dead, in a cell itself, its PDA lost or off the station, or simply a player, the cell stays shut until its time runs out, and nobody is told the pardon was not done. The desk has already struck the name from `held`, so the Head of Security's own list and its reports to the Captain say nobody is in the cells.

Even told to, the Head of Security could not open the cell from where it is: the server's `tool_free` looks for the cell through the body's own `jailed` list or by sight, so from its office it answers "Nothing is holding Dana Reyes that you know of." (`nothing`), which the window takes as nothing to do.

The case:

1. The officer puts Dana Reyes in Cell 1 for 15 minutes and tells the Head of Security.
2. The officer is beaten down in a hallway two minutes later. Its PDA stays on its body, so it is still "the officer aboard" (`officerAboard`, HOLE-08).
3. The Captain sends "Pardon Dana Reyes." The desk: `pardoned` is Dana (from `desk.held`), `strike` deletes `held`, queues the let-go line to the officer by PDA, and calls `dropWarrant(brain, 'Dana Reyes', true)` on itself: not held, not seen, not in its own `jailed`: nothing. The Captain is sent "Captain, Dana Reyes is pardoned."
4. The officer lies on the floor. Dana sits in Cell 1 for 13 more minutes.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:259`, `strike`:

    if (held) {
      delete desk.held[held];
    }
    ...
    // Whoever may have them lets them go: its officer, if the officer was given the warrant or
    // put them in the cell, and itself.
    if (officerAboard(brain) && (held || (warrant && warrant.given !== 'no'))) {
      tellOfficer(brain, letGoLine(officerAboard(brain) ?? '', who, pardoned), ...);
    }
    dropWarrant(brain, who, pardoned);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:182`, `dropWarrant`, which knows only its own prisoners:

    const holding = brain.security?.holding;
    const inCell = Object.keys(beat.jailed).some((it) => sameName(name, it));
    const cuffed = brain.peopleInView.some(
      (person) => sameName(name, person.name) && person.cuffed,
    );
    if (
      ((holding && sameName(name, holding)) || inCell || (had && cuffed)) && ...

`desk.ts:419`, the Captain told it is done before anyone has done it:

    strike(brain, pardoned, true);
    reply(brain, from, pardonedLine(to, pardoned), aloud, ...);

`code/modules/llm_crew/crew_npc_security.dm:1288`, `tool_free`, which finds a cell only through its own `jailed` or by sight:

    for(var/name in jailed)
        if(jailed[name] == cell && findtext(LOWER_TEXT(name), wanted))
            theirs = TRUE
    if(!theirs)
        for(var/mob/living/carbon/human/person as anything in cell.occupants())
            if(is_named(person, wanted) && (person in in_sight))
                theirs = TRUE

## How it was found

Read from the code, both halves. Not seen in a round.

## How to fix it

1. In `strike`, when `held` is set and the officer is the one to act, keep a `desk.toRelease: { name, cell, pardoned, at }` instead of forgetting the cell.
2. Clear it when the officer's `freed` outcome comes (`deskOutcome`, `case 'freed'`).
3. In `syncDesk`, if a `toRelease` entry is older than a minute or two with no `freed`, or there is no officer fit to send (`serving(brain)` is null, which KNA-09's fix will widen), push it onto its own `beat.toFree` with the cell name, so the Head of Security goes and does it itself.
4. Give the `free` step a place to go: when the body's `tool_free` answers `nothing` and the window knows the cell, walk to the brig first (`brigPlace`) and send `free` again from there, where the cell is in sight. `tool_free` already finds a cell by sight. Or pass the cell's name as a second argument and have `tool_free` walk to that timer, checking by sight when it gets there.
5. Answer the Captain "Captain, Dana Reyes is pardoned. Hale is letting them out." and, if step 3 fires, "Captain, Hale has not let Dana Reyes out. I am going to do it." Both in fixed words.

## How to test the fix

- Simulator: after the `warrant` scenario's jailing, put the officer down (as `hurt` does) and send "Pardon <name>." from the Captain. The Head of Security must walk to the brig and send `free`, and the prisoner must leave the cell.
- `tools/llm_crew/security.ts`: `strike` on a name in `desk.held` must leave a release pending until a `freed` outcome comes.
- Type check.
