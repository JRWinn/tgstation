---
id: KNA-23
title: The officer looks for someone by standing for 20 seconds at the first spot it reaches in the room, so in a room wider than its sight it does not see them
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:878, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:900, code/modules/llm_crew/crew_npc_tools.dm:231, code/modules/llm_crew/crew_npc_places.dm:32
fix: After the first look from the arrival spot, walk to the middle of the room and then to its far end before the room is counted as looked in
---

## What is wrong

Also written up as: ARR-16
See also: DESK-08 (the same thing for a janitor sent to a mess in a big room)

Listed in the change log entry of 2026-11-18, 14:15, Known and not fixed: "A sighting names the room. In a wide room the officer may look for twenty seconds and not see them." No later entry touches it, and the code is as it was.

When an officer has a fresh sighting it walks to the room (`go_to(place)`) and, once there, stands still for 20 seconds (`LOOK_DS`, a `wait` step). Then the sighting is marked looked at, and it falls through to walking the hallways. In a hallway it stands 10 seconds (`HALLWAY_DS`) and goes on to the next one. At no point does it walk through the room it is looking in.

Where it stands is wherever `go_to` sets it down: the spot it first noted in that room if it has been there before (`visited_places`, which is the square it came in by), or else the nearest safe square inside the room to where it came from (`safe_spot_in(room, get_turf(pawn))`). Both are at the edge of the room by the door it came through. It sees 7 tiles (`CREW_NPC_VISION_RANGE`), less round corners and furniture.

The case: the Head of Personnel sends "Security: Pun Pun is in the Bar Lounge." The officer comes in from the Central Primary Hallway and stops just inside. The Bar Lounge on MetaStation runs about 18 tiles east to west. Pun Pun is at the far end by the stage. The officer stands 20 seconds, sees nobody, sets `lookedAt`, and walks off to the Aft Primary Hallway. The sighting is used up: the same sighting is not looked at again (`warrant.lookedAt < sighting.at`). The same goes for every hallway on the round: the Central Primary Hallway on MetaStation is a loop round the bridge, and 10 seconds at one corner of it covers a few percent of it.

More of what it costs, from ARR-16:

- The hallway round sees a small part of each of its five hallways, waits 90 seconds (`BETWEEN_WALKS_DS`), and does the same again from the same near ends, because `visited_places` keeps the first spot it stood in. It never sees more of them in later rounds.
- After a spent sighting the officer starts the hallway round from the first hallway by name, which may take it further away from where the person was.
- The Head of Security hears nothing of it: nothing says "I looked and did not find them".

This joins KNA-07 (which rooms it walks with no fresh word) and ARR-11 (one hallway it cannot reach stops the round). Neither covers how it looks once it is in the room.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:866`, `serveStep`:

    if (brain.location !== sighting.place) {
      return knowsPlace(brain, sighting.place)
        ? {
            ready: true,
            step: `There is a warrant on ${name}${why}. They were last seen in the ${sighting.place}, and you are going there to look.`,
            act: { tool: 'go_to', place: sighting.place },
          }
        : ...
    }
    if (brain.now - brain.inPlaceSince < LOOK_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${sighting.place}, where ${name} was last seen, and are looking for them.`,
      };
    }
    warrant.lookedAt = brain.now;

and for the hallways, `arrests.ts:900`:

    if (brain.now - brain.inPlaceSince < HALLWAY_DS) {
      return {
        ready: false,
        wait: true,
        step: `You are in the ${hall}, looking for ${name}.`,

`code/modules/llm_crew/crew_npc_tools.dm:231`, `tool_go_to`, which picks the one square:

    var/turf/destination = place_spot(known_place)

`code/modules/llm_crew/crew_npc_places.dm:32`, `place_spot`: the noted spot, or `safe_spot_in(room, get_turf(pawn))`, the nearest to the body.

## How it was found

Read from the code. Not seen as such in a round: in `data/logs/2026/11/19/round-19.33.50` the monkey was found in the Bar Lounge, which the officer reached by walking up to it, and in `round-20.00.21` the officer was shut out and walked the hallways (change log 20:19 entry) without seeing it.

## How to fix it

1. Give the look two or three legs. Keep on the warrant a `lookLeg` (0, 1, 2) set to 0 when a new sighting comes in. Leg 0 is what happens now: stand `LOOK_DS` where it arrived. Leg 1: `go_to(place, middle: true)`, which already exists (`tool_go_to` with `middle`, using `middle_of`), then look for a few seconds. Leg 2: a walk to the far side of the room from where it came in. Only after the last leg is `lookedAt` set.
2. The far side needs the server. Add an argument to `tool_go_to`, say `far`, that picks a safe, clear square of the room (as `middle_of` does) at the greatest distance from the body's square. It must be one the body can walk to: test it with `get_path_to` as `tool_go_to_door` does, and fall back to the middle.
3. In a hallway, use the same legs, so a loop hallway is walked rather than glanced into. A shorter wait at each stop (5 seconds) keeps the whole round no longer than it is now.
4. `dropsWalk: true` is already set on the step taken when the person comes into sight, so a leg is broken off the moment they are seen. Check that the `go_to` legs carry `dropsWalk: true` as well, so `orderToDrop` in `driver.ts` breaks them off (the arrest step is what replaces them).
5. From ARR-16: the server tool could instead be one `go_to` with a `spot` argument (`near`, `middle`, `far`), or a `search_room` walk that visits three or four spots spread through the room. Either way the body walks, and nothing is seen that it does not walk within sight of. Keep the leg count on the warrant and number each walk (`attempt`) so the driver does not hold a repeated `go_to` back. Rooms smaller than the body can see from one spot need none of this: the server can say how big a room is, and the window can skip the extra legs. Build it once for security and the janitor (DESK-08) with the same tool.
6. For the owner, if wanted: whether the officer should also look into the rooms that open off the room of the sighting (KNA-07's fix 1) belongs with this.

## How to test the fix

Simulator: the stand-in station is small, so add a scenario (a long hallway as well as a wide room) where the sighting room is wider than 7 tiles and the suspect is at its far end; the officer must arrest within one sighting. Tables: a case in `tools/llm_crew/security.ts` that walks `serveStep` through the legs with nobody in sight and checks the acts are `go_to`, `go_to` middle, `go_to` far, and only then the hallways. Next round, `game.log`: the officer's walks after "was seen in" should show two or three walks inside the one room.
