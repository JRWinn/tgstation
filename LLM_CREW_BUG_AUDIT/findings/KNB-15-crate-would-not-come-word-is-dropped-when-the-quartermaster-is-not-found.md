---
id: KNB-15
title: Word that a crate would not come is dropped without a trace when the Quartermaster is not found, and a technician who cannot reach its office door holds it five minutes for nothing
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:652, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:385, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1467, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:221
fix: When tellQuartermaster gives up on a would-not-come word, send the same line to the Quartermaster by PDA and have its readsMessage pass a technician's WONT_COME_WORDS to crateHeldUp
---

## What is wrong

See also: CARGO-02 (the same give-up path loses word that an order came in). This is the other word that path loses, and it is listed on its own in the change log.

The 2026-11-18 09:20 entry ("crates that get away, and crates in the way"), Known and not fixed, has two lines on it:

- "A technician who cannot walk to the Quartermaster, being shut aboard the shuttle, cannot say a crate would not come. It goes on trying to reach the Quartermaster's door until the word is five minutes old, then drops it. Nothing about it goes by PDA."
- "Whether a technician shut aboard the shuttle ever sends 'I am shut in' is not known."

Nobody came back to it. It is wider than the shuttle. A technician that gave up a haul and put the crate clear (`gaveUp` set in `ingest`) has a `WONT_COME` task to tell the Quartermaster. `tellQuartermaster` says it to the Quartermaster's face if it is in sight. If not, the technician goes to the Quartermaster's Office door, knocks, and waits a minute and a half (`AT_QM_DOOR_DS`). If nobody comes, or the Quartermaster was told twice and did not say "I have that", `tellQuartermaster` sets `task.byPda` and returns null, meaning "word goes by PDA as it always did".

For an order that has come in, there is a PDA fall-back (to whoever ordered: see CARGO-02). For a crate that would not come there is none. `syncWontCome` reads `byPda` as "done with" and closes the task:

    // Told and heard, or the Quartermaster was not to be found or did not answer: either way it is
    // done with. Nothing between the two of them goes by PDA, so there is no other way to send it.

The comment is no longer true. Since the 09:20 entry itself, one word between a technician and the Quartermaster does go by PDA: "I am shut in the ...", which the Quartermaster's `readsMessage` reads and acts on. And the Quartermaster's `readsMessage` has no branch for `WONT_COME_WORDS`, so even a would-not-come line sent by PDA would be ignored.

So whenever the Quartermaster is out of sight and out of its office (fetching paper from a bin in another department, walking up to a head, at the counter with the bay out of view, or dead), the word is dropped. Nobody is sent to see to the crate (`crateHeldUp` never runs), and whoever ordered it is never told it is held up (the second telling that would send them word never happens). Nothing is written to the round's log either.

A technician that cannot walk to the office door at all (shut aboard the docked shuttle, as in `round-00.56.30`, or shut in a cargo room) never knocks. `task.knockedAt` stays unset, so `waitedAtDoor` is never true and even the give-up is not reached. Each `go_to_door` fails and is backed off by the driver, until `gaveUp.at` is older than `WONT_COME_DS` (five minutes) and `owed` turns false. Then it is closed the same way.

Concrete case:

