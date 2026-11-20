---
id: MAP-09
title: The window's own table of who answers to whom is matched by words inside titles and disagrees with the game's, so a Bridge Assistant and every Assistant are the Head of Personnel's staff and a Chef is nobody's
kind: bug
severity: low
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:25, tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:84, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:176, code/modules/llm_crew/crew_npc_guarding.dm:59
fix: Have the server send each person's department and head job (from the job datum's departments_list) with the PDA list and the people in view, and drop the hand-written DEPARTMENTS table except as a fallback
---

## What is wrong

See also: HOLE-01 (the same loose `isJob` match lets any card text with captain in it be obeyed as the Captain).

There are two answers to "who answers to whom" in the code, and they differ.

- The server's `answers_to` (`crew_npc_guarding.dm:59`) uses the game's job data: the job on the person's ID, its `departments_list`, and each department's `department_head`. It is sent as `superior` for people in view.
- The window's `hierarchy.ts` is a table written by hand, and a title is matched against it with `title.toLowerCase().includes(job.toLowerCase())`. It is what decides a head's staff from the PDA list (`staff()` in `head.ts:176`), who is called to a meeting, and `answersTo` wherever the server's `superior` is not to hand.

Where they part:

1. **"Assistant" is under the Head of Personnel in the table.** In the game, Assistants have their own department with no head (`/datum/job_department/assistant`: "Don't add department_head!"). So the server says an Assistant does not answer to the Head of Personnel and the window says it does. The Head of Personnel's `staff()` lists every Assistant on its PDA, calls them all to its staff meeting by PDA (`HOP_WAY` is `aloud: false`) and waits for their word. On a server with players, Assistants are the commonest job.
2. **"Bridge Assistant" has "Assistant" in it**, so `departmentOf` finds it under Service. It is a Command job in the game (the Bridge Assistant station trait), answering to the Captain.
3. **"Chef"**, the game's alternate title for the Cook (`JOB_CHEF`, `cook.dm` `alternate_titles`), is in no row, so a Chef has no head and is never called to the Head of Personnel's meeting.
4. Jobs the table has no row for at all (Veteran Security Advisor, Cargo Gorilla, Pun Pun, Bridge Assistant had it not been caught by "Assistant") get `headOf` null. The window then takes such a person's word as from nobody it answers to, which is right, but only by luck of the table.

None of these is an NPC job today. They are the people the crew meet when other players are aboard, and the owner wants a whole station.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:38`:

    name: 'Service',
    head: 'Head of Personnel',
    jobs: [
      'Janitor',
      'Bartender',
      'Cook',
      'Botanist',
      'Assistant',

`tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:84`:

    function isJob(title: string, job: string): boolean {
      return title.toLowerCase().includes(job.toLowerCase());
    }

`code/modules/jobs/departments/departments.dm:61` (base game):

    /datum/job_department/assistant
    ...
    	// Don't add department_head! Assistants names should not be in bold.

`code/modules/llm_crew/crew_npc_guarding.dm:69`, the server's own answer:

    for(var/datum/job_department/department as anything in own_job.departments_list)
    	if(initial(department.department_head) == their_job.type)
    		return TRUE

## How it was found

Read from the code and the base job data. Not seen in a round: every round had one player, the Captain.

## How to fix it

1. Server: for each entry of the PDA list (`crew_npc_cargo.dm:679`) and of `people_in_view` (`crew_npc_senses.dm:191`), add `department` (the first of the job's `departments_list`, as its name) and `head_job` (that department's `department_head`'s title), from `crew_npc_job_of(person)`. A PDA entry has only text: look the job up with `SSjob.get_job(saved_job)`, which knows the alternate titles (`name_occupations` holds them).
2. Window: make `headOf`, `answersTo` and `staff()` use those fields when they are there, and fall back to `DEPARTMENTS` only when they are not.
3. Question for the owner: should the Head of Personnel's meetings take in Assistants? The game says they have no head; on a full server there may be a dozen. If yes, keep it, but on purpose: give Assistants a row of their own rather than finding them by a word.

## How to test the fix

- Type check of the window code.
- A table of cases (with `tools/llm_crew/addressing.ts` as the model): `Assistant`, `Bridge Assistant`, `Chef`, `Security Officer (Cargo)` against each head, both from the server fields and from the fallback.
