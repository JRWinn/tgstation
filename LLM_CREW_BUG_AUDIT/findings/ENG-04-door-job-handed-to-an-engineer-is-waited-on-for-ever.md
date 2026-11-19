---
id: ENG-04
title: A door the Chief Engineer has handed to an engineer is waited on for ever, and security, told "I am sending X", hears nothing more if X never reports
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: ef99daa6810
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:217, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:256, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:874
fix: Give each entry of forcing.sent a time limit, and when it passes with no word back tell whoever asked that engineering has not opened the room, keeping the entry marked so a late word from the engineer is still passed on
---

## What is wrong

When security asks the Chief Engineer to have a door forced, `forcingReads` does three things at once: it notes the job in `forcing.sent`, it sends the engineer the order by PDA, and it tells security "I am sending Kim to open the Bar." From then on the Chief Engineer only waits for the engineer's `DONE_WORDS` or `FAILED_WORDS`. There is no time limit on `forcing.sent`, nothing reads its `at`, and nothing is sent to security if the word never comes.

The word can fail to come in several ordinary ways:

- **The order never reaches the engineer.** `send` puts it in `toTell`. The driver takes a line out of `toTell` the moment the step that sends it is chosen (`brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells)` in `driver.ts`), before the server answers. A PDA message that does not go (the network down, as when the power fails) is kept by the server and tried again every 20 seconds (`unsent_messages`, `resend_unsent` in `crew_npc_cargo.dm`), but only for eight minutes (`CREW_NPC_UNSENT_KEPT`); after that it is given up with a line in `game.log` and the brain is not told. A network down for longer than that loses the order. A line that waits in `toTell` more than two minutes (`TELL_KEPT_MS`) because the Chief Engineer was busy is dropped without being sent at all.
- **The engineer's word back does not reach the Chief Engineer**, by the same two routes.
- **The engineer is dead, in a cell, or a player** (ENG-03): it never answers.
- **The engineer left off the job part way** ("left off forcing" in `force_door_open`): the server tells the brain nothing ("Nobody is told it: the errand is no longer this one"), and if the job is then dropped some other way, nothing goes back.

In each case the Head of Security has been told someone is coming and hears no more. `askEngineering` will not ask again for the same room for ten minutes (`ASK_AGAIN_DS`), and when it does, the Chief Engineer sends the same engineer again, adds a second entry for the same room to `forcing.sent`, and tells security "I am sending Kim" again.

One case: twenty minutes in the station power fails and PDA messages stop (the owner's memory note "station power fails early"). An officer is shut out of the Bar; the Head of Security's ask to the Chief Engineer was sent just before the network went. The Chief Engineer's `send` to the engineer fails, is kept by the server, and is given up eight minutes later with the network still down. `forcing.sent` now holds `{ room: 'Bar', to: 'Kim ...', askedBy: 'Ray ...' }` and will for the rest of the round. Security was told "I am sending Kim to open the Bar." and waits; nobody tells the Captain that the door was never opened.

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

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:874`, in the driver: a line is struck from `toTell` when it is sent, not when it is known to have gone.

    if (step.tells) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== step.tells);
    }

## How it was found

Read from the code. Not seen in a round: the one round with a forcing job (`round-20.00.21`) had the network up, and the engineer answered.

## How to fix it

1. In `jobs/forcing.ts`, add a constant `SENT_WAIT_DS`, say 3000 (five minutes: a walk across the station, two goes at the door, and the word back).
2. In `syncForcing` (it is called from the Chief Engineer's `syncTasks`, `chiefengineer.ts:274`), when `isChiefEngineer(brain.job)`, go through `forcing.sent`. For each entry older than `SENT_WAIT_DS` and not yet given up on, `send` the one who asked `forceFailedLine(firstName(askedBy), room, 'nobody from engineering has said it is open')` and set `gaveUpAt = brain.now` on the entry (add the field to `ForcingWork['sent']` in `types.ts:479`). The Head of Security already reads `FAILED_WORDS` from a Chief Engineer (`forcing.ts:272` to `:299`): it tells the Captain and clears `forcing.asked[room]` so it may ask again. Keep the reason free of "I", as `whyNot` asks. The new line still ends in a full stop, which `FAILED_WORDS` needs.
3. Do not drop the entry at that point. The engineer may only be slow (a long walk, a second go at the door). If its "the door of the X is open" comes later, the lookup at `forcing.ts:258` must still find the entry so that security is told the door is open after all. Drop given-up entries after a second, longer limit (say 9000, fifteen minutes).
4. When a new ask comes in for a room that already has a live entry in `forcing.sent`, do not push a second entry or send "I am sending X" again. If the entry was given up on, replace it (new `at`, no `gaveUpAt`) and send the order and the "I am sending" line again as now.
5. The server's eight-minute resend covers a short outage. The time limit above is still needed for a longer one, and for the dead or silent engineer, and it is the only thing that tells security. Picking a different engineer on the second go is ENG-03's fix, not this one.

## How to test the fix

- `tools/llm_crew/security.ts` has the forcing chain end to end. Add a case where the engineer never answers: after `SENT_WAIT_DS` the Head of Security must get a `FAILED_WORDS` line and the Captain a copy.
- Add a case with two asks for one room in a row: one entry in `forcing.sent`, one "I am sending" line.
- Add a case where the engineer's "the door of the Bar is open." comes after the time limit: the Head of Security must still get the "is open" line and pass it to the officer.
- Type check.
- In a round, grep `pda.log` for "I am sending" and check each has a later "is open" or "could not open" for the same room.

## Check

Checked by Opus 5.5 on 2026-11-19. Every quote matches the code today (the driver line is now `driver.ts:874`, in the function that notes a step done). Read `forcing.ts` end to end: `forcing.sent` is written at line 217 and read only at lines 258 to 259, on a `DONE_WORDS` or `FAILED_WORDS` line from an engineer. A grep of the whole brain finds no other reader, and its `at` is never read. `syncForcing` looks only at `forcing.jobs`. Read the server side: `tool_message` keeps a message that would not send (`crew_npc_cargo.dm:721` to `:731`), and `resend_unsent` gives it up after `CREW_NPC_UNSENT_KEPT` (8 minutes; the order line has no " now" in it, so the 90-second limit does not apply) with only a `game.log` line. The brain struck the line from `toTell` when the step was chosen. Read the Head of Security's side (`forcing.ts:272` to `:299`): it does nothing more once told "I am sending", and `askEngineering` will not ask again for ten minutes. So with the order lost, or an engineer that never answers, security is never told. Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers a time limit here. Not a duplicate: ENG-03 points here for the wait, and HOLE-08 is the general rule about silent people, while this cause and fix stand alone. The fix was changed: as first written it dropped the entry at the time limit, which would have lost a late "is open" from a slow engineer (`forcing.ts:260` passes nothing on with no entry). Severity medium and effort small stand. Not run.
