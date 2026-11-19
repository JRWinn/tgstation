---
id: ARR-01
title: Each failed try at an arrest is held back longer by the driver, up to two minutes, while the officer stands beside them
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:811, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:798, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:931, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805
fix: Number each try at an arrest as the tries at a cell are numbered, and say the arrest line again only when toldAt is null
---

## What is wrong

See also: QM-14 (the same driver rule, that every saying of a line is counted as a failure of it, as it strikes the Quartermaster's queued `toTell` lines; that fix is in the tell path of `driver.ts` and on purpose leaves a plan's own `say`, such as the arrest line here, as it is, so the two are mended separately).

The plan in `jobs/arrests.ts` is "three tries, then a rest of 30 seconds, then again". What the officer really does is set by the driver. A step that fails is left alone for 20 seconds times the number of times that same step has failed, up to 120 seconds (`fail` and `inBackoff` in `driver.ts`), and the count is only wiped when the step succeeds. The arrest step is the same step every time: same task, same person, same `how`. So against someone who will not stand still the gaps between tries are 20, 40, 60, 80, 100 and then 120 seconds for ever. While the step is held back nothing else is ready, the officer keeps its post (`keepsPost`), and `nextStep` gives nothing: it stands beside the suspect and does nothing.

The line "X, you are under arrest. Stand still." has the same trouble. The driver counts every saying of a line as a failure of that line ("Asked once; if nothing comes of it, it is left a while"), and a spoken line is never cleared. `serveStep` wants the line said again every 45 seconds (`TOLD_STANDS_DS`) and returns the say step, not the arrest, while it is due. From the third saying the line is held back 60 seconds or more, and the arrest waits behind it. (This part is only for someone who has not hit the officer: `serveStep` skips the line for a warrant with `resisted` set and `toldAt` not null, and `securityFeels` sets `resisted` when a wanted person strikes it. A monkey that bites gets the arrest hold-back only; one that only walks off gets both.)

The cells and the walk to a door were mended for exactly this by numbering each try (`attempt`), "so that the driver does not hold it back". The arrest was not.

