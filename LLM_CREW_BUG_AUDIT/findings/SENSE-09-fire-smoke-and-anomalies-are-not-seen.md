---
id: SENSE-09
title: Fire, smoke and anomalies are never seen, so a body walks into flames and goes on mopping beside a burning room without a word
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:341, code/modules/llm_crew/crew_npc_motor.dm:43, code/modules/atmospherics/environmental/LINDA_fire.dm:64, code/game/objects/effects/anomalies/_anomalies.dm:2
fix: In look_around report hotspots, smoke and anomalies in sight as a hazard list, and keep the walk and the idle step off burning tiles
---

## What is wrong

Everything a body sees of the world besides people comes through `notable_things`, and it throws away every effect that is not a mess:

    		if(iseffect(thing))
    			if(!istype(thing, /obj/effect/decal/cleanable))
    				continue

Fire in this codebase is `/obj/effect/hotspot`. Smoke is `/obj/effect/particle_effect/fluid/smoke`. An anomaly is `/obj/effect/anomaly`. All three are effects, so all three are dropped. Nothing else in `code/modules/llm_crew/` looks for them (a search for `hotspot`, `on_fire`, `fire_stacks` finds nothing).

So a body standing in a burning room sees nothing burning. It is not told, its brain does not mention it, and it carries on. The walk does not keep off burning tiles: `crew_npc_safe_turf` (used for the idle step and other spot choices) looks at the pressure only, and the route is a navmap A* path that does not look at fire at all. A player would see the flames and keep out.

Bodies do burn: a crew body that catches fire is set alight like anyone (HOLE-11 already notes it never stops, drops and rolls). It still has no sense that tells it why.

One concrete case. A plasma fire starts in the hallway outside the Cargo Bay (a random event, or the Captain's welder). Technicians in the bay see nothing: `things_in_view` holds no fire. A janitor called to a mess in the Cargo Lobby walks its route through the burning hallway, catches fire, and is told only what its body state says. The fire alarm closes the fire doors; the body is told "a fire door is shut" (`fire_door_report`), and nothing about the fire behind it.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:341`, in `notable_things`:

    	for(var/obj/thing in in_sight)
    		var/kind
    		if(iseffect(thing))
    			if(!istype(thing, /obj/effect/decal/cleanable))
    				continue
    			kind = "mess"

`code/modules/llm_crew/crew_npc_motor.dm:43`, `crew_npc_safe_turf`, pressure only:

    	var/datum/gas_mixture/air = destination.return_air()
    	...
    	return pressure >= WARNING_LOW_PRESSURE && pressure <= WARNING_HIGH_PRESSURE

`code/modules/atmospherics/environmental/LINDA_fire.dm:64` (base): `/obj/effect/hotspot`.

## How it was found

Read from the code and the base type paths. Not seen in a round; the logs were not searched for a crew body catching fire.

## How to fix it

1. In `look_around`, count `/obj/effect/hotspot`, `/obj/effect/particle_effect/fluid/smoke` and `/obj/effect/anomaly` in `in_sight` into a small `hazards_in_view` list (kind and the room it is in), and emit one knowledge event the first time a hazard comes into view in a room ("There is a fire in the Primary Hallway."), keyed by room and kind so it is said once.
2. Send `hazards_in_view` to the window, and put one short line in the scene text when it is not empty. Mind the prompt budget: nothing is added when there is no hazard.
3. In `crew_npc_safe_turf`, also refuse a tile with a hotspot on it (`locate(/obj/effect/hotspot) in destination`), so the idle step and the spots chosen by code keep off it.
4. Whether a walk should route round fire, and what the crew do about one (leave, pull the alarm, tell engineering by PDA), is the reactions work the owner has put off and GAP-17 lists for bad air. Seeing it is the first step and is cheap.

Question for the owner: should a fire in view be passed on (to the Chief Engineer or the Captain, as GAP-13 proposes for someone down), or only seen for now?

## How to test the fix

- Compile.
- In a round, light a fire in sight of a crew body and check `crew_brain.log` for the new event, and that an idle step never lands on a burning tile.
