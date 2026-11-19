---
id: SECT-26
title: Staff go on sending security sightings of someone already jailed or pardoned for up to ten minutes, and security drops them without a word
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:252, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:106, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599
fix: Have whoever keeps the list answer a sighting of someone no longer wanted with a fixed line that staff read to strike the name from their own list
---

## What is wrong

A head's list is replaced each time security sends a notice. Its staff's lists are not: they hold what their head read out at the last staff meeting (every ten minutes, `MEETING_EVERY_DS`), or sent them by PDA after it. When someone on the list is jailed or pardoned, the staff do not hear of it until the next meeting.

Until then, every NPC who sees that person sends the Head of Security "Security: Pun Pun is in the Bar.", once per person and room every two minutes. The Head of Security's `deskTakes` finds no warrant on Pun Pun, and the sender is not a head, so the message is dropped; nobody tells the sender. Their voice is still told "Security is looking for Pun Pun" (`wantedCues`), and may say so to Pun Pun or anyone else.

Concrete case. The janitor heard "Security is looking for Pun Pun" at the 10:00 meeting. Pun Pun is jailed at 12:00 for five minutes and let out at 17:00. From 17:00 until the Head of Personnel's next meeting at 20:00, the janitor sends a sighting of Pun Pun every two minutes from each room it sees him in, and every other member of staff does the same.

A pardon is the same, and worse for the person pardoned: they are free, and the crew go on reporting where they are.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:252`, `syncWanted`, sends a sighting of anyone on its own list:

    for (const person of brain.peopleInView) {
      const entry = known.entries.find((it) => sameName(it.name, person.name));
      // Not itself, and not someone security already has in cuffs.
      if (!entry || person.name === brain.name || person.cuffed) {
        continue;
      }

`wanted.ts:106`, `takeList`, is the only thing that changes the list; it is called from a notice (heads only) and from a meeting line.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599`: a sighting is taken only for a standing warrant; otherwise, from anyone not a head, `deskTakes` returns false and the Head of Security's `readsMessage` drops it (`deskUnread` returns false for a non-head).

## How it was found

Read from the code. Not run and not seen in a round.

## How to fix it

1. In `deskTakes`, when a sighting in the fixed words (`Security: X is in the Y.`) names someone with no warrant, answer by PDA in a fixed line: "Dana, Pun Pun is no longer wanted." Once per sender and name in ten minutes, so it does not answer every sighting.
2. In `readWanted`, read that line from security (`isSecurity(job)`) and take the name off the reader's own list (`known.entries`), returning true.
3. Optionally, have a head pass the same line on to its staff by PDA when a notice takes a name off its list, so they are not left waiting for the next meeting. That is a PDA to each member of staff each time; ask the owner.

## How to test the fix

Add to `tools/llm_crew/security.ts`: a janitor that has Pun Pun on its list and sends a sighting; the Head of Security, with no warrant on Pun Pun, answers "Tolly, Pun Pun is no longer wanted."; the janitor's `readWanted` of that line empties its list, and its next `syncWanted` with Pun Pun in view sends nothing.
