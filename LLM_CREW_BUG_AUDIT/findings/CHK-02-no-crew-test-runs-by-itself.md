---
id: CHK-02
title: None of the crew tests runs by itself - not in the build, not in CI, and the tools folder is never type checked or linted
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: tools
files: tools/llm_crew/sim.ts:1302, tools/build/build.ts:497, tgui/tsconfig.json:32, package.json:8, .github/workflows/run_linters.yml:134
fix: Add one runner script that runs the tables, the dry model tests and the simulator scenarios and exits non-zero on any failure, and hang the quick part of it on the tgui test target
---

## What is wrong

Everything that checks the crew's window code is run by hand, one command at a time, by whoever remembers:

- the five tables of cases (`security.ts`, `addressing.ts`, `engine.ts`, `reports.ts`, `book.ts`), about 400 cases, a second or two each;
- the two model tests in dry mode (`DRY=1 voice.ts`, `DRY=1 choose.ts`), which only build the prompts;
- the simulator, 46 scenarios in three modes.

Nothing in the repository runs any of them:

- `bun test` (the CI step `tgui-test`) finds five test files in all of tgui (`common/type-safety.test.ts`, `tgui/constants.test.ts`, `tgui/interfaces/Radio.test.tsx`, `tgui-say/ChannelIterator.test.ts`, `tgui-say/ChatHistory.test.ts`). None is ours. It reports "25 pass, 0 fail" whatever state the crew code is in.
- `tgui/tsconfig.json` includes `./packages` only, so `tsc` never reads `tools/llm_crew/*.ts`. Those files also load the window code with `await import(ROOT + '...')`, which gives `any`, so even a type check pointed at them would learn nothing: a renamed export or a changed argument list in the window code is found only when the tool is next run.
- The lint in CI is `biome lint tgui` (root `package.json`), which does not reach `tools/`.
- There is no DM unit test for any crew code under `code/modules/unit_tests/`, and none of the sweeping unit tests there touches a crew type.

The concrete case is `CHK-01`: `voice.ts` has been crashing since a brain field was added, the type check, the lint, the server compile and all five tables stayed green, and no change log entry noticed. The change log shows the same thing from the other side: each entry lists which scenarios were run that time ("the nine security scenarios", "twelve scenarios", "the five new scenarios"), so most scenarios are not run for most changes, and `LLM_CREW_CHANGELOG.md:1057` records a full run in which `nested` did not pass.

A full quiet pass of the simulator, four at a time, took about half an hour on this machine during the audit (one scenario is 50 seconds to 4 minutes of wall time, because every simulated second waits on six real timer ticks). That cost is why it is not run in full, and it is why it has to be a single command that can be left running.

Three smaller things found on the way, all of the same kind:

- A scenario name that is not known runs the default crew and prints "all passed". `sim.ts quiet qmwiat` (a slip for `qmwait`) is silently the 12 minute default scenario. See the last arm of `const crew = ...` at `tools/llm_crew/sim.ts:1302`: `... : VARIANT === 'crew' ? spawnCrew() : spawnStaffed(['Cora Tech'], ...)`.
- `doorway` and `headdoor` are scenarios (`tools/llm_crew/sim.ts:463`) that are not in the list at the head of the file, so anyone who runs "every scenario listed" misses them.
- `biome check packages/tgui/interfaces/CrewBrain` (the command in the audit README) reports 34 errors. All are formatting and import order; none is a lint rule. `biome lint`, which is what CI runs, reports one note (`addressing.ts:125`, a needless `!!`). So CI would pass, and the README's command will always look red. Running `bun run tgui:fix` (root `package.json`) would settle it in one go, at the price of a large diff.

## Where

`tgui/tsconfig.json:32`:

    "include": ["./*.d.ts", "./packages", "happydom.ts"]

`package.json:8` (repo root), the lint CI runs:

    "tgui:lint": "biome lint tgui"

`tools/build/build.ts:497`:

    export const TguiTestTarget = new Juke.Target({
      parameters: [CiParameter],
      dependsOn: [BunTarget],
      executes: () => bun('./tgui', 'tgui:test'),
    });

`tools/llm_crew/security.ts`, the end of every table, which is why they cannot simply be imported by a test file as they stand:

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);

## How it was found

Checks that were run at commit `b4284e5fe54`: `bun test` from `tgui/` (25 pass, 5 files), `bun x tsc --noEmit` (clean), `bun x biome lint packages/tgui/interfaces/CrewBrain` (exit 0, one note), `bun x biome check` on the same folder (exit 1, 34 formatting and import-order errors), each table (all passed), a search of `code/modules/unit_tests`, `.github/` and `tools/ci` for `llm_crew`, `crew_npc` and `CrewBrain` (nothing), and the simulator runs described in the other CHK findings. SpacemanDMM's dreamchecker and OpenDream are not on this machine, so what those two CI steps would say about `code/modules/llm_crew/` is not known.

## How to fix it

1. Add `tools/llm_crew/all.ts`: it starts each of the five tables, then `voice.ts` and `choose.ts` with `DRY=1`, as child processes (`Bun.spawn`), and collects the exit codes. With an argument (`all.ts sim`) it then runs every scenario in quiet mode, four at a time, N times each (default 1), and prints one line a scenario: passed, failed (with the FAIL lines), or timed out. It exits non-zero if anything failed. Keep the scenario list in one exported array in `sim.ts` (or a small `scenarios.ts`) so the header comment, the runner and the "unknown name" check all read the same list.
2. In `sim.ts`, refuse a scenario name that is not in that list: print the list and exit 2.
3. Hang the quick part (tables and dry runs, about ten seconds) on the build's test target: either a new Juke target in `tools/build/build.ts` that `TestTarget` depends on, or a `tgui/packages/tgui/interfaces/CrewBrain/tables.test.ts` that spawns `all.ts` and expects exit 0, so the existing `bun test` picks it up. The second is less code and needs no change to the build.
4. Leave the simulator out of CI (half an hour), and put the one command in `CLAUDE.md` and the audit README's "How to check your work" table instead of the per-file commands.
5. Owner's call: whether to run `bun run tgui:fix` once so that `biome check` is clean. It touches most files in `CrewBrain/`, so it should be its own commit, made when no other session has uncommitted crew changes.

None of this touches the crew's behaviour, so the project's rules are not in play.

## How to test the fix

- `tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe tools/llm_crew/all.ts` exits 0 on a clean tree (after `CHK-01` is fixed) and 1 if a case in any table is made to fail on purpose.
- `sim.ts quiet nosuchname` exits 2 and lists the scenarios.
- From `tgui/`, `bun test` runs one more file and still passes.
