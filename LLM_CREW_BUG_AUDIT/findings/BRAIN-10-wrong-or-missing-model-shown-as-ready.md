---
id: BRAIN-10
title: With qwen3.5 9b not installed the window takes whichever model Ollama lists first, embedding models too, and with none at all it still says Ollama ready
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:189, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:75, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:197
fix: Choose only a chat model, prefer one whose name starts with the preferred family, and show a warning instead of Ollama ready when the preferred model is missing or nothing usable is installed
---

## What is wrong

`chooseModel` is given the names from Ollama's `/api/tags` and does one of two things:

- If the list is not empty and has no `qwen3.5:9b`, it takes `installed[0]`, the first name Ollama lists, whatever it is. That can be an embedding model (`nomic-embed-text`), a vision model, or a 70b model that will not answer inside the 60-second limit. Ollama lists models by when they were last pulled or changed, so it is whatever the owner pulled last, not anything chosen.
- If the list is empty, it keeps `qwen3.5:9b`, which is not there.

Either way the status bar says "Ollama ready, using <name>" (`index.tsx:197`), because `checkLlm` sets `state: 'ok'` whenever `/api/tags` answered. Then every call fails: HTTP 404 "model not found", or HTTP 400 "does not support chat" for an embedding model, or a time-out for one too big. Each failure goes to the fallbacks in `think`'s `catch` (and in `chooseJob` and `readOrder`), so the crew go on with plain lines, but nobody is told why, and the error is only in each `crew_brain.log` record.

A near miss of the name counts as missing too: `qwen3.5:9b-q8_0` or `qwen3.5:latest` installed instead of `qwen3.5:9b` is passed over for `installed[0]`.

One concrete case: the owner has `qwen3.5:9b-instruct-q4_K_M` and, pulled later, `nomic-embed-text` for another tool. `/api/tags` lists `nomic-embed-text` first. The window says "Ollama ready, using nomic-embed-text:latest". Every talk call comes back HTTP 400; every NPC speaks only its plain lines and answers no one.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:188`:

    /** Picks which installed model to use. */
    export function chooseModel(installed: string[]): void {
      if (installed.length > 0 && !installed.includes(PREFERRED_MODEL)) {
        model = installed[0];
      } else {
        model = PREFERRED_MODEL;
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:74`:

    fetchOllamaModels()
      .then((models) => {
        chooseModel(models);
        setLlm({ state: 'ok', models });
      })

## How it was found

Read from the code. Not seen in a round: the owner's machine has the preferred model. That `/api/tags` is ordered by last change is from Ollama's behaviour as known, not checked against its source here.

## How to fix it

1. In `chooseModel`, return what was chosen and why: `'preferred'`, `'near'` (a name that starts with `qwen3.5:9b` or `qwen3.5`), `'other'`, or `'none'`.
2. Prefer, in order: the exact `qwen3.5:9b`; a name starting with `qwen3.5:9b`; a name starting with `qwen3.5`. Skip names with `embed` in them. Only then fall back to the first other name.
3. In `index.tsx`, show a `NoticeBox` warning instead of "Ollama ready" for `'other'` ("qwen3.5:9b is not installed; using X, which may not work") and for `'none'` ("no model is installed in Ollama; the crew will use plain lines only").
4. Optional: after the first failed talk call with HTTP 404 or 400, set the status to error with Ollama's message, so a wrong model shows at once.

## How to test the fix

A small test of `chooseModel` with lists: `[]`, `['nomic-embed-text:latest', 'qwen3.5:9b-q8_0']`, `['llama3:8b']`, `['qwen3.5:9b']`. Run the type check. By hand: stop Ollama's preferred model (rename it), open the window, and see the warning.
