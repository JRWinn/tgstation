---
id: GAP-22
title: Tests the plans promised and never wrote or ran, no server code is ever exercised, the model has never been asked the new questions, and two scenarios fail by chance
kind: gap
severity: medium
effort: large
confidence: sure
status: found
area: tools
files: tools/llm_crew/sim.ts:1, tools/llm_crew/voice.ts:1, LLM_CREW_PLAN_NO_CHEATS.md:193, LLM_CREW_PLAN_ROUND_0912.md:262, LLM_CREW_PLAN_DROPPED_CRATES.md:36
fix: Write the scenarios the plans list as the fixes for them are built, run the model cases once with the card free, pin the simulator's randomness so a failing run can be replayed, and add a checklist round for server code
---

## What is wrong

Every plan ends with a list of checks, and every change log entry says which were done. Read together, the same four holes run through all of them.

**1. Nothing ever runs the server code but a round.** The simulator "plays the server by hand" for the window code. Every change log entry since 13:30 says, in these words or near them: "The simulator runs none of the server code, so [the list] are compile-checked only." That covers every click, pull, door, locker, baton, cuff, cell, bucket, crate and machine. In `round-19.33.50` and after, each server-side fix needed a played round to find the next fault in the same proc (the baton: five entries, five rounds). The owner tests by playing, and each round costs a quarter of an hour and one fault.

**2. The real model has never been asked the new questions.** Listed as not done, and still not done by any later entry:

- the question that has the LLM read a loose order (16:50 entry: "has never been put to a real model"), which is the one place a model's answer becomes an order;
- every security line (14:15: "The new lines have no cases in `tools/llm_crew/voice.ts`"), every later security entry: "No model tests";
- the Quartermaster's lines (Quartermaster plan, "Not built: voice cases against the real model");
- the dropped-crate lines (dropped crates plan, "Not built: voice cases on the real model for the new lines");
- the remark at a meeting, word for word moment (meeting follow-ups plan: "The remark on the real model: not done");
- the two cases the no-cheats plan names (step 12: "an order asked for at the door, and 'have you called anyone?'");
- the locked-areas voice facts ("the new voice cases have not been run against the model").

**3. Scenarios the plans list and nobody wrote.**

| Plan | Scenarios |
| --- | --- |
| No cheats, section 5 step 11 | A technician walks in and out of the Delivery Office; a head orders while someone is knocking; the second technician says who was called; a janitor runs dry in a locked room, leaves, comes back and is let in; a janitor with a bucket, with a cart, with neither; the sink runs dry with three janitors; an order runs with the technician held up between the two presses; a door shuts before the person is through |
| 09:12 round, section 5 | A janitor with two rooms where the clean fails; a meeting call the staff do not hear; the Captain's "place that order" while an order waits; the Quartermaster's own crate told of by PDA; "I cannot shift it" between janitors and a technician. Status: "Not built: the simulator scenarios in section 5" |
| Dropped crates | `regrip`, `putclear`, `shutaboard`: "the simulator ... has no crates that move, so they would test nothing" |
| Security entries | "No scenario has security shut out of a room" (16:50, 18:05), "no scenario has a monkey that bites with its teeth" (19:38), the walk broken off when someone comes into sight (15:40), "the simulator has no door to force" (18:50), no room big enough for people to be out of each other's sight (17:35) |
| 13:30 and 15:00 entries | "No new simulator scenarios" for door names, the bucket, the next door opened unasked, an order given again, marked squares, kinds of mess, the shuttle called for empties |

**4. Two scenarios fail by chance, and a failure is waved through.** `aside` "failed 1 run in 4 on this code and 2 in 4 on a clean copy" (14:15), `nested` "3 of 7 with, 3 of 6 on a clean copy" (meeting follow-ups), `qm` with a chatty LLM "failed one check ... and passed three times out of three when run again: I take it for chance, and have not proved that" (18:05). The audit's own README says the simulator "is not the same every run, so run each a few times". A check that fails one time in four on good code cannot catch a fault that shows one time in four, and three change log entries in a row accepted a red run on that ground. Lint is in the same state: "Lint still reports the folder's old formatting findings" (13:30).

And nothing runs any of it but a person: `tools/llm_crew/` is not in any workflow under `.github/workflows/`.

One case of what this costs: the fix for the baton drawn with full hands (20:53) was "compile-checked only", for a fault whose cause "is not known". If it is wrong, the next round with a warrant shows it, the officer goes down again, and that round is spent.

## Where

`tools/llm_crew/sim.ts` (2005 lines): the scenario list is at its top. `tools/llm_crew/voice.ts:1`: "What the real model does with the one job it has left: talking." `LLM_CREW_BUG_AUDIT/README.md`, "How to check your work".

## How it was found

Read from the Status sections of all eleven plans and the "Tested" and "Not built" lines of every change log entry. `sim.ts` and `voice.ts` were not read beyond their headers, and nothing was run, by the audit's rules.

## How to fix it

1. **Make a red run mean something (medium, do first).** Give `sim.ts` a seed: one seeded random source for the stand-in LLM's chatter and every `stagger`, printed at the start of a run and taken from `SEED=`. A failing run can then be replayed and bisected. Then find why `aside` and `nested` fail on clean code (both are timing checks, by the entries: the limit may simply be too tight for the driver's 20-second back-off) and either mend the cause or widen the check with the reason written beside it. Until then, the rule in the change log header should be: a scenario that fails is run ten times and the count is written down.
2. **Write each missing scenario with its fix.** The table above is the list. Do not write them ahead of the fixes: most need the fake server to grow (a console that can be dead, a door that shuts itself, water amounts, a cart, a second room in sight). Each finding in this audit names its scenario.
3. **Model cases, once (small, needs the graphics card free).** Add to `tools/llm_crew/voice.ts`: the reading question with ten loose orders and five lines that are not orders (the pass mark is no false warrant, since a false "neither" only costs "I did not follow that"); six security moments (told of a warrant and then greeted by the person it is on; asked to follow); three Quartermaster moments; the two no-cheats cases. Keep the run in `tools/llm_crew/runs/` as `before.json` was.
4. **A server checklist round (small, a document).** Since only a round runs server code, make the round cheap: one page, `tools/llm_crew/ROUND_CHECKS.md`, listing every "what to grep for next round" line from the change log by feature, with the admin steps that set each up (declare a warrant, cut an APC, pull an alarm, break a tube). After a round, one script greps `game.log`, `pda.log` and `runtime.log` for each and prints seen or not seen. The grep lines already exist at the foot of each entry: this only gathers them.
5. **Longer term, the owner's call:** DM unit tests exist in this codebase (`code/modules/unit_tests/`). A few for the crew's pure procs (`crew_npc_doors_of`, `crew_npc_door_label`, `orderable_crates`, `crates_wanted`, `crew_npc_alarm_was_pulled` until it is deleted) would run in the normal test build with no round. It touches the base game's test list, so ask first.

## How to test the fix

- Step 1: the same `SEED` gives the same transcript twice. `aside` and `nested` pass 20 of 20 on a clean copy.
- Step 3: the kept run, read by a person.
- Step 4: run the script on `data/logs/2026/11/19/round-20.43.32` and check it finds "to draw its baton" absent and "with its baton" present.
