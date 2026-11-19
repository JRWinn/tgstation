---
id: CARGO-18
title: A technician the Quartermaster sends to see to a crate that would not go out to the lobby is given nothing to do about it, and the one who failed tries again alone
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2126, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:455, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1046, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:196
fix: When the see-to line names a held crate that would not go out to the lobby, have the technician sent take a hand-over task for that number, and have the one who failed drop its own
---

## What is wrong

See also: QM-05

When a haul is given up, the technician tells the Quartermaster in fixed words, and the Quartermaster sends another technician: "Sam, crate #12 is in the Cargo Bay and Cora could not get it out to the lobby. See to it, please." (`seeToLine`). All the sent technician does with that line is set `seeToUntil`, which for five minutes makes the shuttle and the rooms its work as well as whoever they were given to.

That is enough for a crate that would not come off the shuttle (`unload`), go aboard (`recycle`) or come clear of a door (`stow_crate`): those are shuttle and rooms work, and the freight tasks pick the crate up again. It does nothing for a crate that would not go **out to the lobby** (`release`). Bringing a held crate out is not shuttle or rooms work. It is the `handover` task, and that task exists only in the brain of the technician who heard the collector ask (`brain.pickupAsked`, set in `overhears`). The technician sent has no `pickupAsked` for crate #12, so it has no task about it at all, and carries on as before.

Meanwhile the technician who failed still has its `handover` task (its `pickupAsked` is under two minutes old), so after the driver's back-off it tries the same release again by itself, which is the very thing the Quartermaster decided against: "With only the one technician, that one is told to try again", otherwise another is sent.

Concrete case, two technicians, the work divided (Cora the counter, Sam the shuttle and the rooms):

1. Jan comes to the counter: "Cora, I am here to collect crate 12 for Hop Kins." Cora's `pickupAsked = {Jan, 12}`; `syncHeld` gives her a `handover` task.
2. Cora's `release(12)` gives up: the crate kept catching. She puts it clear in the bay. `brain.gaveUp = {tool: 'release', what: 'crate #12', leftIn: 'Cargo Bay'}`.
3. `syncWontCome` has her tell the Quartermaster: "Ada, I could not get crate #12 out to the lobby. It is in the Cargo Bay, clear of the doors." Ada: "Cora, I have that."
4. Ada's `crateHeldUp`: first time, another technician in view, so `sendFor = Sam`: "Sam, crate #12 is in the Cargo Bay and Cora could not get it out to the lobby. See to it, please."
5. Sam's `overhears`: `SEE_TO_WORDS` matches, `seeToUntil = now + 3000`. Sam already has the shuttle and the rooms. Nothing else changes; Sam has no task naming crate 12.
6. Cora's `handover` is still open, so she tries `release(12)` again on her own. If it fails again and she tells Ada a second time, Ada sends Hop Kins "Held up at cargo ...", though nobody else ever tried.

Jan stands at the counter through all of it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2126`, in `overhears`, all that the see-to line does:

    const seeTo = isQuartermaster(speakerJob)
      ? heard.trim().match(SEE_TO_WORDS)
      : null;
    if (seeTo) {
      if (seeTo[1].toLowerCase() === firstName(brain.name).toLowerCase()) {
        brain.seeToUntil = brain.now + SEE_TO_DS;
      }
      return;
    }

`cargo.ts:455`, in `syncHeld`, a hand-over only ever comes from this brain's own `pickupAsked`:

    const asked = brain.pickupAsked;
    const crate =
      asked && asked.number !== null && brain.now - asked.at < PICKUP_ASK_DS
        ? brain.heldCrates.find((held) => held.number === asked.number)
        : undefined;

`cargo.ts:253`, `dutyOf`, which leaves the hand-over out of the shuttle and the rooms:

    if (task.kind === CHECK || isRounds(task) || isTidying(task)) {
      return 'rooms';
    }
    return freightDuty(task);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:196`, release is one of the hauls the Quartermaster is told of:

    const WONT_COME_HOW: Record<string, string> = {
      unload: 'off the shuttle',
      recycle: 'aboard the shuttle',
      release: 'out to the lobby',
      stow_crate: 'clear of the door',
    };

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1046`, in `crateHeldUp`, the choice to send someone else.

## How it was found

Read from the code on both sides: every use of `SEE_TO_WORDS`, `seeToUntil` and `pickupAsked`, and the Quartermaster's `crateHeldUp`. Not seen in a round. QM-05 is the same line for a shut-in workmate; LOGB-07 is the line being said after the crate got out. Neither covers a release.

## How to fix it

1. In `overhears`, when the see-to line is to this technician and its words have "out to the lobby" and a crate number (`#(\d+)`), set this technician's own `brain.pickupAsked = { name: <crate's for, from heldCrates>, number: N, at: brain.now }` as well as `seeToUntil`. `syncHeld` then makes the `handover` task, and `release` brings the crate out. Better still, keep a separate `brain.seeToCrate = {number, at}` that `syncHeld` reads alongside `pickupAsked`, so a later real ask at the counter does not wipe it.
2. The collector's name is not in the line. Either leave `person` off the `release` (the server falls back to whoever it last heard, and the lobby line then says "Someone"), or have the Quartermaster put it in: "... could not get it out to the lobby for Jan". If the latter, extend `WONT_COME_WORDS`/`wontComeLine` to carry it. That is a wording change the owner may want to approve.
3. The technician who failed should stand down once the Quartermaster has the word: in `syncWontCome`, when a `wont_come` task for a `release` is `passedOn`, set `brain.pickupAsked = null` for that number so its `handover` closes. With only one technician, the Quartermaster's "try again" line should then set it back; add the reading of `tryAgainLine` (supply.ts:235, read by nobody today) to do so.
4. Leave `seeToUntil` as it is for the other three hauls.

## How to test the fix

- Simulator: two technicians with the work divided and a Quartermaster; a collector asks the counter technician for a held crate; make its first `release` give up. Want the Quartermaster's see-to line, then the other technician's `release` of that number, and no second `release` from the first.
- Type check.
- In a round, grep `game.log` for "could not get it out to the lobby. See to it" and look for the named technician's `release(` in the next minute.
