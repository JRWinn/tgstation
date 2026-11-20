---
id: QM-13
title: Sent to look at a room and report, a crew member names as in there everyone and every mess it can see, through windows and doorways into other rooms
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: senses
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:56, code/modules/llm_crew/crew_npc_senses.dm:161
fix: In whatIsThere count only people whose place is the room looked at, and say nothing of messes unless the server says which room each is in
---

## What is wrong

When the Captain or its head tells a crew member to go and look at a room and report back, `syncOrders` waits five seconds in the room and then writes down what it saw with `whatIsThere`. That takes every person in `brain.peopleInView` and every mess in `brain.thingsInView` and says they are "in there". The server fills both from `oview(CREW_NPC_VISION_RANGE, body)` (`crew_npc_senses.dm:161`), which is everything in sight: through windows, through an open door into the hallway, across a room boundary in an open-plan bay. `PersonInView` has a `place` field for exactly this ("Seeing someone does not put them in the room with you: there are windows."), and `whatIsThere` does not use it.

So the report to the Captain is wrong in the very thing it was sent to find out. Sent to look at the Bridge, a crew member standing in it reports "Pun Pun and Hop Kins are in there" when both are in the hallway beyond the glass; sent to look at an empty Warehouse with a window onto the Cargo Bay, it names the technicians in the bay; a mess on the far side of a window is reported as a mess in the room.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:56`, `whatIsThere`:

    const messes = brain.thingsInView
      .filter((thing) => thing.kind === 'mess')
      .map((thing) => thing.name);
    const people = brain.peopleInView.map((person) => person.name);

`tgui/packages/tgui/interfaces/CrewBrain/types.ts:48`:

    /** The room this person is standing in. Seeing someone does not put them in the room with you: there are windows. */
    place?: string;

## How it was found

Read from the code. Not run, not seen in a round. Confidence is "likely" rather than "sure" only because I did not check how often `place` is sent (`people_in_view` in the server); where it is missing the fix keeps today's behaviour.

## How to fix it

1. In `whatIsThere`, keep only people with `place === undefined || place === brain.location` (the room it is standing in, which is the room looked at).
2. Messes: `ThingInView` carries no room. Either have the server send `place` for things too (in `notable_things`, the area of each), and filter the same way, or say "I could see" instead of "There is a mess there" so the report does not claim more than is known. The first is better; the second is one line.
3. Keep the rest of the report as it is.

## How to test the fix

A case in a new table or in `tools/llm_crew/security.ts` style: a brain in the Bridge with one person `place: 'Bridge'` and one `place: 'Central Primary Hallway'`; `whatIsThere` (export it, or drive `syncOrders`) must name only the first. Type check and lint.
