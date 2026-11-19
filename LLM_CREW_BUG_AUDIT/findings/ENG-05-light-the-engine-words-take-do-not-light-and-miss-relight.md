---
id: ENG-05
title: The Captain's "light the engine" is read from any line holding those three words, so "do not light the engine" relights it, while "relight the engine" is not read at all
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:126, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:668, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:698
fix: Read the order to light the engine again with a pattern that wants it at the start of a clause and refuses a negation or a question, and accept relight, restart and start up as well
---

## What is wrong

See also: GAP-15, which lists "light the engine" among the orders read by fixed words with no speller. This adds two ways the words are wrong that a speller would not mend.

After the Chief Engineer has had the emitters switched off for loss of integrity, or the engineer could not light the engine, the engine is lit again only "if someone it answers to says to light it". The test is:

    export const LIGHT_AGAIN_WORDS = /\blight the engine\b/i;

anywhere in a PDA from someone it answers to, or anywhere in a line said to it by a superior. That reads wrong both ways.

**Taken when it is not an order.** Any line holding the three words counts, whatever is round them:

- "Do not light the engine again until I say so."
- "Why did you not light the engine?"
- "Can engineering light the engine safely now?"
- "Did Sam light the engine?"

Each one calls `lightAgain`, which clears `shut`, `emittersOff`, `stuck` and `litAt`, and sets `chief.order = { what: 'light' }`. The engineer is told "the engine is yours. Light it now, please." The first is the plainest: the Captain says not to light it, and the Chief Engineer has it lit.

The 95 percent floor in `syncTasks` will give the shut order again if integrity is still under it, so a crystal still coming apart is shut off again at once. But a crystal that was shut off and has since healed back over 95, with whatever broke its cooling still broken, is lit on the Captain's "do not", and goes through the whole loss again.

**Missed when it is an order.** `\blight` needs a word break before "light", so the most natural words do not match:

- "Relight the engine." ("relight" has no break before "light")
- "Restart the engine." / "Start the engine up again."
- "Turn the engine back on." / "Get the emitters back on."
- "Light it again." (no "the engine")

None of these is read. The voice answers, and may well say "Right away", and the engine stays dark. Nothing tells the Captain the words were not understood: compare the Head of Security, which answers "I did not follow that" to an order it could not read.

One case: integrity fell, the emitters went off, the crystal has cooled and reads 100 percent. The Captain PDAs the Chief Engineer "Relight the engine please, but keep an eye on it." `LIGHT_AGAIN_WORDS.test` is false. Nothing happens. The Captain, a minute later, "Why haven't you lit the engine?" That is taken, and the engine is lit: the right outcome, by the wrong line.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:126`:

    /** How the Captain, or anyone the Chief Engineer answers to, tells it to have the engine lit again after it was shut off. */
    export const LIGHT_AGAIN_WORDS = /\blight the engine\b/i;

`jobs/chiefengineer.ts:668`, `readsMessage`, and `:698`, `overhears`:

    if (LIGHT_AGAIN_WORDS.test(text)) {
      lightAgain(brain);
    }

`jobs/chiefengineer.ts:611`, `lightAgain`: everything that keeps the engine off is undone.

    chief.shut = false;
    chief.emittersOff = false;
    chief.shutGivenAt = null;
    chief.stuck = null;
    chief.litAt = null;
    chief.lightTaken = false;
    chief.lightGivenAt = brain.now;
    chief.order = { what: 'light', givenAt: null, sent: false };

## How it was found

Read from the code. Not seen in a round: the emitters have not yet been shut off in one.

## How to fix it

1. Replace `LIGHT_AGAIN_WORDS` with two patterns in `jobs/engineering.ts`:
   - an order: `/(?:^|[.!,;]\s*|\bplease\s+)(?:re-?light|light|restart|start(?: up)?|turn on|get going)\s+(?:the\s+)?(?:engine|emitters|supermatter|sm)\b(?:\s+(?:again|back on|up))?/i`, plus "turn the engine back on" and "light it again" as their own forms. Anchoring to the start of a clause keeps "why did you not light the engine" out.
   - a refusal: `/\b(?:do not|don't|dont|never|not)\b[^.]*\b(?:light|start|turn on)\b/i`. A line that matches the refusal is never taken for the order, whatever else it holds.
2. A question mark at the end means it is not an order.
3. When a line from someone it answers to mentions the engine and is neither, have the Chief Engineer say it did not follow, and the words it does take ("Say 'light the engine' and I will have it lit."), as the Head of Security does for warrants. That costs nothing when the model is dead.
4. If the owner wants loose wording here, this is a small, fixed question for the LLM reader GAP-15 proposes: "Is this an order to light the engine: yes or no." Code still acts only on a yes.

## How to test the fix

- Add to `tools/llm_crew/engine.ts` a table of lines and the expected answer: "Light the engine." yes, "Relight the engine please." yes, "light the engine again" yes, "Do not light the engine again" no, "Why did you not light the engine?" no, "Did Sam light the engine" no.
- Run the `engine` simulator scenarios: the shut-off scenario's "light the engine" from the Captain must still relight.
