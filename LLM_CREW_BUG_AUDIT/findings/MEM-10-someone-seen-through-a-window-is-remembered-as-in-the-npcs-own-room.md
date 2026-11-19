---
id: MEM-10
title: Someone seen through a window or an open door is remembered as being in the NPC's own room
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/memory.ts:164
fix: In observe record person.place, the room the server says they stand in, and fall back to npc.location only when it is missing
---

## What is wrong

`observe` keeps where the NPC last saw each person. It records the NPC's own room, not the room the person is in:

    for (const person of npc.people_in_view ?? []) {
      brain.people.set(person.name, { place: npc.location, at: now });
    }

The server sends each person's own room (`"place" = get_area_name(person, TRUE)` in `crew_npc_senses.dm`), and `types.ts` says why: "The room this person is standing in. Seeing someone does not put them in the room with you: there are windows." `jobs/wanted.ts` already uses `person.place ?? brain.location`. Memory does not.

The body sees seven tiles through glass, through open doors and across room boundaries (a hallway into the room beside it). So the room it remembers for someone is often wrong.

What it changes: `describeMemoryFor` gives the model "Where you last saw those who were named: - Pun Pun: Central Primary Hallway, 2 minutes ago" when Pun Pun was in the Bar, seen through the Bar's window from the hallway. The model is told "If they ask where something is, give the room", and does. The Captain asking a janitor "have you seen Pun Pun?" is sent to the wrong room. The same list feeds `isSighting` in `addNote` and the name list in `saidTo`, which only use the names and are not affected.

Concrete case: a janitor walks the Central Primary Hallway past the glass front of the Bar; the Head of Personnel is behind the bar counter, five tiles off. `people_in_view` has her with `place: "Bar"`. `brain.people` gets `{ place: "Central Primary Hallway" }`. Asked by the Captain a minute later where the Head of Personnel is, the janitor says the hallway.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:164`, in `observe` (quoted above).

`code/modules/llm_crew/crew_npc_senses.dm:191`, the server sending each person's `"place"`.

## How it was found

Read from the code, with the server's `people_in_view` read to check the field is sent. Not run, not seen in a round log.

## How to fix it

1. In `observe`, use `person.place || npc.location` as the place.
2. Nothing else changes: every reader of `brain.people` takes the place as a room name.

## How to test the fix

- A table of cases for `observe`: a brain in the hallway with a person in view whose `place` is "Bar" remembers them in the Bar; with no `place` given, in the hallway.
- Type check from `tgui/`.
