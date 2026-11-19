---
id: CARGO-13
title: Someone sent for a crate asks the first technician in sight every minute for up to half an hour, even one who is down, and then drops the errand without telling anyone
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:183, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:200, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:154, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:386
fix: Ask a technician who is on their feet, turn to another after an ask that brought nothing, and after three asks tell the head who sent it and put the errand off
---

## What is wrong

See also: JOBS-02, MEM-11 (the 30-minute give-up rule in `syncTasks` that is this errand's only end today, and what it breaks; this finding's own fault is in `planPickups`, which technician it asks and that it never stops asking).

A crew member sent to collect a crate stands in the Cargo Lobby and asks a technician for it by name. The technician it asks is `brain.peopleInView.find(isTechnician)`: the first one the server lists. Three things are missing:

1. **It does not look at whether that technician can answer.** The list holds everyone in sight, with `down` and `cuffed` marked (see CARGO-12). A technician lying knocked out or dead in view of the counter, or standing in cuffs, is asked.
2. **It never turns to anyone else.** The line begins with the technician's first name ("Sam, I am here to collect crate 12 for Hop Kins, please."). A second technician standing at the counter hears it as said to someone else (`said_to === 'other'`) and, by the test in `overhears` in `cargo.ts`, leaves it alone.
3. **There is no count and no end.** After each ask it waits `BROUGHT_OUT_WAIT_DS` (one minute) and asks again, the same technician, for ever. The only ends are the crate being put out, or a technician saying there is no such crate.

Collecting comes before nearly all its other work (`isCollecting` in `workInOrder`), and while it waits the driver holds it there. So it does nothing else. The one thing that stops it is the general rule in `tasks.ts` that drops any task that is not blocked after 30 minutes (`GIVE_UP_DS`). The task is then filtered out with no word to the head who sent it, and no note that it was not done.

One concrete case: the Captain has the officer arrest Sam in the Cargo Bay, and Sam fights and is batoned down by the counter. The Head of Personnel's crate #12 is waiting, and it sends the janitor Jan for it. Jan reaches the lobby. `technician` is Sam (first in the list), `down` is true and is not read. Jan says the line to Sam. Maria, the other technician, is at the counter and hears a line said to Sam. Nothing is brought out. A minute later Jan asks Sam again. The head, hearing nothing, sends a second janitor after five minutes, who joins Jan at the counter and does the same.

It is also the state a collector is in when a technician is alive but cannot bring the crate (a haul that keeps failing, see `WONT_COME` in `cargo.ts`): asked once a minute, with nobody told.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:182`, in `planPickups`:

    // A technician: the Quartermaster does not work the counter.
    const technician = brain.peopleInView.find((person) =>
      isTechnician(person.job),
    );

and at line 200:

    // Asked, and it is being fetched: it waits by the counter. If nothing comes of it, it asks again.
    if (
      task.askedAt !== undefined &&
      brain.now - task.askedAt < BROUGHT_OUT_WAIT_DS
    ) {
      return {
        ready: false,
        wait: true,
        step: `You have asked cargo for crate #${number}, and are waiting at the counter for it to be brought out.`,
      };
    }
    const first = firstName(technician.name);
    return {
      ready: true,
      step: `${by} has sent you to collect crate #${number}. ${technician.name}, who works in cargo, is here: ...`,
      say: `${first}, I am ${ASKING} ${number} for ${by}, please.`,

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:148`, the only end:

    brain.tasks = brain.tasks.filter((task) => {
      if (task.state === 'done') {
        ...
      }
      return brain.now - task.createdAt < GIVE_UP_DS || task.state === 'blocked';
    });

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2222`, why the second technician does not answer:

    if (
      speaker &&
      !isCargo(theirJob) &&
      event.details.said_to !== 'other' &&
      COLLECT_WORDS.test(heard) &&

## How it was found

Read from the code, not seen in a round. Not listed in the change log or the plans. `LLM_CREW_PLAN_QUARTERMASTER.md` section 5 records the opposite fault as fixed (a second janitor sent for one crate after four and a half minutes), which is the head's side of the same wait.

## How to fix it

1. In `planPickups`, choose among technicians who are in view and neither `down` nor `cuffed`. If there is none, treat it as "nobody from cargo at the counter" (the existing `retryAt` path).
2. Keep on the task who was asked and how many times: `task.askedOf` (a name) and `task.asks` (a count), set in `pickupsAfterSaying`. On the next ask, prefer a technician other than `task.askedOf` if one is there.
3. After three asks with the crate still not out: tell the head by PDA with a fixed line through `brain.toTell` (`byPda: true`), for example "Cargo has not brought out crate #12: I asked three times at the counter. I will try again later.", set `task.retryAt = brain.now + TRY_AGAIN_DS * 3` and reset `task.asks`. `syncPickups` already blocks the task while `retryAt` is ahead, which frees the body for its other work and also keeps the task from being dropped by `GIVE_UP_DS`.
4. On the technician's side (`overhears` in `cargo.ts`), a collecting line said to a workmate by name should still be taken when that workmate is down, cuffed or not in view. With CARGO-12's `ableInView` helper: treat `said_to === 'other'` as no bar when `event.details.said_to_name` is a technician who is not able.
5. Where a task is dropped by `GIVE_UP_DS` in `tasks.ts` and has `askedBy`, whoever asked ought to hear. That is a wider change than this one: at least log it (`brain.lastJob`) so the window shows it.

## How to test the fix

- Simulator: the `collect`-style scenarios (see the list at the top of `tools/llm_crew/sim.ts`) with two technicians, the first marked `down`. Check the crate is asked of the second and brought out. A second run with one technician who never answers: check a PDA message to the head after the third ask, and that the janitor goes back to its messes.
- Type check.
