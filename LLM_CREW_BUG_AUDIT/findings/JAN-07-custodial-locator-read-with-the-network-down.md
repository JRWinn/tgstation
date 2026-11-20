---
id: JAN-07
title: The custodial locator is read with the station network down, though the program needs it, and the closet is named when the locator shows no gear there
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:546, code/modules/llm_crew/crew_npc_cleaning.dm:586, code/modules/modular_computers/file_system/programs/radar.dm:284, code/modules/llm_crew/crew_npc_engineering.dm:113
fix: In has_custodial_locator check computer.get_ntnet_status() as engine_reading does, and say plainly when the locator shows nothing rather than naming a room it did not show
---

## What is wrong

`tool_locate` reads where every mop and cart is from `GLOB.janitor_devices`, as the PDA's Custodial Locator would show. But the game's program needs the station network: `custodial_locator` has `PROGRAM_REQUIRES_NTNET`. `has_custodial_locator` only looks for the file on a PDA the body carries. With the network down, which is how test rounds go after the power fails (see the README, "station power fails early"), a player's locator shows nothing, and the body still gets "the cleaning gear is kept in Custodial Closet ... You now know the way there."

`engine_reading` in `crew_npc_engineering.dm` already does this right for the engine monitor: it skips a computer with `!computer.get_ntnet_status()`.

A second, smaller point in the same proc: when the locator shows no gear in any custodial closet, the code looks the closet up in `GLOB.areas` and reports it with "the janitor's supplies", as if the locator had shown it. Every crew member knows rooms by name, so the room is fair; but the answer says the locator showed gear there, and it did not.

Concrete case: the power fails 15 minutes into a round, the network goes with it. A new janitor spawned later has never seen the station and sends `locate`. It is told where the gear is and given the way there (`visited_places[supply_place]` is set), with nothing on its PDA working.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:546`:

    /datum/ai_controller/crew_npc/proc/has_custodial_locator()
    	var/mob/living/carbon/human/body = pawn
    	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
    		if(locate(/datum/computer_file/program/radar/custodial_locator) in computer.stored_files)
    			return TRUE
    	return FALSE

`code/modules/modular_computers/file_system/programs/radar.dm:284`:

    	program_flags = PROGRAM_ON_NTNET_STORE | PROGRAM_REQUIRES_NTNET

`code/modules/llm_crew/crew_npc_engineering.dm:113`, the same check done right:

    		if(!computer.get_ntnet_status())
    			continue

`code/modules/llm_crew/crew_npc_cleaning.dm:586`, the closet named without the locator showing it:

    	if(isnull(closet_place))
    		for(var/area/station/service/janitor/closet in GLOB.areas)
    			...
    				gear_by_place[closet_place] = list("the janitor's supplies")

## How it was found

Read from the code and the base game's radar program. Not seen in a round.

## How to fix it

1. Split `has_custodial_locator` into "has the program" and "the program works now": the second also needs `computer.get_ntnet_status()` (and, to be strict, the computer's power: `computer.use_energy` / an `enabled` check, if the PDA has a dead cell).
2. In `tool_locate`, if the program is there but does not work, answer FALSE with "Your PDA's custodial locator shows nothing: it has no connection." so the brain looks for the closet another way.
3. Keep `has_locator` in the brain data as "has the program", so the brain still knows to try it later.
4. When no gear is found in any closet, keep naming the closet if the owner wants that (the crew know rooms by name), but word the answer as what the body knows, not what the locator showed: "Your locator shows no gear in a custodial closet. Janitors' things are kept in the Custodial Closet." Ask the owner if that is wanted.

## How to test the fix

- Server compile to a side copy.
- In a round, cut the station's network (or wait for the power to go), spawn a janitor and have it `locate`: it should be told the locator shows nothing.
