# Crew NPC bug audit: read this first

This folder is a list of bugs and gaps found in the LLM crew NPC work, each with the way to fix it. **No crew code was changed by the audit.** It was written so that another engineer or agent can pick it up and do the fixing.

- Asked for by the owner on 2026-11-18: "find as many bugs as you can (with our alterations, not the base SS13) ... document the way that you would go about solving the bug ... if you see any glaring gaps or things we missed write that up too ... document it enough so that another agent can come in and pick up".
- Branch: `crew-bug-audit`, cut from `master` at `3e1419ed2cd` (the merge of `security-arrest`). The line numbers in the findings are for that commit.
- Made by Claude with many reviewers working at once, each given one part of the code or one line of attack. **Two models did it.** It began on Claude Fable 5.2, whose usage ran out part way; the owner switched to Claude Opus 5.5 and asked that every finding after that be marked as found by Opus. Each finding's `found_by` line says which model found it, and `checked_by` which checked it.

## Where it stands

**The audit is finished.** 523 findings were written. After duplicates, **403 bugs and 93 gaps are open**: 1 critical bug, 50 high, 243 medium and 109 low. Every critical, high and medium bug has been checked by a second reviewer, apart from 2 medium bugs written last. The low bugs and almost all the gaps have not been checked. 26 findings were marked as duplicates of others, and 1 was refuted. 141 findings were found by Claude Fable 5.2 and 382 by Claude Opus 5.5. "Progress" at the bottom says how it went.

**To look over the bugs, open `SUMMARY.md`.** It numbers every open bug, most severe first and easiest fix first within each severity, with the proposed fix under each. The gaps are listed after the bugs.

## Start here

These are the faults that matter most, grouped by what goes wrong. All of them are confirmed. In `SUMMARY.md`, number 1 is the critical bug and numbers 2 to 22 are the high bugs that are small fixes: that is the best place to begin.

