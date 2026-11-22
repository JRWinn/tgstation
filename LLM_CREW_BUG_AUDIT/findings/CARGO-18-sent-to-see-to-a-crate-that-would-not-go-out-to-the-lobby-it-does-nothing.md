---
id: CARGO-18
title: A technician the Quartermaster sends to see to a crate that would not go out to the lobby is given nothing to do about it, and the one who failed tries again alone
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 575029ccbcb
found_by: Opus 5.5
checked_by: Opus 5.5
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
6. While her `pickupAsked` is under two minutes old (`PICKUP_ASK_DS`, counted from Jan's ask, not from the give-up), Cora's `handover` is still open, so after the driver's back-off (20 seconds, `RETRY_MS`) she may try `release(12)` again on her own. If it fails again and she tells Ada a second time, Ada sends Hop Kins "Held up at cargo ...", though nobody else ever tried. Whether there is time for the retry depends on how long the haul and the telling took.
7. Once Jan's ask is two minutes old, `syncHeld` closes Cora's `handover` too. From then on no technician has crate 12 as work: held crates are brought out only on an ask (`planHeld`'s `release` is the only `release` in the window). Jan has to ask again.

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

1. In `overhears`, when the see-to line is to this technician and `seeTo[2]` has "out to the lobby" and a crate number (`crate #(\d+)`), keep a separate `brain.seeToCrate = {number, at}` as well as setting `seeToUntil`. Do not write it into `pickupAsked`: that would also take the order option away for two minutes (`offers`) and give the voice the cue "<name> has come to collect crate #N" for someone who is not there. `syncHeld` must read `seeToCrate` when it works out `item`: today it closes every `handover` whose item is not the one from `pickupAsked` (cargo.ts:464), so a hand-over task added any other way is closed again on the next sync. Let `seeToCrate` lapse after `SEE_TO_DS`, or when the crate is `out` or `takenBy`.
2. The collector's name is not in the line. Either leave `person` off the `release` (the server falls back to whoever it last heard, and the lobby line then says "Someone"), or have the Quartermaster put it in: "... could not get it out to the lobby for Jan". If the latter, extend `WONT_COME_WORDS`/`wontComeLine` to carry it. That is a wording change the owner may want to approve.
3. The technician who failed should stand down once the Quartermaster has the word: in `syncWontCome`, when a `wont_come` task for a `release` is `passedOn`, set `brain.pickupAsked = null` for that number so its `handover` closes. With only one technician, the Quartermaster's "try again" line should then set it back; add the reading of `tryAgainLine` (supply.ts:235, read by nobody today) to do so.
4. Leave `seeToUntil` as it is for the other three hauls.

## How to test the fix

- Simulator: two technicians with the work divided and a Quartermaster; a collector asks the counter technician for a held crate; make its first `release` give up. Want the Quartermaster's see-to line, then the other technician's `release` of that number, and no second `release` from the first. Let the haul and the telling take over two minutes from the ask: the sent technician must still bring the crate out.
- The same with a single technician: want "try ... again", then a second `release` from it.
- Type check.
- In a round, grep `game.log` for "could not get it out to the lobby. See to it" and look for the named technician's `release(` in the next minute.

## Check

Opus 5.5, 2026-11-19. Read the see-to branch of `overhears` (cargo.ts:2124), `leftTo` and `dutyOf` (cargo.ts:253-290), `syncHeld` and `planHeld` (cargo.ts:455, :540), `syncWontCome` and `wontComeStep` (cargo.ts:637-700), the `HANDOVER` part of `afterActing` (cargo.ts:1948), `ingest` setting `gaveUp` (brain.ts:715), the driver's back-off (driver.ts:52, :931), `crateHeldUp` and the `WONT_COME_WORDS` reader in quartermaster.ts (:1032, :1538), the words in supply.ts:196-238, and on the server `crate_released` (crew_npc_held.dm:343) and `gave_up_report` (crew_npc_grip.dm:318), which do send `gave_up` with tool `release`. Quotes match. The only `release` in the window is `planHeld`'s, fed only by this brain's own `pickupAsked`; `seeToUntil` only widens `leftTo` for shuttle and rooms work. So the technician sent has nothing to do with the crate. Confirmed. The change log (entry with `crateHeldUp`, lines 978-981) built the see-to for shuttle and rooms work and lists among known faults only that "try it again" changes nothing; release is not covered anywhere. Mended step 6, which is timing-dependent, added step 7 (the ask lapses and the crate is forgotten), and corrected fix step 1: writing into `pickupAsked` has side effects, and `syncHeld` would close any hand-over not drawn from it. Not seen in a round.

## Fix so far

Done on branch `m-cargo` (window only; new table `tools/llm_crew/cargo-seeto.ts`, 11 cases; simulator qmstuck, waiting, lost passed; not played):

- Step 1: in `overhears` (`jobs/cargo.ts`), a see-to line to this technician naming "crate #N ... out to the lobby" is kept in `seeToCrates` (a map by brain id, as `letOutTries` is, so no new brain field), as well as setting `seeToUntil`. `syncHeld` takes a hand-over for that number when there is no counter ask, marked `via: 'see_to'`, until the crate is out or taken or `SEE_TO_DS` has gone by. `planHeld` gives it its own step and a `release` with no person.
- Step 2: the first option, `person` left off; the lobby line then says "Someone". The Quartermaster's words are not changed.
- Step 3: in `syncWontCome`, once the Quartermaster has the word of a `release` give-up, the technician who failed clears `pickupAsked` for that number and finishes its hand-over. The Quartermaster's `tryAgainLine` is now read (`TRY_CRATE_AGAIN_WORDS` in `supply.ts`): told to try crate #N again, it takes the hand-over up again the same way.
- Step 4: the other three hauls are as before.

Not done: a simulator scenario with the release given up (the stand-in server cannot give one up today).
