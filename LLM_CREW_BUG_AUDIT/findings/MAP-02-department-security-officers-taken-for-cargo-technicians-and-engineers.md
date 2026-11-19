---
id: MAP-02
title: A security officer posted to Cargo or Engineering is taken for a cargo technician or an engineer, because job titles are matched by a bare word
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:19, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:84, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:30, tgui/packages/tgui/interfaces/CrewBrain/jobs/index.ts:21
fix: Match a title against the game's whole job titles (a list per job, alternate titles included) instead of a word inside it, and test the security-officer department titles first
---

## What is wrong

The window decides what job someone holds from the title on their ID or PDA, by looking for one word in it:

- `isTechnician`: `/cargo/i` and not Quartermaster.
- `isCargo`: `/cargo|quartermaster/i`.
- `isEngineer`: `/engineer/i` and not Chief Engineer.
- `isJanitor`: `/janitor|custodian/i`.

The game gives a security officer who chose a department a title with that department in it. `setup_department` in `code/modules/jobs/job_types/security_officer.dm` puts a department trim on the card and imprints the PDA with it, so the ID and the PDA list both read `Security Officer (Cargo)` or `Security Officer (Engineering)` (`JOB_SECURITY_OFFICER_SUPPLY`, `JOB_SECURITY_OFFICER_ENGINEERING` in `code/__DEFINES/jobs.dm`). The server sends that text as `job` for everyone in view (`person.get_assignment(...)` in `crew_npc_senses.dm:191`) and for everyone on the PDA list (`saved_job`, `crew_npc_cargo.dm:679`).

So:

- `/cargo/i` matches `Security Officer (Cargo)`. The officer is one of the Quartermaster's `technicians()` (`quartermaster.ts:183`), so the work split, a given-out order and "the other technician" can all go to a security officer. The Head of Personnel at the counter takes the first `isTechnician` person in view as the one to ask for supplies (`head.ts:950`), and the Supply checkpoint is beside the Cargo Lobby on most maps, so a cargo officer standing at the counter is the one asked. A janitor locked out of the bay asks "a technician" in view to let it in (`janitor.ts:677`).
- `/engineer/i` matches `Security Officer (Engineering)` (the word "Engineering" has "engineer" in it). The officer is one of `engineersAboard` (`engineering.ts:45`). With no Chief Engineer aboard, a door that security wants forced is sent by PDA to `engineersAboard(brain)[0]` (`forcing.ts:163`), which can be the officer.
- The same bare words also catch the game's other titles: "Engineering Response Officer" and "Visiting Engineer" are engineers, "Janitorial Response Officer" is a janitor, and `jobFor` would give an NPC with any of them that job's whole duties (JANITOR is first in `JOBS`).

Concrete case: a round with other players. A player joins as a security officer with the Supply department preference. Their PDA lists them as `Security Officer (Cargo)`. The NPC Quartermaster holds its first meeting, deals the standing work with `dutiesFor(technicians(brain))`, and gives the officer "the rooms" or "the shuttle". The officer never does it. Orders the Quartermaster gives that officer are given again and again (see QM-02 for the retry with no end).

Only a player gets a department title today: NPC officers are dressed with `/datum/outfit/job/security` and have no client, so `setup_department` reads no preference. But the owner wants a whole station, and players will share it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19`:

    export function isTechnician(title: string): boolean {
      return /cargo/i.test(title) && !isQuartermaster(title);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:19`:

    export function isEngineer(title: string): boolean {
      return /engineer/i.test(title) && !isChiefEngineer(title);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:84`:

    export function isCargo(title: string): boolean {
      return /cargo|quartermaster/i.test(title);
    }

`code/modules/jobs/job_types/security_officer.dm`, `setup_department` (base game):

    if(dep_trim)
    	var/obj/item/card/id/worn_id = spawning.get_idcard(hand_first = FALSE)
    	SSid_access.apply_trim_to_card(worn_id, dep_trim)
    	...
    	pda.imprint_id(spawning.real_name, assignment)

`code/datums/id_trim/jobs.dm`:

    /datum/id_trim/job/security_officer/supply
    	assignment = JOB_SECURITY_OFFICER_SUPPLY

## How it was found

Read from the code, the window side and the base game's officer setup. Not seen in a round: every round so far had one human player, the Captain.

## How to fix it

1. In `hierarchy.ts`, give each department's jobs as whole titles, with the alternate titles the game has (`Security Officer (Medical)`, `(Engineering)`, `(Science)`, `(Cargo)` under Security; `Chef` under Service). Add one helper, `titleIs(title, job)`, that is true when the title equals the job, or equals one of its alternates, ignoring case and spaces at the ends. Keep the "Custodian" and "Senior Janitor" dressing the comment at `isJob` speaks of by listing them as alternates, not by `includes`.
2. Rewrite `isTechnician`, `isCargo`, `isEngineer`, `isJanitor`, `isOfficer`, `isQuartermaster`, `isChiefEngineer`, `isHeadOfSecurity`, `isHeadOfPersonnel` on `titleIs`. `isOfficer` must stay true for the four department titles.
3. Where a title is edited by hand on an ID (the HoP's console lets anyone type any assignment), it will match nothing; that is the right answer, and the person is crew with no known job.
4. Add a table of cases in `tools/llm_crew/` (beside `addressing.ts`) with each title in `code/__DEFINES/jobs.dm` and the job each predicate should give.

## How to test the fix

- Type check and lint of the window code.
- The new table: `Security Officer (Cargo)` is an officer and not a technician; `Security Officer (Engineering)` is an officer and not an engineer; `Cargo Technician`, `Station Engineer`, `Chief Engineer`, `Quartermaster` give what they give now.
- Simulator: add a player-held `Security Officer (Cargo)` to the PDA list in a Quartermaster scenario and check that no duty or order goes to them.
