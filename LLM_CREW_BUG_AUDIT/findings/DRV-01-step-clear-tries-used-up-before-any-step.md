---
id: DRV-01
title: The two tries at stepping clear of a doorway are used up while the driver is waiting, so a body that arrives in a doorway mostly stays in it
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:112, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:517, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:745
fix: Count a step clear when the step is issued (in drive, beside noteDone), not when nextStep asks whether one is allowed
---

## What is wrong

See also: DRV-02

A body that is waiting (at a staff meeting, say) and finds itself in a doorway is meant to step clear, at most twice in one room. The count of tries is put up inside `nextStep`, which only works out what the next step would be. `drive` calls `nextStep` on every update from the server, and then very often returns without doing the step: the breath after the last action is not over (`driveAfter`), or someone is talking and the step is one that "leaves" (`step_aside` is). Updates come at least every 0.9 seconds, and one more for every sense event of any NPC the owner has. So both tries are spent in the first second or two after the body arrives, before the driver is allowed to act, and when it is allowed the answer is "no more tries". The body stands in the doorway for the whole wait.

One concrete case: a janitor is called to a staff meeting in the Bar. Its `go_to` arrives; `noteResult` sets `driveAfter` to between 1 and 4 seconds from now. It is in the doorway (`in_doorway`). Update 1 (0.3s later, a workmate's sense event): `nextStep` reaches the waiting meeting task, `mayStepInside` puts the count to 1 and the step is returned; `drive` returns null at `now < brain.driveAfter`. Update 2: count 2, null again. Update 3, with the breath over: `mayStepInside` returns false, `nextStep` returns null. No `step_aside` is ever sent.

It works in two cases only: when the breath happens to be over before the second update, and when the body is pushed into a doorway after it has been waiting a while, so that no wait stands between asking and stepping.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:112`, `mayStepInside`: it both asks and counts.

    function mayStepInside(brain: NpcBrain): boolean {
      const tries = stepInsideTries.get(brain.id);
      const count = tries && tries.place === brain.location ? tries.count : 0;
      if (count >= STEP_INSIDE_MAX) {
        return false;
      }
      stepInsideTries.set(brain.id, { place: brain.location, count: count + 1 });
      return true;
    }

`driver.ts:517`, in `nextStep`, where it is called:

          if (
            plan.inside &&
            brain.inDoorway &&
            !brain.shutIn &&
            !inBackoff(brain, STEP_INSIDE_KEY) &&
            mayStepInside(brain)
          ) {
            return {
              key: STEP_INSIDE_KEY,

`driver.ts:745`, in `drive`: `nextStep` is called first, and three ways out follow it that take no step.

      let step = nextStep(brain);
      ...
      if (now < brain.driveAfter) {
        return null;
      }
      ...
      if (leaves && now - brain.lastSayAt < AFTER_SAYING_MS) {
        return null;
      }
      ...
      if (leaves && talking && !doorWaiting) {
        brain.heldSince ||= now;
        if (now - brain.heldSince < TALK_HOLD_MAX_MS) {
          return null;
        }

`step_aside` is not in `STAYS`, so `leaves` is true for it and the talk hold applies as well: at a meeting, where someone has just spoken, that is up to 15 seconds of updates.

## How it was found

Read from the code, then shown with a throwaway script (kept outside the repo) that imports the real `driver.ts` and the fixture brain from `tools/llm_crew/fixtures.ts`. A janitor at a meeting in the Bar, report given, `inDoorway` true, `driveAfter` 3 seconds off. `drive` was called four times during the breath and once after it:

    tick 1 during the breath -> drive returned null | issued so far 0
    tick 2 during the breath -> drive returned null | issued so far 0
    tick 3 during the breath -> drive returned null | issued so far 0
    tick 4 during the breath -> drive returned null | issued so far 0
    breath over -> drive returned null | issued []
    nextStep now: null
    control, no wait -> drive returned step-inside | issued [{"tool":"step_aside"}]

The round logs fit this, though they cannot show a try being used up (nothing is logged when one is). In `data/logs/2026/11/19/round-19.33.50`, `round-20.00.21` and `round-20.43.32` there are 13 steps logged as "stepping clear to wait". Ten of them come 5 to 46 seconds after the same body's last step, which is a body already waiting that was pushed into a doorway. Three come about 3 seconds after an `approach`, the short-breath case. No body in those rounds stepped clear twice in one stay. The change log (the entry with "(6) Nobody waits in a doorway", `LLM_CREW_CHANGELOG.md:473`) says the cap was added and does not say it was played.

## How to fix it

1. Split `mayStepInside` in two. `canStepInside(brain)` only reads: true if the count for this room is under `STEP_INSIDE_MAX`. `noteSteppedInside(brain)` puts the count up.
2. In `nextStep` call `canStepInside` only.
3. In `drive`, count the try where the step is really sent: after `issue(step.act)` has returned a tool name, `if (step.key === STEP_INSIDE_KEY) noteSteppedInside(brain)`. The natural place is `noteDone`, which already does this kind of bookkeeping for the aside step (`step.key === ASIDE_STEP_KEY`).
4. Keep `nextStep` free of anything that changes the brain because of a step it has not taken. (The other two things it changes, trimming `toTell` and clearing an `asideAsked` that has run out, are harmless.)
5. See DRV-02 for the count never being reset, which is in the same function and best done in the same sitting.

## How to test the fix

- Type check from `tgui/`.
- Add a case to the simulator's meeting scenario, or a small table test: a waiting body in a doorway with `driveAfter` a few seconds off, driven five times, must send exactly one `step_aside` once the breath is over, and no more than two in all while it stays in the room.
- In the next round with a staff meeting, look in `crew_brain.log` for `ROUTINE (no LLM)` lines ending "stepping clear to wait" for a body whose card showed it in a doorway.
