---
id: ENG-11
title: With no engineer to give it to, the emitters-off order is dropped without a word, while the Captain is told the emitters are being switched off and every report after says the engine was shut off
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:327, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:169
fix: When the shut order has nobody to go to, tell the Captain nobody is aboard to switch the emitters off, raise the order again when an engineer turns up, and stop saying the engine has been shut off before it is heard to be
---

## What is wrong

When the integrity falls under 95 percent, `syncTasks` does three things at once: sets `chief.shut`, makes the shut order, and tells the Captain "The engine is losing integrity: 93 percent. I am having the emitters switched off." A few lines later, in the same call:

    // With no engineer aboard there is nobody to order.
    if (chief.order && !engineer(brain)) {
      chief.order = null;
    }

So with no engineer in sight or on its PDA, the order is thrown away. `shutGivenAt` was never set, so the "say it again after 90 seconds" branch (`chief.shutGivenAt !== null && ...`) never fires, and an engineer who turns up later is never told. `chief.shut` stays true, so the floor test does not run again (see ENG-08).

From then on everything the Chief Engineer says about the engine is wrong:

- The Captain was told the emitters are being switched off. Nothing more is sent.
- `engineWords` gives "The engine has been shut off: it was losing integrity." to every meeting's close and every report to the Captain, with the integrity reading after it, falling.
- Its voice is told "You have ordered the emitters off, and have not yet heard that they are."

The Chief Engineer does not switch them off itself. The plan's decision 2 is "It never works the engine room while an engineer is aboard", which leaves room for it when none is, as it already forces a door itself when it has no engineer (`forcing.ts`). KNB-11 asks the same question for lighting.

How a lit engine comes to have no engineer: a player who is not an engineer lit it (the Captain, an atmospheric technician, an assistant); or the NPC engineer's PDA is gone from the station's level (it was gibbed in the delamination's first blast, or taken off the station); or the owner spawned a Chief Engineer alone.

One case: the round's only NPC engineer died and was cremated; a player atmospheric technician lights the engine and leaves. At 50 minutes the integrity falls to 94. `chief.shut = true`, the Captain is sent "I am having the emitters switched off", `engineer(brain)` is null, the order is dropped. The engine goes on firing. At the next meeting the Chief Engineer says "The engine has been shut off: it was losing integrity. It is at 61 percent integrity. The meeting is over, thank you."

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279`, the Captain told before anyone is found to do it:

    if (reading && !chief.shut && reading.integrity < INTEGRITY_FLOOR) {
      chief.shut = true;
      chief.emittersOff = false;
      chief.litAt = null;
      chief.order = { what: 'shut', givenAt: null, sent: false };
      tellCaptain(
        brain,
        `The engine is losing integrity: ${Math.floor(reading.integrity)} percent. I am having the emitters switched off.`,
        ...
      );
    }

`jobs/chiefengineer.ts:327`, the order dropped:

    if (chief.order && !engineer(brain)) {
      chief.order = null;
    }

`jobs/chiefengineer.ts:169`, `engineWords`:

    if (chief.shut) {
      return `The engine has been shut off: it was losing integrity.${integrity}`;
    }

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. Have the order go out to the first engineer that turns up. The simplest way, which keeps the drop as it is: widen the "say it again" branch in `syncTasks` so that it also fires when the order was never given. Change `chief.shutGivenAt !== null && brain.now - chief.shutGivenAt > SHUT_AGAIN_DS` to `(chief.shutGivenAt === null || brain.now - chief.shutGivenAt > SHUT_AGAIN_DS) && !!engineer(brain)`. While there is no engineer the order is still dropped each sync, and the sync after an engineer appears on the PDA or in sight makes it again.
   Do not instead keep the shut order open with no engineer: `syncMeeting(brain, ENGINE_WAY, chief.order?.what === 'shut')` holds back every staff meeting while a shut order is open, so the Chief Engineer would hold none for the rest of the round. If that way is taken, change that argument to `chief.order?.what === 'shut' && !!engineer(brain)`. (`giveStep` already answers not-ready with no wait when `engineer(brain)` is null.)
2. Word the Captain's line by what is true: when `engineer(brain)` is null at the moment of the shut, send "The engine is losing integrity: N percent. I have no engineer to switch the emitters off." instead.
3. In `engineWords`, while `shut && !emittersOff`, say "I have ordered the emitters off, and have not heard that they are." rather than "has been shut off" (and, with no engineer, "The engine is losing integrity and I have no engineer to switch the emitters off."). This wording is wrong even with an engineer aboard, between the order and the engineer's word that they are off.
4. Owner's question: with no engineer, does the Chief Engineer go and switch the emitters off itself? The tool already lets any engineering staff work the emitters (`works_in_engineering` in `tool_work_machine`), and `emitterSteps` gives the steps.

## How to test the fix

- `tools/llm_crew/engine.ts`: a Chief Engineer with no engineer in `peopleInView` or `pdaPeople`, reading integrity 90: the Captain's line must say there is no engineer, and `engineWords` must not say "has been shut off".
- Same brain, then an engineer added to `pdaPeople`: the next plan is the PDA "Emitters off, now".
- Same brain with no engineer: a staff meeting must still be called on time (guards against the fix holding meetings back).

## Check

Opus 5.5, 2026-11-19. Read `jobs/chiefengineer.ts` today: `chiefOf`, `engineer`, `engineWords`, `syncTasks`, `giveStep`, `cues`, `lightAgain` and the word readers; `engineersAboard` and `isEngineer` in `jobs/engineering.ts`; `people_on_pda` in `crew_npc_cargo.dm`. All three quotes are as the code is. Traced: the floor test sets `chief.shut` and the order and sends the Captain "I am having the emitters switched off" before anything asks whether there is an engineer; the drop at "With no engineer aboard there is nobody to order" then nulls the order in the same call; `shutGivenAt` is set only where the order is said or sent, so the "say it again" branch, which needs `shutGivenAt !== null`, never fires; `chief.shut` stays true until `lightAgain`, so the floor test is not run again; `engineWords` and the `cues` line say what the finding says. Nothing in the change log or `LLM_CREW_PLAN_ENGINEERING.md` chose this: the 11:00 entry lists only that nothing lights the engine with no engineer. KNB-11 and ENG-08 are near but not the same fault.

`engineer(brain)` is null only when no one with "engineer" (not chief) in their job is in sight or on a PDA on the station level. `people_on_pda` does not ask whether the owner is alive, so a dead engineer whose body and PDA lie aboard still counts: that case sends the order to a corpse rather than dropping it, and is not this finding. The finding's cases (no engineer spawned, a non-engineer lit it, the PDA gone) stand. Severity medium kept: a rare case, but the Captain and every report are told the engine is off while it fires. Effort small kept. Fix step 1 rewritten: keeping the shut order open as first written would have stopped all staff meetings while no engineer was aboard (`syncMeeting(..., chief.order?.what === 'shut')`). Nothing run.
