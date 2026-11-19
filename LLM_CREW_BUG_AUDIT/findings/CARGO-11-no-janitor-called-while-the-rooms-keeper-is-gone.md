---
id: CARGO-11
title: Once the rooms are given to one technician, the other never sends for a janitor, even when that technician is dead, in the brig or gone
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1541, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1350, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:266
fix: In tidyStep leave the call to the keeper only while leftTo says they are about, as every other piece of the standing work does
---

## What is wrong

After the Quartermaster's first staff meeting the standing work is divided. Every piece of it that is left to a workmate goes through `leftTo`, which leaves it only while that workmate "is about: in sight, or seen not long since" (`HOLDER_ABOUT_DS`, one minute). If they are nowhere to be seen, whoever is there does it.

Sending for a janitor is the one piece that does not go through `leftTo`. `tidyStep` asks `roomsKeeper(brain)`, which is only "the first name in `brain.duties` that has the rooms". It does not ask where they are. So if the keeper of the rooms is arrested and put in a cell, is knocked out in another room, is dead, or is shut in somewhere, the other technician's step for every mess is, for as long as that lasts:

"There is a mess in the Cargo Bay. Maria Williams has the rooms this shift, and sends for a janitor when one is wanted."

No call is sent. The `tidy` task stays open and not ready. `brain.duties` is never emptied, and a dead technician is never dealt out of it (the Quartermaster only says new lines to those present), so for a keeper who is dead this lasts the round.

One concrete case: Maria has the shuttle and the rooms, Sam the counter. The Captain declares a warrant on Maria and she is taken to the Brig for fifteen minutes. A crate of oil is dropped in the Cargo Bay. Sam's `areaMesses` has the bay, a `tidy` task is added, and `plan` goes to `tidyStep` (a `tidy` task has no duty in `dutyOf`, so the `leftTo` test at the top of `plan` does not apply). `keeper` is "Maria Williams", which is not Sam, so the step is not ready. Sam unloads the shuttle and makes the rounds for Maria, because those do go by `leftTo`, and walks through the oil for fifteen minutes without calling anyone.

The comment above the test gives the reason it was added (two technicians each sent the same janitor the same calls), and that reason stands only while the keeper is there to do the calling.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1537`, in `tidyStep`:

    // Once the Quartermaster has divided the work, sending for a janitor goes with the rooms. ...
    const keeper = roomsKeeper(brain);
    if (keeper && keeper !== brain.name) {
      return {
        ready: false,
        step: `There is a mess in the ${place}. ${keeper} has the rooms this shift, and sends for a janitor when one is wanted.`,
      };
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1350`:

    function roomsKeeper(brain: NpcBrain): string | undefined {
      return Object.entries(brain.duties).find(([, parts]) =>
        parts.includes('rooms'),
      )?.[0];
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:284`, what `leftTo` does and `tidyStep` does not:

    return (
      holders.find(
        (name) =>
          brain.peopleInView.some((person) => person.name === name) ||
          brain.now - (brain.people.get(name)?.at ?? -Infinity) < HOLDER_ABOUT_DS,
      ) ?? null
    );

`dutyOf` at line 253 names what counts as "rooms" work, and a `tidy` task is not in it:

    if (task.kind === CHECK || isRounds(task) || isTidying(task)) {
      return 'rooms';
    }

## How it was found

Read from the code, not seen in a round. `LLM_CREW_PLAN_QUARTERMASTER.md` says "A technician leaves another's part alone while that workmate is about. If the workmate has been out of sight for a minute, it sees to it." This step does not keep to that.

## How to fix it

1. In `tidyStep`, replace the test with `const theirs = leftTo(brain, 'rooms'); if (theirs) { ... step names theirs ... }`. `leftTo` already returns null when the rooms are this technician's own, when nobody has divided the work, when the Quartermaster has sent this one to see to things (`seeToUntil`), and when the keeper has not been seen for a minute.
2. The two-callers fault the test was written for is still covered when both are about, and when the keeper is away there is only one caller. The server's `workmate_called` flag (`brain.workmateCalled`) and the shared list in `expected.ts` still stop a second call on top of a first.
3. Each technician keeps its own `brain.janitorCalls`, so the one stepping in does not know who has already said the mess is beyond them. When stepping in, read the department's shared list as well: `expectedCall(brain.post, name, brain.now, place)` says who was called to that room. Skip a janitor who is still expected there and was called less than `CALL_AGAIN_DS` ago.
4. `roomsKeeper` is also used for doors (`doorIsMine`, which has its own wait) and in `cues`. Leave those.
5. See CARGO-12 for the other half: a keeper who is in sight but down or in cuffs still counts as about.

## How to test the fix

- Simulator: the `qm` scenario divides the work. Add a step that takes the technician with the rooms out of the bay for good and puts a mess in the bay, and check that the other one sends the janitor a PDA message within a few minutes.
- Type check.
- In a round: `pda.log` should show a call for a janitor from the technician who does not have the rooms, after the one who does has been taken to the Brig.
