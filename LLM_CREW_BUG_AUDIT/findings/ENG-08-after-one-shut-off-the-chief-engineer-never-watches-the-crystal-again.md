---
id: ENG-08
title: After one shut-off the Chief Engineer stops watching the crystal, so an engine lit again by anyone but its own order loses integrity unwatched
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:566, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:177
fix: Test the integrity floor whenever the reading shows energy in the crystal, shut or not, and clear chief.shut when the engine is heard or read to be lit again
---

## What is wrong

The integrity watch in `syncTasks` only runs while `chief.shut` is false:

    if (reading && !chief.shut && reading.integrity < INTEGRITY_FLOOR) {

Once the Chief Engineer has had the emitters switched off, `chief.shut` stays true until someone it answers to says "light the engine" (`lightAgain`). Nothing else clears it. Not the engineer saying "the engine is lit" (`hearEngineer` sets `litAt` and clears `stuck`, and leaves `shut` alone), and not the monitor showing energy in the crystal again.

So if the engine is lit again any other way, the Chief Engineer believes it is off, reports "The engine has been shut off" at every meeting and to the Captain, and never orders the emitters off again, however far the integrity falls. Ways it is lit again:

- **A player engineer, or the Captain, switches the emitters back on.** The plainest case: a player sees the dark engine and lights it.
- **A second NPC engineer starts by itself.** `syncTasks` in `engineer.ts` starts any engineer that has not been told anything two minutes after it was first heard of (`!engine.told && !engine.shut && now - bornAt > STANDING_DS`). An engineer spawned by the owner after the shut-off, or one that was not the one sent the shut order (ENG-03), has `engine.shut` false and lights the engine, emitters and all. It then tells the Chief Engineer "the engine is lit", which is believed (`litAt`) and changes nothing about the watch.
- The order "light the engine" from the Captain worded in a way `LIGHT_AGAIN_WORDS` does not take (ENG-05), followed by the Captain doing it by hand.

One case: the integrity fell to 94 at 30 minutes, the emitters went off, `chief.shut` is true. At 35 minutes the owner, seeing the dark station, spawns a second Station Engineer. At 37 minutes it starts by itself, walks the 21 steps (each "already so" but the emitters) and switches the three emitters on. Whatever broke the cooling the first time is still broken. The integrity falls again: 90, 80, 50. `syncTasks` skips the floor test every time because `chief.shut` is true. The Chief Engineer's meeting closes with "The engine has been shut off: it was losing integrity. It is at 50 percent integrity."

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279`, `syncTasks`:

    // The crystal is coming apart. The emitters go off, and nothing comes before that.
    if (reading && !chief.shut && reading.integrity < INTEGRITY_FLOOR) {
      chief.shut = true;
      ...

`jobs/chiefengineer.ts:566`, `hearEngineer`: lit again does not undo `shut`.

    if (LIT_WORDS.test(text)) {
      heardIt();
      chief.litAt = brain.now;
      chief.lightTaken = true;
      chief.stuck = null;
      return;
    }

`jobs/chiefengineer.ts:169`, `engineWords`: `shut` is reported first, whatever the reading says.

    if (chief.shut) {
      return `The engine has been shut off: it was losing integrity.${integrity}`;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:177`, the start by itself, which knows nothing of a shut-off it was not told:

    if (
      !engine.told &&
      !engine.shut &&
      !engine.shutting &&
      brain.now - brain.bornAt > STANDING_DS
    ) {
      startLighting(engine, null);
    }

## How it was found

Read from the code. Not seen in a round: no round has had a shut-off.

## How to fix it

1. In `syncTasks`, run the floor test whenever the crystal has energy in it, shut or not: `if (reading && reading.integrity < INTEGRITY_FLOOR && (!chief.shut || (chief.emittersOff && reading.energy > ENERGY_NOTHING)))`. With the emitters reported off and energy rising, someone has lit it: give the shut order again, and tell the Captain "The engine has been lit again and is losing integrity."
2. Keep one Captain message per new loss: reset the "told" mark when integrity goes back over the floor.
3. In `hearEngineer`, on `LIT_WORDS`, if `chief.shut` is true, clear it (the engine is lit, whoever did it) so `engineWords` stops saying it is off, and the normal watch carries on.
4. In `engineer.ts`, an engineer starting by itself could first ask the Chief Engineer, but that needs a word back and slows the first lighting; the watch in step 1 is the safety net and is enough. Owner's question: should an engineer that was not told anything start by itself at all once the round is past its first minutes? The two-minute rule was written for round start.

## How to test the fix

- `tools/llm_crew/engine.ts`: Chief Engineer with `shut = true`, `emittersOff = true`, reading energy 500 and integrity 90: a new shut order must be made.
- Same, with the engineer saying "Ada, the engine is lit.": `shut` false afterwards, `engineWords` says lit.
- Simulator: after the shut-off scenario, switch the toy emitters on from the sim side and drop integrity: the Chief Engineer must order them off again.
