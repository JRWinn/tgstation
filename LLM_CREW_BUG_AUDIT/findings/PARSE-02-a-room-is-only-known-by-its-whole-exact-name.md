---
id: PARSE-02
title: A room is found in what was said only by its whole exact name, so medbay, the captains office, the hop office, the dorms and hydro name no room
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:294, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:808, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:197, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:294
fix: Give placeNamedIn a forgiving match - apostrophes optional, a room's distinctive word alone when only one room has it, and a short table of the usual station shorthands (hop, ce, qm, hydro, dorms, medbay)
---

## What is wrong

`placeNamedIn` is how code finds which room a line or a PDA message names. A room counts only if its whole name, as the area is called in the map, is in the text as words. Every character that is not a letter, digit or space is turned into a one-character wildcard, so an apostrophe must still be there as some character:

- "Medbay Central" needs "medbay central". "the medbay", "medbay", "med bay", "medical" name nothing.
- "Captain's Office" needs "captain?s office". "captains office", typed without the apostrophe as most people do, names nothing.
- "Head of Personnel's Office" needs all five words. "the hop office", "hop's office" name nothing.
- "Quartermasters" (the area name of the QM's office in this codebase), "Hydroponics", "Dormitories", "Chief Engineer's Office", "Patients' Rooms", "Primary Tool Storage" are never named by "the qm office", "hydro", "dorms", "the ce office", "the patients rooms", "tool storage".
- "kitchens" does not name the Kitchen.

Where the model is up and asked, the reply's `work.where` is an enum of the known rooms, so the model maps "medbay" to "Medbay Central" for spoken work. But `placeNamedIn` is the only reader, with no model at all, for:

- every PDA mess call to a janitor (`janitor.ts:808`). "blood in medbay" from the Captain makes no task; with the mess words matching and no room found the message falls through to "your supplies have come" (DESK-01);
- where a wanted person was seen (`wanted.ts:197`, `:232`) and the place given with a warrant (`officer.ts:351`);
- where a meeting is called (`meetings.ts:281`, `:294`, `:554`);
- where a crate is to be taken (`pickups.ts:80`), the head's orders (`head.ts:1284`) and the desk (`desk.ts:346`, `:600`, `:612`);
- every spoken order when the model is down, and the superior's order made out by code before the model is asked (`workInWords`, `tasks.ts:254`).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:294`:

    export function placeNamedIn(brain: NpcBrain, heard: string): string | undefined {
      // Longest names first, so "Medbay Central" is not taken for "Medbay".
      return allPlaces(brain)
        .sort((a, b) => b.length - a.length)
        .find((name) =>
          new RegExp(
            `\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`,
          ).test(heard),
        );
    }

Area names it is matched against, from `code/game/area/areas/station/*.dm`: `"\improper Captain's Office"`, `"\improper Head of Personnel's Office"`, `"\improper Chief Engineer's Office"`, `"Quartermasters"`, `"Medbay Central"`, `"\improper Patients' Rooms"`, `"Security Post - Cargo Bay"`.

## How it was found

Run. A throwaway script (`parse/place.ts` in the scratchpad) set the station rooms to the MetaStation names above and called `placeNamedIn` with lower-cased lines:

    "clean up the medbay"            -> (none)
    "theres blood in medbay"         -> (none)
    "mess in the captains office"    -> (none)
    "go to the hop office"           -> (none)
    "mess in the hop's office"       -> (none)
    "cargo has a mess"               -> (none)
    "check tool storage"             -> (none)
    "mess in hydro"                  -> (none)
    "clean the dorms"                -> (none)
    "mess in the CE office"          -> (none)
    "mess in central hallway"        -> (none)
    "clean the qm office"            -> (none)
    "blood in the patients rooms"    -> (none)
    "mess in the kitchens"           -> (none)
    "blood in teh kitchen"           -> Kitchen
    "the bar's floor is dirty"       -> Bar
    "clean the cargo bay pls"        -> Cargo Bay

Not seen in a round log.

## How to fix it

Keep it all in code, and general: no list tied to one map's rooms beyond the job shorthands every /tg/ player uses.

1. In `placeNamedIn`, build the pattern for each room from its words, not its characters: lower case, drop `'`, split on anything not a letter or digit, and join the words with `\W*` and an optional `'?s?` after each, so "captain's office", "captains office" and "captain office" all match "Captain's Office", and "kitchens" matches "Kitchen".
2. A second pass, only if the first finds nothing: a room is named by any one of its words that no other known room has and that is not a common word (drop "the", "of", "room", "office", "storage", "hallway", "primary", "central", "aft", "fore", "port", "starboard", "maintenance"). "medbay" then names "Medbay Central" when that is the only known room with "medbay" in it, and names nothing when there are several (Medbay Central, Medbay Lobby): a call that names nothing is better than one to the wrong room.
3. A small shared table of shorthands, matched as whole words, each turned into the job title before matching: `hop` to "head of personnel", `hos` to "head of security", `ce` to "chief engineer", `cmo` to "chief medical officer", `rd` to "research director", `qm` to "quartermaster", plus `hydro` to "hydroponics", `dorms` to "dormitories", `sec` to "security", `med` to "medbay". Write it once beside `placeNamedIn`.
4. Keep the longest-first sort for the first pass; MEM-04 asks for it to change to first-named. Whoever fixes both should do them together.

## How to test the fix

- Add a table to `tools/llm_crew/` that runs `placeNamedIn` over the lines above with the MetaStation room names, and wants Medbay Central, Captain's Office, Head of Personnel's Office, Hydroponics, Dormitories, Chief Engineer's Office, Quartermasters, Patients' Rooms, Kitchen; and wants nothing for "medbay" when both Medbay Central and Medbay Lobby are known.
- Keep `bun tools/llm_crew/addressing.ts`, `book.ts` and `security.ts` passing: the wanted and warrant readers use the same function.
