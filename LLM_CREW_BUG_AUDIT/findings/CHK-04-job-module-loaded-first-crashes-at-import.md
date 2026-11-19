---
id: CHK-04
title: Loading any job's file before the rest of the window code throws at import, because jobs/index.ts builds its list while the jobs are still loading
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/index.ts:21, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:15, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:18
fix: Build the JOBS list the first time jobFor is called, not when jobs/index.ts is loaded
---

## What is wrong

The window code has a circle in what loads what. Each job's file (`jobs/janitor.ts`, `jobs/cargo.ts` and the other six) imports `../tasks`. `tasks.ts` imports `./jobs` for `jobFor`. `jobs/index.ts` imports all eight job files and, **as it loads**, puts their exported objects in an array:

    const JOBS: Job[] = [JANITOR, QUARTERMASTER, CARGO, ...];

That is fine when something else is loaded first (`brain.ts`, `tasks.ts`, `memory.ts`): by the time the array is built, every job file has finished. It is not fine when a job file is the first thing loaded. Then the job file is half way through its own imports, `jobs/index.ts` runs, reads that job's export before it exists, and the whole load throws.

The concrete case, as run. A one-line script that does `await import('<abs path>/CrewBrain/jobs/janitor.ts')` and nothing else:

    jobs/cargo.ts: THROWS Cannot access 'CARGO' before initialization.
    jobs/chiefengineer.ts: THROWS Cannot access 'CHIEF_ENGINEER' before initialization.
    jobs/engineer.ts: THROWS Cannot access 'ENGINEER' before initialization.
    jobs/head.ts: THROWS Cannot access 'HEAD_OF_PERSONNEL' before initialization.
    jobs/headofsecurity.ts: THROWS Cannot access 'HEAD_OF_SECURITY' before initialization.
    jobs/janitor.ts: THROWS Cannot access 'JANITOR' before initialization.
    jobs/officer.ts: THROWS Cannot access 'OFFICER' before initialization.
    jobs/quartermaster.ts: THROWS Cannot access 'QUARTERMASTER' before initialization.

All the other 37 files of the folder load by themselves without error.

Nothing trips on this today. The game's window starts from `index.tsx`, whose first import of ours is `./brain`, and every tool in `tools/llm_crew/` loads `fixtures.ts` (which loads `memory` and `tasks`) or `brain` first. So this is a trap, not a fault in a round. It is written up because of what springs it:

- A new table of cases that starts `const { JANITOR } = await import(ROOT + 'jobs/janitor')` without going through `fixtures.ts` dies on its first line with an error that says nothing about why. `tools/llm_crew/engine.ts` and `book.ts` already import job files directly; they are saved only by importing `./fixtures` on the line before.
- In the window, a new import of a job file placed ahead of `./brain` in `index.tsx` (or in anything `index.tsx` imports before it: `Details.tsx` and `colors.ts` come after today) would do the same in the bundle. The window would then fail to load at all: no brain for any crew member, every body idle for the round, and the only sign a script error in the tgui window. That would be a critical fault from a one-line change that the type check and the lint both pass.

It was checked that the formatter's import sorting does **not** spring it: the folder was copied outside the repo, `biome check --write` was run on the copy (27 files changed, imports sorted in `brain.ts`, `driver.ts`, `tasks.ts` and others), and the same 37 files still loaded and the same 8 still threw. So `bun run tgui:fix` is safe on this count.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/index.ts:6` and `:21`:

    import { CARGO } from './cargo';
    import { CHIEF_ENGINEER } from './chiefengineer';
    import { ENGINEER } from './engineer';
    import { HEAD_OF_PERSONNEL } from './head';
    import { HEAD_OF_SECURITY } from './headofsecurity';
    import { JANITOR } from './janitor';
    ...
    const JOBS: Job[] = [
      JANITOR,
      QUARTERMASTER,
      CARGO,
      HEAD_OF_PERSONNEL,
      CHIEF_ENGINEER,
      ENGINEER,
      HEAD_OF_SECURITY,
      OFFICER,
    ];

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:15`:

    import { jobFor } from './jobs';

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:18` (and the same in the other seven):

    } from '../tasks';

## How it was found

A check that was run: every `.ts` file in `CrewBrain/` and `CrewBrain/jobs/` was imported by itself, each in a fresh bun process, from a throwaway script in the temp folder. The output is quoted above. The bundle the game loads (rspack) was not built or run, so the claim about `index.tsx` is read from how module loading works, not seen.

## How to fix it

1. In `jobs/index.ts`, do not read the job objects at load time. Replace the `const JOBS` array with a function that builds it on first use:

       let jobs: Job[] | null = null;
       function allJobs(): Job[] {
         jobs ??= [JANITOR, QUARTERMASTER, CARGO, HEAD_OF_PERSONNEL, CHIEF_ENGINEER, ENGINEER, HEAD_OF_SECURITY, OFFICER];
         return jobs;
       }

   and have `jobFor` use `allJobs().find(...)`. Keep the order and the comment about why the Quartermaster comes before cargo and the Chief Engineer before the engineer.
2. Check that no job file calls `jobFor` while it is loading (at the top level of the file, outside any function). A search for `jobFor(` in `jobs/*.ts` and a look at each hit is enough: all the uses seen in this audit were inside functions.
3. Nothing else changes: no behaviour, no prompt, nothing on the server.

## How to test the fix

- The same sweep: import each file of the folder by itself with bun. All 45 must load.
- The type check from `tgui/`, the five tables, and two or three simulator scenarios (`quiet crew`, `quiet qm`, `quiet warrant`) to see `jobFor` still gives each title its job, the Quartermaster and the Chief Engineer in particular.
