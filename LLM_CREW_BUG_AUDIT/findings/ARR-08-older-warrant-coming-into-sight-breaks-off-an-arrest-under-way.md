---
id: ARR-08
title: With two warrants, the person on the older one coming into sight breaks off an arrest of the other that is under way
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:631, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:461, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:740
fix: In orderToDrop do not drop a step of one emergency task for another emergency task, and have serveStep make the other warrant wait while an arrest is in hand
---

## What is wrong

A warrant whose person is in sight is an emergency task (`syncBeat`). The driver drops whatever the body is in the middle of for "an emergency it could be getting on with and is not" (`orderToDrop`). It takes the first such task in the list's order, and among emergencies that is the oldest. It carries on only when that first task is the one it is already doing.

So with warrants on A (given first) and B, the officer in the middle of arresting B, and A walking into view: the first emergency task that is ready with something to do is A's ("walk up to them"), it is not the task in hand, and the arrest of B is dropped for it. The window sends `approach` and then `arrest` for A. On the server `start_errand` and `start_walk` cancel B's errand without a result, so `beatAfterActing` never hears how B's arrest went.

What that leaves:

- If the baton had landed and the cuffs went on B as the proc ran on (SEC-03 says a called-off arrest keeps running), `warrant.cuffedByMe` is never set for B. From then on `serveStep` reads B as "in cuffs already. Someone else from security has made the arrest, and you are leaving them to it", and B is left in cuffs for good. No "cuffed" word goes to the Head of Security either.
- If the cuffs had not gone on, a stunned B is walked away from.

The other order does not do it: with B the older warrant, the first emergency found is B's own, which is the task in hand.

The same break-off happens when A was in sight all along and resting (`restUntil`): its rest ends in the middle of B's arrest, A's step becomes ready, and B is dropped.

