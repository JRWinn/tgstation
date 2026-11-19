---
id: API-04
title: A PDA with a name and no job is sent to the window with job null, and a head's brain then throws on every update
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:679, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:193, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:211, tgui/packages/tgui/interfaces/CrewBrain/types.ts:280
fix: Send "job" = candidate.computer.saved_job || "" from people_on_pda (and skip PDAs the messenger itself would not list), and read person.job ?? '' in the window
---

## What is wrong

`people_on_pda` lists every messenger on the station level that has a `saved_identification`, and sends its `saved_job` as the job. It never checks that the job is set. A modular computer can carry a name and no job: `imprint_id` sets `saved_job = job_name || stored_id?.assignment || saved_job`, so a PDA imprinted from an ID card whose `assignment` is empty (a card given a name at the ID console and no job, an agent card, a fresh PDA imprinted by its own "imprint" button from such a card) has a name and a null job. The base game's own messenger leaves such PDAs out of its contact list (`messenger_data.dm:12`: `if(!messenger_device.saved_identification || !messenger_device.saved_job)`); ours does not.

DM sends a null var as JSON `null`. The window's type says `job: string`, and two places call a string method on it:

    person.job.toLowerCase().includes(job.toLowerCase()),      // head.ts staff()
    person.job.toLowerCase().includes(headJob.toLowerCase()),  // driver.ts nextToWrite()

`staff()` is called for every head of staff (Head of Personnel, Quartermaster, Chief Engineer, Head of Security) while its tasks are brought up to date, on every state update. With one such PDA on the station, `staff()` throws a TypeError inside `ingest`, which runs in the window's `useEffect`. The loop over the NPCs stops at that head, so every NPC after it in the list gets no events and no step, on every update, for as long as the PDA is aboard. If the thrown error takes the React tree down, the effect cleanup `stopSession` runs and every brain is cleared.

Concrete case: the Head of Personnel (a player) makes an ID with a name and no job yet and puts it in a spare PDA, which imprints the name only. The Head of Personnel NPC's next update throws.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:666`, `people_on_pda`:

    if(candidate == own_messenger || isnull(candidate.computer) || !candidate.computer.saved_identification)
        continue
    ...
    people += list(list("name" = candidate.computer.saved_identification, "job" = candidate.computer.saved_job))

`code/modules/modular_computers/computers/item/computer.dm:810` (base game), `imprint_id`:

    saved_identification = name || stored_id?.registered_name || saved_identification
    saved_job = job_name || stored_id?.assignment || saved_job

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:191`, `staff`:

    return brain.pdaPeople.filter((person) =>
      department.jobs.some((job) =>
        person.job.toLowerCase().includes(job.toLowerCase()),
      ),
    );

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:210`, `nextToWrite`:

    ? brain.pdaPeople.find((person) =>
        person.job.toLowerCase().includes(headJob.toLowerCase()),
      )

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:95`:

    useEffect(() => {
      setStationPlaces(data.places ?? []);
      ingest(data.npcs ?? [], data.now);
    }, [data]);

## How it was found

Read from the code on both sides and the base game's `imprint_id`. Not seen in a round, and not run. How often a named PDA with no job turns up in a round was not checked; it needs a card with a name and an empty assignment.

## How to fix it

1. Server, `people_on_pda`: skip a messenger with no `saved_job`, as the base messenger does, or send `"job" = candidate.computer.saved_job || ""`. Skipping matches what a player's own PDA would list. Do the same in `janitors_on_pda`, `door_keepers` and `room_keepers` for consistency (they do not crash, but they read the job).
2. Window, `brain.ts` ingest: map `npc.pda_people` to `{ name: String(p.name ?? ''), job: String(p.job ?? '') }` so no field from the server is trusted to be a string. The same for `people_in_view[].job`, which `get_assignment(if_no_id = "", if_no_job = "")` already keeps a string.
3. Optional: wrap the per-NPC body of `ingest` in try/catch and log the error to the brain log, so one bad field stops one NPC for one update rather than the whole crew.

## How to test the fix

- A throwaway bun script that imports `staff` from `jobs/head.ts` with a brain whose `pdaPeople` holds `{ name: 'X', job: null }`: before the fix it throws, after it returns.
- Compile the server. In a round, imprint a spare PDA with a name-only ID and watch that the heads still hold meetings and `crew_brain.log` keeps getting ROUTINE records for every NPC.
