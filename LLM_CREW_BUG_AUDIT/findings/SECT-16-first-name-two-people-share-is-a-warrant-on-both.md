---
id: SECT-16
title: A warrant by a first name two crew share is taken without asking which, and then names both of them
kind: bug
severity: medium
effort: small
confidence: sure
status: duplicate
duplicate_of: TRUST-06
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:358, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:72, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:540
fix: When the name read is a first name that two or more known people have, take no warrant and ask which, naming both in full
---

## What is wrong

`readWarrant` turns a first name into a full name when exactly one known person has it. With two, it falls back to the misspelling reader, which gives up on a tie, and the warrant is kept under the first name alone. The desk then takes it as a warrant on "Dana", and says so: nothing tells the Captain there are two Danas.

From then on every match to a person goes through `sameName("Dana", seen)`, which is true for both Dana Reyes and Dana Smith. Whichever the officer sees first is arrested, cuffed and put in a cell, and that is reported as the warrant served. Staff send sightings of both. Every head reads "Security is looking for Dana" at its meetings.

Concrete case, run in a script: the Head of Security knows Dana Reyes (Janitor) and Dana Smith (Cook) from its PDA. The Captain sends "Arrest Dana for theft." The warrant list is `["Dana"]`, and the Captain is told "Captain, I have that: a warrant for Dana, for theft. 5 minutes." `sameName('Dana', 'Dana Smith')` and `sameName('Dana', 'Dana Reyes')` are both true.

Random names in SS13 come from lists of a few hundred first names, so two crew with one first name happen in a full round.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:358`, in `readWarrant`:

    // A first name alone is whoever it knows of by that first name, if there is only one.
    const owners = known.filter(
      (it) => firstName(it).toLowerCase() === (name ?? '').toLowerCase(),
    );
    if (owners.length === 1) {
      name = owners[0];
    } else {

`security.ts:154`, in `closeName`, a tie gives nothing:

    if (near.length === 0 || (near.length > 1 && near[0].apart === near[1].apart)) {
      return undefined;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:540`, the warrant is taken as read:

    const minutes = declared.minutes ?? MINUTES_USUAL;
    const unknown = !knownNames(brain).some((it) =>
      sameName(declared.name, it),
    );
    desk.warrants.push({
      name: declared.name,

## How it was found

A bun script in the system temp folder (fixtures from `tools/llm_crew/fixtures`, `jobs/desk`, `jobs/security`) ran the case above and printed `["Dana"] [ "Captain, I have that: a warrant for Dana, for theft. 5 minutes." ] true true`. Not seen in a round.

## How to fix it

1. Have `readWarrant` return the owners it found when there are two or more (for example `{ name, reason, minutes, ambiguous: ['Dana Reyes', 'Dana Smith'] }`).
2. In `deskTakes`, when `ambiguous` is set, take no warrant and answer, in fixed words, "Captain, there are two by that name: Dana Reyes and Dana Smith. Which one?" (a new line in `REFUSALS`). The next "Warrant for Dana Reyes" is then read whole.
3. Do the same in `deskTakes` for a name read in full that `sameName` matches to two known people (a warrant on "Pun Pun" when "Pun Pun" and "Pun Pun II" are both aboard is the same question).
4. Leave a first name with one owner as it is.

## How to test the fix

Add to `tools/llm_crew/security.ts`: with Dana Reyes and Dana Smith on the PDA list, "Arrest Dana for theft." leaves no warrant and answers with the new line; "Arrest Dana Smith for theft." is a warrant on Dana Smith; with only Dana Reyes known, "Arrest Dana for theft." is still a warrant on Dana Reyes.
