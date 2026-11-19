---
id: CHK-09
title: Shown in the simulator - one error thrown in an after-saying hook leaves the LLM turn taken for good, and every crew member stops talking and most of the work stops
kind: gap
severity: high
effort: small
confidence: sure
status: duplicate
duplicate_of: DRV-06
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1555, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1620, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1572, tools/llm_crew/sim.ts:51
fix: Take DRV-06's fix, and add a simulator run with a planted throw (BRAIN= copy, or a FAULT= switch in sim.ts) to the checks, so the guard it adds is tested and stays tested
---

## What is wrong

See also: DRV-06. That finding reads from the code that one thrown error stops every brain, and says it was not run. This one runs it, and adds two things it could only reason about.

1. **It is not only strict mode.** DRV-06's worst case is tgui's fatal handler emptying `window.update`. The simulator has no strict mode and no `window.onerror`: bun prints the rejection and carries on. Even so the whole crew stops. The reason is the other half of DRV-06: `think` throws from inside its own `catch`, the promise rejects, and `running = true` is never cleared, so no crew member ever gets another LLM turn, and every body whose next step is a line to say stands still for the rest of the round.
2. **The path is short and common.** The planted throw was put in `roundsAfterSaying`, one of the six after-saying hooks. `think` calls it at `brain.ts:1555` after any line is said, inside the `try`. The throw goes to the `catch` at `:1572`, which, because a line was owed (`mustSay`), says it plainly and calls the same six hooks again at `:1615` to `:1621`. The second throw leaves the `catch`. Bun's stack shows exactly that:

       error: planted fault in roundsAfterSaying
             at roundsAfterSaying (...\boom\jobs\rounds.ts:196:13)
             at think (...\boom\brain.ts:1620:7)

   So any throw in any hook that runs after saying (each job's `afterSaying`, `guardAfterSaying`, `meetingsAfterSaying`, `ordersAfterSaying`, `roundsAfterSaying`, `pickupsAfterSaying`, `afterSaying`) does this, with or without the model, because the fallback path calls the same hooks.

The result, in `sim.ts quiet crew` with the planted throw: 19 checks fail, the model is asked to talk 6 times in 12 minutes (the clean code asks it 50 to 60 times), and the Head of Personnel says nothing all round. In `quiet qm`, 30 fail; in `quiet warrant`, 12 fail ("they are told they are under arrest, word for word, before a hand is laid on them  never told"); in `chatty crew`, 18 fail. The bodies' coded steps that need no line (walks, cleaning) partly go on: 62 steps by code against about 130 on clean code.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1551` to `:1556`, inside the `try` of `think`:

      jobFor(brain.job).afterSaying?.(brain, mustSay);
      guardAfterSaying(brain, mustSay);
      meetingsAfterSaying(brain, mustSay);
      ordersAfterSaying(brain, mustSay);
      roundsAfterSaying(brain, mustSay);
      pickupsAfterSaying(brain, mustSay);

`brain.ts:1611` to `:1622`, inside the `catch` of the same `try`:

    // The LLM being down must not leave the body dumb: what had to be said is said plainly.
    if (mustSay && brain.peopleInView.length > 0) {
      runTool(brain, { tool: 'say', text: mustSay });
      ...
      jobFor(brain.job).afterSaying?.(brain, mustSay);
      guardAfterSaying(brain, mustSay);
      meetingsAfterSaying(brain, mustSay);
      ordersAfterSaying(brain, mustSay);
      roundsAfterSaying(brain, mustSay);
      pickupsAfterSaying(brain, mustSay);
      afterSaying(brain);
    }

`tools/llm_crew/sim.ts:51`, the switch that makes the demonstration cheap:

    // BRAIN=<folder> runs another copy of the window code, to compare it with the one in the tree.
    const ROOT = PATH.resolve(process.env.BRAIN || `${import.meta.dir}/../../tgui/packages/tgui/interfaces/CrewBrain`) + PATH.sep;

## How it was found

A check that was run. The `CrewBrain` folder was copied to the system temp folder, and one line was added to the copy, as the first line of `roundsAfterSaying` in `jobs/rounds.ts`:

    throw new Error("planted fault in roundsAfterSaying");

Then, with nothing in the repo changed, four runs, four at a time:

    BRAIN=<temp>/boom tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe tools/llm_crew/sim.ts quiet crew
    (and quiet qm, quiet warrant, chatty crew)

The last lines of `quiet crew`:

    62 steps taken by code; in 12 minutes the LLM was asked 6 time(s) to talk and 1 time(s) which job comes first (quiet LLM).
    19 FAILED

The same scenarios on the code in the tree pass (quiet: three runs of three in the audit's first pass; chatty and dead: this pass). The temp copy was deleted afterwards. What the real tgui window does on top of this (the fatal screen, the server closing its end) is DRV-06's reading and was not run here.

## How to fix it

1. Do DRV-06's steps 3 and 4: a `finally` in `think` that frees the LLM turn whatever happens (minding the session check), and in the `catch`, say the owed line first and run each hook in its own `try`, so a fault in one hook neither stops the line nor the other hooks.
2. Make the planted fault part of the checks, so the guard cannot quietly go away. The small way: a `FAULT=<hook name>` switch in `sim.ts` that, after loading the window code, wraps that one exported function of the loaded module so it throws on every call (for ES modules this needs the hook called through an object the sim can reach; if it cannot be reached, keep the BRAIN= copy and a three-line script in `tools/llm_crew/` that makes the copy and plants the line). The pass mark is not "all passed": it is that the model is still asked to talk about as often as without the fault, every line the scenario expects is still said (the hooks' own bookkeeping may be wrong, so some checks may fail), and one error record per NPC per minute is logged (DRV-06 step 2).
3. Run it for `roundsAfterSaying` and for one job's `afterSaying` (say the Quartermaster's), in `quiet crew` and `quiet qm`.

## How to test the fix

- The planted run above, after the fix: the model is asked to talk 40 or more times in `quiet crew`, the Head of Personnel holds its meeting, and bun prints no unhandled rejection.
- The code in the tree: every scenario still passes in quiet mode, and `dead crew` and `dead qm` still pass.
- From `tgui/`: the type check.
