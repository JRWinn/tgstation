---
id: KNA-01
title: A second ask for a door wipes out the first, so a technician says it is coming and never comes
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: cba515cfec5
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2319, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2281, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1380, tgui/packages/tgui/interfaces/CrewBrain/types.ts:1104
fix: Keep door asks as a list by asker, serve them oldest first, and strike one only when its door has been opened or it has run out
---

## What is wrong

Also written up as: CARGO-10

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

The new line need not be an ask at all, and need not come from anyone who could be let through (from CARGO-10). `DOOR_WORDS` (`cargo.ts:156`, `/\bdoor\b|let (me|us) (in|out|through)|open up/i`) matches any line with the word "door", and `overhears` takes it from anyone, a workmate included, unless `said_to` is `other`. The technician's own cues push the word into the crew's talk: `cargo.ts:1757` "You are opening the door for them now: say so if you speak of it", and `cargo.ts:1774` "If you answer, say that Maria is seeing to it". A case, two technicians, Maria has the rooms:

1. The janitor Jan says at the counter "Could you let me in, please?" Both technicians set `doorAsked = { name: 'Jan Mopp', ... }`. The door is Maria's; she is mid-haul.
2. Sam answers, as its cue tells it: "Maria is seeing to the door, Jan."
3. Maria hears it (it has her name in it, so it may not read as said to someone else), `DOOR_WORDS` matches, and her `doorAsked` becomes `{ name: 'Sam Tech', room: undefined, out: false }`. `mayPass` for Sam is null, `doorWanted` is null, and the `syncTasks` loop at `cargo.ts:873` closes her DOOR task for Jan.
4. If Maria had already set off, the door still opens, but the task is gone when the answer comes back, so `afterActing` finds no task: Jan is not noted as let in (`noteLetIn`), is not on the list of people to let out, and `lastOpened` is not set.

The same happens when a head at a staff meeting in the bay says anything about a door, when the Captain says "mind the door", and when a second person asks who may not be let in: the refusal goes to them and the first person's ask is gone. Whether `saidTo` in `addressing.ts` takes Sam's line as said to Jan was not run; if it does, the fault needs a line with no name in it ("I am getting the door."), which the model also says.

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
8. In the tick (`cargo.ts:843` to `:903`), `asked` is the one slot today. With a list: the "I am coming" promise goes to `askFrom(brain, wants.name)` (the entry being served), and the refusal walks every live `out: false` entry that `mayPass` turns down, each once. An asker who is waiting their turn is neither promised nor refused; if a word is wanted for them, make it "I will be with you after X", and only if the owner wants it.
9. `cargo.ts:1967` drops the entry whether the door opened or not (`ok` false too). Keep that: an open that failed should not be retried for ever, and the asker asks again.

10. (From CARGO-10.) In `overhears` and `readsMessage`, do not take a line from cargo staff as an ask unless they are asking to be let out: return early on `isCargo(speakerJob) && !LET_OUT_WORDS.test(heard)`. A technician that is shut in sends "I am shut in the ..." (`SHUT_IN_WORDS`), which has neither "door" nor "let me", so that keeps working. With the list this is not needed for correctness (a workmate's entry fails `mayPass` and is passed over), but it keeps chatter out of the list.

A smaller stopgap, if the list is too much for one sitting: in `readsMessage` and `overhears`, do not overwrite a live ask with `out: true` from someone else; queue the newcomer in a second slot. I would do the list: three janitors make the two-slot version wrong again.

Keeps the rules: senses only (the asks are PDA messages and speech the body received), code does the work.

## How to test the fix

- Simulator: add a scenario to `tools/llm_crew/sim.ts` with two janitors let into two different cargo rooms who both send the let-out message to the same technician within five seconds. Pass when both doors are opened. The existing door scenarios (`nested`, `aside`, the janitor ones) must still pass.
- A table of cases or a throwaway bun script on `CARGO.readsMessage` (`jobs/cargo.ts:1893`) and what the tick then wants (`CARGO.syncTasks`, the DOOR task it adds): two let-out asks from two names, then the first served and opened (`afterActing` with `ok`), then the second must be what is wanted next. Also a third ask from the first name again must replace its own entry, not add one.
- (From CARGO-10.) A unit case: a brain with a standing ask from an expected janitor, then `overhears` a line from a workmate with "door" in it; the janitor's ask must still be what `doorSought` serves. And the simulator with a chatty model (`chatty` as the last argument), the `crew` and `nested` scenarios with two technicians: one ask from the janitor leads to one `open_door` and a let-in note, with the other technician talking.
- Type check from `tgui/`.
- Next round, `game.log`: every "was told by its brain to PDA X: X, I am coming to the ... door of the ... to let you out" should be followed within a minute or so by "opened ... to let X out of ...". Count the ones that are not.

## Check

Checked by Opus 5.5, 2026-11-19. Confirmed.

- The quotes are what the code says today: `readsMessage` (`cargo.ts:2319`) and `overhears` (`cargo.ts:2281`) both assign `brain.doorAsked` whoever it is from; `doorSought` (`cargo.ts:1380`) reads only that slot; the promise at `cargo.ts:860` is sent as soon as the DOOR task is added; the loop at `cargo.ts:873` finishes any DOOR task not for `wants`.
- Looked for what else could bring the first asker back. The knock (`brain.knockAt`, `cargo.ts:1404`) would name a janitor let in by this technician (`stillInside`), but it is read only after a live ask, and it lasts `DOOR_ASK_DS` (60 s): Collin's door was not opened until 84 s after his ask, so any knock from Marina had run out by then. The long stop (`cargo.ts:1475`) skips a room with a mess in it, and the Mining Office still had rubble. Nothing else names her.
- Read the round log: `data/logs/2026/11/19/round-20.00.21/game.log` lines 628 to 691 are as the finding says. Jaden let Marina into the Mining Office at 02:12:51 ("opened Mining Dock Maintenance to let ... into Mining Office"), promised her the door at 02:14:05, overwrote the slot with Collin's ask four seconds later, and opened only Collin's at 02:15:29. `grep -c "to let *no key*/(Marina Shaffer) out"` gives 0.
- No later change log entry touches `doorAsked`. Only the 15:00 entry's (2), which added `after`.
- Severity high stands: it leaves a janitor shut in for good, and two janitors finishing in cargo within a few seconds is common. Effort medium: window only, but `types.ts`, `brain.ts`, `jobs/cargo.ts` and `jobs/guarding.ts`, about 60 to 80 lines.
- Added steps 8 and 9 to the fix (the promise and the refusal in the tick also read the one slot) and a smaller test. No script was run.
