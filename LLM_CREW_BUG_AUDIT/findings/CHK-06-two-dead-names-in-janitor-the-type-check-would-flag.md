---
id: CHK-06
title: Two names in jobs/janitor.ts are never read - a wait constant left from the first build and the via argument of letInStep
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:48, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:625, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:66
fix: Delete WAIT_AT_COUNTER_DS, and drop the via parameter of letInStep (or use it), so the only wait at a locked door is LET_IN_WAIT_DS
---

## What is wrong

The type check the project runs is clean, but it does not look for names that are declared and never used. Turned on for one run (`--noUnusedLocals --noUnusedParameters`), it finds exactly two in the whole `CrewBrain` folder, both in `jobs/janitor.ts`:

    packages/tgui/interfaces/CrewBrain/jobs/janitor.ts(48,7): error TS6133: 'WAIT_AT_COUNTER_DS' is declared but its value is never read.
    packages/tgui/interfaces/CrewBrain/jobs/janitor.ts(625,3): error TS6133: 'via' is declared but its value is never read.

Neither changes what the crew does today. Both mislead whoever reads the file:

1. `WAIT_AT_COUNTER_DS` (600, one minute) has the doc comment "How long (deciseconds) a janitor waits at a locked door for someone who could open it to turn up." That is not the number used. The wait at a locked door is `LET_IN_WAIT_DS` at line 66, also 600, read in `letInStep`. Someone who wants a janitor to wait longer at a door and edits the constant whose comment says exactly that changes nothing. It has been in the file since the first commit (`82810bef671`), when the janitor waited at the cargo counter; `git log -S` shows it was never removed when the wait moved.
2. `letInStep(brain, task, place, via)` takes `via` and never reads it. The door it asks at is worked out again with `doorFor(brain, place)` from what the body knows of nested rooms. The caller passes `task.via`, which is set in only one place, to `CARGO_LOBBY`, when a cargo worker calls the janitor (`jobs/janitor.ts:847`). So the argument looks like it says which door to stand at and does not. DESK-06 is about how `task.via` is set; this is only about the dead argument.

The concrete case for 1: the change log's "the janitor gives up at the door too soon" kind of fix, done by raising `WAIT_AT_COUNTER_DS` to 1200, passes the type check, the lint, the tables and the simulator, and the janitor still gives up after one minute.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:47`:

    /** How long (deciseconds) a janitor waits at a locked door for someone who could open it to turn up. */
    const WAIT_AT_COUNTER_DS = 600;

`jobs/janitor.ts:65`, the one that is used:

    /** How long (deciseconds) it waits at the door after knocking and asking to be let in. */
    const LET_IN_WAIT_DS = 600;

`jobs/janitor.ts:621`:

    function letInStep(
      brain: NpcBrain,
      task: Task,
      place: string,
      via: string,
    ): Plan {
      // The door it asks at: this room's, or that of the locked room this one lies inside, if it is
      // not through that one yet. What it says there names both, so whoever opens it knows why.
      const door = doorFor(brain, place);

`jobs/janitor.ts:604`, the only caller:

      if (task.via && task.place && task.place !== task.via) {
        return letInStep(brain, task, task.place, task.via);

## How it was found

A check that was run, from `tgui/`: `../tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe x tsc --noEmit --noUnusedLocals --noUnusedParameters`, filtered to `CrewBrain` (the two lines above are all it printed for our folder). Then the file was read at both places, and `grep -rn WAIT_AT_COUNTER` over the folder finds only the declaration. The plain `tsc --noEmit` the README lists is clean, and `biome lint` does not report unused names in this setup. Not seen in a round: it changes nothing a round would show.

## How to fix it

1. Delete `WAIT_AT_COUNTER_DS` and its comment at `jobs/janitor.ts:47`.
2. Drop the `via` parameter from `letInStep` and from its one call at line 605. Keep the `task.via` test in the `if` before it: that is what says the mess is in a room the janitor must be let into.
3. Optional: add `"noUnusedLocals": true` for the `CrewBrain` folder only (a small `tsconfig` that extends `tgui/tsconfig.json`, used by whatever runner CHK-02 proposes), so the next leftover is caught. Turning it on for all of tgui would flag base code that is not ours.

## How to test the fix

- From `tgui/`: `bun x tsc --noEmit` clean, and the same with `--noUnusedLocals --noUnusedParameters` prints nothing for `CrewBrain`.
- Simulator: `quiet office` and `quiet nested` (both have a janitor let into a locked room) still pass.