1. The Quartermaster gives Sam an order, then walks out of sight of the bay on other business (to a head who has asked to see it, or to a paper bin in another department).
2. The crate docks. Sam's haul off the shuttle loses its grip four times on someone standing in the shuttle airlock. `put_clear` leaves it in the Supply Shuttle, clear of the doors. `gaveUp` is set.
3. `syncWontCome` adds a `WONT_COME` task. The Quartermaster is not in view. Sam goes to the Quartermaster's Office door, knocks, and waits 90 seconds.
4. `tellQuartermaster` sets `byPda`. `syncWontCome` finishes the task and clears `brain.gaveUp`. No message is sent.
5. The Quartermaster comes back. Its book still says "Order 2. Given to Sam Tech." Nobody else is sent to the shuttle. The head who ordered waits.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:650`, in `syncWontCome`:

    // Told and heard, or the Quartermaster was not to be found or did not answer: either way it is
    // done with. Nothing between the two of them goes by PDA, so there is no other way to send it.
    if (telling && (telling.passedOn || telling.byPda || !owed)) {
      if (telling.passedOn && telling.item) {
        brain.wontComeTold[telling.item] = brain.now;
      }
      telling.reported = true;
      finishTask(brain, telling);
      brain.gaveUp = null;
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:385`, in `tellQuartermaster`, the give-up that only a knock reaches:

    const office = brain.headOffice;
    const waitedAtDoor =
      task.knockedAt !== undefined && brain.now - task.knockedAt > AT_QM_DOOR_DS;
    if (!office || waitedAtDoor) {
      task.byPda = true;
      return null;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1467`, the technician's PDA words it does read: the docked line, the own-crate line, and "I am shut in". Nothing reads `WONT_COME_WORDS` here; only `overhears` does, at line 1538.

## How it was found

Read from the code, starting from the two 09:20 lines. The face-to-face path is seen working: `grep -rh "GAME-SAY.*I could not get crate" data/logs` finds five such lines said to a Quartermaster (rounds 14.28.06, 15.52.18, 17.48.05 and 2026-11-19 20.43.32). The give-up path was not looked for in the logs: it leaves no line, which is part of the fault. Only some of the 27 "has given up hauling" lines in the logs are hauls `wontComeHow` names (collect_crate and take_back are not), so the five cannot be compared with them directly.

## How to fix it

The owner ruled that word between the Quartermaster and a technician goes face to face, and then allowed one exception by PDA ("I am shut in"). CARGO-02 asks the owner the same question for an order that came in. Ask once for both: "When a technician has looked for the Quartermaster and not found it, may the word go by PDA?" If yes:

1. In `syncWontCome`, when `telling.byPda` is set, the word is still `owed` and the body has a PDA (`brain.hasPda`), do not close the task. A sync function gives no step, so the step goes in `wontComeStep`: when `tellQuartermaster` returns null and `task.byPda` is set, return `{ ready: true, act: { tool: 'message', person: quartermaster.name, text: wontComeLine(...) } }`, as the waiting-crate path just above it does for whoever ordered. In cargo's `afterActing`, on that `message` for a `WONT_COME` task, set `task.sentByPda = true` (a new field on `Task`) whether it went or not, and set `wontComeTold[item]` if `ok`. `syncWontCome` then closes on `sentByPda` instead of `byPda`. With no PDA, close as now.
2. In `tellQuartermaster`, also set `byPda` when the `go_to_door` for the office has failed twice (keep a count on the task, as `unheard` is kept, counted in cargo's `afterActing` on `act.tool === 'go_to_door' && !ok`, where the `knock` bookkeeping already is), so a body that cannot reach the door does not hold the word for five minutes. `tellQuartermaster` is shared with the order-came-in and still-waiting words, so this change reaches those too; that is wanted.
3. In the Quartermaster's `readsMessage`, under `isTechnician(job)`, match `WONT_COME_WORDS` and call `crateHeldUp(brain, from, stuck[1].trim(), stuck[2], stuck[3] ?? null)`, as `overhears` does. Do not push the "I have that" line: the PDA result is the technician's proof it was sent.
4. Mend the comment at `cargo.ts:650`.
5. If the owner says no: at least log it. Add a sense event or a `game.log` line when the word is dropped, so a round shows it.

## How to test the fix

- Type check.
- Simulator: `qmstuck` makes `unload` fail by hand. Add a variant in which the Quartermaster is sent off to a far room before the shuttle docks. Check that it is sent "I could not get crate #N off the shuttle" by PDA and that another technician is then told "See to it, please."
- In a round: `grep -n "could not get crate" pda.log` should show the line whenever `game.log` has "has given up hauling" and the Quartermaster was away.

## Check

Checked by Opus 5.5. Read `tellQuartermaster` (`cargo.ts:328-410`): `byPda` is set only after two unheard tellings (362) or, with the Quartermaster out of sight, when there is no office or the knock was 90 seconds ago (`AT_QM_DOOR_DS = 900`, 385-390). `knockedAt` is set only in `afterActing` on a successful `knock` (`cargo.ts:1931`), so a body whose `go_to_door` keeps failing never reaches that give-up. Read `syncWontCome` (`cargo.ts:637-675`): `byPda` closes the task and clears `brain.gaveUp` with nothing sent, and `wontComeStep` (678-700) has no PDA step either; `WONT_COME_DS = 3000` is the five minutes. Read the Quartermaster's `readsMessage` (`quartermaster.ts:1445-1494`): a technician's PDA is read for `DOCKED_WORDS`, `ARRIVED_WORDS` and `SHUT_IN_WORDS` only; `WONT_COME_WORDS` and `crateHeldUp` are reached only from `overhears` (1538-1547). The two lines quoted from the 09:20 entry are at `LLM_CREW_CHANGELOG.md:995-996` and no later entry touches them. Not a duplicate: CARGO-02 is the order-came-in word on the same give-up, and CARGO-18 and LOGB-07 are about the face-to-face path. Confirmed. I raised effort to medium (three changes across `cargo.ts`, `quartermaster.ts` and a `Task` field) and put the PDA step in `wontComeStep`, since `syncWontCome` gives no step.
