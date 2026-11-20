---
id: KNA-33
title: An engineer forces open, and leaves standing open, a door into a room that has lost its air, because only its own side of the door is looked at
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: code/modules/llm_crew/crew_npc_forcing.dm:199, code/modules/llm_crew/crew_npc_forcing.dm:432, code/game/machinery/doors/airlock.dm:1339
fix: Before taking a door's power, look for a pressure warning on the door's fire door or a hull breach in view, and if there is one stop and say the room has no air instead of forcing it
---

## What is wrong

The change log entry of 2026-11-18, 18:05 to 19:12, lists among what the helper reported of `force_door`: "It will force a door into a room with no air: only the air on its own side of the door is looked at." No later entry takes it up, and the code is as it says.

An engineer sent to force a door picks the door, checks only the tile it will work from (`spot`), opens the panel, cuts the power, pries the door and leaves it standing open on purpose, so that the officer can get back out with its prisoner. With the power gone the door cannot shut itself: `open()` arms its auto-close (`airlock.dm:1339`), but `close()` with the default checks returns FALSE while `!hasPower()`, and the timer is not set again when the power comes back. So the door stays open until someone shuts it.

If the room behind it has been holed (a meteor or "Space Dust" event: one fired in `data/logs/2026/11/19/round-20.43.32` at 02:57:05), forcing it opens the hallway to space through a door nobody will shut: the fire doors drop round it, the engineer and anyone near are in bad air, and the hallway it stood in is now one of those rooms nobody can walk through. A player engineer would not pry an airlock with its fire door showing a pressure warning, or would at least shut it again after.

The case: someone with a warrant shelters in a store room that a meteor has holed, in a hardsuit. Nobody whose ID opens it answers the officer. The Head of Security asks engineering, the engineer walks to the door from the hallway (`crew_npc_safe_turf(spot)` is the hallway tile: fine), takes the power, pries it, and reports "the door of the X is open". The hallway vents through it.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:199`, in `tool_force_door`, the only air check, on the near side:

    		var/turf/spot = spots[nearest]
    		var/list/nearest_sides = doors[nearest]
    		// Nobody stands working at a door where the air is bad.
    		if(!crew_npc_safe_turf(spot))
    			no_way_to += "[nearest.name] at ([nearest.x],[nearest.y]), where the air on its near side is bad"
    			continue

`far_side` is worked out a few lines below (`var/turf/far_side = inside ? nearest_sides[2] : nearest_sides[1]`) and used only to see whether the room can be walked into some other way. Nothing in `force_door_open` (line 432) looks at it either.

## How it was found

Read from the code, following the helper's note in the change log. Not seen in a round: no door has yet been forced in a round at all.

## How to fix it

Keep to the senses: reading the gas on the far tile from code would be the knowledge CHEAT-11 already objects to.

1. In `force_door_open`, once the body stands at the door and before `take_door_power`, look at what a player standing there would see: a fire door on the door's own tile or the next one (`locate(/obj/machinery/door/firedoor) in` those tiles) whose pressure or temperature warning is showing (the fire door's alarm state, which its lights show), and any shut fire door in view across the room's side. If there is one, stop with `forcing_failure("no_air", "The fire door by it is showing a pressure warning: there is no air on the other side.", ...)`.
2. Add `no_air` to `final` in `forcingAfterActing` (`jobs/forcing.ts`), so it is not tried twice, and a wording to `whyNot`: "there is no air on the other side". The Head of Security passes it to the Captain as it does "it is bolted".
3. Whether an engineer with an analyzer should instead check the far side with it, and whether it should ever force such a door with internals on, is the owner's to say.

## How to test the fix

Server compile. In a round: space one small room with a door locked to engineering (a meteor or a deconstructed wall), put a warranted body in it, and have the chain run. `game.log` should read "could not force ... (no_air)" and the door should stay shut. A room with air must still be forced as before ("forced open").
