---
id: SIM-06
title: Two janitor checks run in every scenario and pass where there are no janitors, and a tool the stand-in does not know is never a failure
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:1391, tools/llm_crew/sim.ts:1395, tools/llm_crew/sim.ts:1052
fix: Run the two janitor checks only when there are janitors, and count every tool call that reaches the default case as a failed check
---

## What is wrong

Two checks in the report run for every scenario, with no guard on whether the scenario has any janitors:

    const janitors = crew.filter((body) => body.job === 'Janitor');
    check('every janitor ends with something to clean with', janitors.every(...), ...);
    ...
    check('no janitor keeps walking at a room it cannot get into', bayTries.every((tries) => ...), ...);

`[].every(...)` is true, so in the engine, security (other than `warrant`), Quartermaster desk, `rounds`, `bydoor`, `waiting`, `mixed` and `lost` scenarios these print `ok` for nothing. As run, `sim.ts quiet engine` prints them as its first two lines:

    ok   every janitor ends with something to clean with
    ok   no janitor keeps walking at a room it cannot get into  tries at the Cargo Bay: 

In a scenario of 19 checks, two are always green. Whoever reads "all passed" with a count, or compares the number of `ok` lines between two runs, is misled; and the day someone adds a janitor-free scenario on purpose to see a janitor fault, these checks will say it passed.

Second, the stand-in answers any tool it does not know with "Your body does not know how to do that." (`default:` in `toolCall`), and nothing counts those. The window sends five real tools the stand-in does not have (`force_door`, `rest`, `put_down`, `give`, `grenade`: see `SIM-04`), and a misspelled tool name in a job's `plan` would be answered the same way. Either would show only as a body that quietly fails a step and backs off, and the run would pass. In the real game the server answers an unknown tool with `tool: null` and the same words (`crew_npc_tools.dm:14`), so the window's `noteResult` does not even match it to the step; the step is then failed by `LOST_ACT_MS` twelve seconds later. Neither side notices a typo.

## Where

`tools/llm_crew/sim.ts:1391` and `:1395`, quoted above.

`tools/llm_crew/sim.ts:1052`:

    default:
      return result(body, tool, false, 'Your body does not know how to do that.');

`code/modules/llm_crew/crew_npc_tools.dm:13`:

    if(!istext(tool) || !(tool in list(CREW_TOOL_SAY, ...)))
        action_result(null, FALSE, "Your body does not know how to do that.")
        return

## How it was found

Read from the code, then seen in the output of one run of `sim.ts quiet engine` (made with an instrumented copy outside the repo, which changes nothing in the checks).

## How to fix it

1. Put both janitor checks inside `if (janitors.length) { ... }`.
2. In `toolCall`, before the `switch`, keep a list of the tools the real server accepts (copy the list from `handle_tool_call`). A call for a tool not in it is pushed to `unknownTools` with the body's name; a call for a real tool the stand-in has no case for is pushed to `unhandledTools`.
3. At the end: `check('the window sent no tool the server does not know', unknownTools.length === 0, ...)` and print `unhandledTools` as a warning line (not a failure, until `SIM-04` gives the stand-in those tools), so it is seen.
4. In the window code (owner's call, outside this finding's scope): the server could put the tool name it was given in `details.tool` even when it does not know it, so the window matches the answer to its step at once rather than twelve seconds later.

## How to test the fix

`sim.ts quiet engine` prints neither janitor check. `sim.ts quiet crew` still prints both. Rename one tool in a scratch copy of a job (`BRAIN=`) and see the new check fail.
