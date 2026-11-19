---
id: CHEAT-02
title: Who to ask to open a door is found by reading every crew member's ID card and the place of their PDA, from anywhere
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_doors.dm:134, code/modules/llm_crew/crew_npc_security.dm:784, code/modules/llm_crew/crew_npc_security.dm:770
fix: Go by the name and job the PDA's contact list shows and the access that job is given, not by the card each person carries or where their PDA is
---

## What is wrong

Two procs pick who a body should write to when it needs a door opened: `door_keepers` (a body shut in a room) and `room_keepers` (an officer shut out of a room with a warrant on someone inside). Both walk `GLOB.pda_messengers` and, for each one:

1. skip it unless the PDA is on a station level right now (`get_turf(candidate.computer)` and `is_station_level`);
2. take the actual ID card in the PDA, or the one its holder is wearing, wherever they are (`holder?.get_idcard(TRUE)`);
3. test that card against the room's doors with `door.check_access(card)`.

A player has none of that. The PDA's messenger shows a list of names and job titles (`saved_identification`, `saved_job`, which is what `messenger_program.dm:100` puts in the window). It does not say where anyone is, and nobody can read the access on someone else's card from across the station.

The change log calls this deliberate as a way of working ("Who can open a room is worked out from ID cards", 2026-11-18), but never as a cheat the owner accepted, and it is not in `LLM_CREW_PLAN_NO_CHEATS.md`.

Concrete cases where the body knows what a player could not:

- The Head of Personnel gives an assistant cargo access at the desk. A janitor shut in the Cargo Bay writes to the assistant, whose title says nothing about cargo. A player would never think to.
- A cargo technician's PDA is in a locker on the mining station, or the technician is on the escape shuttle off the station level. The body leaves them out. A player sees them in the list and writes to them.
- Someone has lost their ID card. The body leaves them out, knowing it. A player would write to them and be told "I have no card".
- `room_keepers` runs with every look the security body takes (`keepers_known`, cached for a minute), so the security body keeps an up-to-date view of every crew member's card.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:144`, in `door_keepers`:

    	for(var/messenger_ref in GLOB.pda_messengers)
    		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
    		if(candidate == own_messenger || isnull(candidate.computer) || !candidate.computer.saved_identification)
    			continue
    		var/turf/where = get_turf(candidate.computer)
    		if(isnull(where) || !is_station_level(where.z))
    			continue
    ...
    		var/obj/item/card/id/card = candidate.computer.stored_id
    		if(isnull(card))
    			var/mob/living/holder = get(candidate.computer, /mob/living)
    			card = holder?.get_idcard(TRUE)
    		if(!card || !door.check_access(card))
    			continue

`code/modules/llm_crew/crew_npc_security.dm:800`, in `room_keepers`, the same lines again.

The station-level test alone (where each PDA is) is also in `janitors_on_pda` and `people_on_pda`, `code/modules/llm_crew/crew_npc_cargo.dm:648` and `:666`, which give every body its list of whom it can write to ("Only people aboard. PDAs lying in ruins and on other ships are on the list too"). Those should drop it in the same change, or keep it only for PDAs the messenger itself hides.

What a player sees, `code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:356`:

    			"name" = computer.saved_identification,
    			"job" = computer.saved_job,

## How it was found

Read from the code. The change log entries of 2026-11-18 (items (3) and (21), and the H9 entry) describe the card reading as the way it works.

## How to fix it

1. Write one shared proc, `crew_npc_contacts_who_open(list/doors, datum/computer_file/program/messenger/own)`, for both callers.
2. For each messenger that would show in the contact list (the same test the messenger uses for listing: not hidden, has a `saved_identification`), take its `saved_job`, look up the job (`SSjob.get_job`), and the access that job starts with: the job's outfit `id_trim`, through `SSid_access.trim_singletons_by_path[...]`, and its `access` list. Test with `door.check_access_list(that_access)`. This is what anyone aboard knows: the job a title stands for opens that job's doors.
3. Drop the station-level test. If someone far away is written to, they will not come, and the existing 45-second wait moves on to the next name.
4. Keep the order (staff, then heads, then the Captain) as now.
5. `keepers_known` can then cache for longer: the answer changes only when someone joins or leaves the list.

No owner question: this is the senses rule as written. One thing to tell the owner: a person the HoP has given extra access will no longer be asked, as a player would not ask them.

## How to test the fix

- Server compile.
- Simulator: the `security.keepers` and `door_keepers` lists the sim plays come from the sim itself, so the window side is unchanged. Run the shut-in and shut-out scenarios to check the PDA asking still runs.
- A round: shut a janitor in the Cargo Bay with both technicians away; `pda.log` should show it writing to a technician by job title first, then the Quartermaster, then the Captain.
