---
id: ENG-04
title: A door the Chief Engineer has handed to an engineer is waited on for ever, and security, told "I am sending X", hears nothing more if X never reports
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:217, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:256, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:873
fix: Give each entry of forcing.sent a time limit, and when it passes with no word back tell whoever asked that engineering has not been able to open the room, and drop the entry
---

## What is wrong

When security asks the Chief Engineer to have a door forced, `forcingReads` does three things at once: it notes the job in `forcing.sent`, it sends the engineer the order by PDA, and it tells security "I am sending Kim to open the Bar." From then on the Chief Engineer only waits for the engineer's `DONE_WORDS` or `FAILED_WORDS`. There is no time limit on `forcing.sent`, nothing reads its `at`, and nothing is sent to security if the word never comes.

The word can fail to come in several ordinary ways:

- **The order never reaches the engineer.** `send` puts it in `toTell`. The driver takes a line out of `toTell` the moment the step that sends it is chosen (`brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells)` in `driver.ts`), before the server answers. A PDA message that does not go (the network down, as when the power fails, or the Chief Engineer's PDA gone) is lost, and nothing sends it again. A line that waits in `toTell` more than two minutes (`TELL_KEPT_MS`) because the Chief Engineer was busy is dropped too.
- **The engineer's word back does not reach the Chief Engineer**, by the same two routes.
- **The engineer is dead, in a cell, or a player** (ENG-03): it never answers.
- **The engineer left off the job part way** ("left off forcing" in `force_door_open`): the server tells the brain nothing ("Nobody is told it: the errand is no longer this one"), and if the job is then dropped some other way, nothing goes back.

In each case the Head of Security has been told someone is coming and hears no more. `askEngineering` will not ask again for the same room for ten minutes (`ASK_AGAIN_DS`), and when it does, the Chief Engineer sends the same engineer again, adds a second entry for the same room to `forcing.sent`, and tells security "I am sending Kim" again.

One case: twenty minutes in the station power fails and PDA messages stop (the owner's memory note "station power fails early"). An officer is shut out of the Bar; the Head of Security's ask to the Chief Engineer was sent just before the network went. The Chief Engineer's `send` to the engineer fails. `forcing.sent` now holds `{ room: 'Bar', to: 'Kim ...', askedBy: 'Ray ...' }` and will for the rest of the round. Security was told "I am sending Kim to open the Bar." and waits; nobody tells the Captain that the door was never opened.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:217`, in `forcingReads`:

    if (engineer) {
      // It is given to an engineer, and security is told who is coming.
      forcing.sent.push({ room, to: engineer, askedBy: from, at: brain.now });
      send(
        brain,
        engineer,
        forceOrderLine(firstName(engineer), room),
        ...
      );
      send(
        brain,
        from,
        forceSentLine(firstName(from), engineer, room),
        ...
      );

`jobs/forcing.ts:256`: the only place an entry leaves `forcing.sent` is a word back from an engineer.

    if (room && isChiefEngineer(brain.job) && isEngineer(fromJob)) {
      // Passed on to whoever asked.
      const sent = forcing.sent.find((it) => it.room === room);
      forcing.sent = forcing.sent.filter((it) => it !== sent);

`grep -n "forcing.sent\|\.sent\b" jobs/forcing.ts` finds no other reader. `syncForcing` looks only at `forcing.jobs`.

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:873`, in the driver: a line is struck from `toTell` when it is sent, not when it is known to have gone.

    if (step.tells) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
    }

## How it was found

Read from the code. Not seen in a round: the one round with a forcing job (`round-20.00.21`) had the network up, and the engineer answered.

## How to fix it

1. In `jobs/forcing.ts`, add a constant `SENT_WAIT_DS`, say 3000 (five minutes: a walk across the station, two goes at the door, and the word back).
2. In `syncForcing`, for the Chief Engineer, go through `forcing.sent`. For each entry older than `SENT_WAIT_DS`, drop it and `send` the one who asked `forceFailedLine(firstName(askedBy), room, 'nobody from engineering has said they opened it')`. The Head of Security already reads `FAILED_WORDS`: it then tells the Captain and clears `forcing.asked[room]` so it may ask again. Keep the reason free of "I", as `whyNot` asks.
3. When a new ask comes in for a room that already has an entry in `forcing.sent`, do not push a second entry or send "I am sending X" again: say the job is in hand.
4. For a PDA line that matters to a job (this, and the engine words), the lost-on-failure behaviour in the driver is the root. That is the driver's to mend (keep the line in `toTell` until the server answers `ok`), and other findings touch it. The time limit above is needed even then, for the dead or silent engineer.

## How to test the fix

- `tools/llm_crew/security.ts` has the forcing chain end to end. Add a case where the engineer never answers: after `SENT_WAIT_DS` the Head of Security must get a `FAILED_WORDS` line and the Captain a copy.
- Add a case with two asks for one room in a row: one entry in `forcing.sent`, one "I am sending" line.
- In a round, grep `pda.log` for "I am sending" and check each has a later "is open" or "could not open" for the same room.
