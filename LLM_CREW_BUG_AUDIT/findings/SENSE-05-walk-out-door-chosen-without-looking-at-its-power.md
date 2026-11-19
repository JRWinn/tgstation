---
id: SENSE-05
title: The door to walk a stranger out by is picked without looking at whether it has power, so once the station power fails the walk out makes for a door that will not open
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_guarding.dm:84, code/game/machinery/doors/airlock.dm:326, code/modules/llm_crew/crew_npc_doors.dm:585
fix: In spot_outside_post skip a shut door that has no power (door.density && !door.hasPower()), so the spot is never put past a door the route planner will not go through
---

## What is wrong

`spot_outside_post` picks the door the body walks a stranger out by. It skips a door that is bolted, welded, or does not open to the body's ID. It does not look at the door's power. An airlock with no power does not open when walked into: `bumpopen` returns at once on `!hasPower()`. The body does not in fact walk into the dead door: the route planner (navmap A*, `nav_blocker_can_pass` in `turf.dm:1064` calls `/obj/machinery/door/airlock/CanAStarPass`, `airlock.dm:1523`) counts a shut airlock with no power as a wall. So the spot past the dead door is reached the long way round, through some other door and the tunnels, with the stranger dragged along behind, and the 40-second walk timeout (`CREW_NPC_EVICT_HOLD`) can run out on the way; or, where the dead door is the only way to that spot, no route is found at all and the walk fails at once with "there is no way through". The window is told "You could not get X out of the Cargo Bay: ..." and the stranger is left where they were, or (API-01) taken to have refused.

Which door has power is not the same for all the doors of one room: a door on the edge of a room belongs to whichever area its tile is in, and is fed by that area's APC. So when one area's power is out, `spot_outside_post` can pick the dead door next to the body over a live one a few tiles further, because nearness is the score.

This comes up in most test rounds: the memory note "station power fails early" says test rounds lose power about fifteen minutes in, and no crew member runs the engine for long.

The door tool already has the right test, at `crew_npc_doors.dm:585`:

    if(door.locked || door.welded || !door.hasPower() || !door.allowed(body))

One concrete case. Twenty minutes into a round the Cargo Bay's APC is empty. The bay's door onto the hallway stands on a Cargo Bay tile, so it has no power; a maintenance hatch on the far side stands on a maintenance tile whose APC still has charge. A janitor that came in on its own has no business in the bay; after two asks the technician sends `throw_out`. `spot_outside_post` scores the hallway door at its distance (say 4) and the hatch at its distance plus 50, and picks the hallway door. The technician walks the janitor into it, it does not open, and the walk fails. The window is told the janitor could not be got out, and asks again later: the same door is picked each time.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:84`, in `spot_outside_post`:

    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(door.locked || door.welded || !door.allowed(body))
    			continue

`code/game/machinery/doors/airlock.dm:326` (base):

    /obj/machinery/door/airlock/bumpopen(mob/living/user)
    	if(!hasPower())
    		return

## How it was found

Read from the code and the base `bumpopen`. Not seen in a round; the power failure is from the memory note and the change log entry about the station going dark.

## How to fix it

1. In `spot_outside_post`, change the skip line to `if(door.locked || door.welded || !door.hasPower() || !door.allowed(body))`, matching the door tool.
2. Also skip a door that is electrified and shut (`door.density && door.isElectrified()`): walking a stranger into it shocks the body, which a player would not do once they had seen it spark. Optional; ask the owner if wanted.
3. When every door is skipped, `take_hold_of` already says "You cannot see a door to walk X out by." Make the words say why when it is power: "None of the doors out of the Cargo Bay has power." so the window and the log show the real reason.

## How to test the fix

- Compile.
- In a round, cut the power to the post's area (or wait for it to fail), put a stranger in the post and let the keeper send `throw_out`: grep `game.log` for `walk failed (throw_out` and check there is none at a dead door.
