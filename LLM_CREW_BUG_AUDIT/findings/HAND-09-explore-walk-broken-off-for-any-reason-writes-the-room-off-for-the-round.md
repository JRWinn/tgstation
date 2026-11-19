---
id: HAND-09
title: An explore walk that ends for any reason, a stun or a queue at a door included, writes the room off as unreachable for the rest of the round
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: code/modules/llm_crew/crew_npc_tools.dm:497, code/modules/llm_crew/crew_npc_tools.dm:304, code/modules/llm_crew/crew_npc_danger.dm:121
fix: Write a room into unreachable_places from walk_finished only when the reason is CREW_NPC_NO_WAY, and give the other failures a time after which the room may be tried again
---

## What is wrong

See also: LIFE-01, which found the same in `blocked_places` for `go_to` (there the room is written off for five minutes). For `explore` it is for good.

`pick_somewhere_new` only offers a room it has just found a route to (`get_path_to` with the body's access). So when the walk there then fails, the cause is nearly always passing: the body was knocked down (the walk ends with `reason = null`, "you were interrupted"), the walk ran over `CREW_NPC_TRAVEL_TIMEOUT` behind people at a door, a fire door came down on the way, or the route planner was wrong about one door. `walk_finished` writes the room into `unreachable_places` whatever the reason. Nothing ever takes a room out of that list. `pick_somewhere_new` skips it for the rest of the round, and `tool_flee` will not run there either.

So the body never sees the inside of that room, never looks through its storage, and never learns what is kept there. A janitor that was tackled by Pun Pun on its way to explore Primary Tool Storage on its first walk never learns of the tools and supplies in it.

One concrete case. At round start a cargo technician is told `explore`. `pick_somewhere_new` picks the Cargo Office next door, finds a route of 12 steps, and the walk starts. A workmate is standing in the doorway. The technician waits in the queue, the walk goes on, a door cycles, and the station's power is low that round so the door is slow. The walk does not run out of time, but Pun Pun, loose in the bay, tackles it (`Paralyze(40)`). The walk ends: `walk_finished(target, FALSE, null)`. `tool == CREW_TOOL_EXPLORE && isturf(target)`: `unreachable_places["Cargo Office"] = TRUE`. For the rest of the round the technician never explores the office it works beside.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:496`, `walk_finished`, in the branch for a walk that failed:

    		// Somewhere new that turned out not to be reachable after all is not tried again.
    		if(tool == CREW_TOOL_EXPLORE && isturf(target))
    			unreachable_places[get_area_name(target, TRUE)] = TRUE

`code/modules/llm_crew/crew_npc_tools.dm:304`, `pick_somewhere_new`, which then skips it:

    		if(visited_places[place_name] || unreachable_places[place_name])
    			continue

`code/modules/llm_crew/crew_npc_danger.dm:121`, `tool_flee`, which also skips it:

    		if(place == here_name || (place in unreachable_places))
    			continue

## How it was found

Read from the code. Not seen in a round. To look for it: in `game.log`, "walk failed (explore, to somewhere new): you were interrupted" or "it was taking too long", and that room never reached later.

## How to fix it

1. In `walk_finished`, write the room into `unreachable_places` only when `reason == CREW_NPC_NO_WAY`.
2. For any other failure, write it into a second list, `explore_failed[place] = world.time`, and have `pick_somewhere_new` skip a room in it for `CREW_NPC_BLOCKED_PLACE_TIME` (the five minutes LIFE-01's `blocked_places` uses), then try it again.
3. `ways_reopened()` should empty `explore_failed`, as it does the other lists of places not reached.
4. If LIFE-01's fix gives a walk ended by a stun its own reason, use that here too: a stun is not even a failed try.

Keeps the rules: it only changes which rooms the body will choose to walk to.

## How to test the fix

- Server compile to a side copy.
- In a round: send a body to explore, knock it down on the way (an admin smite or a stun baton), and when it is up send it to explore again. It must make for the same room.