One concrete case, from what round-20.43.32 had standing: a warrant on Pun Pun, then one on the Head of Personnel. The officer finds the Head of Personnel in the Bar Lounge, says the line and sends `arrest(p5, 'quiet')`. The cuffs take about four seconds of both standing still. Pun Pun wanders into view in that time. `syncBeat` makes Pun Pun's task an emergency. `orderToDrop` returns it, `drive` sends `approach(p2)`, the server's `start_walk` clears the errand, and the body walks off as the cuffs click shut or do not.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:631`:

    function orderToDrop(brain: NpcBrain): Task | null {
      const order = workInOrder(brain).find(
        ({ task, plan }) =>
          task.urgency === 'emergency' && plan.ready && !!plan.act,
      );
      if (!order) {
        return null;
      }
      ...
      if (
        brain.lastAct?.task === order.task.id &&
        !(order.plan.dropsWalk && brain.lastAct.act.tool === 'go_to')
      ) {
        return null;
      }
      return inBackoff(brain, keyOf(order.task, order.plan.act)) ? null : order.task;
    }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:347`, `workInOrder`: among emergencies nothing but `createdAt` tells two ready tasks apart.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:461`, in `syncBeat`:

    for (const warrant of beat.warrants) {
      // With them in sight, or by the arm, nothing comes before it.
      const now = !!target(brain, warrant) || holds(brain, warrant);
      keep(brain, SERVE, true, now ? 'emergency' : 'asked', warrant.name);
    }

`arrests.ts:711`, in `serveStep`: the other warrant waits only once someone is by the arm, which is after the cuffs:

    const held = security?.holding;
    if (held) {
      return { ready: false, wait: true, step: `You have ${held} by the arm. ${name} waits until they are in a cell.` };
    }

`arrests.ts:740`, what the dropped prisoner then reads as:

    if (seen.cuffed && !warrant.cuffedByMe) {
      return {
        ready: false,
        step: `${seen.name} is in cuffs already. Someone else from security has made the arrest, and you are leaving them to it.`,
      };
    }

`code/modules/llm_crew/crew_npc_hands.dm:161`, `start_errand`: `errand_serial++`, and `crew_npc_do_errand/perform_async` reports only `if(... errand_serial == serial)`.

## How it was found

Read from the code. Not seen in a round: in round-20.43.32 the second warrant was never acted on, for another reason.

## How to fix it

1. `driver.ts`, `orderToDrop`: if the task of `brain.lastAct` is itself an emergency task, return null, unless the plan of the task found says it may break in. Add an optional `breaksIn?: boolean` to `Plan` (`types.ts`) for that, and set it in `planBeat` for `AWAY` only (getting out of reach of an attacker it cannot stop has to break in on an arrest. That it does so today only when its task is older is luck). This is a rule for every job, not for security alone.
2. `jobs/arrests.ts`, `serveStep`: belt and braces. Near the top, if `brain.lastAct?.act.tool === 'arrest'` and `brain.lastAct.task` is another task than this warrant's, return `{ ready: false, wait: true, step: 'You are in the middle of arresting someone else. X waits.' }`. `serveStep` does not know its task id today: pass the task in from `planBeat`, which has it.
3. `beatAfterActing` cannot mend a result that never comes. Once SEC-03 is fixed the server will stop the old arrest. Until then, treat a suspect seen `cuffed` within a few seconds of this officer's own `arrest` step for that warrant as its own: set `warrant.cuffedByMe` when `brain.lastAct` was an arrest for that task. See also ARR-13 (a warrant handed back mid-arrest), which loses the same result. Better still, have `drive` remember the arrest it dropped (task and time) so that step 3 does not depend on `lastAct`, which the new step overwrites.
4. Ask the same of `STOP` as of `AWAY`: an attacker with no warrant who hits it in the middle of an arrest. Today `STOP`, like `AWAY`, is newer than the serve task and sorts after it, so it breaks in only by the same luck of order. Whether it should break in is the owner's call.

What must keep working: a walk of the hallways is still dropped the moment someone wanted is in sight (`dropsWalk`). Getting away from an attacker still breaks in.

## How to test the fix

- Type check and lint.
- Simulator: a scenario with two warrants, A given first. Put B in view, let the officer send `arrest` for B, hold the result back for five seconds, and bring A into view meanwhile. Check that no `approach` or `arrest` for A is sent until B's result is in.
- Run every scenario once: the driver change touches all jobs. `aside`, `crew` and the security ones most of all.

## Check

Checked by Opus 5.5, from the code. Nothing was run.

- The quotes are what the code says: `orderToDrop` (`driver.ts:631`), `syncBeat`'s `keep(... now ? 'emergency' : 'asked' ...)`, `serveStep`'s `held` wait and its `seen.cuffed && !warrant.cuffedByMe` branch, `start_errand`'s `errand_serial++`.
- `workInOrder` (`tasks.ts`): a serve task has no `place`, so `isRightHere` is false; it is not `asked`, so `isCalledFor` is false; with both emergency and both ready, `createdAt` decides. `keep` creates each serve task once, in the order of `beat.warrants`, so the older warrant's task sorts first.
- While B's arrest runs, `brain.lastAct` is B's arrest and `busy` is true, so `drive` calls `orderToDrop`. A's plan in sight is `approach` (ready, with an act); `brain.lastAct.task` is B's id, so it is returned unless A's approach is in backoff. `drive` then issues A's step once `driveAfter` (2.5 s) and `AFTER_SAYING_MS` (2.5 s from the arrest line) have passed, well inside an arrest that closes in, maybe swings, and spends several seconds on the cuffs. The server has no guard: `handle_tool_call` takes any tool while an errand runs, and `start_walk` replaces the errand. The old errand's `perform_async` then sees a changed `errand_serial` and reports nothing. `noteResult` would ignore it anyway: `lastAct` is now A's.
- So B's result never reaches `beatAfterActing`. If the cuffs went on, `cuffedByMe` is never set and `serveStep` reads B as "someone else's arrest" for good. Confirmed.
- Searched the change log for `orderToDrop`: only H5 (`dropsWalk`, 14:15 entry), which is about walks. Nothing chose this.
- The fix: step 1 is the right place and is general. It changes every job's emergencies, which is why the whole scenario set has to be run; step 4 asks of `STOP` what the write-up asked of `AWAY`. Step 2 on its own is enough for the security case and is the smaller change; it needs the task id passed into `serveStep`. Step 3's "See also ARR-11" was the wrong number (ARR-11 is the hallway search); corrected to ARR-13.
- Confidence left at likely: the timing (A must come into view during the few seconds of an arrest) was not seen in a round. Severity medium and effort small stand.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: a5bc3977401.

- ARR-08 (window part): part done. With two warrants, the other person coming into sight no longer breaks off an arrest under way. planBeat's serve branch waits ('You are in the middle of arresting someone else. X waits.') while brain.lastAct is an arrest for another task, so orderToDrop finds nothing to drop it for. Left: driver.ts, orderToDrop: return null when brain.lastAct's task is itself an emergency task, unless the found plan has breaksIn. types.ts Plan: add breaksIn?: boolean. arrests.ts planBeat AWAY branch: set breaksIn: true (this group's file, next round). Step 3 (drive remembering a dropped arrest, so a suspect it cuffed is taken as its own) is not done. sim.ts: two warrants, the first person coming into view while the arrest of the second is held back 5 s.

Round two (branch crew-bug-fixes-medium): fa7a7954086. Still not finished: see the change log entry for what is left.