One concrete case, from a round (below): Pun Pun in the Bar Lounge. Force try 1 fails at 01:36:49. Try 2 is sent at 01:37:15. Try 3 fails at 01:39:30.8. The line is said for the fourth time at 01:40:24.9, exactly 60 seconds after its third saying, and try 4 is sent at 01:40:32.4, 61.6 seconds after try 3 failed. In between the officer made one `approach` and then stood by the monkey for 48 seconds. The arrest took five minutes. A later entry in the change log puts the whole five minutes down to slow clicks and a two minute rest. The rest is now 30 seconds, but this hold-back is still there and grows with every try.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:811`, in `serveStep`. The act has no number in it, so its key never changes:

    return {
      ready: true,
      step: force
        ? `${seen.name} will not stand still to be arrested. You are using your baton, and then the cuffs.`
        : `You have told ${seen.name} they are under arrest. You are putting the cuffs on them.`,
      act: {
        tool: 'arrest',
        person: seen.handle,
        how: force ? 'force' : 'quiet',
      },
      dropsWalk: true,
    };

Compare the try at a cell, a few lines up, which is numbered:

      act: { tool: 'jail', minutes, attempt: (warrant.cellAttempts ?? 0) + 1 },

`driver.ts:166` and `driver.ts:931`: the key is the task and the whole act, and each failure adds 20 seconds:

    function keyOf(task: Task | null, act: Action | undefined, say?: string): string {
      return `${task?.id ?? 'none'}:${act ? JSON.stringify(act) : `say:${say}`}`;
    }

    function fail(brain: NpcBrain, key: string): void {
      const count = (brain.failures.get(key)?.count ?? 0) + 1;
      brain.failures.set(key, {
        count,
        until: Date.now() + Math.min(RETRY_MS * count, RETRY_MAX_MS),
      });
    }

`driver.ts:1011`, in `noteResult`: every failed result of the last step calls `fail(brain, last.key)`. Only `event.details.ok` deletes the record.

`driver.ts:805`, in `drive`: a line is counted as failed the moment it is said, and nothing ever deletes that record:

    if (step.say) {
      // Asked once; if nothing comes of it, it is left a while before being asked again.
      fail(brain, step.key);
      speak(step.say, step.needs, step.sayIf, step.exact);

`arrests.ts:798`, in `serveStep`: the line is wanted again every 45 seconds, and comes before the arrest:

      if (
        warrant.toldAt === null ||
        brain.now - warrant.toldAt > TOLD_STANDS_DS
      ) {
        const line = arrestLine(seen.name, warrant.reason);
        return { ready: true, step: ..., say: line, exact: true };
      }

`driver.ts:535` to `544`: a ready step in back-off sets `heldBack` and is passed over. `driver.ts:579`: with nothing ready, a job with `keepsPost` returns null, so the officer stands still.

## How it was found

Read from the code, then checked against a round. `data/logs/2026/11/19/round-19.33.50/crew_brain.log`, the officer Nova Aultman, lines beginning `ROUTINE (no LLM) in Bar Lounge`:

    01:36:45.559  arrest("p2", "force")
    01:37:15.531  arrest("p2", "force")
    01:39:24.708  say("Pun Pun, you are under arrest. Stand still.")
    01:39:28.662  arrest("p2", "force")
    01:39:36.977  approach("p2")
    01:40:24.941  say("Pun Pun, you are under arrest. Stand still.")
    01:40:32.427  arrest("p2", "force")

`game.log` of the same round has the third try failing at 01:39:30.843 ("hit Pun Pun with its baton 0 times"). 01:39:30.8 to 01:40:32.4 is 61.6 seconds: the 60 seconds a key gets on its third failure. 01:39:24.7 to 01:40:24.9 is 60.2 seconds: the same, for the line said a third time. Not seen: a fifth or sixth try, where the gap would be 100 and 120 seconds.

## How to fix it

1. In `BeatWarrant` (`types.ts`) add `arrestAttempts?: number`, "how many tries at arresting them it has made in all. It numbers each try."
2. In `serveStep` (`jobs/arrests.ts`) add `attempt: (warrant.arrestAttempts ?? 0) + 1` to both `arrest` acts that are for a warrant (the one at the end, and the "taking them by the arm again" one). The server ignores it: `handle_tool_call` passes only `arguments["person"]` and `arguments["how"]` to `tool_arrest`.
3. In `beatAfterActing`, in the `act.tool === 'arrest'` branch, after the `how === 'stop'` return and the `!warrant` return, do `warrant.arrestAttempts = (warrant.arrestAttempts ?? 0) + 1` when `!ok`. Do it before the early returns for `no_way`, `no_baton` and `no_cuffs`, so that each of those is also a new key. Those cases are already paced by something else: `no_way` by the let-in steps, `no_baton` and `no_cuffs` by the plan no longer being ready.
4. The pace is then the plan's own: `ARREST_TRIES` and `REST_DS`. Check that a failed try cannot now be sent again in a tight loop: every failed result either adds to `warrant.tries` (rest after three) or changes what `serveStep` returns. The one that does neither is `no_way` with the person in the officer's own room: see ARR-07, which gives it a cap. Do the two together.
5. The line. In `serveStep`, say the line again only when `warrant.toldAt === null`, not every 45 seconds. It is already set back to null where a fresh telling is right: after three tries, after "lost", after `no_way`, after a failed walk to a cell. That leaves the first saying (never held back) and one saying after each rest, and by then the hold-back of the earlier saying has run out unless it has been said three or more times. To be safe against that as well, have `beatAfterSaying` wipe the record: export a small `forget(brain, key)` from `driver.ts`, or simpler, have `brain.ts` delete from `brain.failures` any key that ends `:say:${mustSay}` where it calls `afterSaying` for a line that was said word for word (`exact`). A line that was said is not a step that failed.
6. Keep `dropsWalk` and the `approach` step as they are.

What must keep working: someone who stands still is cuffed on the first quiet try. The rest of 30 seconds after three tries. "I cannot bring in X: they will not stand still", once.

## How to test the fix

- Type check and lint.
- `tools/llm_crew/sim.ts quiet fight` and `quiet warrant`, a few runs each. They pass today because the simulator's monkey does not walk off, so add a case: a suspect whose first four `arrest` results are `ok: false, reason: 'moved'` with the person still in view. Check that the fourth try is sent within about 45 seconds of the first (three tries, a 30 second rest, a fourth), not after two minutes or more.
- A case in `tools/llm_crew/security.ts` can check the keys directly: two `serveStep` results for the same warrant, with one failed `beatAfterActing` between, must have different `act`s (the `attempt` differs), so `keyOf` differs.
- In the next round, in `crew_brain.log`, the times between one arrest and the next for the same officer: a few seconds, with one gap of about 30 after every third. With the number added the log prints the act as `arrest("pN", "force", 2)`, as it prints `jail(5, 1)` today, so grep for `arrest("pN", "force"` without the closing bracket.

## Check

Checked by Opus 5.5. Confirmed.

- Code, as quoted: `keyOf` (`driver.ts:166`) is the task id and the whole act as JSON; `fail` (`:931`) holds a key back `min(20000 * count, 120000)` ms; `noteResult` deletes the record only on `ok` (`:988`) and calls `fail` otherwise (`:1012`); `drive` calls `fail` on every line it says (`:807`). In `nextStep` (about `:535`) a ready step in back-off sets `heldBack` and is skipped, and with nothing ready the officer (`keepsPost: true`, `officer.ts:407`; the Head of Security at `headofsecurity.ts:192`) gets null. The `arrest` act in `serveStep` (`arrests.ts:811`) is `{ tool, person, how }` with nothing that changes from try to try. `brain.failures` is cleared only on leaving a shut-in or a held door (`brain.ts:463`, `:679`). `go_to_door`, `jail` and the forced-door `go_to` already carry `attempt` (`arrests.ts:600`, `:708`, `:845`).
- Round log: `data/logs/2026/11/19/round-19.33.50/crew_brain.log` has the line said at 01:36:34, 01:37:21, 01:39:24.7 and 01:40:24.9 and the force tries at 01:36:45, 01:37:15, 01:39:28, 01:40:32; `game.log` has the third failing at 01:39:30.843. The 60 second gaps after the third failure and the third saying match `fail`'s count of 3. That round was on the older build with a two-minute rest (change log entry 19:38 to 20:00); the driver code is unchanged since, so the growing hold-back still stands with the 30 second rest.
- Nothing in the change log or plans names this. Server side: `handle_tool_call` passes only `person` and `how` to `tool_arrest` (`crew_npc_tools.dm:68`), so an extra `attempt` is harmless.
- Severity lowered to medium: the arrest is slowed, not stopped, and is made in the end (five minutes in that round). Effort raised to medium: the fix touches `types.ts`, `jobs/arrests.ts` and `brain.ts` or `driver.ts`, though it stays well under 50 lines.
- The fix is sound. On step 5's second part: wipe the say key only after `afterSaying` has set `warrant.toldAt`, so that the line cannot be due again the same pass; with `toldAt === null` as the only test that already holds.
