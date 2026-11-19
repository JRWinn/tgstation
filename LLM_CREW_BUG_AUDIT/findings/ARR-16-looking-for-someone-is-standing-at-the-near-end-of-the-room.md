---
id: ARR-16
title: Looking for someone in a room or a hallway is standing at its near end for 20 or 10 seconds, so in any big room they are not found and the sighting is spent
kind: gap
severity: medium
effort: medium
confidence: sure
status: duplicate
duplicate_of: KNA-23
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:878, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:900, code/modules/llm_crew/crew_npc_tools.dm:370
fix: Walk the room or hallway end to end, in a few go_to steps to spots spread through it, before a sighting is counted as looked at or a hallway as walked
---

## What is wrong

See also: DESK-08 (the same thing for a janitor sent to a mess in a big room) and KNA-07 (which rooms the hallway round takes in). This file is about how security looks once it is in a room.

Going after a sighting, security walks to the room, then stands there "looking" for `LOOK_DS` (20 seconds) and sets `warrant.lookedAt`. That sighting is then spent: it is not walked to again unless a newer one comes. On the hallway round it stands in each main hallway for `HALLWAY_DS` (10 seconds) and goes on to the next.

Where it stands is wherever `go_to` put it: the spot it first stood in that room, or, for a room it has never been in, `safe_spot_in`, which picks the sampled spot **nearest to where the body already is**. That is the near end of the room. The body sees `CREW_NPC_VISION_RANGE`, 7 tiles, less round walls and crates. A main hallway on MetaStation runs many times that. The Central Primary Hallway goes most of the way round the Bridge. So "looking" sees the first stretch of the room and none of the rest.

What it costs:

- A sighting passed on by a head or by the Head of Security ("Pun Pun is in the Central Primary Hallway") is looked at from one end and spent. The officer then starts the hallway round, from the first by name, which may take it further away.
- The hallway round walks five hallways and sees a small part of each. Then it waits 90 seconds (`BETWEEN_WALKS_DS`) and does the same, from the same near ends, because `visited_places` keeps the first spot it stood in.
- The Head of Security hears nothing of it: nothing says "I looked and did not find them".

One concrete case: Pun Pun is at the starboard bend of the Central Primary Hallway. A head sends "Pun Pun is in the Central Primary Hallway". The officer, in the Security Office, walks there and stops at the first spot of the hallway it reaches. The monkey is 20 tiles further round. 20 seconds later `lookedAt` is set and the officer sets off for the Aft Primary Hallway.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:878`, in `serveStep`, looking about after a sighting:

    if (brain.now - brain.inPlaceSince < LOOK_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${sighting.place}, where ${name} was last seen, and are looking for them.`,
      };
    }
    warrant.lookedAt = brain.now;

`jobs/arrests.ts:900`, the hallway round:

    if (brain.now - brain.inPlaceSince < HALLWAY_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${hall}, looking for ${name}.`,
      };
    }
    round.next += 1;

`code/modules/llm_crew/crew_npc_tools.dm:370`, where a room it has not been in is walked to:

    for(var/sample in 1 to min(length(place_turfs), 40))
    	var/turf/candidate = pick(place_turfs)
    	...
    	var/distance = get_dist(here, candidate)
    	if(distance < best_distance)

`crew_npc_places.dm:32`, `place_spot`: a room it has been in is walked to at the spot it knows it by, always the same one.

## How it was found

Read from the code. Not seen in a round, and no round log was read for it.

## How to fix it

1. Give the server a way to walk through a room rather than to it. The simplest that keeps to what a player does: a `go_to` with a `spot` argument (`near`, `middle`, `far`), where `far` is the safe spot furthest from where the body stands, and `middle` already exists (`middle_of`). Or a `search_room` walk that visits three or four spots spread through the room. Either way the body walks; nothing is seen that it does not walk within sight of.
2. In `serveStep`, count a sighting as looked at only once the body has stood at the far spot, or the last of the spots, as well as the near one: keep the step count on the warrant (`warrant.lookSteps`), and number each walk (`attempt`) so the driver does not hold it back.
3. Do the same for each hallway on the round.
4. Rooms smaller than the body can see from one spot need none of this: the server can say how big a room is, and the window can skip the extra steps.
5. Do it once for security and the janitor (DESK-08) with the same tool.

## How to test the fix

- A simulator scenario with a long hallway and the wanted person at its far end: the officer should walk the length of it and find them.
- `tools/llm_crew/security.ts`: `serveStep` in a sighting room with `lookSteps` short of the last spot should give a `go_to` with the next spot, not set `lookedAt`.
- In the next round, grep `game.log` for the officer's walks after a sighting and check it reaches more than one spot in the room.
