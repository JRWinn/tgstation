---
id: MEM-03
title: News about a person is thrown away as a sighting if it says meet, or is and any room name inside any word
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/memory.ts:80
fix: In isSighting match room names as whole words, drop meeting from the met words, and call a note a sighting only if it has nothing else in it beyond the name, a verb of being or seeing and the room
---

## What is wrong

`addNote` refuses any note that `isSighting` says "only says where someone is, or that the NPC has met them", since where people were is kept elsewhere. The test is much wider than that:

1. A note that names a known person and has any of the words `met`, `meet`, `meeting`, `introduced` anywhere is a sighting. So "Zara wants a staff meeting at two." and "Zara promised to meet me about my pay rise." are thrown away. Meetings are exactly the news a head gives its staff.
2. A note that names a known person, has any of `is|was|are|were|stands|standing|saw|seen|spotted`, and has **any room name aboard as a substring anywhere** (`said.includes(place.toLowerCase())`) is a sighting. Every room aboard counts (`allPlaces` includes the station's whole list), so short names match inside ordinary words: "Bar" in "barely", "barred", "embarrassed", "crowbar"; and a room named in the note for any reason ("Zara is barred from the Kitchen", "Zara says the Chapel fire was arson") makes the note a sighting.

The person is "known" if the NPC has ever seen them (`brain.people`) or they are in view, which is nearly everyone a note would be about.

Run (script below), a janitor that has seen Zara Holt, offered these notes:

| Note | Result |
| --- | --- |
| Zara wants a staff meeting at two. | DROPPED |
| Zara promised to meet me about my pay rise. | DROPPED |
| Zara is barely coping since the fire. | DROPPED ("bar" in "barely") |
| Zara is barred from the Kitchen. | DROPPED |
| Zara said the Captain is embarrassed about the Chapel fire. | DROPPED |
| Zara owes me twenty credits. | kept |
| Zara is angry with the Captain. | kept |

The NPC then has no memory of what it was told, and the decision log shows nothing (a refused note is skipped with `continue` in `think()`).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:80`, `isSighting`:

    const said = note.toLowerCase();
    if (/\b(met|meet|meeting|introduced)\b/.test(said)) {
      return true;
    }
    return (
      /\b(is|was|are|were|stands?|standing|saw|seen|spotted)\b/.test(said) &&
      allPlaces(brain).some((place) => said.includes(place.toLowerCase()))
    );

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/memory.ts`, set `brain.people` to hold "Zara Holt", and called `addNote` with each note above. Not seen in a round log.

## How to fix it

1. Match room names as whole words, the way `placeNamedIn` in `tasks.ts` does (`\b<name>\b`), not with `includes`.
2. Take `meeting` out of the "met" words. Keep `met` and `introduced`, and only when the note is short (say under eight words): "Met Zara Holt in the Bar." is a sighting; "Zara promised to meet me about my pay" is not.
3. A note is a sighting only if, once the person's name, the room name and the small words are taken out, at most one or two telling words are left (`tellingWords` minus the name parts and the room words). "Zara is in the Bar" leaves nothing; "Zara is barred from the Kitchen for fighting" leaves "barred", "fighting".
4. Keep it simple: if in doubt, keep the note. A stray sighting note costs one line of six; a lost piece of news cannot be got back.

## How to test the fix

- A table of cases for `addNote` (beside the one proposed in MEM-02): the seven rows above, all of them kept; add "Zara Holt is in the Bar." and "Saw Zara in the Kitchen." which must still be dropped.
- Type check from `tgui/`.
