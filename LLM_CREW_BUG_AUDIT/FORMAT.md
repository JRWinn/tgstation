# How a finding is written

Every bug or gap found in the audit is one file in `LLM_CREW_BUG_AUDIT/findings/`. One file, one fault. This page says how to write one, and it is the rule for everyone who adds to the audit.

## What counts

- **In scope:** our own work. `code/modules/llm_crew/`, `tgui/packages/tgui/interfaces/CrewBrain/`, `tools/llm_crew/`, and the three base-game edits we made (`code/game/objects/structures/plasticflaps.dm`, `code/modules/mob/living/carbon/human/human_defense.dm`, the includes in `tgstation.dme`).
- **Out of scope:** bugs in base /tg/station that our code does not touch or trip over. If our code relies on a base proc and gets its behaviour wrong, that is our bug and it is in scope.
- **Not a finding:** style, naming, formatting, "could be cleaner". Only things that make the crew do the wrong thing, stop, crash, cheat, or mislead whoever reads the logs or tests.
- **A gap** is something missing rather than broken: planned and not built, half built, or never thought of. Write it the same way, with `kind: gap`.

## File name and number

`findings/<PREFIX>-<NN>-<a-few-words>.md`, for example `findings/SEC-03-baton-not-drawn-with-full-hands.md`.

- `PREFIX` is the one you were given. Use no other.
- `NN` counts from 01 in the order you find them. Never reuse a number.
- Write the file **as soon as you are sure of the fault**, before you look for the next one. Work that is only in your head is lost if the session ends.

## The file

Copy this shape exactly. The top block is read by a script: keep each key on one line, plain text, no quotes, no colons inside the title or fix line (use a comma or a dash).

```
---
id: SEC-03
title: An officer holding two things can never draw its baton
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:412
fix: Put one held thing down in drop_for_weapon before the baton is taken out
---

## What is wrong

What the crew does, and what it should do. Then one concrete case: the state it starts in, what happens step by step, and the wrong result. Name real functions and real values.

## Where

`code/modules/llm_crew/crew_npc_security.dm:412`, in `draw_item`:

    the few lines of code that show it, copied exactly

Add the other places that matter (callers, the base proc it relies on) the same way.

## How it was found

One of: read from the code / seen in a round log (name the folder and quote the line) / a check or script that was run (say the command and what it printed). Say plainly what was not seen. "Read from the code, not seen in a round" is the usual truth.

## How to fix it

Numbered steps another engineer could follow without you: which function, what to change, what existing helper to use, what must keep working. If there are two ways, say which you would take and why. If the fix needs the owner to decide something, say what the question is.

## How to test the fix

The simulator scenario or table of cases to run or add (`tools/llm_crew/`), the compile or type check, and what to look for in `game.log` or `pda.log` in the next round.
```

### The keys

| Key | Values | Meaning |
| --- | --- | --- |
| `kind` | `bug`, `gap` | Broken, or missing. |
| `severity` | `critical`, `high`, `medium`, `low` | See below. |
| `effort` | `small`, `medium`, `large` | small: under about 20 lines in one file. medium: one part of the code, under about 100 lines. large: a design change, or both the server and the window. |
| `confidence` | `sure`, `likely`, `guess` | How sure the finder is. `sure` means the code was read end to end and the fault cannot be avoided. |
| `status` | `found`, `confirmed`, `refuted`, `unsure`, `duplicate`, `fixed` | `found`: written up, nobody has checked it. `confirmed`: a second reviewer tried to prove it wrong and could not. `refuted`: it is not a fault, and the file says why. `unsure`: the second reviewer could not settle it. `duplicate`: the same fault as another file, named in a `duplicate_of:` line. `fixed`: done, with the commit named in the file. |
| `found_by` | `Fable 5.2`, `Opus 5.5` | The model that found it. The audit began on Claude Fable 5.2, which ran out of usage part way; the owner switched to Claude Opus 5.5 and asked that every finding after that be marked as found by Opus. |
| `checked_by` | `Opus 5.5` | Added by whoever checks it: the model the second reviewer ran on. Left out until it is checked. |
| `duplicate_of` | an id | Only when `status: duplicate`: the finding that keeps the write-up. |
| `area` | one word | security, doors, supply, hands, cleaning, core, senses, brain, driver, memory, cargo, quartermaster, head, janitor, engineering, tools, logs, design |
| `files` | paths with line numbers, commas between | The first is the main place. |
| `fix` | one sentence | The proposed change, short enough for a table. |

### Severity

- **critical:** a runtime error in code that runs often, a body or the whole crew stops working for the rest of the round, the window hangs or loses its memory, or the server hangs.
- **high:** a job fails or loops for good in a case that will come up in most rounds. Or the no-cheats rule is broken. Or the wrong person is acted on.
- **medium:** wrong behaviour in a case that comes up less often, or one a player would notice while the work still gets done.
- **low:** wording, noise in the logs, dead code, a test or tool that misleads.

## Rules for the write-up

1. **Quote the code.** Give the file and line, and copy the lines. Line numbers drift: the quote is what the next person searches for.
2. **Give one concrete case.** "If X is null this breaks" is not enough. Say how X comes to be null in a round.
3. **Try to prove yourself wrong before you write.** Read the callers. Read the base-game proc you are relying on (it is in this repo under `code/`). If a guard elsewhere stops the fault, it is not a finding.
4. **Check it is not already known.** Search `LLM_CREW_CHANGELOG.md` and `LLM_CREW_PLAN_*.md` for the function name and a key word. If it is listed there as known and not fixed, write it up only if you can add the cause or the fix, and say where it is listed.
5. **Say how sure you are and what you did not check.** Read from the code is not the same as seen in a round.
6. **Plain words, short sentences**, the way `LLM_CREW_CHANGELOG.md` is written. Say what the crew does, not what the abstraction is.
7. **The fix must keep the project's rules** (see `README.md` in this folder): no cheats, the code does the work and the model only talks, a dead model must not stall the work, and new behaviour is general rather than tied to one job or one map.

## When you check someone else's finding

Assume it may be wrong. Open the code at the quote and make sure the quote is still what the code says. Look for the guard, the caller, or the base-game behaviour that makes the fault impossible. Judge the fix as well: would it work, would it break something else, does it keep the rules. Then:

- set `status:` to `confirmed`, `refuted` or `unsure`, and add a `checked_by:` line under `found_by:` naming the model you run on;
- correct `severity`, `effort` and `fix` if they are wrong, and mend the write-up where it is wrong;
- add a last section, `## Check`, saying what you read or ran and why you reached that answer. For `refuted`, name the line that makes it impossible.

## When you fix one

Follow the rule in `CLAUDE.md`: read the top entry of `LLM_CREW_CHANGELOG.md` first, and add an entry when you are done. Then set `status: fixed` in the finding, add a line `fixed_in: <commit>` under it, and run `build-index.mjs` again.
