---
id: SENSE-05
title: The door to walk a stranger out by is picked without looking at whether it has power, so once the station power fails the walk out makes for a door that will not open
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 64052050ca6
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

One concrete case. Twenty minutes into a round the Cargo Bay's APC is empty. The bay's door onto the hallway stands on a Cargo Bay tile, so it has no power; a maintenance hatch on the far side stands on a maintenance tile whose APC still has charge. A janitor that came in on its own has no business in the bay; after two asks the technician sends `throw_out`. `spot_outside_post` scores the hallway door at its distance (say 4) and the hatch at its distance plus 50, and picks the hallway door. The planner will not take the shut hallway door, so the technician sets off with the janitor the long way round to the hallway spot (through the hatch and the tunnels, if its ID opens a way back out of them), and the 40 seconds run out; or no route is found and the walk fails at once. The window is told the janitor could not be got out, and asks again later: the same door is picked each time.

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

1. In `spot_outside_post`, change the skip line to `if(door.locked || door.welded || !door.allowed(body) || (door.density && !door.hasPower()))`. Only a shut dead door is skipped: one that lost its power standing open is still a way through, and the planner takes it (`CanAStarPass` is TRUE on `!density`). The door tool's test (`crew_npc_doors.dm:585`) skips every dead door because it must open and shut it; that is not wanted here. This keeps the senses rule: a door with no power shows no lights.
2. Do not add the electrified test the first version suggested. Nothing a player sees says a door is live until it sparks on them, so the body may not know it either (senses rule).
3. When every door is skipped, `take_hold_of` already says "You cannot see a door to walk X out by." Optionally count the doors skipped for want of power and say "None of the doors out of [post_place] has power.", so the window and the log show the real reason. Same file, a few lines.

## How to test the fix

- Compile.
- In a round, cut the power to the post's area (or wait for it to fail), put a stranger in the post and let the keeper send `throw_out`: grep `game.log` for `walk failed (throw_out` and check there is none (`there is no way through` or `it was taking too long`) at a post whose nearest door is dead, and that `walked ... out of` follows `took hold of` instead.

## Check

Checked by Opus 5.5. The quote at `crew_npc_guarding.dm:84` is what the code says: `spot_outside_post` skips only bolted, welded and no-access doors and scores by distance, and `take_hold_of` (`:170`) walks to the spot it gives with `start_walk(..., CREW_NPC_EVICT_HOLD)`. The `bumpopen` quote (`airlock.dm:326`) is right, but the first version had the body walk into the dead door, and it does not: the crew walk is `navmap_astar` (`crew_npc_controller.dm:8`), whose door edges go through `nav_blocker_can_pass` (`turf.dm:1064`) to `airlock/CanAStarPass` (`airlock.dm:1523`), FALSE for a shut door without power. So the harm is a long detour or no route, each ending in `put_out(FALSE, ...)` from `walk_finished` (`crew_npc_tools.dm:436`). Still a fault: the spot is put past a door that is no way out, and a door takes power from its own tile's area, so a dead one can be picked over a live one. Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers `spot_outside_post` and power. Mended the case, narrowed the fix to shut dead doors, and dropped the electrified test, which the body could not see. Severity medium and effort small stand. Nothing was run.
