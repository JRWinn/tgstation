---
id: SIM-03
title: In the simulator every crew voice is one tile away and nobody is ever turned away, so who a line was said to is never tested end to end
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:564, tools/llm_crew/sim.ts:453, tools/llm_crew/sim.ts:286, code/modules/llm_crew/crew_npc_senses.dm:419, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:120
fix: Give each body a spot in its room, send the real distance between two bodies and a facing flag with every speech_heard, as the server does
---

## What is wrong

Who a line with no name in it was said to is worked out in `saidTo` (`addressing.ts`) from two things the server sends with every `speech_heard`: `distance` (tiles) and `facing` (whether the speaker is turned towards the hearer). The rules: one tile away and not turned away means "me"; turned towards it within three tiles and nearest of the NPCs means "me"; otherwise "nobody", unless the two were just talking.

The simulator sends:

- `distance: 1` for every line a crew body says, to every body that is `near` it: in the same room, across the open cargo counter (bay and lobby), or from a doorway.
- `distance: 2` for every line a player says.
- no `facing` at all, ever.

With `facing` missing, `turnedAway` is false, so every NPC line with no name in it is "said to me" for every other NPC in earshot, however many there are and however far apart the real room would put them. A player's unnamed line is "said to me" only when the NPC has nobody else in view.

So in every scenario, a line like "I will see to it.", "Yes.", "The meeting is over." or "On my way." reaches every bystander as addressed to it. In the game the same line reaches only the one beside the speaker or the one it is turned to. Any job code that only acts on `said_to === 'me'` (the Quartermaster's `hears` at `quartermaster.ts:1602`, the head's `head.ts:1195`, the officer's `officer.ts:474`, the Chief Engineer's `chiefengineer.ts:686`, `desk.ts:719`, `aside.ts:32`) is tested only in the case where it always hears. The rules for facing and distance are checked by the table in `tools/llm_crew/addressing.ts` alone, never together with the jobs that depend on them.

It cuts the other way as well: three janitors and a head in the Bar all take each other's unnamed lines as said to them, which is the flood the addressing rules were written to stop ("a room of them unbearable", `addressing.ts:4`). The simulator cannot show whether it is stopped, because its rooms have no size.

The stand-in also contradicts itself: the same body is `distance: 4` in `people_in_view` (unless the two are "next to" each other) and `distance: 1` in the line it says.

Concrete case: `sim.ts quiet qm`. When a technician answers the Quartermaster's order with "Order 1, right away." and the Head of Personnel and two janitors are in the bay for the head's errand, all four hear it as said to them. In the game, with the technician turned to the Quartermaster three tiles off, the head and the janitors hear "nobody", and only the Quartermaster, if it is the nearest NPC, hears "me".

## Where

`tools/llm_crew/sim.ts:564`, in the `say` case:

    for (const other of bodies) if (other !== body && near(other, body)) emit(other, 'speech_heard', `${body.name} says: "${args.text}"`, { handle: handleFor(other, body.name), speaker: body.name, source: 'person', distance: 1, message: args.text });

The same at `sim.ts:453` (`bodySays`) and, with `distance: 2`, at `sim.ts:286` (`playerSays`).

`code/modules/llm_crew/crew_npc_senses.dm:419`, the real details:

    "distance" = get_dist(body, speaker),
    ...
    details["facing"] = !!(get_dir(talker, body) & talker.dir)
    ...
    details["near_door"] = format_text(near_door.name)

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:120`:

    // The server says whether the speaker is turned this way. An older one says nothing of it.
    const facing = event.details.facing as boolean | number | undefined;
    const turnedAway = facing !== undefined && !facing;
    if (distance <= BESIDE && (!turnedAway || nearest)) {

`near_door` (the door the speaker stands at, which `doors` code reads for "could you let me in?") is also never sent.

## How it was found

Read from the code: the three emit sites in `sim.ts`, `on_pre_hear` in `crew_npc_senses.dm`, and `saidTo` and `nearestToSpeaker` in the window code. Not run.

## How to fix it

1. Give each body and player a tile in its room: `{ x, y }`, set on arrival (the middle of the room for a `go_to ... middle`, a spot by the door for `go_to_door`, next to the person for `walk_to`, anywhere for the rest, from a seeded random source so a run can be replayed). Rooms need a size, say 8 by 8 for the Bar and the bay, 4 by 4 for offices.
2. Each body faces the way it last moved, or the person it last walked up to or spoke to by name.
3. In all three emit sites, send `distance` as the tile distance (counting the counter as 2 tiles for bay-to-lobby) and `facing` as the server works it out.
4. Send `distance` in `people_in_view` from the same tiles, so the two agree.
5. Keep a switch (`FLAT=1`) that puts the old flat values back, so a scenario that starts failing can be told apart: a real fault in a job's use of `said_to`, or only a scenario that relied on everyone hearing everything.

The fix is in the test tool only. It keeps the project's rules: it makes the stand-in sense only what a body in the game would.

## How to test the fix

Run the scenarios with the most people in one room (`quiet crew`, `quiet qm`, `chatty crew`, `quiet warrant`) with and without `FLAT=1`. Any check that passes flat and fails with real distances is a place where a job counts on hearing an unnamed line it would not hear in the game. Write each such place up against the job, not the simulator.
