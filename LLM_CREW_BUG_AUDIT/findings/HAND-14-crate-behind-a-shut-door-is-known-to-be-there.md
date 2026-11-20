---
id: HAND-14
title: A crate on the far side of a shut airlock counts as seen, so the body knows a crate it cannot see is jammed there and sets off to move it
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_grip.dm:402, code/modules/llm_crew/crew_npc_grip.dm:383
fix: In crate_in_the_way count a crate as seen only if it is in view itself, and when only the door is in view walk to the door first and look again
---

## What is wrong

`crate_in_the_way` looks for a loose crate shutting a doorway near the body after a walk found no way through. It takes the crate as seen if the crate is in view, or if any airlock beside the crate is in view. The comment gives the reason: "a door it is looking at with a crate jammed behind it is where anyone would look next."

But a shut airlock is opaque. A crate on the far side of it, on the tile in front of the door, is not in view and cannot be. The body has only the door to look at, and still knows that a crate is behind it, which crate, and that it shuts the way. It then goes straight for that crate (`go_back_for` → an errand to the crate). The rules say a crew member knows only what its body could see. A player in the same place sees a shut door, walks to it, it opens, and only then sees the crate.

The behaviour that follows is close to a player's, since the walk to the crate goes through the door. Two things differ:

1. The body never says or learns "the way is shut" when the only thing shutting it is unseen: it is set moving by knowledge it does not have.
2. The log line "found no way to X and is moving the crate clear: it lies at ..., shutting a doorway" is written for a crate it never saw, which misleads whoever reads `game.log` about what the body knew.

One concrete case. A crate is left on the tile just inside the Warehouse, square in front of its airlock (`crew_npc_crate_shuts_way` is TRUE: an airlock in a cardinal tile). A technician in the Cargo Bay is told to go to the Warehouse. The route planner, which sees every crate, finds no way. `walk_finished` calls `clear_the_way`. `crate_in_the_way`: the crate is not in `view` (the airlock is shut), but the airlock is in range 1 of it and in `view`, so `in_sight = TRUE`, and its ID opens the airlock. The technician sets off for a crate it has not seen.

## Where

`code/modules/llm_crew/crew_npc_grip.dm:402`, `crate_in_the_way`:

    		var/in_sight = (crate in seen)
    		...
    		var/own_door = FALSE
    		for(var/obj/machinery/door/airlock/door in range(1, crate))
    			if(door.allowed(body))
    				own_door = TRUE
    			if(door in seen)
    				in_sight = TRUE
    		if(!in_sight || !own_door)
    			continue

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. Make `in_sight` mean the crate is in view: `var/in_sight = (crate in seen)`, and drop the `if(door in seen) in_sight = TRUE` line.
2. For the case the comment is about (a shut door it can see, with no way through it), the honest step is to walk to the door: `start_walk(door, CREW_TOOL_TO_DOOR, ...)` or a short walk to the tile in front of it. Bumping it opens it for a body whose card opens it, and then the crate is in view and the next `crate_in_the_way` finds it. Only do that once per `way_cleared_at` window, as now.
3. If step 2 is more than is wanted now, step 1 alone keeps the rule; the walk then fails as "no way through" and the brain hears so.

Keeps the rules: the body acts only on what it can see.

## How to test the fix

- Server compile to a side copy.
- In a round: put a crate just inside the Warehouse airlock with the airlock shut, and send a technician to the Warehouse. With the fix, `game.log` must show it reach the door before any "is moving the crate clear" line.
