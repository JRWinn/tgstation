---
id: JOBS-01
title: A department security officer, Security Officer (Cargo) or (Engineering), is taken for a cargo technician or a station engineer
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:84, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:19, tgui/packages/tgui/interfaces/CrewBrain/jobs/index.ts:21, code/modules/llm_crew/crew_npc_senses.dm:191, code/modules/jobs/job_types/security_officer.dm:41
fix: Send each person's base job title from the server (crew_npc_job_of(person).title) beside the ID assignment and match jobs on that, or failing that strip a trailing bracketed department before matching
---

## What is wrong

The window tells jobs apart by testing the title on an ID with a loose regular expression. Two of them catch a title the game itself gives a security officer:

- `isCargo` is `/cargo|quartermaster/i` and `isTechnician` is `/cargo/i && !isQuartermaster`. A security officer posted to Supply has the ID title **"Security Officer (Cargo)"** (`JOB_SECURITY_OFFICER_SUPPLY` in `code/__DEFINES/jobs.dm:71`). Both tests are TRUE for it.
- `isEngineer` is `/engineer/i && !isChiefEngineer`. An officer posted to Engineering has **"Security Officer (Engineering)"** (`JOB_SECURITY_OFFICER_ENGINEERING`). "engineer" is inside "Engineering", so the test is TRUE.

These are not made-up titles. They are the `alternate_titles` of the Security Officer job, and `setup_department` in `security_officer.dm` writes them onto the officer's ID and PDA whenever a player has a department set in their preferences (it is a common preference). The server sends the ID assignment as the person's job: `person.get_assignment(...)` in `crew_npc_senses.dm:191` for people in view, and `computer.saved_job` for the PDA list (`crew_npc_cargo.dm:679`), which `imprint_id(..., assignment)` set to the same title.

So a player who joins as a security officer posted to Cargo is, to every crew NPC:

- **one of the Quartermaster's technicians.** `technicians()` in `quartermaster.ts:183` lists them, so the Quartermaster can hand them an order face to face ("Sam, order 3: ...") and wait on it (see QM-02 for what happens to an order given to someone who never answers). `staff()` in `head.ts:183` lists them as the Quartermaster's staff for its meetings.
- **the technician at the counter.** `planPickups` asks `brain.peopleInView.find((person) => isTechnician(person.job))`. Someone sent for a crate who sees the officer at the cargo checkpoint window, or in the lobby, asks the officer for the crate, every minute (CARGO-13), and never gets it.
- **cargo staff, not crew.** The counter turns them away when they come for something: `cargo.ts:2224` takes a crate collection only from `!isCargo(theirJob)` and `cargo.ts:2189` sends an order to the Quartermaster only for `!isCargo(speakerJob)`. `seenInside` (`cargo.ts:1191`) never counts them as a visitor shut in a room, and `cargo.ts:1153` counts them as a workmate at the post.
- **word from cargo.** `pickupsOverhear` takes "is lost" from anyone `isCargo` and ends the errand; `head.ts:1242`, `1257` and `1266` and `janitor.ts:804` and `888` take PDA messages from them as from cargo.

And an officer posted to Engineering is, to the Chief Engineer and the engineer, one of the engineers: `engineersAboard` (`engineering.ts:49`), the lines read in `chiefengineer.ts:655` and `678`, and the door-forcing messages in `forcing.ts:242`, `256` and `272`.

A rarer case of the same kind: the wizard's "RPG Titles" event (`code/modules/events/wizard/rpgtitles.dm`) rewrites every living player's ID assignment to the job's `rpg_title`. The Captain's card then no longer says "Captain", so `isJob(toTitle, 'Captain')` in `hierarchy.ts` and every `/captain/i` test stop seeing the Captain at all. The base-title fix below covers that too.

The same would happen to an NPC body itself if it were ever given a departmental trim, because `jobFor` takes the first job whose `is` matches and `CARGO` and `ENGINEER` come before `OFFICER` in `JOBS` (`index.ts:21`). NPCs are spawned from an outfit (`crew_npc_spawn.dm:35`), with no department, so today this only bites through other people's titles.

