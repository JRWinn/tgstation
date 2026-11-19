---
id: SIM-07
title: The stand-in model answers every call in two and a half seconds with whole, well-formed JSON, so a slow, hung, cut-off or wayward model is never simulated
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:80, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1693, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1346
fix: Add stand-in model modes slow, hung, cutoff, junk and wayward, honour the abort signal, and run the long scenarios in each
---

## What is wrong

The stand-in for Ollama (`globalThis.fetch` in `sim.ts`) has three modes: `quiet`, `chatty` and `dead`. In the first two it always:

- answers after exactly `LLM_MS` (2.5 s) for talk, `CHOICE_MS` (0.8 s) for a choice or a reading;
- returns `ok: true`, `done_reason: 'stop'`, and `message.content` that is whole JSON fitting the schema;
- says nothing, `'...'`, `''`, or "Right you are." / "I will see to it.";
- ignores `init.signal`, so the window's abort after `THINK_TIMEOUT_MS` (60 s) or `CHOICE_TIMEOUT_MS` (15 s) can never cut a call short.

In `dead` mode it throws at once, which is the one failure it has.

The real model, from the round logs (`data/logs/2026/11/19/round-*/crew_brain.log`), takes a median of about 1.1 s and up to 6 s on a free card, so `LLM_MS` is fair for a good day. What is never simulated is everything else the window code was written for:

| What the real model does | Window code that handles it | Ever run? |
| --- | --- | --- |
| Hangs, or is slow because the card is busy or the model is loading (tens of seconds) | the abort in `callOllama`; one GPU, one call at a time, so every NPC waits behind it (`BRAIN-02`, `DRV-05`) | never: the stand-in never takes longer than 2.5 s |
| Stops for length: a reply cut off, not valid JSON | `isCompleteReply` and the second call without "think" (`brain.ts:1346`); the `done_reason === 'length'` error | never |
| HTTP error (model not pulled, out of memory) | `readError` | never |
| Gives a line with a handle in it, an asterisk (`HAND-03`), a line over 200 characters, "my body", a name it was not given | `withoutHandles`, `BODY_TALK`, the server's prefix strip | never |
| Gives a move nobody asked for, or names a crate or a place the job did not offer | `agrees`, `fills`, "nothing said called for it: not done" | only "order" with the first crate listed, when the heard line has "order", "suppl" or "crate" in it |
| Says something different each time | `saidBefore`, `isFiller`, `remarksUnanswered` | never: the same few lines every time |

So the claim in the change log that a slow or dead model cannot stall anything has been tested only for a model that is dead outright, never for one that is merely slow, and never for one that answers badly.

## Where

`tools/llm_crew/sim.ts:80`, the stand-in:

    (globalThis as any).fetch = async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      ...
      await new Promise((resolve) => setTimeout(resolve, LLM_MS));
      return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) }, done_reason: 'stop', prompt_eval_count: 900, eval_count: 40 }) };
    };

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1693`, `callOllama`, which passes `signal: controller.signal` and sets the abort timer the stand-in never feels.

A side effect of the clock patch, not a fault today: the patched `setTimeout` returns 0 and `clearTimeout` is not patched, so each call's abort timer is never cleared and fires 60 simulated seconds later on a controller that is already done. Harmless now; it would abort a later call if `callOllama` ever reused a controller.

## How it was found

Read from the code. The real timings were read from the `ms` field of the three round logs of 2026-11-19 (talk calls: median 1,085 to 1,206 ms, slowest 5,905 ms, no hung call in them).

## How to fix it

1. Make the stand-in honour `init.signal`: race the delay against the signal's `abort` event and reject with an `AbortError` as `fetch` does.
2. Patch `clearTimeout` to remove the timer from `timers` (give each timer an id and return it from the patched `setTimeout`).
3. Add modes, set by `MODE` or by `LLM=` alongside it:
   - `slow`: each call takes a random 5 to 40 s (seeded), choices too;
   - `hung`: one call in ten never answers until aborted;
   - `cutoff`: one reply in five is the JSON cut off part way, with `done_reason: 'length'` and `eval_count` under the budget on some and at it on others;
   - `junk`: one reply in ten is not JSON, one in ten is JSON with a missing field, one HTTP 500;
   - `wayward`: lines with a handle, an asterisk, "my body", 300 characters, someone else's name; a `go_to` or `order` move when nothing was asked for; a different line each time.
4. Run `crew`, `qm`, `warrant` and `engine` in `slow` and `hung`, with the checks unchanged: the work must still get done, later. Run them in `wayward` with one more check: nothing the stand-in made up was carried out (no order placed, no walk taken, that the code did not ask for).

## How to test the fix

The four scenarios pass in `quiet` as before. In `slow` they pass with the run lengthened, or show which checks are timing-bound. In `hung` the run ends with every NPC still working; if every NPC stops after the first hung call, that is `BRAIN-02` shown.
