---
id: API-04
title: A PDA with a name and no job is sent to the window with job null, and a head's brain then throws on every update
kind: bug
severity: low
effort: small
confidence: likely
status: refuted
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:679, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:193, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:211, tgui/packages/tgui/interfaces/CrewBrain/types.ts:280
fix: None needed - GLOB.pda_messengers never holds a messenger whose PDA has no saved_job, so people_on_pda cannot send job null
---

## What is wrong

See also: DRV-06, which shows what any error thrown in `ingest` costs (the React tree unmounts, `stopSession` empties every brain) and asks for a concrete throw. This is one: a field the server sends as null where the window calls a string method.

`people_on_pda` lists every messenger on the station level that has a `saved_identification`, and sends its `saved_job` as the job. It never checks that the job is set. A modular computer can carry a name and no job: `imprint_id` sets `saved_job = job_name || stored_id?.assignment || saved_job`, so a PDA imprinted from an ID card whose `assignment` is empty (a card given a name at the ID console and no job, an agent card, a fresh PDA imprinted by its own "imprint" button from such a card) has a name and a null job. The base game's own messenger leaves such PDAs out of its contact list (`messenger_data.dm:12`: `if(!messenger_device.saved_identification || !messenger_device.saved_job)`); ours does not. **(Wrong, see Check: that line is in `add_messenger`, which is what puts a messenger into `GLOB.pda_messengers`, the very list `people_on_pda` walks. Such a PDA is never on it.)**

DM sends a null var as JSON `null`. The window's type says `job: string`, and two places call a string method on it:

    person.job.toLowerCase().includes(job.toLowerCase()),      // head.ts staff()
    person.job.toLowerCase().includes(headJob.toLowerCase()),  // driver.ts nextToWrite()

`staff()` is called for every head of staff (Head of Personnel, Quartermaster, Chief Engineer, Head of Security) while its tasks are brought up to date, on every state update. With one such PDA on the station, `staff()` throws a TypeError inside `ingest`, which runs in the window's `useEffect`. The loop over the NPCs stops at that head, so every NPC after it in the list gets no events and no step, on every update, for as long as the PDA is aboard. Worse, per DRV-06 the error leaves the effect, React (with no error boundary) unmounts the tree, the effect cleanup `stopSession` runs and every brain is cleared. Rare to set off, but it costs the whole crew's memory when it happens, so it is rated high.

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

## Check

Checked by Opus 5.5. Refuted: the server cannot send a PDA person with job null.

- `people_on_pda` (`code/modules/llm_crew/crew_npc_cargo.dm:666`) reads only `GLOB.pda_messengers`. The only place anything is put in that list is `add_messenger` (`code/modules/modular_computers/file_system/programs/messenger/messenger_data.dm:9`), and its first test, line 12, is `if(!messenger_device.saved_identification || !messenger_device.saved_job) return`. A PDA with a name and no job is never added. Every other use of `GLOB.pda_messengers[...]` under `code/` reads it; none writes it.
- Once a messenger is on the list its `saved_job` cannot go back to null while its name stays: `imprint_id` (`computer.dm:812`) is `job_name || stored_id?.assignment || saved_job`, which falls back to the old job when the card's assignment is empty or null; `reset_imprint` (`computer.dm:817`) nulls both and raises `COMSIG_MODULAR_PDA_IMPRINT_RESET`, whose handler `on_imprint_reset` (`messenger_program.dm`) calls `remove_messenger`; the only other write is `saved_job = "Citizen"` in `role_tablet_presets.dm:539`. So the name-only PDA in the write-up's case (a card with a name and no assignment put in a spare PDA) imprints, `add_messenger` refuses it, and it is not on the list `people_on_pda` walks.
- The write-up's own quote of `messenger_data.dm:12` is that guard; it was taken for the contact list's filter, but it is the registration into the shared list.
- On the window side the write-up is right that a null job would throw, though not for every head: a throwaway bun script calling `staff` from `jobs/head.ts` with `pdaPeople = [{ name: 'X', job: null }]` threw a TypeError for the Head of Personnel and the Chief Engineer, and returned `[]` for the Quartermaster and the Head of Security (those branches use `isTechnician` and a regex `.test`, which take null without throwing). That only matters if a null can arrive, and from this list it cannot.
- Not ruled out, and not worth a fix on its own: an admin editing `saved_job` by hand to null. Making `brain.ts:537` coerce `name` and `job` to strings is cheap hardening that DRV-06's try/catch would cover better; it is no fix for a fault that can happen in a round. Severity set to low for the record.