One concrete case: the Captain (the player) and a second player who joins as a security officer with "Supply" as their department. Their ID reads "Security Officer (Cargo)" and they start at the cargo checkpoint, next to the Cargo Lobby. The NPC janitor is sent for crate #12. At the counter `planPickups` finds the officer first in `peopleInView` and says "Ann, I am here to collect crate 12 for Hop Kins, please." The technicians in the bay hear it as said to someone else (`said_to === 'other'`) and leave it. The janitor asks the officer again every minute.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:19`:

    export function isTechnician(title: string): boolean {
      return /cargo/i.test(title) && !isQuartermaster(title);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:84`:

    export function isCargo(title: string): boolean {
      return /cargo|quartermaster/i.test(title);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:19`:

    export function isEngineer(title: string): boolean {
      return /engineer/i.test(title) && !isChiefEngineer(title);
    }

`code/modules/jobs/job_types/security_officer.dm:41` (base game):

    alternate_titles = list(
        JOB_SECURITY_OFFICER_MEDICAL,
        JOB_SECURITY_OFFICER_ENGINEERING,
        JOB_SECURITY_OFFICER_SUPPLY,
        JOB_SECURITY_OFFICER_SCIENCE,
    )

and `setup_department` in the same file, which applies `/datum/id_trim/job/security_officer/supply` (assignment `JOB_SECURITY_OFFICER_SUPPLY`) to the ID and re-imprints the PDA with it.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/index.ts:21`: `CARGO` and `ENGINEER` are listed before `OFFICER`, so the first match wins for a title that has both.

## How it was found

Read from the code: the regular expressions, every caller found by grepping for `isCargo(`, `isTechnician(` and `isEngineer(`, and the base-game job, trim and define files. Not seen in a round: no round with a second player has been played.

## How to fix it

1. Server (`crew_npc_senses.dm:191`, the PDA list in `crew_npc_cargo.dm:679`, and the NPC's own `job` in `crew_brain_link.dm:89`): send the base job title beside the ID title, from `crew_npc_job_of(person)?.title` (it already resolves the trim's job, and `SSjob.get_job` maps every alternate title to its job). For the PDA list, `SSjob.get_job(saved_job)?.title`. Call the field `job_title`, and leave `job` as it is, since the prompt and the lines spoken use the title as it is written on the ID.
2. Window: carry `job_title` on `PersonInView`, on `pdaPeople`, and on `brain` (`brain.jobTitle`), and make `isCargo`, `isTechnician`, `isQuartermaster`, `isEngineer`, `isChiefEngineer`, `isOfficer`, `isHeadOfSecurity`, `isJanitor`, `isHeadOfPersonnel` and `jobFor` test that, falling back to `job` when it is empty (a custom title the HoP typed, a card with no trim).
3. If the server change is not wanted, a smaller window-only step: in each of those tests, first drop a bracketed department from the end (`title.replace(/\s*\([^)]*\)\s*$/, '')`), and anchor the cargo and engineer tests to the title's start (`/^cargo\b/i`, `/\bengineer\b/i` after the strip). That fixes the four department officers but no other alternate title a later base-game change adds.
4. Keep `QUARTERMASTER` before `CARGO` and `CHIEF_ENGINEER` before `ENGINEER` in `JOBS`: with base titles that order still matters for custom ones.

Owner question: should an officer posted to Cargo be let into the bay like cargo staff (their ID opens it), or treated as any other visitor? The fix above treats them as security, which is what the game says they are.

## How to test the fix

- A small table of cases, in the style of `tools/llm_crew/addressing.ts`: `isTechnician('Security Officer (Cargo)')` FALSE, `isCargo('Security Officer (Cargo)')` FALSE, `isEngineer('Security Officer (Engineering)')` FALSE, `isOfficer('Security Officer (Engineering)')` TRUE, `jobFor('Security Officer (Cargo)') === OFFICER`, and the ordinary titles unchanged.
- Simulator: a `pickup` scenario with a person titled "Security Officer (Cargo)" standing in the lobby before the technician; the collector must ask the technician.
- Type check and compile. In a round with a second player set to a security department, grep `game.log` for the collector's "here to collect crate" line and check whose first name begins it.
