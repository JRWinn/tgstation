---
id: HEAD-10
title: When the server finds no meeting room on the Head of Personnel's own deck, the window falls back to the Bar, which the server's own comment says the staff cannot get into
kind: bug
severity: medium
effort: medium
confidence: likely
status: fixed
fixed_in: cdcda46f592
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:613, tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:54, code/modules/llm_crew/crew_npc_cargo.dm:74
fix: Have the server look for a meeting room on every station deck, nearest first, and in the window drop the Bar fallback so a head with no room tells the Captain once and holds no meeting
---

## What is wrong

The server picks the Head of Personnel's meeting room once, when the body is made: the first of the Lounge, the Bar atrium, the Cafeteria and the Bar that has floor on the body's own z-level and is not shut to the crew. If none qualifies, `meeting_place` stays null and the window gets `meetingRoom: null`.

The window then uses the department's `meetsIn`, which is `'Bar'`. The server's comment on that very list says why that is wrong: "The room called the Bar is, on most stations, the bartender's side of the counter, which the staff cannot get into." `knowsPlace` is true for any room on the station's list, so the meeting is called there.

What follows at every meeting: the janitors are called to the Bar, walk there, cannot get through the bartender's door, try `WALK_TRIES` (2) times, set `shutOut`, and send "I could not get into the Bar for the meeting. ..." by PDA. The head, who can open that door, stands behind the counter alone, waits `GATHER_MAX_DS`, and closes the meeting with nobody there. The Captain is sent "0 of 3 there, 3 reported by PDA" every ten minutes.

When does the server find none? It looks only at `here.z`, the deck the head spawned on. On a station of several decks, the head's office and the service rooms may not share one, and then nothing qualifies. A room whose every door needs access and which has no open way in is also skipped (`crew_npc_room_is_closed`).

