---
id: TRB-11
title: A pardon for someone in a cell is passed only to the officer, so with the officer down or gone nobody opens the cell, though the Captain is told at once that it is done
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 473a72153cc
found_by: Opus 5.5
checked_by: Opus 5.5
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
4. Give the `free` step a place to go. Do it before `free` is sent, not after a `nothing` answer: `afterActing` in `arrests.ts` (the `act.tool === 'free'` branch) takes a `nothing` answer as `ok` and drops the `toFree` entry at once. So carry the cell on the `toFree` entry (`{ name, pardoned, tries, cell }`), and in `freeStep` (`arrests.ts`), when the entry has a cell, the name is not in `beat.jailed`, nobody of that name is in view, and `brain.location !== brigPlace(brain)`, return a `go_to` the brig first. From there `tool_free` finds the cell by sight (`cell.occupants()` and `in_sight`). That keeps the fix in the window. The other way, passing the cell's name to `tool_free` and walking to that timer, touches the server too and makes the effort large.
5. Answer the Captain "Captain, Dana Reyes is pardoned. Hale is letting them out." and, if step 3 fires, "Captain, Hale has not let Dana Reyes out. I am going to do it." Both in fixed words.

## How to test the fix

- Simulator: after the `warrant` scenario's jailing, put the officer down (as `hurt` does) and send "Pardon <name>." from the Captain. The Head of Security must walk to the brig and send `free`, and the prisoner must leave the cell.
- `tools/llm_crew/security.ts`: `strike` on a name in `desk.held` must leave a release pending until a `freed` outcome comes.
- Type check.

## Check

Checked by Opus 5.5. Every quote is what the code says today: `strike` (`desk.ts:259`), the pardon branch (`desk.ts:420`), `dropWarrant` (`arrests.ts:182`), the `freed` outcome (`desk.ts:835`), and `tool_free` (`crew_npc_security.dm:1274`).

Traced: `strike` deletes `desk.held[held]` before anything is done, sends `letGoLine` to `officerAboard` (the first officer in view or on the PDA list, with no check that it is fit), and calls its own `dropWarrant`, which pushes onto `beat.toFree` only if the Head of Security has them by the arm, has them in its own `beat.jailed`, or holds the warrant and sees them in cuffs. For a prisoner the officer jailed, none of these hold, so nothing is queued. `freeStep` (`arrests.ts:923`) sends `free` at once from wherever the body is, and `tool_free` only finds a cell through the body's own `jailed` or by sight, so even a queued entry would get `nothing` from the office. Nothing in `syncDesk` or the `freed` outcome follows a pardon up.

One softening: an officer that is only knocked out keeps its `toFree` entry and frees the prisoner when it is up again, if the PDA line reached its brain while it was down (not checked). So for "knocked out" the pardon is late; for an officer that is dead, cuffed, jailed, without its PDA, off the station, or a player who ignores it, it is never done. The brig timer still opens the cell when the time runs out, so the harm is bounded by the sentence. Medium stands. Effort medium holds for the window-only way in step 4.

Searched `LLM_CREW_CHANGELOG.md` for "pardon": the security entry (lines near 596) describes the officer doing it and lists no fallback; nothing later changes `strike`. Not run: read from the code only.

## Fix so far

Built on branch m-secdesk, all in `jobs/desk.ts`, by the window-only way of step 4 with the walk done by the desk rather than by `freeStep`: nothing in `arrests.ts` or the server changed.

- `strike` keeps someone its officer put in a cell (`desk.held`, with who put them there) on a release list (`toRelease`: name, cell, when their time is up, pardon or not, which officer was told). Someone it put in a cell itself is left to its own `dropWarrant`, as before.
- The Captain is answered "Captain, Dana Reyes is pardoned. Hale is letting them out." With the officer out hurt, only "Captain, Dana Reyes is pardoned.", and it goes at once.
- A `freed` from anyone takes them off the list. Their time running out does too.
- `syncRelease` (called from `syncDesk`): after two minutes with no "is free" (`RELEASE_WAIT_DS`), or at once with no officer fit to send, the Captain is told "Captain, Hale has not let Dana Reyes out. I am going to do it." and a `release_prisoner` task walks it to `brigPlace`. There it puts them on its own `beat.toFree`, and its own `let_go` step sends `free` from where the cell is in sight, which `tool_free` finds by `cell.occupants()` and `in_sight`.

Not done: KNA-09's widening of "no officer fit to send" (an officer down or silent); until that is built, an officer that is down but still on the PDA is waited on for the two minutes first.
