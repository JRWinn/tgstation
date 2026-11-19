---
id: KNA-01
title: A second ask for a door wipes out the first, so a technician says it is coming and never comes
kind: bug
severity: high
effort: medium
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2319, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2281, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1380, tgui/packages/tgui/interfaces/CrewBrain/types.ts:1104
fix: Keep door asks as a list by asker, serve them oldest first, and strike one only when its door has been opened or it has run out
---

## What is wrong

A cargo technician keeps one ask for a door at a time (`brain.doorAsked`). When two people ask within a few seconds, the second ask overwrites the first. The technician has already answered the first by PDA, "I am coming to the X door of the Y to let you out", and then never goes, because nothing is left to say that anyone is waiting there.

This is the cause of a janitor left shut in a cargo room, which the change log reports in round after round without a cause ("A janitor was shut in the Head of Personnel's Office", 18:05 entry; the janitor shut in the Bitrunning Den for forty minutes, 15:00 entry). It is also the real cause behind the item "not looked into" in the entry of 2026-11-18, 20:19 to 20:40: "a janitor with no route from the Mining Office to the Bar Lounge three times". That janitor was shut in the Mining Office and had been promised a door twice.

The case, from `data/logs/2026/11/19/round-20.00.21` (log times are 6 hours ahead):

1. 02:14:05.105: Marina Shaffer (janitor, shut in the Mining Office) sends Jaden Prechtl "I am done in the Mining Office and am at the Mining Dock Maintenance door. Could you let me out to the Fore Port Maintenance, please?"
2. 02:14:05.172: Jaden answers "Marina, I am coming to the Mining Dock Maintenance door of the Mining Office to let you out."
3. 02:14:09.977: Collin Archibald (janitor, in the Cargo Bay) sends Jaden "I am done in the Cargo Bay and am at the Quartermaster Maintenance door. Could you let me out..."
4. 02:14:10.032: Jaden answers "Collin, I am coming to the Quartermaster Maintenance door of the Cargo Bay to let you out."
5. 02:15:29.001: Jaden "opened Quartermaster Maintenance to let Collin Archibald out of Cargo Bay".
6. Marina's door is never opened. `game.log` has no "to let Marina Shaffer out of" line in the round. At 02:15:06 she writes to the other technician, Osbert Mortland, and five seconds later Collin does too (02:15:10): the same overwrite, in Osbert's brain this time. Osbert opens neither. At 02:16:06 she writes to her head, who writes to the Captain.

Nothing in that order of events is unusual: two janitors called to cargo rooms finish within seconds of each other in most rounds.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2316`, in `readsMessage`: every PDA message with a door word in it replaces the slot, whoever it is from.

    if (!from || !DOOR_WORDS.test(text)) {
      return;
    }
    brain.doorAsked = {
      name: from,
      at,
      room: roomAskedIn(brain, text),
      byPda: true,
      out: LET_OUT_WORDS.test(text),
      door: doorNamed(text),
    };

`cargo.ts:2275`, in `overhears`: the same for an ask said aloud.

    brain.doorAsked = {
      name: speaker,
      at: brain.now,

`cargo.ts:1380`, in `doorSought`: the only place an ask is turned into someone to open a door for reads that one slot.

    const asked = brain.doorAsked;
    if (
      asked &&
      brain.now >= (asked.after ?? 0) &&
      brain.now - asked.at < (asked.out ? LET_OUT_ASK_DS : DOOR_ASK_DS)
    ) {
      const want = mayPass(brain, asked.name, asked.room, asked.out);

`cargo.ts:860`: the promise is sent the moment the task is added, before the door is opened, and `asked.answered` is on the slot that is about to be overwritten.

    if (asked?.byPda && asked.name === wants.name && !asked.answered) {
      asked.answered = true;

`cargo.ts:873`: the DOOR task for the first asker is then closed, because `doorWanted` no longer names them.

    for (const task of brain.tasks) {
      if (
        task.kind === DOOR &&
        task.state !== 'done' &&
        (task.item !== wants?.name || task.place !== wants?.room)
      ) {
        finishTask(brain, task);
      }
    }

The long stop at `cargo.ts:1475` (`LEFT_INSIDE_DS`, three minutes) does not save the first asker either: it skips a room that still has a mess in it (`brain.areaMesses[room]`), and the Mining Office still had rubble the janitor could not shift.

Other writers of the slot, which have the same effect: `cargo.ts:1967` (cleared when a DOOR task for that name is acted on) and `cargo.ts:2011` (the next door out, set after a door is opened: this can overwrite a waiting ask from someone else).

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-20.00.21`, `game.log` and `crew_brain.log`, the lines quoted above. Then read from the code. The overwrite was not run in a script.

## How to fix it

1. In `types.ts`, change `doorAsked` from one record or null to a list, or add `doorAsks: DoorAsk[]` beside it and keep `doorAsked` as a getter for the newest (fewer call sites change). Each entry keeps what the record holds now (`name`, `at`, `room`, `byPda`, `out`, `door`, `after`, `answered`, `refused`).
2. In `readsMessage` and `overhears`, replace only an entry from the same `name` (a second ask from the same person is the newer word). Push otherwise.
3. In `doorSought`, walk the list oldest first and return the first entry that is still live (`after` passed, not run out) and that `mayPass` and `doorIsMine` allow. Keep the "shut in one of its locked rooms, by PDA" fallback per entry.
4. Drop an entry when its door has been opened for that name (where `lastOpened` is set, and at `cargo.ts:1967`), or when it has run out (`LET_OUT_ASK_DS`, `DOOR_ASK_DS`). Do not drop it because another ask arrived.
5. `cargo.ts:2011` (the next door out for someone just let out of an inner room) pushes an entry for that name instead of assigning the slot.
6. The other readers of `brain.doorAsked` need the entry for the person they are about: `plan` for a DOOR task (`cargo.ts:971`), the refusal at `cargo.ts:886`, the two cues at `cargo.ts:1760` and `cargo.ts:1776`, and `jobs/guarding.ts:375` (`brain.doorAsked?.name === name`). Give them a helper `askFrom(brain, name)`.
7. Keep `brain.doorAsked` in `brain.ts:301` initialised to match.

A smaller stopgap, if the list is too much for one sitting: in `readsMessage` and `overhears`, do not overwrite a live ask with `out: true` from someone else; queue the newcomer in a second slot. I would do the list: three janitors make the two-slot version wrong again.

Keeps the rules: senses only (the asks are PDA messages and speech the body received), code does the work.

## How to test the fix

- Simulator: add a scenario to `tools/llm_crew/sim.ts` with two janitors let into two different cargo rooms who both send the let-out message to the same technician within five seconds. Pass when both doors are opened. The existing door scenarios (`nested`, `aside`, the janitor ones) must still pass.
- Type check from `tgui/`.
- Next round, `game.log`: every "was told by its brain to PDA X: X, I am coming to the ... door of the ... to let you out" should be followed within a minute or so by "opened ... to let X out of ...". Count the ones that are not.