Which maps hit it (found in the check): the standing test crew is spawned on `SSmapping.levels_by_trait(ZTRAIT_STATION)[1]`, the lowest station deck (`spawn_test_crew`, `crew_npc_spawn.dm:100`), in its office or else in any hallway on that deck. On Tramstation and NebulaStation the Head of Personnel's office, the Bar Lounge, the Bar and (Nebula) the Cafeteria are all on map z2, and z1 has hallways, so the head is spawned in a hallway on z1, `here.z` is 1, nothing qualifies, and every meeting is called in the Bar. On IceBoxStation z1 has no hallway, so the head is put on the owner's tile and the result depends on where the owner stands; the Bar Lounge is on z2 and the Bar and Atrium on z3. MetaStation, DeltaStation, KiloStation and CatwalkStation have a room on the office's deck and are not hit by the test crew. That the whole test crew lands on the lowest deck of a multi-deck map is a wider fault than this one.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:611`:

    const HOP_WAY: MeetingWay = {
      // The server names a room all its staff can walk into. Failing that, the department's own.
      room: (brain) => brain.meetingRoom ?? departmentHeadedBy(brain.job)?.meetsIn,

`tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:54`:

    meetsIn: 'Bar',

`code/modules/llm_crew/crew_npc_cargo.dm:74`, `learn` on the server:

    // Where it calls its staff together. The room called the Bar is, on most stations, the bartender's
    // side of the counter, which the staff cannot get into: the seats in front of it are what is wanted.
    var/turf/here = get_turf(pawn)
    for(var/room_type in list(/area/station/commons/lounge, /area/station/service/bar/atrium, /area/station/service/cafeteria, /area/station/service/bar))
      var/area/station/room = GLOB.areas_by_type[room_type]
      if(isnull(room) || !length(room.get_turfs_by_zlevel(here.z)) || crew_npc_room_is_closed(room, here.z))
        continue

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:183`, why the Bar counts as known:

    export function knowsPlace(brain: NpcBrain, name: string): boolean {
      return stationPlaces.has(name) || brain.places.has(name);
    }

## How it was found

Read from the code, not seen in a round. The check added which decks the rooms are on, from the map files (see "Check"); whether each map's rooms are shut to janitors was not checked.

## How to fix it

1. Server (`crew_npc_cargo.dm`, the Head of Personnel branch of `learn`): look over every station z-level, not only `here.z`, and take the nearest qualifying room by path, preferring the body's own deck. Keep the list of four kinds, in that order. This is the general rule for any head with no room of its own. The proc is `learn_starting_places`; `crew_npc_room_is_closed(room, z)` and `get_turfs_by_zlevel` already take the deck, so loop over `SSmapping.levels_by_trait(ZTRAIT_STATION)` with the body's own deck first. Path length across decks is costly to work out at spawn; "own deck first, then any other in order" is enough.
1a. Separately, and worth its own finding: `spawn_test_crew` (`crew_npc_spawn.dm:100`) looks for each body's room only on the lowest station deck. Looking on every station deck would put the head in its office on Tramstation and NebulaStation, and this finding would then not arise there with the test crew.
2. Window: drop `meetsIn: 'Bar'` from the Service department (or make `HOP_WAY.room` ignore it), so a head with no named room has none.
3. In `syncMeeting`, when a meeting is due and `way.room(brain)` is null or unknown, push one `toTell` to the Captain by PDA ("There is nowhere I can call my staff together; I am not holding staff meetings.") and set `nextMeetingAt` a full gap on, so it is said once a round, not every tick. Today the meeting is simply never called and `meetingOrderedBy` is left set for good, with the Captain told by `whenAsked` that one is being called.
4. The owner may prefer the head to hold its meeting in its own office, or at the staff's post, when no room is found. That is a design choice; the question is which.

## How to test the fix

- On Tramstation or NebulaStation with the standing test crew, the Head of Personnel's first "Staff meeting in the" message in `pda.log` should name the Bar Lounge (after step 1), or there should be none and one line to the Captain (step 2 and 3 alone).
- Simulator: send the head `meeting_room: null`. Pass if no "Staff meeting in the Bar" message is sent and the Captain gets the one line.
- Server compile (`tgstation_check.dme`).
- On each map in rotation, check that the Head of Personnel's first "Staff meeting in the" message in `pda.log` names a room other than the Bar.

## Check

Read the Head of Personnel branch of `learn_starting_places` and `crew_npc_room_is_closed` in `crew_npc_cargo.dm`, `learn_place`, `create_crew_npc` and `spawn_test_crew` in `crew_npc_spawn.dm`, `meeting_room` in `crew_brain_link.dm:143` and `brain.ts:536`, `HOP_WAY` and `syncMeeting` in `jobs/head.ts`, the Service entry in `hierarchy.ts`, `knowsPlace` in `memory.ts`, and the area names in `code/game/area/areas/station/` (`/area/station/service/bar` is named "Bar"). The quotes are what the code says today. With `meeting_place` null the window takes `meetsIn` 'Bar', which `knowsPlace` always accepts, so the meeting is called there. To see whether it comes up, I ran a throwaway Python script (in the scratchpad, not kept) over the seven station `.dmm` files, listing the decks that hold the Head of Personnel's office, the four meeting rooms and the hallways; the results are in "What is wrong". Tramstation and NebulaStation are hit every round with the standing test crew; MetaStation is not. The old round `data/logs/2026/11/18/round-19.33.11` (MetaStation) has "Staff meeting in the Bar now" six times, but that is from before the server picked a room and is not this fault. Whether each map's Bar is shut to janitors (`crew_npc_room_is_closed`, the server's comment) was not checked map by map, so confidence stays likely. Effort set to medium: steps 2 and 3 are a small window change and fix the wrong room alone; step 1 adds a small server change, which makes it both sides. Searched the change log and plans for `meeting_place`, `meetsIn` and the Bar: nothing covers the fallback. Not run in a round.

## Fix so far

Round M2, group g-srv-b (2026-11-20): step 1 not built; larger than its label. Crew bodies cannot walk between decks: `/datum/ai_movement/navmap_astar/crew_npc` (`crew_npc_motor.dm`) leaves `allow_multiz` FALSE (the base game's bots and monkeys set it TRUE), and the crew code assumes one deck throughout (consoles, bins, lockers, cell timers, alarms and route checks all pass over anything with `z != body.z`, e.g. `crew_npc_tools.dm:670`, `crew_npc_grip.dm:411`). So a meeting room learnt on another deck would be one neither the head nor its staff can get to, and a `learn_place` that looks on other decks would hand every caller (offices, posts, the lobby) rooms it cannot walk to. Step 1 waits on multi-deck walking (an owner choice: turn on `allow_multiz` for crew and go through the one-deck tests, or keep crew to one deck). A tried version of step 1 (own deck first, then the other station decks, in `learn_place`, `middle_of` and the Head of Personnel branch) was compiled clean and not committed. Steps 2 and 3 (window) still stand alone and stop the wrong room. Step 1a (`spawn_test_crew`, `crew_npc_spawn.dm`) is in nobody's files this round and has the same question.

Round A1, group a-heads (2026-11-22), on the owner's answer (meet in its own office; no multi-deck walking): `HOP_WAY.room` in `jobs/head.ts` now falls back from the server's meeting room to the department's `meetsIn` (none for Service), then to the head's own office (`brain.office`), then its post. Only a head with none of these tells the Captain it holds no meetings, as before. Step 1 (other decks) and 1a are not built, by the answer. Not checked: whether its staff can get through the office door (the Head of Personnel's Office is command-locked on most maps; nothing in `head.ts` opens it for them).
