---
id: ENG-06
title: The Chief Engineer takes "the engine is lit" or "the emitters are off" from anything its engineer says, and the relight that follows can switch the emitters on before the cooling is running
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: 61d23ca300d
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

The engineer's voice is the LLM. Asked by anyone how the engine is going, it says what LLMs say: "I'll let you know once the engine is lit", "Nearly there, the engine is lit as soon as the emitters are on", "The emitters are off until the cooling is running". Each holds a set phrase. The engineer's fixed lines about the engine begin with the Chief Engineer's first name ("Ada, the engine is lit."), all but "The engine, right away.", but nothing checks that: not the name, not the start of the line, not who it was said to. The change log's 20:19 entry shows the engineer's LLM saying a door was forced when it was not, so the voice saying the engine is lit is not far-fetched.

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

1. In `hearEngineer`, take a set phrase only when the line **begins with the whole fixed line**: `text.trim().toLowerCase().startsWith(litLine(brain.name).toLowerCase())`, and the same with `offLine`, `onAgainLine`, and for the stuck line a prefix regex built from the first name (`^Ada, I cannot light the engine: ([^.]+)\.`, name escaped). Two things the first draft of this fix got wrong:
   - `saidTo(brain, text)` alone is not enough: "Ada, I'll let you know once the engine is lit." begins with the name and holds the phrase (checked with bun).
   - Do not anchor the end with `$`. The engineer's fixed lines are said `exact`, and `withRemark` in `jobs/reports.ts` puts the LLM's remark after them in the same line: `withRemark(litLine('Ada Lovelace'), 'All done in there')` gives "Ada, the engine is lit. All done in there." A `$` anchor would lose the real word.
   - `ENGINE_TAKEN` ("The engine, right away.") has no name in front, so it cannot go behind a name check. Match it as a prefix of the line instead. It is already tested first in `hearEngineer`, so a remark after it ("I'll tell you when the engine is lit") is not read as the engine lit; keep it first.
   A small helper, say `beginsWith(text, line)` in `jobs/engineering.ts`, serves all of them.
2. In `jobs/engineer.ts`, `takeWord`: take `RELIGHT_WORDS` only when `engine.lit` is true. If it is still lighting, ignore the relight: the lighting list will switch the emitters on in their turn. (`engine.lit` stays true through a relight and goes false on a shut-off, so a real relight still works.)
3. In `plan` for `RELIGHT`, as a second guard, return not-ready while `lighting(engine)` is true (or while `nextLightingStep(steps, engine.done)` is a non-emitter step). That keeps the emitters-last rule in one more place it can be broken.
4. The voice should also not be able to say a set phrase it has not earned. A small check where the driver takes the LLM's `say`: if it matches any of engineering's `*_WORDS` and the job did not ask for that line, drop the phrase or the line. Owner's question: is that worth adding for every job's set words, not only engineering's? The same weakness is in the Quartermaster's and security's.

## How to test the fix

- `tools/llm_crew/engine.ts`: Chief Engineer overhears an engineer say "I'll tell you when the engine is lit." `litAt` must stay null.
- Same file: the Chief Engineer overhears "Ada, I'll let you know once the engine is lit." `litAt` must stay null. It overhears "Ada, the engine is lit. All done in there." `litAt` is set and "Sam, I have that" is queued. It overhears "The engine, right away. I'll tell you when the engine is lit." `lightTaken` is true and `litAt` stays null.
- During a shut-off, it overhears "The emitters are off until the cooling is running." `chief.emittersOff` stays false and no message goes to the Captain.
- The PDA path (`readsMessage`, `aloud` false) with the fixed line still sets `litAt`.
- Engineer brain with `engine.done` short of the full list and `lit` false, given "Sam, the emitters have stopped. Switch them on again, please.": no `RELIGHT` task. With `lit` true: a `RELIGHT` task, and its plan switches on the first emitter.
- Engineer brain lighting, with a `RELIGHT` task forced in and the `LIGHT` step's key put in `brain.failures`: `nextStep` must not give an emitter switch-on.
- Simulator `engine` scenario with a chatty LLM: run it several times and check in the sim's log that no emitter is switched on before every non-emitter step is done.

## Check

Checked by Opus 5.5. Confirmed, with the severity lowered to medium and the fix corrected.

What I read:
- `jobs/chiefengineer.ts`: `overhears`, `hearEngineer`, `readsMessage`, `syncTasks` (the relight order needs `litAt` set, energy 1 or less, `LIT_GRACE_DS` = 1200 ds and `RELIGHT_EVERY_DS` = 3000 ds) and `lightAgain`. The quotes are what the code says today.
- `jobs/engineer.ts`: `takeWord`, `syncTasks`, `plan` and `afterActing`.
- `jobs/engineering.ts`: the set words and `saidTo`.
- `jobs/engine.ts`: `nextLightingStep` and `emitterSteps`.
- `driver.ts`: `nextStep`, `inBackoff`, `fail` and `noteResult`. A failed step's key is held back for `RETRY_MS` = 20 s, and `ready[0]` is then the next task.
- `tasks.ts`: `workInOrder`. Both tasks are `'asked'` with no place, so the older `LIGHT` comes first until its step is held back.
- `brain.ts`: where the LLM's `say` is taken. There is no filter there for set phrases. Only filler and repeats are dropped, and only for unprompted lines.
- `reports.ts`: `withRemark`.
- `crew_npc_machines.dm`: `switch_emitter` is given the wanted state, so it is not a toggle.

Part 1 is as described. Every line an engineer says in the Chief Engineer's hearing reaches `hearEngineer` unless `hearReport` takes it as a meeting report. The tests are unanchored. This includes the engineer's own remarks in company and its answers to the Captain.

Part 2 is as described too, but it follows only from part 1. While the engine is really being lit, nothing else sets `litAt`, so the relight order only comes after a false "lit".

I ran a throwaway bun script outside the repo. `LIT_WORDS` matches "I'll tell you the moment the engine is lit". `OFF_WORDS` matches "The emitters are off until...". `saidTo` passes "Ada, I'll let you know once the engine is lit." The real fixed line goes out as "Ada, the engine is lit. All done in there." when the LLM adds a remark. So the first draft's fix was wrong in two ways: `saidTo` alone does not stop the fault, and a `$` anchor would drop the real word. I rewrote "How to fix it" step 1.

Nothing in `LLM_CREW_CHANGELOG.md` or `LLM_CREW_PLAN_ENGINEERING.md` fixes or chooses this. The plan says "the emitters are last, and are switched on only when every step before them has been seen done".

Why medium and not high: the fault needs the engineer's voice to use one of the exact phrases while the Chief Engineer is in earshot. That is not most rounds. The emitters coming on early also needs a lighting step to fail once while the relight is open. The integrity watch (shut-off under 95 percent) still stands behind it while the PDA has power.

Not checked: whether an LLM really says these phrases in a round. No round log shows it.
