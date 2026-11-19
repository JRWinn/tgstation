---
id: ARR-11
title: One main hallway it cannot walk to stops the whole search, and it stands still between ever longer tries at that one hallway
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:887, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:301, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:538
fix: Skip a hallway in blockedPlaces, and count a walk to a hallway that came to nothing as that hallway looked at, so the round goes on to the next
---

## What is wrong

See also: KNA-07 (that the search is only rooms named Primary Hallway). This is a separate fault in how the round of hallways moves on.

With no fresh word of the person, security walks the main hallways in a fixed order (`hallways()`, sorted by name), one at a time. `beat.round.next` moves on to the next hallway only after the body has stood in the current one for ten seconds (`brain.location === hall` and `HALLWAY_DS`). A walk to a hallway that fails moves nothing: `beatAfterActing` has nothing for a `go_to` of the serve task unless `warrant.opened` is set. So the next plan is the same `go_to` to the same hallway.

The driver then holds that step back for 20 seconds times the number of times it has failed, up to two minutes (`fail`, `inBackoff`), and while it is held back there is nothing else ready, the officer keeps its post (`keepsPost`), and it stands where it is. It tries the same hallway every two minutes for the rest of the round and never looks in any other.

`hallways()` does not look at `brain.blockedPlaces`, though the server adds the hallway there the moment the walk fails (`blocked_places[goal] = world.time` in `crew_npc_tools.dm`). The sighting branches just above do look at it.

When one hallway cannot be walked to:

- Fire doors shut across it after a fire alarm or a breach. Pun Pun pulls fire alarms (round-19.33.50, per ARR-07). The walk fails with "there is no way through". While those doors stay shut the search is stuck, even though four other hallways are open.
- A hull breach or no air: the path avoids unsafe floor (`crew_npc_safe_turf`).
- A station whose main hallways are on more than one floor (HOLE-05: crew cannot leave the floor they are on). Every round on such a map, the first hallway by name on another floor stops the search for good.

Each failed walk with "there is no way through" and no fire doors also calls `note_way_out_failed()` on the server, which counts towards the body thinking it is shut in, so the stall can feed into that as well.

One concrete case: a warrant on Pun Pun, no sighting for five minutes. The hallways in order are Aft, Central, Fore, Port and Starboard Primary Hallway. Pun Pun has pulled the fire alarm in the Aft Primary Hallway and its fire doors are shut. The officer sends `go_to('Aft Primary Hallway')`. The walk fails. 20 seconds of standing still, the same walk, it fails; 40 seconds; 60; ... 120, and so on. Pun Pun is in the Central Primary Hallway, which is never walked.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:887`, in `serveStep`:

    const halls = hallways(brain);
    const round = beat.round;
    const walking = round.next > 0 || brain.now - round.at > BETWEEN_WALKS_DS;
    if (halls.length > 0 && walking && round.next < halls.length) {
      const hall = halls[round.next];
      if (brain.location !== hall) {
        return {
          ready: true,
          step: `... You are walking the main hallways to look for them: the ${hall} next.`,
          act: { tool: 'go_to', place: hall },
        };
      }

`jobs/arrests.ts:301`:

    function hallways(brain: NpcBrain): string[] {
      return allPlaces(brain)
        .filter((place) => /primary hallway/i.test(place))
        .sort();
    }

`jobs/arrests.ts:1050`, in `beatAfterActing`, the only `go_to` of a serve task that is counted:

    if (warrant?.opened && act.tool === 'go_to' && act.attempt !== undefined) {

`code/modules/llm_crew/crew_npc_tools.dm:485`, the server noting the hallway as one it found no way into:

    if(tool == CREW_TOOL_GO_TO && goal)
    	blocked_places[goal] = world.time

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `hallways()` (or where `halls` is used), leave out any hallway in `brain.blockedPlaces`. The server drops a place from that list after its own while (`is_blocked_place`), so a hallway whose fire doors open again comes back into the round.
2. In `beatAfterActing`, for a `go_to` of a serve task whose `place` is `halls[beat.round.next]` and which failed, move `round.next` on by one, wrapping to 0 and setting `round.at` as the plan already does at the end of a round. Number the try (`attempt`) as the cell and door walks are, so that the driver does not hold the next hallway back for the failure of this one.
3. Keep the fixed order: it is what lets two security staff (if there are ever two searching) not need to share the list.

## How to test the fix

- `tools/llm_crew/security.ts`: a case with `blockedPlaces: ['Aft Primary Hallway']` and no sighting; the serve plan should be a `go_to` to the Central Primary Hallway.
- A simulator scenario where the first hallway's walk fails: the officer should be in the second hallway within a few seconds of the failure, not two minutes later.
- In the next round, grep `game.log` for `walk failed (go_to, ` with a Primary Hallway goal by the officer, and check the next `go_to` is to a different hallway.
