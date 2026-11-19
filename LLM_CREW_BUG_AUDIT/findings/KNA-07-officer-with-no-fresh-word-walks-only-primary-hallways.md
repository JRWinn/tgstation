---
id: KNA-07
title: With no fresh word of a suspect the officer walks only rooms named Primary Hallway, and never looks beside where they were last seen
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:301, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:887
fix: Look first in the rooms that open onto the room of the last sighting, then walk every hallway the station has, by kind of room and not by name
---

## What is wrong

Two entries list this and leave it to the owner:

- 2026-11-18, 14:15, Known and not fixed: "The officer walks only rooms with 'Primary Hallway' in the name."
- 2026-11-18, 20:19 to 20:40, Known and not fixed: "The officer walked the five main hallways for eight minutes after it was shut out (20:07:58 to 20:15:57) and never looked into the Bar Lounge, from where the bar is in plain sight across the counter. Where it looks when it has no fresh word is the owner's to decide."

Two things are wrong with the way it is built, apart from the choice the owner has to make.

1. **It is tied to one map's room names.** `hallways` keeps the places whose name matches `/primary hallway/i`. On MetaStation that is five rooms. A station whose hallways are called something else ("Central Hallway", "Aft Corridor") gives an empty list, and the officer then never moves: the plan falls through to "You have no fresh word of where they are, and have walked the hallways lately." This breaks the rule that nothing assumes one map.
2. **Shut out of the room where the suspect is, it walks away from them.** After `letInStep` gives up (`warrant.shutOut.gaveUp`), the next thing tried is the hallway round, which starts from the first hallway by name, wherever the officer is standing. The room next door, from which a person at a counter or behind a window is in plain sight, is never tried.

The case: the Captain says "Pun Pun is in the Bar". The Bar is locked to security. The officer asks to be let in, waits, reports "nobody has opened the Bar for security". It then walks Aft, Central, Fore, Port and Starboard Primary Hallway in that order and waits a minute and a half between rounds. Pun Pun sits in the Bar, visible from the Bar Lounge, the whole time. In the round the arrest came eleven minutes after the warrant.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:301`:

    function hallways(brain: NpcBrain): string[] {
      return allPlaces(brain)
        .filter((place) => /primary hallway/i.test(place))
        .sort();
    }

`jobs/arrests.ts:887`, in `serveStep`:

    // No sighting to follow. It walks the main hallways, one after the other, and looks.
    const halls = hallways(brain);
    const round = beat.round;
    const walking = round.next > 0 || brain.now - round.at > BETWEEN_WALKS_DS;
    if (halls.length > 0 && walking && round.next < halls.length) {

The server already knows which rooms are hallways by kind, not by name: `place_kind()` in `code/modules/llm_crew/crew_npc_senses.dm:221` tests `istype(here, /area/station/hallway)`. And it already knows which rooms open onto a room: `crew_npc_doors_of(room, z)` in `crew_npc_doors.dm:241` gives, for each door, the tile outside it.

## How it was found

Read from the code. The eight minutes are the change log's reading of `data/logs/2026/11/19/round-20.00.21`.

## How to fix it

1. **Hallways by kind.** Have the server send the names of the station's hallways once, with the other places a security body learns (`learn_security_places` in `crew_npc_security.dm:115`, or with `closed_rooms` in the state): every `/area/station/hallway` area with floor on the body's level. `hallways(brain)` reads that list and drops the name test. Keep the name test as the fallback when the list is empty.
2. **Start the round from where it stands.** Order the walk by nearest first from `brain.location` (the server can send the list already sorted by distance from the brig, or the window can start at the hallway it is in). Today's alphabetical order sends it across the station and back.
3. **Rooms beside the last sighting.** When the sighting's room is one it could not get into (`warrant.shutOut` set, or in `brain.blockedPlaces`), walk to each room that opens onto it and that is not locked to the officer, and look for `LOOK_DS`, before the hallway round. The server gives the list in the answer to the failed `go_to_door` (it has just walked `crew_npc_doors_of` for that room): add `beside` to the details, the names of `get_area_name(sides[2])` for each door, less the ones `locked_out_of`. Rooms that share only a window or a counter with it (the Bar Lounge and the Bar) have no door between them, so also add the areas of open floor within a few tiles of the room's edge. That last part is the piece that would have found Pun Pun, and it is a guess at what "next to" should mean.
4. **The owner's question,** as the change log leaves it: where does an officer look when it has no fresh word? The proposal is: beside the last sighting first, then the hallways nearest first, then nothing new until word comes. Other answers the owner might want: the suspect's own workplace; the rooms the suspect was seen in earlier in the round; asking the heads for sightings again.

Keeps the rules: the station's layout is something any crew member knows; nothing is learned about where the suspect is except by looking.

## How to test the fix

- `tools/llm_crew/security.ts`: add cases for `hallways` with a place list that has no "Primary Hallway" in it but has the server's hallway list.
- `tools/llm_crew/sim.ts`: the simulator's station needs a room that is locked to security with a second room beside it. Add one to the `warrant` scenario's map, put the suspect in the locked room, and pass when the officer goes to the room beside it before any hallway.
- Server compile for the new field.
- Next round: after "nobody has opened the X for security" in `pda.log`, the officer's next `go_to` in `crew_brain.log` should be a room beside X.
