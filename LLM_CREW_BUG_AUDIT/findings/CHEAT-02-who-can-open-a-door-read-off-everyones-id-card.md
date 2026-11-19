---
id: CHEAT-02
title: Who to ask to open a door is found by reading every crew member's ID card and the place of their PDA, from anywhere
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_doors.dm:134, code/modules/llm_crew/crew_npc_security.dm:784, code/modules/llm_crew/crew_npc_security.dm:770
fix: Go by the name and job the PDA's contact list shows and the access that job's ID trim gives, not by the card each person carries or where their PDA is
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

The station-level test alone (where each PDA is) is also in `janitors_on_pda` and `people_on_pda`, `code/modules/llm_crew/crew_npc_cargo.dm:648` and `:666`, which give every body its list of whom it can write to ("Only people aboard. PDAs lying in ruins and on other ships are on the list too"). There it only keeps ruin and ship PDAs out of the meeting and janitor lists; replacing it is an owner question (see "How to fix it", step 3).

What a player sees, `code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:356`:

    			"name" = computer.saved_identification,
    			"job" = computer.saved_job,

## How it was found

Read from the code. The change log entries of 2026-11-18 (items (3) and (21), and the H9 entry) describe the card reading as the way it works.

## How to fix it

1. Write one shared proc, `crew_npc_contacts_who_open(list/doors, datum/computer_file/program/messenger/own)`, for both callers.
2. For each messenger that would show in the contact list (the test `get_messengers()` uses, `messenger_program.dm:88`: not `invisible`, has a `computer`; plus the existing `saved_identification` test), take its `saved_job`, look up the job (`SSjob.get_job`), and the access that job starts with: `var/datum/outfit/job_outfit = job.outfit`, `SSid_access.trim_singletons_by_path[initial(job_outfit.id_trim)]`, and that trim's `access | wildcard_access` (a card is given both; `access` alone misses the Captain's and the heads' wildcard accesses). The trim's `access` already follows the `jobs_have_minimal_access` config and the map's `job_changes` (`code/datums/id_trim/jobs.dm`, `refresh_trim_access`). Test with `door.check_access_list(that_access)`. Cache the list per job title: it does not change in a round. An unknown title (an assistant renamed, a custom title from the HoP) gives no access and is left out, as a player would leave them out.
3. Drop the card test entirely, and the station-level test in these two procs. If someone far away is written to, they will not come, and the existing 45-second wait moves on to the next name. If the owner wants off-station names left out (ruin and ship PDAs), the senses-clean way is the crew manifest, which every PDA can show (`crewmanifest.dm`, `GLOB.manifest.general`): keep only names on it. Ask before choosing; do not keep the z-level test.
4. Keep the order (staff, then heads, then the Captain) as now.
5. `keepers_known` can then cache for longer: the answer changes only when someone joins or leaves the list.

No owner question for the card test: this is the senses rule as written. One thing to tell the owner: a person the HoP has given extra access will no longer be asked, as a player would not ask them. The station-level test in `janitors_on_pda` and `people_on_pda` is a smaller leak and dropping it would put ruin and ghost-role PDAs into meeting and janitor lists; that is the owner's call (manifest filter, or leave as is).

## How to test the fix

- Server compile.
- Simulator: the `security.keepers` and `door_keepers` lists the sim plays come from the sim itself, so the window side is unchanged. Run the shut-in and shut-out scenarios to check the PDA asking still runs.
- A round: shut a janitor in the Cargo Bay with both technicians away; `pda.log` should show it writing to a technician by job title first, then the Quartermaster, then the Captain.
- A round: take a cargo technician's ID card off them (admin strip) and shut a janitor in the Cargo Bay. Before the fix the technician is skipped; after, it is written to first.

## Check

Checked by Opus 5.5. Read `door_keepers` (`crew_npc_doors.dm:134`), `room_keepers` and `keepers_known` (`crew_npc_security.dm:770-830`): the quotes are what the code says. Both take `candidate.computer.stored_id` or `holder?.get_idcard(TRUE)` from the PDA's holder, wherever they are, and call `door.check_access(card)`; both skip any PDA not on a station z-level. Read the base `get_messengers()` (`messenger_program.dm:88`): the contact list a player sees filters only on `invisible` and shows `saved_identification` and `saved_job`, nothing about place or access. So the three concrete cases hold (extra access from the HoP, a PDA off the station level, a lost card). The change log (`(3)`, `(21)`, H9 and "Who can open a room is worked out from ID cards") describes it as how it works; no entry or plan says the owner accepted it as a hidden channel, and `LLM_CREW_PLAN_NO_CHEATS.md` does not mention it. Checked the fix against `code/datums/id_trim/jobs.dm` and `_id_trim.dm`: trims keep `access` and `wildcard_access` apart, so the fix must test both (the Captain's `New()` adds to `extra_access`, which `refresh_trim_access` folds into `access`). Severity kept at medium: it decides only whom to write to, not what the body does to the world, and in most rounds the job title gives the same answer as the card. Effort raised to medium: one new shared proc and two callers in two files, more if the owner wants the manifest filter.
