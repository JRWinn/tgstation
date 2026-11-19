---
id: BRAIN-11
title: The reader of last resort for orders is sampled at the talking temperature, so one message can read as a warrant one time and neither the next, and its minutes are never checked against the message
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1715, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1094, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:880
fix: Give callOllama a temperature argument and pass 0 for readOrder, and take the minutes only when a number of minutes is written in the message
---

## What is wrong

When code cannot read a PDA order from the Captain or a head to security, `readOrder` asks the model to read it: warrant, pardon or neither, the name, and the minutes. The result is turned into the fixed words "Warrant for <name>, <n> minutes." and taken exactly as if the Captain had written that (`deskRead` then `deskTakes`). It is the one model call whose answer becomes an arrest.

It is sampled like small talk. `callOllama` sends one `temperature` for every call, `TEMPERATURE = 0.7`, chosen for talk ("Higher is more varied"). A reading wants the most likely answer, not a varied one. For a message that is hard to read, which is the only kind that reaches the reader, 0.7 means the same words can come back as `warrant` on one call and `neither` on the next. That is the case SECT-01's fix sends here on purpose: "do not arrest Dana Reyes" is to go to the reader, and whether Dana is hunted then rests on a weighted coin.

The check in `readReading` holds the name to the message (every word of the name must be in it), but not the minutes. The model is asked for "how many minutes in a cell the message says. 0 if it does not say", and whatever whole number it gives from 1 up is taken (capped at 15). At 0.7 a small model that has been told the answer is an integer often gives a plausible one rather than 0, so a message that gave no time gets one the sender never asked for. Code's own reading of an order leaves the minutes empty when none are written (`number === null ? null : ...`, `security.ts:336`, found with `MINUTES_SAID`), so that the default term applies; the reader steps round that.

One concrete case: the Captain sends the Head of Security "Bring that clown Pun Pun to me when you get a chance, he took my hat". Suppose code does not read it (no warrant words that `readWarrant` takes). The reader is asked. At temperature 0.7 the answer may be `{"kind":"warrant","name":"Pun Pun","minutes":10}` or `{"kind":"neither",...}`; the Captain gave no minutes, and asked for Pun Pun to be brought, not jailed for ten minutes. If it comes back as the first, the Head of Security declares a warrant for 10 minutes and its officer arrests him.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1708`, in `callOllama`, used by talk, choice and reading alike:

        options: {
          temperature: TEMPERATURE,
          num_predict: maxTokens,
          num_ctx: CONTEXT_TOKENS,
        },

`brain.ts:1094`, in `readOrder`:

        const answer = await callOllama(
          [
            { role: 'system', content: call.system },
            { role: 'user', content: call.user },
          ],
          call.schema,
          READING_MAX_TOKENS,
          READING_TIMEOUT_MS,
        );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:880`, in `readReading`:

      const minutes = Number(body.minutes);
      return {
        kind: body.kind,
        name,
        minutes:
          Number.isFinite(minutes) && minutes >= 1
            ? Math.min(MINUTES_MOST, Math.round(minutes))
            : 0,
      };

## How it was found

Read from the code. Not run against the model (the task forbids model calls), so how often a reading flips at 0.7 is not measured; that it can is how sampling works. The one READING in the logs on disk (`round-20.00.21`) came back "no warrant or pardon on anyone the message names".

## How to fix it

1. Give `callOllama` a `temperature` parameter, defaulting to `TEMPERATURE`. In `readOrder` pass `0`. Keep `num_ctx` the same for all calls, so Ollama does not reload the model between them.
2. In `readReading`, keep `minutes` only when the message has a number or a number word next to "minute", "min" or "m" (the same reading `security.ts` already does for code-read orders, `MINUTES_SAID` at `security.ts:291`); otherwise use 0, so the code's own default applies.
3. Leave the choice of job at 0.7: there the variety is wanted (`buildChoice` shuffles for the same reason).

## How to test the fix

A table of messages for `readReading` in `tools/llm_crew/`: replies with minutes for messages with and without a time in them; only those with a time keep it. With a free GPU (see the owner's note on model tests), run the reader 10 times on each of a few hard messages ("do not arrest Dana Reyes", "bring Pun Pun to me") at 0 and at 0.7 and compare how often the kind changes. Run the type check.
