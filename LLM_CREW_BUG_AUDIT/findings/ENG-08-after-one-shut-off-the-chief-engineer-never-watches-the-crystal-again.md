---
id: ENG-08
title: After one shut-off the Chief Engineer stops watching the crystal, so an engine lit again by anyone but its own order loses integrity unwatched
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: e8b35692ae0
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:566, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:177
fix: Clear chief.shut when the engine is heard to be lit or on again, or when the crystal's energy is seen rising after the emitters were reported off, so that the usual integrity watch runs again
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

1. Do not test "energy over nothing" while shut, as first proposed here (`chief.emittersOff && reading.energy > ENERGY_NOTHING`). A crystal's energy does not drop to nothing when the emitters stop: it decays a little each tick (`calculate_internal_energy` in `code/modules/power/supermatter/supermatter.dm:713`, the powerloss terms), so for minutes after "the emitters are off" the energy is still well over 1 while integrity is still under 95. That test would set `shut` again and send the Captain "losing integrity" on every sync tick.
2. Watch for the energy rising instead. Add `energyAt?: number` to `ChiefWork` (`types.ts`), the last energy read while `shut && emittersOff`. In `syncTasks`, while `chief.shut && chief.emittersOff`, if `reading.energy` is higher than `energyAt` by a clear margin (say 50) on two readings running, the engine has been lit again by someone: set `chief.shut = false`, `chief.emittersOff = false`, `chief.litAt = brain.now`, and tell the Captain once, "The engine has been lit again." Then the usual floor test at line 279 runs on the next tick and, if integrity is under 95, gives the shut order and tells the Captain as it does now. Heat in the chamber can also add energy with the emitters off (`SM_POWER_HEAT`); then the order goes out again, the engineer finds every emitter off, and says so. That is harmless.
3. In `hearEngineer`, on `LIT_WORDS` or `ON_AGAIN_WORDS`, if `chief.shut` is true, clear `shut` and `emittersOff` (the engine is lit, whoever did it) so `engineWords` stops saying it is off and the floor test runs again. This alone covers the second NPC engineer, which says "the engine is lit" when it is done. Step 2 is for a player or the Captain lighting it by hand. With this step, an engineer's word that was owed from before the shut-off must not arrive after it and clear `shut` by mistake: in `engineer.ts`, where `SHUT_WORDS` is taken (`takeWord`, `engineer.ts:457`), drop any owed `lit` or `on` word from `engine.words`.
4. In `engineer.ts`, an engineer starting by itself could first ask the Chief Engineer, but that needs a word back and slows the first lighting; the watch above is the safety net and is enough. Owner's question: should an engineer that was not told anything start by itself at all once the round is past its first minutes? The two-minute rule (`STANDING_DS`, counted from that brain's own `bornAt`) was written for round start.

## How to test the fix

- `tools/llm_crew/engine.ts`: Chief Engineer with `shut = true`, `emittersOff = true`, readings of energy 500, 400, 300 and integrity 90 (decaying after a shut-off): no new shut order and no new Captain line.
- Same, with readings of energy 300, 400, 500 and integrity 90: `shut` is cleared and on the next sync a new shut order is made, with one Captain line.
- Same, with the engineer saying "Ada, the engine is lit.": `shut` false afterwards, `engineWords` says lit.
- Simulator: after the shut-off scenario, switch the toy emitters on from the sim side and drop integrity: the Chief Engineer must order them off again.
- Type check.

## Check

Checked by Opus 5.5 on 2026-11-19. Every quote matches the code: the floor test at `chiefengineer.ts:279` runs only while `!chief.shut`; `hearEngineer` at `:566` sets `litAt` and leaves `shut` alone, and `ON_AGAIN_WORDS` likewise only sets `litAt`; `engineWords` at `:169` reports `shut` first; and `lightAgain` at `:611` is the only place `chief.shut` is set false (grep). The engineer's start by itself at `engineer.ts:177` needs only `!engine.told && !engine.shut && !engine.shutting` and two minutes from that brain's `bornAt`, and `startLighting` clears its own `shut`; a newly spawned engineer, or one that was never sent the shut order, has `engine.shut` false and lights the engine. So the case holds: once shut, any later loss of integrity is never acted on until someone says "light the engine". Nothing in `LLM_CREW_CHANGELOG.md` (the 11:00 entry of 2026-11-18 built the shut-off) or `LLM_CREW_PLAN_ENGINEERING.md` covers a relight by someone else. The first fix proposed was wrong and was replaced: it would have fired on the energy left in the crystal after every shut-off (read in `supermatter.dm:713` to `:749`; energy decays, it does not drop to zero). Severity medium stands: it needs a shut-off and then a relight outside the Chief Engineer's order, but then the crystal can be lost unwatched. Effort small stands. Not run.
