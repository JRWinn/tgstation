---
id: ENG-06
title: The Chief Engineer takes "the engine is lit" or "the emitters are off" from anything its engineer says, and the relight that follows can switch the emitters on before the cooling is running
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:537, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:672, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:463, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:359
fix: Take each of the engineer's set words only when the line begins with that whole fixed line (litLine(chief name) and so on; a remark may follow it), and let the engineer take a relight order only once the engine is lit, with RELIGHT not ready while lighting(engine)
---

## What is wrong

Two faults that together break the one rule engineering is built round: "the emitters are the last thing touched, and they are only touched when every step before them has been seen done" (`jobs/engine.ts`).

**1. The Chief Engineer reads its engineer's words from anything the engineer says.** `overhears` passes every line an engineer says in its hearing to `hearEngineer`, and `hearEngineer` tests the set words anywhere in the line:

    export const LIT_WORDS = /\bthe engine is lit\b/i;
    export const OFF_WORDS = /\bthe emitters are off\b/i;
    export const STUCK_WORDS = /\bI cannot light the engine: ([^.]+)\./i;
    export const ON_AGAIN_WORDS = /\bthe emitters are on again\b/i;

The engineer's voice is the LLM. Asked by anyone how the engine is going, it says what LLMs say: "I'll let you know once the engine is lit", "Nearly there, the engine is lit as soon as the emitters are on", "The emitters are off until the cooling is running". Each holds a set phrase. The engineer's fixed lines all begin with the Chief Engineer's first name ("Ada, the engine is lit."), but nothing checks that: not the name, not the start of the line, not who it was said to. The change log's 20:19 entry shows the engineer's LLM saying a door was forced when it was not, so the voice saying the engine is lit is not far-fetched.

Taken from chat:

- "the engine is lit" sets `chief.litAt`, `lightTaken`, clears `stuck`, and the Chief Engineer answers "Sam, I have that". From then on it believes the engine is lit.
- "the emitters are off", during an emergency shut-off, clears the shut order and tells the Captain "The emitters are off" while they are still firing.

**2. A relight order is obeyed while the engine is still being lit, and it skips the emitters-last rule.** Two minutes after `litAt`, with energy still at nothing (the engine is not lit yet), `syncTasks` orders "the emitters have stopped. Switch them on again, please." The engineer takes it whenever it is not shutting off:

    if (RELIGHT_WORDS.test(text)) {
      if (!engine.shutting && !engine.shut) {
        engine.relighting = true;
        engine.switched = [];
      }
      return;
    }

and its `RELIGHT` task switches on each emitter, with no look at `engine.done`. The rule that no emitter comes while a cooling step is undone lives only in `nextLightingStep`, which the `RELIGHT` plan never calls. Both tasks are `'asked'`. The older `LIGHT` task is chosen first while its step is ready. But a lighting step that fails once is held back by the driver for 20 seconds (`fail` in `driver.ts`), and then `RELIGHT` is the ready one. The changelog notes "Gas to Chamber" and "Gas to Filter" can each be reached from one tile only, so a first try that fails is likely.

One case: at 3:00 the engineer is on step 8 of 21. The Captain walks into Engineering: "How's the engine coming?" The engineer's voice answers "Going well, Captain, I'll tell you the moment the engine is lit." The Chief Engineer, standing in Engineering after the meeting, hears it: `LIT_WORDS` matches, `chief.litAt = now`. At 5:00, energy is 0: the Chief Engineer orders the relight. The engineer is at step 12, "turning on Gas to Chamber", which fails once ("You cannot reach the Gas to Chamber"). With `LIGHT` held back, the driver picks `RELIGHT` and switches the three emitters on, with the chamber's gas not yet going round. The crystal is hit with no cooling.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:672`, `overhears`: every line of an engineer, said to anyone.

    if (isEngineer(jobOf(brain, speaker))) {
      // At its meeting, a report is a report, whoever's turn it is.
      if (!hearReport(brain, speaker, heard)) {
        hearEngineer(brain, speaker, heard, true);
      }
      return;
    }

`jobs/chiefengineer.ts:566`, `hearEngineer`:

    if (LIT_WORDS.test(text)) {
      heardIt();
      chief.litAt = brain.now;
      chief.lightTaken = true;
      chief.stuck = null;
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:359`, `plan` for `RELIGHT`: no test of the lighting steps.

    if (task.kind === RELIGHT) {
      const next = emitterSteps(brain.machines, 'switch_on').find(
        (action) => !engine.switched.includes(action.key),
      );

Compare the engineer's own reading of the Chief Engineer, which does check the name: `if (!saidTo(brain, text)) { return; }` in `takeWord`.

## How it was found

Read from the code. The LLM remark is not seen in a round log: the brain log holds raw replies, and no round has had a relight. Confidence is "likely" because part 1 needs the voice to use one of the phrases; part 2, the relight skipping the rule once an order arrives, is certain from the code.

## How to fix it

1. In `hearEngineer`, take a set phrase only when the line is the fixed line: it begins with the Chief Engineer's own first name, as every fixed line the engineer says does. Use the same `saidTo(brain, text)` the engineer uses (it is in `jobs/engineering.ts`). Better still, match the whole fixed line: `^<first name>, the engine is lit\.$`, and so on for each.
2. In `jobs/engineer.ts`, `takeWord`: take `RELIGHT_WORDS` only when `engine.lit` is true. If it is still lighting, ignore the relight: the lighting list will switch the emitters on in their turn.
3. In `plan` for `RELIGHT`, as a second guard, return not-ready if `lightingSteps(brain.machines)` has any non-emitter step not in `engine.done`. That keeps the emitters-last rule in one more place it can be broken.
4. The voice should also not be able to say a set phrase it has not earned. A small check where the driver takes the LLM's `say`: if it matches any of engineering's `*_WORDS` and the job did not ask for that line, drop the phrase or the line. Owner's question: is that worth adding for every job's set words, not only engineering's? The same weakness is in the Quartermaster's and security's.

## How to test the fix

- `tools/llm_crew/engine.ts`: Chief Engineer overhears an engineer say "I'll tell you when the engine is lit." `litAt` must stay null.
- Engineer brain with `engine.done` short of the full list and `lit` false, given "Sam, the emitters have stopped. Switch them on again, please.": no `RELIGHT` task.
- Simulator `engine` scenario with a chatty LLM: run it several times and check in the sim's log that no emitter is switched on before step 18.
