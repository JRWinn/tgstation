---
id: HEAD-10
title: When the server finds no meeting room on the Head of Personnel's own deck, the window falls back to the Bar, which the server's own comment says the staff cannot get into
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:613, tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:54, code/modules/llm_crew/crew_npc_cargo.dm:74
fix: Have the server look for a meeting room on every station deck, nearest first, and in the window drop the Bar fallback so a head with no room tells the Captain once and holds no meeting
---

## What is wrong

The server picks the Head of Personnel's meeting room once, when the body is made: the first of the Lounge, the Bar atrium, the Cafeteria and the Bar that has floor on the body's own z-level and is not shut to the crew. If none qualifies, `meeting_place` stays null and the window gets `meetingRoom: null`.

The window then uses the department's `meetsIn`, which is `'Bar'`. The server's comment on that very list says why that is wrong: "The room called the Bar is, on most stations, the bartender's side of the counter, which the staff cannot get into." `knowsPlace` is true for any room on the station's list, so the meeting is called there.

What follows at every meeting: the janitors are called to the Bar, walk there, cannot get through the bartender's door, try `WALK_TRIES` (2) times, set `shutOut`, and send "I could not get into the Bar for the meeting. ..." by PDA. The head, who can open that door, stands behind the counter alone, waits `GATHER_MAX_DS`, and closes the meeting with nobody there. The Captain is sent "0 of 3 there, 3 reported by PDA" every ten minutes.

When does the server find none? It looks only at `here.z`, the deck the head spawned on. On a station of several decks, the head's office and the service rooms may not share one, and then nothing qualifies. A room whose every door needs access and which has no open way in is also skipped (`crew_npc_room_is_closed`). Which maps hit this was not checked.

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

Read from the code, not seen in a round. It was not checked which of the station maps have none of the four rooms on the Head of Personnel's spawn deck, or have all of them shut.

## How to fix it

1. Server (`crew_npc_cargo.dm`, the Head of Personnel branch of `learn`): look over every station z-level, not only `here.z`, and take the nearest qualifying room by path, preferring the body's own deck. Keep the list of four kinds, in that order. This is the general rule for any head with no room of its own.
2. Window: drop `meetsIn: 'Bar'` from the Service department (or make `HOP_WAY.room` ignore it), so a head with no named room has none.
3. In `syncMeeting`, when a meeting is due and `way.room(brain)` is null or unknown, push one `toTell` to the Captain by PDA ("There is nowhere I can call my staff together; I am not holding staff meetings.") and set `nextMeetingAt` a full gap on, so it is said once a round, not every tick. Today the meeting is simply never called and `meetingOrderedBy` is left set for good, with the Captain told by `whenAsked` that one is being called.
4. The owner may prefer the head to hold its meeting in its own office, or at the staff's post, when no room is found. That is a design choice; the question is which.

## How to test the fix

- Simulator: send the head `meeting_room: null`. Pass if no "Staff meeting in the Bar" message is sent and the Captain gets the one line.
- Server compile (`tgstation_check.dme`).
- On each map in rotation, check that the Head of Personnel's first "Staff meeting in the" message in `pda.log` names a room other than the Bar.
