---
id: MEM-14
title: Rooms the NPC has only been told of are described to the model as rooms it visited and saw nothing in
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/memory.ts:202, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:437, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:271
fix: Keep lastVisit unset for rooms learned without going there, and describe them as known of, not seen, until the body has stood in them
---

## What is wrong

`recordKnownPlaces` adds to `brain.places` every room the server says the NPC knows of without having walked there: the rooms it is told of at spawn (`learn_starting_places` sends a knowledge event with `places`: a technician's lobby, the Quartermaster's office, a head's office and staff post), the room the custodial locator points to, and the room a door is being held into. Each gets `lastVisit: event.at`, the same as a room it stood in.

`describeMemoryFor` then describes such a room as one it has been in:

    - Quartermaster's Office (25 minutes ago): nothing of note

under the heading "What you remember that bears on what was said", or "Where you have been lately, and what you saw there". The model reads that as a visit 25 minutes ago with nothing in the room, and says so ("I was in there earlier, there's nothing much"). The prompt's own rule is that what is in a room it "only know[s] if you have seen it".

`knownPlaces` (the rooms "most recently visited first", used in `driver.ts` for where to go when a door is held to let it out, in `jobs/guarding.ts` for where to go when told to leave, and in `options.ts` for where it can lead someone) counts them as visited too, ranked by when it was told of them.

Concrete case: a cargo technician spawns and is told the way to the Quartermaster's office (a knowledge event at round start). It never goes there. Half an hour in the Captain asks it "Have you been in the Quartermaster's office?". `describeMemoryFor` matches "quartermaster" and "office", and sends "- Quartermaster's Office (30 minutes ago): nothing of note".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:202`, `recordKnownPlaces`:

    let place = brain.places.get(found.place);
    if (!place) {
      place = { lastVisit: event.at, things: new Map(), storage: new Map() };
      brain.places.set(found.place, place);
    }

`memory.ts:437`, in `describeMemoryFor`:

    lines.push(
      `- ${name} (${ago(now - place.lastVisit)}): ${things.length > 0 ? things.join(', ') : 'nothing of note'}`,
    );

`memory.ts:271`, `knownPlaces`, sorted by `lastVisit`.

## How it was found

Read from the code and the server's `learn_starting_places` (`crew_npc_cargo.dm`, `emit_sense(CREW_SENSE_KNOWLEDGE, ..., list("places" = places))`). Not run, not seen in a round log.

## How to fix it

1. Add `visited?: boolean` to the place memory type in `types.ts`. Set it TRUE in `observe` (the body is standing there). Leave it unset in `recordKnownPlaces` and `recordStorage`.
2. In `describeMemoryFor` and `describeMemory`, write a room that was never visited as "- Quartermaster's Office: you know the way, but have not been in", and the things the locator listed as "the locator shows: mop, bucket", not as things seen.
3. In `knownPlaces`, put visited rooms first, by `lastVisit`, and the rest after.
4. In the "Where you have been lately" branch, list only visited rooms.

## How to test the fix

- A table of cases for `describeMemoryFor`: a brain told of a room by a knowledge event and never in it gives the "have not been in" line; after `observe` in that room, the "(just now)" line.
- Type check from `tgui/`.
