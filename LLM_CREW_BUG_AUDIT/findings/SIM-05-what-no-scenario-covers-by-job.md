---
id: SIM-05
title: What no scenario or table covers, by job, and no run is longer than 23 minutes
kind: gap
severity: medium
effort: large
confidence: likely
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:1302, tools/llm_crew/sim.ts:1306, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:353, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:225
fix: Add the scenarios listed here, most important first, each with checks that can fail, and one long scenario of an hour with power lost part way
---

## What is wrong

The simulator has 47 scenarios (the 45 in its header, plus `doorway` and `headdoor`, which are not listed: see `CHK-02`). Read against the eight job modules and the shared ones, these parts of the window code are reached by no scenario and no table of cases. Within each job the most important comes first.

**Every job**

1. **Nothing runs longer than 23 minutes.** The longest scenario is `waiting` at 1,380 seconds; most are 6 to 13 minutes (`SECONDS`, `sim.ts:1306`). A round is an hour or more. So nothing tests what only grows or only comes round late: the head's meetings after the second, `failures` back-offs that reach `RETRY_MAX_MS`, `talkLog`, `saidLately`, `toTell`, `people`, notes and memories growing over an hour, the prompt growing with them, a warrant past its 15 minutes (`KNA-14`), the brig's second prisoner, the supply shuttle's third run.
2. **Power going out.** The change log and the owner's notes say test rounds lose power about 15 minutes in, with every PDA message failing from about 26 minutes. No scenario has it: PDAs always send (`SIM-01`), the engine reading is never null, consoles and door timers always work (`SIM-04`).
3. **A body that goes down.** `awake` is always 1 and `down` always 0. No scenario has anyone knocked out, killed, cuffed by a player, or pulled away, NPC or player. `HOLE-08` (the dead counted on for ever) and `GAP-13` cannot show.
4. **A player in an NPC's job.** Only `qmgone` (a silent Quartermaster) and `engalone` (a silent Chief Engineer). No player Head of Personnel who answers, no player technician who opens the door, no player officer. `HOLE-13` cannot show.
5. **Two of one job, and none of another.** No scenario has two officers (`MULTI-01`), two engineers, two Quartermasters, or a Head of Personnel with no janitors. No scenario has a crew member whose job has no module (the plain `CREW` job in `jobs/index.ts`): an Assistant NPC.
6. **Another map.** One fixed set of 17 rooms with MetaStation's names. No scenario has a room name with an apostrophe or a number in it other than the offices, two rooms whose names contain each other (`MEM-04`), or a meeting room other than the Bar and the Staff Room.

**Security (Head of Security, officer)**

1. **Shut out of a room.** No locked room in any security scenario holds the person on a warrant: Pun Pun goes round the Bar, the Library and the Head of Personnel's office, none of them locked. So `warrant.shutOut` in `jobs/arrests.ts` (asking to be let in, `doorTries`, giving up) never runs.
2. **Forcing a door.** `jobs/forcing.ts` (security asks engineering, an engineer forces the door) never runs: there is no `force_door` in the stand-in and no room to force. The only checks are table cases in `security.ts`.
3. **Someone who walks away.** Only the `warrant` scenario moves Pun Pun, on a fixed route, every 70 seconds. Nobody runs, hides, or leaves sight mid-arrest; nobody is lost on the way to the cell (`got_away`).
4. **A warrant on a crew NPC who is not a head.** Only Pun Pun and Hop Kins (a head). A janitor or technician under arrest, its work and its meeting while in a cell, is untested.
5. **Two warrants at once**, a warrant declared aloud, the Warden or Detective (`SECT-18`), a monkey that bites while held.

**Engineering (Chief Engineer, engineer)**

1. **A map whose engine it does not know** ("I do not know this engine", `ENG-12`): table cases only.
2. **A step that fails other than "will not connect"**: no wrench, no free hand, unpowered, locked alarm.
3. **Engineering sent a door job** (`ENG-04`), **the engineer answering a call**, the engine shut down and lit again by order (`relight`) as a whole run.
4. **The reading lost** with the PDA network (`KNB-11`).

