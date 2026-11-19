---
id: KNA-22
title: Anyone a technician sees inside a cargo room is described to its voice as let in by someone who works here, though nobody let them in
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1729, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1190
fix: Say let in only of those on record as let in, and give those merely seen inside a cue that says nobody here is known to have let them in
---

## What is wrong

Listed in the change log entry of 2026-11-18, 16:50 to 17:35, "Seen in the 17:06 round and left alone": "Four people who arrived in the Delivery Office by disposal chute were told to the technicians as 'let in by someone who works here'." Still so.

The technician's voice is given one line about everyone inside the department's locked rooms who does not work there. It joins two lists: people on record as let in (`stillInside`), and anyone in view whom `seenInside` places in a cargo room. Then it says of all of them that "someone who works here let them in". The second list is everyone seen inside, however they came: down the disposal chute into the Delivery Office, through a door someone else held, by a broken window, or by forcing a door. The model is told a falsehood and talks from it: asked "who let that monkey in?", it says a workmate did.

It also sits badly beside the guard's own work. A stranger in the technician's post with no record of being let in is questioned by `jobs/guarding.ts` ("why are you in here?"), while the same prompt tells the voice that a workmate let them in and that "nobody is keeping them in".

The case: four people come down the mail chute into the Delivery Office (`/area/station/cargo/sorting`, one of cargo's locked rooms on MetaStation). A technician standing there sees them. `person.place` is "Delivery Office", which is in `brain.closedRooms`, they do not belong and are not cargo, so `seenInside` returns the room. None of them is in `stillInside`. The cue reads "A, B, C and D are inside your department's locked rooms because someone who works here let them in."

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1729`, in the voice cues:

    const visitors = post
      ? [
          ...new Set([
            ...brain.peopleInView
              .filter((person) => !!seenInside(brain, person))
              .map((person) => person.name),
            ...ownRooms(brain).flatMap((room) =>
              stillInside(post, room, brain.now).map((entry) => entry.name),
            ),
          ]),
        ]
      : [];
    if (visitors.length > 0) {
      lines.push(
        `${listed(visitors)} ${visitors.length === 1 ? 'is' : 'are'} inside your department's locked rooms because someone who works here let them in. ...`,

`cargo.ts:1190`, `seenInside`, which knows only where they stand:

    if (person.belongs || isCargo(person.job)) {
      return undefined;
    }
    if (person.in_post && brain.post) {
      return brain.post;
    }
    return person.place !== undefined &&
      brain.closedRooms.includes(person.place)
      ? person.place
      : undefined;

## How it was found

Read from the code. The round is the change log's (`data/logs/2026/11/18/round-17.06.14`); I did not go back to that round's log for the four lines.

## How to fix it

1. Split the two lists. Those in `stillInside` keep today's line ("let in by someone who works here ...").
2. Those seen inside and not in `stillInside` get their own line in fixed words: "X is inside your department's locked rooms, and you do not know that anyone here let them in." Leave out "nobody is keeping them in" for them: whether they are put out is the guard's work (`jobs/guarding.ts`), and the voice should not promise either way.
3. Keep the line short: this cue is in every prompt while anyone is inside, and the prompt is a fixed budget.

## How to test the fix

A case in the voice cue tests, or a throwaway script that builds a cargo brain with one person in `peopleInView` in "Delivery Office" and nothing in `expected.ts`, and checks the cue lines. Next round, read a technician's prompt in `crew_brain.log` while a stranger is in the bay and check which line it carries.
