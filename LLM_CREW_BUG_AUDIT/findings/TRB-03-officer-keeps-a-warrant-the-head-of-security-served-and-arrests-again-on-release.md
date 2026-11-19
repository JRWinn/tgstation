---
id: TRB-03
title: When the officer is out hurt both it and the Head of Security hold each warrant, and whichever did not make the arrest arrests the prisoner again when the cell opens
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:802, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:765, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:954, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:755
fix: When a warrant is served, have the desk tell every other holder to drop it (a let-go line with the reason served, or a new served line), and on hurt have the officer hand its warrants back
---

## What is wrong

A warrant that is being served should be in one pair of hands. When the officer breaks off hurt, the Head of Security takes every warrant into its own hands, but the officer is never told to give them up, and it does not give them up of itself. From then on two crew hold one warrant, each in its own `beat.warrants`. When one of them puts the person in a cell, only the desk's list is struck: the other copy stays, and is served again on the first sight of the person after the cell opens.

A hurt officer still makes arrests "for someone who stands for the cuffs" (arrests.ts header; `serveStep` only refuses force when hurt), and every crew NPC stands for the cuffs (`being_arrested`). So a crew member put in a cell by the Head of Security is cuffed again by the officer the next time it sees them free, and walked back to the brig for a second term on a warrant that was served.

The case:

1. The Captain declares "Warrant for Dana Reyes, for theft." The Head of Security gives it to the officer, Hale. Hale's `beat.warrants` has Dana.
2. Hale is beaten under half health by Pun Pun while on another warrant. It sends "Joan, I could not take Pun Pun. I am hurt." The Head of Security's `deskOutcome` sets `officerOut = 'hurt'` and sets every warrant back to `given = 'no'`. `syncDesk` then has nobody to serve and calls `giveWarrant` on itself for each warrant. Hale is told nothing: there is no line for "hand them back". Hale's own `beat.warrants` still has Dana, `tries`, `force` and all.
3. The Head of Security finds Dana, who stands for the cuffs, and puts her in Cell 2 for 5 minutes. Its own outcome is `jailed`: `deskOutcome` strikes Dana off `desk.warrants`, tells the Captain, and stops. No word goes to Hale.
4. Five minutes later the cell opens and Dana goes back to work. Hale meets her in a hallway. `target()` finds her (she is in no running cell and in none of Hale's `jailed`). `serveStep`: `warrant.force` is false on Hale's copy, so it is the quiet arrest, which a hurt officer may still make. "Dana Reyes, you are under arrest, for theft. Stand still." She stands still, is cuffed, and is walked to a cell for another five minutes.
5. Hale reports "Joan, Dana Reyes is in Cell 1 for 5 minutes." `deskOutcome` finds no warrant, still writes `desk.held`, counts a second arrest, and tells the Captain "Captain, Dana Reyes is in Cell 1 for 5 minutes". The Captain sees a second arrest on a warrant already served, and nobody can say why.

It works the other way too: if the hurt officer makes the quiet arrest first, the Head of Security's own copy is left in its `beat.warrants`, and while `officerOut` stays set (it is cleared only by the Captain's "try again"), `syncDesk` never calls `handBack`, so the Head of Security arrests her again when the cell opens.

The same double holding comes about with two officers aboard and a Head of Security, since `officerAboard` is "one in sight, or the first on the PDA" and so is not always the same officer; and in the pardon case the let-go word goes to only one of them.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:802`, the officer out hurt: the desk takes the warrants, nothing goes to the officer:

    case 'hurt':
      ...
      } else {
        desk.officerOut = 'hurt';
        for (const it of desk.warrants) {
          it.given = 'no';
        }

`desk.ts:954`, in `syncDesk`, with nobody to send:

    for (const warrant of desk.warrants) {
      if (!officer) {
        // Nobody to send. It serves the warrant itself.
        giveWarrant(brain, warrant);
        warrant.given = 'taken';

`desk.ts:765`, a warrant served: only the desk's own list is struck.

    case 'jailed': {
      ...
      if (warrant) {
        desk.warrants = desk.warrants.filter((it) => it !== warrant);
        desk.serial += 1;
      }
      tellCaptain(...)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281`, `target`, which counts as free anyone not in a cell it put them in or can see running:

    const shut = inCells(brain);
    return brain.peopleInView.find(
      (person) =>
        sameName(warrant.name, person.name) &&
        person.name !== brain.name &&
        !shut.includes(person.name),
    );

`arrests.ts:755`, in `serveStep`: hurt, it refuses only force.

    const force = warrant.force && !beat.hurt;
    if (warrant.force && beat.hurt) {
      return { ready: false, ... };
    }

The officer's side reads only give, seen, let-go and again lines from its head (`takeWord` in `jobs/officer.ts:313`), so there is no word it could be sent today that means "that one is served".

## How it was found

Read from the code, both halves of the desk and the beat. Not run in the simulator: the `hurt` scenario ends before any second arrest is tried. Not seen in a round.

## How to fix it

1. Give the desk one place that knows a warrant is done: in `deskOutcome`, `case 'jailed'`, after striking it from `desk.warrants`, tell the officer to drop it if the officer was ever given it (`warrant.given !== 'no'` before the hurt reset, so keep a `wasGiven` flag on the warrant) and it was not the officer that reported it. Use a fixed line such as "Hale, Dana Reyes is in a cell: the warrant is served." read in `takeWord` with its own pattern, which calls `dropWarrant` (nobody is held, so nothing is freed). The let-go line would also do, but it would make the officer try to free someone.
2. Do the same for the Head of Security's own copy when the outcome came from the officer: call `dropWarrant(brain, outcome.name, false)` on itself, which drops its `beat.warrants` copy.
3. When the officer breaks off hurt, have it hand its warrants back in its own window: on the `hurt` outcome in `syncBeat`, keep the warrant it has by the arm (if any) and drop the rest, the same rule as `handBack`. The desk gives them again after "try again" (see SECT-11 for that half).
4. As a net, in `serveStep` before arresting a crew member on its own copy, skip one who was in a cell in the last few minutes for this warrant if the brain has heard so (needs step 1's line).

## How to test the fix

- Simulator: extend the `hurt` scenario so that the Head of Security serves the remaining warrant on a crew NPC who stands still, then let the cell time run out and walk the prisoner past the officer. The officer must not arrest them again.
- The reverse: the hurt officer makes a quiet arrest while the Head of Security holds a copy. After the cell opens the Head of Security must not arrest them.
- Type check.
- In a round, grep `game.log` for two "arrested" lines on one name with one warrant, and `pda.log` for two "is in Cell" lines to the Captain for one name.