1. **Every crew member's memory lives only in the brain window, and the window is easy to lose.** The game's own close-all-windows key (Home) closes it, and everyone forgets everything (`ASYNC-06`, critical, a few lines: fix this first). One thrown error for any one crew member stops every brain (`DRV-06`). Closing the window or the owner dropping off wipes all memory, and nothing says so (`HOLE-02`, a critical gap that needs your decision).
2. **The crew obey the wrong people.** Anyone with "captain" in their card's job text is obeyed as the Captain (`HOLE-01`). A PDA message with a made-up sender is taken as from the Captain or any head (`TRUST-02`). A PDA showing any security job can have an engineer pry open any door, the Armory among them (`TRUST-05`). What the model has a head say in passing is taken as that head's order (`TRUST-11`). An order a superior gave someone else is taken on as its own (`MEM-05`).
3. **Words are read too loosely.** "Do not arrest X" declares a warrant (`SECT-01`). Any line from the Captain with "free" or "let go" in it pardons (`SECT-02`). "Arrest Pun Pun in the bar" is a warrant on "Pun Pun in the" (`SECT-03`), and a warrant on a shared first name is served on anyone with it (`TRUST-06`). Any "leave" or "get out" from a head sends a crew member out (`SECT-06`, `SECT-07`). Any "no" from the Captain refuses a waiting order, and there is no way to cancel one (`QM-01`, `QM-08`, `QM-10`). "Clean the bar" is not read as a mess (`PARSE-01`).
4. **Cheats still in the code** (the owner's rule: a body acts only as a player could). Crew walk through people (`CHEAT-01`), PDAs send while off or broken (`CHEAT-14`), doors are held open by code (`KNB-04`), crates are unpacked by `forceMove` (`KNB-06`), wooden crates are opened with no crowbar (`HAND-12`), and the order book (`CHEAT-07`), mail (`CHEAT-08`), grenades (`CHEAT-09`) and tidying (`CHEAT-16`) are all done by code. `KNA-04` holds an older list, `GAP-01` the shuttle moved by code, and `GAP-07` a check script so that new ones are caught.
5. **The security officer's body goes on when it should stop.** A stunned or dead officer keeps stepping (`SEC-01`). An arrest that is called off keeps running (`SEC-03`). Letting someone go can open a cell that now holds somebody else (`SEC-05`). The prisoner is arrested twice (`TRB-03`). Being walked out of a room is taken for an attack (`ARR-02`), and a stranger who could not be reached, or a janitor being seen out, gets a trespass warrant (`API-01`, `MULTI-08`).
6. **Bodies get stuck, or shut others in.** Tidying shuts a crate or locker on a person inside it (`TRC-01`). A walk given during another walk is never walked (`CORE-01`). A janitor shut in the Head of Personnel's Office stays there all round (`LOGB-01`). A held door into an outer room is never gone through (`KNB-08`).
7. **The supply chain drops word.** Orders are placed at a dead console (`SUP-01`). A failed order is told to nobody (`CARGO-01`). A second ask for a door wipes the first (`KNA-01`). The Quartermaster stops getting word back (`CARGO-02`, `QM-14`).

## What is here

| File | What it is |
| --- | --- |
| `SUMMARY.md` | The list to read through: every open bug numbered, most severe first, easiest fix first within each, with the proposed fix under each and whether it was confirmed. Then the gaps, apart. Built by the same script as `INDEX.md`. |
| `INDEX.md` | The same list as tables, with the status, the model that found it and the place in the code, and the closed findings at the end. Built by a script, so it may be older than the findings: build it again before you trust it. |
| `findings/` | One file for each bug or gap. The top block of each holds its severity, effort, status and one-line fix. |
| `COVERAGE.md` | For each reviewer's part of the code: what it read, and what it did not get to. Where to look first if you hunt for more. |
| `FORMAT.md` | How a finding is written, what each key means, and how to mark one checked or fixed. |
| `build-index.mjs` | Builds `INDEX.md` from the findings. |
| `save.sh` | Commits this folder, on this branch only. |

Build `INDEX.md` and `SUMMARY.md` again at any time:

```
tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe LLM_CREW_BUG_AUDIT/build-index.mjs
```

(`node LLM_CREW_BUG_AUDIT/build-index.mjs` does the same if bun is not there.)

## How much to trust a finding

Each finding has a `status`:

- `found`: one reviewer wrote it up, with the code quoted. Nobody has tried to prove it wrong. Most of these are right; some will not be.
- `confirmed`: a second reviewer tried to prove it wrong and could not, and looked over the fix.
- `unsure`: the second reviewer could not settle it. The file says what is in doubt.
- `refuted`: it is not a fault. Kept so that nobody reports it again. The file says why.
- `duplicate`: the same fault as another finding, which is named.

Almost everything here was **read from the code, not seen in a round**. Where a round log or a check that was run backs a finding, the finding says so and names it.

**How hard the checks were.** 316 findings were checked, and only 1 was refuted. That is fewer than one would expect, so it was measured. The checkers did push back, but by correcting rather than refuting:

- **Severity:** changed on 36 findings, 32 of them lowered (24 from high to medium).
- **The fix:** effort changed on 87 and the one-line fix on 128.
- **The write-up:** the body was mended on 297.
- **Reasoning:** every check left a "## Check" section saying what it read and why it reached its answer, at least 532 characters and about 1,650 at the median.

The finders were told to try to prove themselves wrong before writing, and to quote the code, which may be why so few failed. Even so, "confirmed" means a second reading of the code agreed. It does not mean the fault was seen in a round.

## How to pick this up

1. Run `git status` and `git log -5`. Another session may be working in this checkout: changes that are not yours are theirs. If there are finding files that are not committed, the audit was cut off: commit them with `bash LLM_CREW_BUG_AUDIT/save.sh "Crew bug audit: findings left on disk"`.
2. Build the list again (command above) and open `SUMMARY.md` (or `INDEX.md` for the tables).
3. Take the critical bugs first, then high, then medium, then low. Within each, the list is already easiest first. Do the `confirmed` ones before the `found` ones.
4. For each finding:
   - Read its file. Open the code at the quoted lines. **The quote is the anchor: line numbers will have drifted.**
   - If its status is `found`, check it yourself before changing anything (see "When you check someone else's finding" in `FORMAT.md`). If it is wrong, set `status: refuted`, say why, and move on.
   - Read the top entry of `LLM_CREW_CHANGELOG.md` before you change crew code. That is the rule in `CLAUDE.md`.
   - Make the change the finding describes. Test it the way the finding says.
   - Set `status: fixed` and add `fixed_in: <commit>` in the finding. Add an entry at the top of `LLM_CREW_CHANGELOG.md`, saying plainly what was not tested.
5. Fix on a branch of its own, not on this one: this branch is the audit. Related findings (same function, same file) are best done together in one sitting, and the findings name each other where they touch.
6. Gaps are the owner's to decide. Do not build a gap without asking: put the question to the owner, with the finding's proposal.

## The project's rules, which every fix must keep

These come from the owner. They are also the yardstick the reviewers used.

- **No cheats.** A crew body does everything the way a player would: clicking, picking up, carrying, pulling, using a machine it is standing at. Never `forceMove`, `add_reagent`, making an item with `new`, opening a door by setting a variable, or calling a subsystem directly. If a thing is needed and not to hand, the body finds it or has it ordered through cargo. Deciding things in code (which mess next, when to call someone) is not cheating; acting on the world outside the game's rules is.
- **Code does the work; the model is only the voice.** Each job's `plan()` gives the next step and `driver.ts` carries it out. The model is asked only what to say, and which of a few routine jobs comes first. Every line the work needs has a plain fallback, so a slow or dead model cannot stall anything.
- **Senses only.** A crew member knows what its own body could see, hear or be sent. No hidden channel between them. Hand-offs between workmates are said aloud or sent by PDA.
- **An example is not the scope.** A behaviour described for one job is built as a general rule (anyone with a post behind a locked door), not for that job alone. Nothing should assume only janitors and cargo, or only MetaStation.
- **Nobody lays a hand on the Captain or a head of staff**, other than a lawful arrest.
- **Supplies come through cargo, never at spawn.** Staff tell their own head what they need. Cargo delivers nothing: crates are collected.
- **The prompt is a fixed budget.** Anything new in every prompt is paid for by trimming something else.
- **The owner decides design questions.** Where a fix needs a choice the plans do not cover, ask.

## How to check your work

| Check | How |
| --- | --- |
| Type check (window code) | From `tgui/`: `../tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe x tsc --noEmit` |
| Lint (window code) | From `tgui/`: `../tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe x biome check packages/tgui/interfaces/CrewBrain` |
| Tables of cases | `bun tools/llm_crew/security.ts`, `addressing.ts`, `engine.ts`, `reports.ts`, `book.ts` (bun is not on PATH: use the path above) |
| Simulator | `bun tools/llm_crew/sim.ts quiet <scenario>`. The scenarios are listed at the top of `sim.ts`. It is not the same every run, so run each a few times, four at a time at most. It runs the window code only: **none of the server code is run by it.** |
| Server compile, without touching a running game | `cp tgstation.dme tgstation_check.dme`, then `"/c/Program Files (x86)/BYOND/bin/dm.exe" -DCBT tgstation_check.dme` (about 80 seconds), then delete every `tgstation_check.*` file. |
| Model tests (`voice.ts`, `choose.ts`) | Only when the graphics card is free: check `nvidia-smi` first. Pass `num_ctx` 8192 as the game does. |

- **Never run the normal build while `dreamdaemon.exe` is up** (`tasklist`). A rebuilt window bundle reloads the Crew Brain window and wipes every crew member's memory in the round being played.
- On this machine a Bash heredoc eats backslashes. Use the Edit tool for any change with `\n` or `\'` in it.

## Reading round logs

Round logs are in `data/logs/YYYY/MM/DD/round-HH.MM.SS/`. The folder's date is the UTC date and its name is the local start time, so rounds begun after 18:00 local are under the next day. Line times inside are 6 hours ahead of the times the crew see.

- `crew_brain.log`: one JSON object a line. `trigger` starting `ROUTINE (no LLM)` is a coded step. It holds the model's raw replies, not what was said aloud.
- `game.log`: what each body was told to say and do, every failed walk (`walk failed (tool, to goal): reason`), and the lines each fix said to grep for.
- `pda.log`: every PDA message. `attack.log`: who hit or pulled what. `runtime.log`: server errors.
- Before blaming the brain for something after about ten minutes in, check that station power had not failed and that PDA messages were still going out (the last line of `pda.log`), and grep `game.log` for `Random Event triggering` and `fire alarm`.

## What the audit did not do

- No round was played and no model was called. Nothing here was seen in the game unless a finding names a round log.
- The fixes are proposals. None was built or tested.
- Base /tg/station code was read only where our code leans on it.
- **Not checked by a second reviewer:** the 102 low bugs, 2 medium bugs written last (by HOLE and KNA), and 79 of the 93 gaps. Their status is `found`.
- **The duplicate pass was run once.** It named 53 groups that might be one fault and merged 16 findings into others. Some repeats will be left, most likely among the low bugs and the gaps. Where two findings are related but are not one fault, each now says "See also".
- Some parts of the code were read by fewer eyes than others. `COVERAGE.md` lists, for each reviewer, what it did not get to.

## Progress

- 2026-11-18, evening: branch made, this folder set up, hunt started on Claude Fable 5.2 with 39 reviewers, each owning one part of the code or one line of attack.
- 2026-11-18, about 22:07, and again at 23:05: Fable's usage ran out. 14 reviewers had written 141 findings (24 high bugs, 1 critical gap) and were cut off part way. The other 25 never started. Nothing had been checked.
- 2026-11-19: the owner switched to Claude Opus 5.5. Every finding now carries `found_by`. A second run started on Opus: the 25 areas nobody had begun, the 14 cut off part way (each carrying on from a list of what its first reviewer had read), checks of the first run's 25 worst findings in groups that may hold the same fault twice, then one reviewer marking duplicates across the whole list.
- 2026-11-19, later: the second run was stopped by Opus's 5-hour limit. It had written 372 more findings (513 in all) and checked 65 of them: 55 confirmed, 1 refuted, 10 marked as duplicates. 47 of its 49 finders finished; HOLE and KNA did not. 12 batches of checks were cut off, and the five files they had half edited were put back as they were. The duplicate pass never started.
- 2026-11-19, third run, on Opus 5.5: HOLE and KNA carried on, and the 31 high bugs nobody had checked were checked. A reviewer named the groups across the whole list that may be one fault, and others settled each group and marked the duplicates. Then the 235 unchecked medium bugs were checked, security first.
- 2026-11-19, third run finished: all 84 of its reviewers completed. HOLE and KNA added 10 findings (523 in all). The 31 high bugs were all confirmed. Of the 235 medium bugs, 225 were confirmed and 10 found to be duplicates. Of the 53 groups named, 23 were settled: 16 findings marked as duplicates, and "See also" added where findings were related but not the same. `SUMMARY.md` and `COVERAGE.md` were written.