**Quartermaster**

1. **Several orders in hand at once**, from two heads; an order given while a technician already has one on the go.
2. **The Captain aboard but not as a player who answers by PDA**: no Captain in sight, or a Captain who answers face to face.
3. **A third staff meeting**, and its reports.
4. **Orders lost after placing** (`CARGO-01`: shuttle held up, never comes).

**Cargo technicians**

1. **A haul that goes wrong in any way but one**: the grip lost, someone in the way, a crate jammed in a doorway, the regrip and the put-clear (`LLM_CREW_PLAN_DROPPED_CRATES.md` says its three planned scenarios were not written because the stand-in has no crates that move).
2. **The order console or shuttle failing** (`SIM-04`).
3. **More than two technicians**, or one who is away from the post when the shuttle docks.

**Head of Personnel**

1. **A janitor who never answers the call** to the meeting, and the head that waits for it past one meeting.
2. **An order for something other than janitorial supplies and lights**.
3. **Staff it has none of**: a Head of Personnel with no janitors.

**Janitors**

1. **Water**: a bucket, a cart, a sink that runs dry, a mop wetted from a bucket (`GAP-10`); the stand-in wets a mop by holding it in a room with a sink.
2. **A mess its tool will not shift and its hands are full** (`put_down`, not in the stand-in), and the grenade (`grenade_messes` is always 0).
3. **No locator**: every janitor is given one at spawn (`hasLocator: job === 'Janitor'`).
4. **A real fire** as against an alarm pulled by hand (`real_alarm`).

## Where

`tools/llm_crew/sim.ts:1302`, the scenario chooser; `sim.ts:1306`, the run lengths:

    const SECONDS = SECURITY ? SECURITY_SECONDS : ENGINE ? 780 : VARIANT === 'qmwait' ? 560 : ... : VARIANT === 'waiting' ? 1380 : ... : 540;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:353`, the step no scenario can take:

    act: { tool: 'force_door', place: job.room, attempt: job.tries + 1 },

`jobs/arrests.ts:225`, the shut-out branch no scenario reaches:

    const shut = warrant.shutOut;

## How it was found

Read from `sim.ts` (every `spawn...` function, every `VARIANT ===` branch, and the checks), against the job modules' `plan` functions and the tables in `tools/llm_crew/`. Whether each branch is reached was judged from the scenario set-ups, not by running each scenario with coverage; `confidence` is `likely` for that reason. Bun can report line coverage (`bun test --coverage` needs a test file; a small `cov.test.ts` that imports and runs `sim.ts` would do it), and that is the way to make this list exact.

## How to fix it

1. Get a true list first: add `tools/llm_crew/cov.test.ts` that runs every scenario in one process (the simulator keeps its state in module globals, so each scenario has to run as a child process with `--coverage` and the reports merged; or run each with `bun test --coverage` and keep the per-file line counts). Write down which lines of each job module no scenario reaches.
2. Then write, in this order (each one needs the stand-in grown as `SIM-01` and `SIM-04` say):
   - `long`: the `qm` crew plus security and engineering, 75 minutes, power out at 15 minutes and PDAs failing from 26, and checks that can fail: no task in progress longer than 10 minutes, no line said more than N times, the prompt never past the budget (`llm-crew-prompt-budget`), every meeting held or called off.
   - `shutout-warrant`: Pun Pun in a locked room, the officer shut out, engineering asked and the door forced.
   - `down`: a janitor knocked out mid-clean for two minutes, and a technician killed; who notices, and who stops counting on them.
   - `player-hop`: a player Head of Personnel who answers some calls and not others.
   - `twoofficers`.
   - `hauls`: crates that catch, with someone in the way, in each haul tool.
3. Keep each scenario's checks to things that must hold, and make each check able to fail (`SIM-06` gives one that cannot).

## How to test the fix

Each new scenario must fail on purpose when the job's code is broken by hand in a scratch copy (`BRAIN=`), and pass on the real tree, ten runs in ten.
