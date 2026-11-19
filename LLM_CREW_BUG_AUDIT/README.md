# Crew NPC bug audit: read this first

This folder is a list of bugs and gaps found in the LLM crew NPC work, each with the way to fix it. **No crew code was changed by the audit.** It was written so that another engineer or agent can pick it up and do the fixing.

- Asked for by the owner on 2026-11-18: "find as many bugs as you can (with our alterations, not the base SS13) ... document the way that you would go about solving the bug ... if you see any glaring gaps or things we missed write that up too ... document it enough so that another agent can come in and pick up".
- Branch: `crew-bug-audit`, cut from `master` at `3e1419ed2cd` (the merge of `security-arrest`). The line numbers in the findings are for that commit.
- Made by Claude with many reviewers working at once, each given one part of the code or one line of attack. **Two models did it.** It began on Claude Fable 5.2, whose usage ran out part way; the owner switched to Claude Opus 5.5 and asked that every finding after that be marked as found by Opus. Each finding's `found_by` line says which model found it, and `checked_by` which checked it.

## Where it stands

**State as of the last update of this file: the hunt is running. See "Progress" at the bottom, which is updated as each stage ends.** If "Progress" stops short, the session ran out before it finished: the findings already on disk are still good, and "How to pick this up" below says what to do.

## What is here

| File | What it is |
| --- | --- |
| `INDEX.md` | The list: bugs by severity, easiest fix first, with the proposed change beside each. Then the gaps. Built by a script, so it may be older than the findings: build it again before you trust it. |
| `findings/` | One file for each bug or gap. The top block of each holds its severity, effort, status and one-line fix. |
| `FORMAT.md` | How a finding is written, what each key means, and how to mark one checked or fixed. |
| `build-index.mjs` | Builds `INDEX.md` from the findings. |
| `save.sh` | Commits this folder, on this branch only. |

Build the list again at any time:

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

## How to pick this up

1. Run `git status` and `git log -5`. Another session may be working in this checkout: changes that are not yours are theirs. If there are finding files that are not committed, the audit was cut off: commit them with `bash LLM_CREW_BUG_AUDIT/save.sh "Crew bug audit: findings left on disk"`.
2. Build the list again (command above) and open `INDEX.md`.
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

## Progress

- 2026-11-18, evening: branch made, this folder set up, hunt started on Claude Fable 5.2 with 39 reviewers, each owning one part of the code or one line of attack.
- 2026-11-18, about 22:07, and again at 23:05: Fable's usage ran out. 14 reviewers had written 141 findings (24 high bugs, 1 critical gap) and were cut off part way. The other 25 never started. Nothing had been checked.
- 2026-11-19: the owner switched to Claude Opus 5.5. Every finding now carries `found_by`. A second run started on Opus: the 25 areas nobody had begun, the 14 cut off part way (each carrying on from a list of what its first reviewer had read), checks of the first run's 25 worst findings in groups that may hold the same fault twice, then one reviewer marking duplicates across the whole list.
- 2026-11-19, later: the second run was stopped by Opus's 5-hour limit. It had written 372 more findings (513 in all) and checked 65 of them: 55 confirmed, 1 refuted, 10 marked as duplicates. 47 of its 49 finders finished; HOLE and KNA did not. 12 batches of checks were cut off, and the five files they had half edited were put back as they were. The duplicate pass never started.
- 2026-11-19, third run, on Opus 5.5: HOLE and KNA carry on; the 31 high bugs nobody had checked are checked; a reviewer names the groups across the whole list that may be one fault, and others settle each group and mark the duplicates; then the 235 unchecked medium bugs are checked, security first, for as long as the usage lasts. Low bugs and gaps are not checked in this run.
