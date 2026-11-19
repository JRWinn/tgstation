---
id: BRAIN-02
title: A model that hangs, not one that is down, freezes each body with a line to say for 60 seconds times its place in the queue
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:71, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1338, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:734
fix: Give a line the work calls for its own short wait, after which the plain line is said without the model, and give talk calls a shorter time limit
---

## What is wrong

The rule is that a slow or dead model must not stall the work. It holds when Ollama is down: `fetch` fails at once and the plain line is said. It does not hold when Ollama takes the call and does not answer: the model is still loading, the card is busy with something else (a model test run beside a round, say), or Ollama is queueing behind another client.

- One talk call may take 60 seconds (`THINK_TIMEOUT_MS`), and a second 60 if the first reply came back cut off (the retry without "think").
- Only one call runs at a time for all NPCs (`running`), and the rest wait in `queue`.
- A body whose next step is a line to say does no work at all from the moment the line is asked for until its own call has ended: `drive` returns null while `brain.mustSay !== null` (waiting its turn) or `brain.sayingNow` (the call is out).

So the n-th NPC in the queue stands still for n times 60 seconds, and only then says the plain line it could have said at the start. With eight crew who each have something to say, the last one stands for eight minutes. The choice between jobs has a proper guard against this (8 seconds, `CHOICE_WAIT_MS`). A line the work calls for has none.

One concrete case, run with the real window code: three janitors with nothing to clean with, the Captain in view. Each one's next step is to ask the Captain to have supplies ordered. The stand-in model accepts every call and never answers.

    60.5s npc1 say "Zim, I need something to clean with for my work. Could you get it ordered, please?"
    63.0s npc1 explore
    120.5s npc2 say "Zim, I need something to clean with ..."
    123.0s npc2 explore
    180.5s npc3 say "Zim, I need something to clean with ..."
    183.0s npc3 explore

npc3 took no step of any kind for three minutes. The lines that went out were the plain ones: the model added nothing.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:71`:

    /** How long one LLM call may take before it is abandoned. */
    const THINK_TIMEOUT_MS = 60000;

`brain.ts:1338`, in `think`, two calls one after the other, each with the full limit:

    let answer = await callOllama(messages, call.schema);
    ...
    if (!isCompleteReply(reply)) {
      answer = await callOllama(
        messages,
        buildReplySchema({ ...call.parts, think: false }),
      );

`brain.ts:1051`, one call at a time:

    function pump(): void {
      if (running) {
        return;
      }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:734`, in `drive`, the body waits on the line:

    if (
      !brain.awake ||
      (busy && !dropFor && !dropToLeave && !dropToMove) ||
      brain.inHand ||
      // It has something to say first, and is still finding the words.
      brain.mustSay !== null ||
      brain.sayingNow
    ) {
      return null;
    }

`brain.ts:753`, where the line is set, with no note of when:

    (fallback, needs, sayIf, exact) => {
      brain.mustSay = fallback;
      brain.mustSayNeeds = needs ?? null;
      brain.mustSayIf = sayIf ?? null;
      brain.mustSayExact = !!exact;
      brain.wake = true;
    },

## How it was found

Read from the code, then run: a throwaway script outside the repo imported `brain.ts` with `fetch` replaced by one that never resolves until its `AbortSignal` fires, and printed every tool call with its time. Output above. No model was called.

Not seen in a round. In the rounds on disk the model answered in 1 to 6 seconds (`"ms"` in `crew_brain.log`, for example `data/logs/2026/11/19/round-19.33.50`: 233 calls, longest 5,905 ms), so the queue has not yet backed up in play. It will the first time the card is shared.

Not in `LLM_CREW_CHANGELOG.md` or the plans (searched `THINK_TIMEOUT`, "60 second", "finding the words", "its turn").

`DRV-05` is the same fault written up from the driver's side by another reviewer. This file adds the measured run and the brain-side steps of the fix. Do the two together.

## How to fix it

1. Note when a line was asked for. In the `speak` callback in `ingest` (`brain.ts:753`) set `brain.mustSayAt = Date.now()` (new field on `NpcBrain` in `types.ts`, 0 when there is none).
2. Pull the "said plainly" part of the `catch` in `think` (`brain.ts:1612` to `1623`: `runTool` say, `lastSayAt`, the six `afterSaying` hooks) into one function, `sayPlainly(brain, line)`. Both places then do the same thing.
3. In `ingest`, after `drive` and before the brain is queued, add the deadline: if `brain.mustSay !== null`, `brain.status === 'queued'` (its call has not started) and `Date.now() - brain.mustSayAt > MUST_SAY_WAIT_MS` (8000, the same wait a choice gets), then check `mustSayIf`, call `sayPlainly`, clear `mustSay`, `mustSayNeeds`, `mustSayIf`, `mustSayExact`, and leave the brain queued only if `pendingSpeakers.size > 0`. Otherwise take its id out of `queue` and set `status = 'idle'`, `wake = false`.
4. For a call that is already out and carries a line (`sayingNow`), pass a shorter limit to `callOllama`: `mustSay !== null ? MUST_SAY_CALL_MS : THINK_TIMEOUT_MS`, with `MUST_SAY_CALL_MS` about 15000 (the longest real call in the logs is under 6 seconds). Do not make the second, "without think" call when the first already used most of that.
5. Consider bringing `THINK_TIMEOUT_MS` itself down to 20 to 30 seconds. Nobody is still standing there after a minute to hear the answer.
6. Keep: a line with `exact` is said word for word either way. `mustSayIf` is still honoured (a workmate may have asked first). The plain line is not said to an empty room (`brain.peopleInView.length > 0`, as the `catch` does).

No owner decision is needed, only the numbers.

## How to test the fix

- `tools/llm_crew/sim.ts` has `dead` (fetch throws at once) but no stand-in that hangs. Add a mode `hung` whose `fetch` waits on `init.signal` and never answers, and run `crew` and `qm` in it: every scenario that passes in `dead` should pass in `hung`, a few seconds slower.
- Type check from `tgui/`.
- In a round: start a model test (`tools/llm_crew/voice.ts`) while the round runs, and watch that the crew keep working. In `crew_brain.log`, decisions with `"error":"...aborted..."` should be followed at once by the plain line in `game.log`.
