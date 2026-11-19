---
id: ENG-07
title: An engineer given the engine by PDA never answers that it has it, so the Chief Engineer sends the order again every minute until the engine is lit
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:477, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:314, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:730
fix: Have the engineer answer a light order that came by PDA with "The engine, right away." by PDA, and let the Chief Engineer give the order at most twice before it waits on the lit or stuck word instead
---

## What is wrong

The Chief Engineer gives the engine and waits to hear "The engine, right away." (`ENGINE_TAKEN_WORDS`). With nothing heard in a minute (`TAKEN_WAIT_DS`), it gives the order again.

The engineer says that line only when the order was said aloud in its hearing. `takeWord` is called with `aloud = false` from `readsMessage`, and then it takes the order and says nothing back:

    if (aloud) {
      brain.toTell = brain.toTell.filter((tell) => tell.line !== ENGINE_TAKEN);
      brain.toTell.push({ to: from, line: ENGINE_TAKEN, ... });
    }

The Chief Engineer sends the order by PDA whenever the engineer is not in sight (`giveStep`), which is the usual case for every light order outside the first meeting: the Captain's "light the engine" after a shut-off (`lightAgain`), and the re-give after a minute of silence. So:

1. The order goes by PDA. `afterActing` sets `lightGivenAt = brain.now`, `lightTaken = false`, `order = null`.
2. The engineer takes it and starts lighting. It does not answer.
3. A minute later `syncTasks` finds `lightGivenAt !== null && !lightTaken` and makes the order again. It goes by PDA again.
4. And so on, once a minute, until the engineer's "the engine is lit" or "I cannot light the engine" arrives, which is some minutes for 21 steps on 16 machines.

The engineer gets the same PDA four or five times, the Chief Engineer walks to Engineering to find it if its PDA will not send (`giveStep`'s third branch), and its cue says "You have given your engineer the engine to light, and have not yet heard that they have it" the whole time. If the engineer is a player (ENG-03), it never ends.

One case: the integrity fell, the emitters were switched off, the Captain PDAs the Chief Engineer "light the engine". `lightAgain` sets the order. The Chief Engineer is in its office, the engineer at its post. The order goes by PDA at t. The engineer takes it, says nothing, and works the steps. The Chief Engineer sends "Sam, the engine is yours. Light it now, please." again at about t+60 s, t+120 s, t+180 s, t+240 s.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:470`, `takeWord`:

    if (LIGHT_WORDS.test(text)) {
      // Given the engine while it is already lighting it, it carries on from where it is.
      if (!lighting(engine) && !engine.lit) {
        startLighting(engine, from);
      } else {
        engine.by ??= from;
      }
      if (aloud) {
        ...
      }
      return;
    }

`jobs/engineer.ts:519`, `readsMessage`: a PDA order is taken with `aloud = false`.

    if (isChiefEngineer(job)) {
      takeWord(brain, from, text, false);
    }

`jobs/chiefengineer.ts:314`, `syncTasks`: no limit on how many times.

    if (
      !chief.order &&
      !brain.meeting &&
      !chief.shut &&
      !chief.stuck &&
      chief.litAt === null &&
      chief.lightGivenAt !== null &&
      !chief.lightTaken &&
      brain.now - chief.lightGivenAt > TAKEN_WAIT_DS
    ) {
      chief.order = { what: 'light', givenAt: null, sent: false };
    }

`jobs/chiefengineer.ts:738`, `afterActing`: a sent order starts the minute again.

    } else if (LIGHT_WORDS.test(text)) {
      chief.lightGivenAt = brain.now;
      chief.lightTaken = false;
    }

## How it was found

Read from the code. Not seen in a round: no round has had a light order sent by PDA.

## How to fix it

1. In `takeWord`, when `aloud` is false, push the same `ENGINE_TAKEN` line with `byPda: true` instead (the Chief Engineer's `readsMessage` already passes an engineer's PDA to `hearEngineer`, which reads `ENGINE_TAKEN_WORDS` either way).
2. In `chiefengineer.ts`, count the light orders given since the last word from the engineer (`ChiefWork.lightTries`), and stop re-giving after two. With no word at all after that, tell the Captain "Sam has not answered the order to light the engine" once.

## How to test the fix

- `tools/llm_crew/engine.ts`: engineer brain gets `LIGHT_WORDS` by PDA: `toTell` must hold a PDA line matching `ENGINE_TAKEN_WORDS`.
- Simulator `engine` scenario variant where the light order is sent by PDA (engineer out of sight): count the light orders in the log, expect one.
