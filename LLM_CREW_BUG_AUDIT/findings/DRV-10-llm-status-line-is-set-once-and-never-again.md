---
id: DRV-10
title: The window's Ollama line is worked out once when it opens and never again, so it shows ready while every call fails, or unreachable while calls work
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/index.tsx:84, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:183, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:189
fix: Keep the outcome of the last few real LLM calls in brain.ts and show that in the status line, and pick a fallback model that can chat
---

## What is wrong

The bar across the top of the Crew Brain window is the one place the owner looks to see whether the crew have a voice. It is set by `checkLlm`, which asks Ollama for its list of models. That runs once, when the window opens (`useEffect(() => { checkLlm(); }, [checkLlm])`), and again only when the owner presses "Check LLM". Nothing the brains find out afterwards reaches it. So:

- **Ollama stops part way through a round** (the card is needed for something else, or Ollama falls over): the line stays green, "Ollama ready, using qwen3.5:9b", and every card says "Ready". Every reply is the plain fallback line, and the only sign is "LLM call failed" in each NPC's details, which are shut by default.
- **Ollama is started after the window was opened** (the game is up first, then the owner remembers): the line stays red, "Could not reach Ollama at http://127.0.0.1:11434 (AbortError: ...)", while the crew talk normally through it.
- **The preferred model is not installed**: `chooseModel` takes `installed[0]`, the first name in Ollama's list, whatever it is. If that is an embedding model (`nomic-embed-text` and the like are often installed beside a chat model), every call fails with an HTTP 400 from `/api/chat`, and the line says, in green, "Ollama ready, using nomic-embed-text".
- **The first check failed** and the preferred model is not installed: `chooseModel` was never called, `model` stays `qwen3.5:9b`, every call fails with "model not found", and the line shows the old network error rather than that.

One concrete case: the owner plays with the Crew Brain window open. Twenty minutes in, Ollama is closed to free the card. The bar still says "Ollama ready", every card still says "Ready". The crew go on in plain lines and the owner reads the stiff wording as the model having a bad day.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:84`, the only time it is checked without the owner asking:

      useEffect(() => {
        checkLlm();
      }, [checkLlm]);

`index.tsx:193`, what is shown from that one check:

        case 'ok':
          return (
            <Box color="good">
              <Icon name="circle" mr={1} />
              Ollama ready, using {getModel()}
            </Box>

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:189`, the model picked when the preferred one is missing:

    export function chooseModel(installed: string[]): void {
      if (installed.length > 0 && !installed.includes(PREFERRED_MODEL)) {
        model = installed[0];

`brainState` in `index.tsx` shows "Ready" for any NPC whose brain is idle, whatever its last call did.

## How it was found

Read from the code. Not run in a window.

## How to fix it

1. In `brain.ts`, keep the outcome of real calls: in `callOllama`, after a reply or in the `catch` where it is rethrown, set a module-level `lastCall = { ok, at: Date.now(), error }` and `notify()`. Export `getLastCall()`.
2. In `LlmStatusLine`, show the newer of the check and the last call: green "Ollama answering, last reply Ns ago" after a good call; red "Ollama calls failing: <error>" after a failed one, whatever the check said. Keep the button.
3. When a call fails with a network error (`TypeError` from `fetch`, or an abort that is not ours) after the check said ready, run the check again once, so the model list is fresh when Ollama comes back.
4. In `chooseModel`, leave out names with `embed` in them before taking the first, and say in the line that the preferred model is missing ("qwen3.5:9b is not installed, using X"). Owner's question: is there a second model to prefer before taking whatever is listed first?
5. Optionally, on each card, show "Last LLM call failed" in place of "Ready" when that NPC's `lastDecision.error` is set and newer than its last good reply.

## How to test the fix

- Type check from `tgui/`.
- By hand in the game: open the window with Ollama stopped (red), start Ollama, let an NPC be spoken to: the line must turn green without the button. Stop Ollama, speak to an NPC: the line must turn red within one call.
