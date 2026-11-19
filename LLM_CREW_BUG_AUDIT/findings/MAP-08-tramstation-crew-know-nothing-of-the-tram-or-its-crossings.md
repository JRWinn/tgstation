---
id: MAP-08
title: On Tramstation the crew know nothing of the tram, so they cross the tracks without looking at the crossing signal and cannot ride it between the station's parts
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: design
files: code/modules/llm_crew/crew_npc_motor.dm:43, code/modules/transport/transport_module.dm:431, code/modules/transport/tram/tram_signals.dm:23
fix: Treat a tram track tile as a place to step onto only when the nearest crossing signal is green, as a player would, and leave riding the tram to the lift work in HOLE-05
---

## What is wrong

See also: HOLE-05, which names "Tramstation's tram" as a lift the crew cannot work. This is the other half: the tram is also a danger on the way.

Tramstation's main hallways cross the tram's tracks at pedestrian crossings, each with a crossing signal (`/obj/machinery/transport/crossing_signal`) that turns amber and then red as the tram comes (`XING_STATE_GREEN`, `AMBER`, `RED`, `MALF` in `code/__DEFINES/transport.dm`). A player looks at the signal before crossing. The tram does real harm to anyone in its way: `transport_module.dm` "collides into you", with brute damage to head and chest of `3 * damage` where damage is 7 to 21 times the lethality, and 29 times on a 15% roll.

Nothing in the crew code knows of trams, tracks, crossings or lifts (a grep of `code/modules/llm_crew/` and the window code for tram, crossing, elevator, lift, stairs or ladder finds only the word "lifted" for fire doors). `crew_npc_safe_turf` looks only at whether the floor is open, not space, not an outer airlock, and at the air pressure. The route planner sends a body across the tracks whenever that is the short way. So on Tramstation a body crosses whatever the signal shows. With the tram run by a player or by its own schedule, a crew member is hit by it sooner or later, and lies hurt on the tracks, which nobody notices (GAP-13).

The project rule is that nothing is tied to one map. Tramstation is in `config/maps.txt` and is votable.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:43`, `crew_npc_safe_turf`:

    /proc/crew_npc_safe_turf(turf/destination)
    	if(!isopenturf(destination) || isspaceturf(destination))
    		return FALSE
    	// Stepping into an external airlock opens it and starts it cycling, which ends in vacuum.
    	if(locate(/obj/machinery/door/airlock/external) in destination)
    		return FALSE
    	var/datum/gas_mixture/air = destination.return_air()

`code/modules/transport/transport_module.dm:431` (base game, what the tram does to a person):

    to_chat(victim_living, span_userdanger("[src] collides into you!"))
    ...
    victim_living.apply_damage(3 * damage, BRUTE, BODY_ZONE_CHEST, wound_bonus = 21)

`code/modules/transport/tram/tram_signals.dm:23` (base game, what a player looks at):

    var/signal_state = XING_STATE_MALF

## How it was found

Read from the code; the grep above. Not seen: no round has been played on Tramstation.

## How to fix it

1. Find how the tracks are marked in the map (the rail structures or turfs the tram runs on in `code/modules/transport/tram/tram_structures.dm` and `tram_floors.dm`), and add `crew_npc_on_tram_tracks(turf)`.
2. In the crew movement's per-step check (the `allowed_to_move` override proposed in MAP-07, or a `COMSIG_MOVELOOP_PREPROCESS_CHECK` handler), before stepping from a non-track tile onto a track tile, look for a crossing signal in view (`/obj/machinery/transport/crossing_signal`) and read its `signal_state`, which a player sees as its light. Step only on green. On amber, red or malfunction, hold the step and wait; a walk held too long ends with the reason "you are waiting for the tram to pass". Once on the tracks, keep going.
3. Do not count a held crossing as a shut door (`note_way_out_failed`).
4. Riding the tram between the station's parts, by pressing its call button and its destination button, is a tool of its own. Leave it to the lift work and say in the change log that on Tramstation the crew walk only where a walking route exists.
5. Question for the owner: is Tramstation wanted soon? If not, the cheap step is MAP-01's: keep the test server on MetaStation.

## How to test the fix

- Server compile.
- On Tramstation, send a janitor across a crossing while an admin calls the tram, and check in `game.log` that it waited and was not hit (`attack.log` has "collided with" lines for tram hits).
