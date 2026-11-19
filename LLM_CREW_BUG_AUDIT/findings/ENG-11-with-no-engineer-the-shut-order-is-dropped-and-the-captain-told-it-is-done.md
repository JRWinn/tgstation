---
id: ENG-11
title: With no engineer to give it to, the emitters-off order is dropped without a word, while the Captain is told the emitters are being switched off and every report after says the engine was shut off
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:327, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:169
fix: When the shut order has nobody to go to, tell the Captain the emitters are still on and nobody is aboard to switch them off, and keep the order open so it goes to the first engineer that turns up
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

1. Keep the shut order when there is no engineer: change the drop to apply to `light` and `relight` only. For `shut`, let `giveStep` answer not-ready with no wait ("You have nobody to send to switch the emitters off.") so it holds nothing, and it goes out the moment `engineer(brain)` gives a name.
2. Word the Captain's line by what is true: when `engineer(brain)` is null at the moment of the shut, send "The engine is losing integrity: N percent. I have no engineer to switch the emitters off." instead.
3. In `engineWords`, while `shut && !emittersOff`, say "I have ordered the emitters off, and have not heard that they are." rather than "has been shut off".
4. Owner's question: with no engineer, does the Chief Engineer go and switch the emitters off itself? The tool already lets any engineering staff work the emitters (`works_in_engineering` in `tool_work_machine`), and `emitterSteps` gives the steps.

## How to test the fix

- `tools/llm_crew/engine.ts`: a Chief Engineer with no engineer in `peopleInView` or `pdaPeople`, reading integrity 90: the Captain's line must say there is no engineer, and the shut order must still be there after the sync.
- Same brain, then an engineer added to `pdaPeople`: the next plan is the PDA "Emitters off, now".
