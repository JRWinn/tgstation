---
id: DRV-05
title: A line the work calls for holds the whole body still until the model has answered or timed out, 60 seconds a call and one NPC at a time
kind: bug
severity: medium
effort: medium
confidence: sure
status: duplicate
duplicate_of: BRAIN-02
found_by: Fable 5.2
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:734, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:71, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1138, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1338
fix: Give a line its work calls for a wait of its own (about 8 seconds, as a choice has), after which the plain line is said by code and the body goes on
---

## What is wrong

The rule is "every line the work needs has a plain fallback, so a slow or dead model cannot stall anything". That holds for a model that is dead (the call fails at once and the plain line is said). It does not hold for one that is slow, loading, or not answering.

When a step is something to say, `drive` hands the line to `speak`, which sets `brain.mustSay`. From then until the LLM call for that NPC has finished, `drive` returns null for that body on every update: it does no work at all, not even work on the spot. The line is said only at the end of `think`. And `think` is behind three waits, none of which the driver limits:

- its turn. One call runs at a time for the whole crew (`running`), orders to be read go first, and talk is first come, first served. If the NPC at the head of the queue spoke under 4.2 seconds ago, everyone behind it waits for that as well (`startTalk` only ever looks at `queue[0]`).
- the call. `THINK_TIMEOUT_MS` is 60 seconds.
- a second call of up to 60 seconds more if the first reply was not whole JSON.

A choice between jobs has had this thought through: the body waits `CHOICE_WAIT_MS` (8 seconds) and then takes the code's own order. A line to say has no such limit.

One concrete case: the graphics card is busy and Ollama takes its connections but answers slowly or not at all (the project's own notes say model tests need a free card). A head calls a staff meeting with four staff. Each is called on for its report, a line that is said word for word (`exact`) with only a remark asked of the LLM. Each report waits the full 60 seconds for the call to time out before the fixed line is said. The four reports take over four minutes, a call to a meeting stands for seven (`SUMMONS_STANDS_DS`), and all the while every other NPC whose work calls for a line ("Zim, that is done", "could you let me out, please?") is standing still in the queue behind them, doing nothing.

With a healthy model the same thing shows as a few seconds of standing about for each line, which grows with the number of NPCs talking at once.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:734`, in `drive`, the way out that stops all work while a line waits:

      if (
        !brain.awake ||
        (busy && !dropFor && !dropToLeave && !dropToMove) ||
        // Someone has it by the arm. It goes where it is taken.
        brain.inHand ||
        // It has something to say first, and is still finding the words.
        brain.mustSay !== null ||
        brain.sayingNow
      ) {
        return null;
      }

`driver.ts:805`, where the line is handed over:

      if (step.say) {
        // Asked once; if nothing comes of it, it is left a while before being asked again.
        fail(brain, step.key);
        speak(step.say, step.needs, step.sayIf, step.exact);
        noteDone(brain, step);
        return step;
      }

`brain.ts:71`:

    const THINK_TIMEOUT_MS = 60000;

`brain.ts:1138`, `startTalk`, which takes only the head of the queue and waits on it:

      const brain = brains.get(queue[0]);
      ...
      const wait =
        Math.max(
          brain.lastThinkEnd + MIN_THINK_GAP_MS,
          brain.lastSayAt + SAY_COOLDOWN_MS,
        ) - Date.now();
      if (wait > 0) {
        if (retryTimer === null) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            pump();
          }, wait);
        }
        return false;
      }

`brain.ts:1338`, in `think`, the call and the second call, both at the default 60 seconds:

        let answer = await callOllama(messages, call.schema);
        ...
        if (!isCompleteReply(reply)) {
          answer = await callOllama(
            messages,
            buildReplySchema({ ...call.parts, think: false }),
          );

The simulator has `quiet`, chatty and `dead` (`sim.ts:87`, `throw new Error('Ollama is not running')` at once). It has no slow model, so no run has ever shown this.

## How it was found

Read from the code. Not seen in a round, and no model was called.

## How to fix it

1. In `brain.ts`, take the block in the `catch` of `think` that says the plain line and runs the after-saying hooks (from "The LLM being down must not leave the body dumb" to `afterSaying(brain)`) out into a function, `sayPlainly(brain, line)`. It must also clear `mustSay`, `mustSayNeeds`, `mustSayIf` and `mustSayExact`, check `mustSayIf` first, and set `lastSayAt`.
2. Stamp when a line was asked for: in the `speak` callback in `ingest`, set `brain.mustSayAt = Date.now()` (a new field on `NpcBrain`; add it to the new-brain block and to `makeBrain` in `tools/llm_crew/fixtures.ts`).
3. In `ingest`, before `drive` is called, if `brain.mustSay !== null`, `!brain.sayingNow` and `Date.now() - brain.mustSayAt > SAY_WAIT_MS` (8000, the same as `CHOICE_WAIT_MS`), and the server's say cooldown is over (`Date.now() - brain.lastSayAt > SAY_COOLDOWN_MS`), call `sayPlainly`. The NPC may stay in the talk queue: when its turn comes `think` finds no line called for and either answers whoever spoke or returns at once.
4. For a call already in flight that carries a line (`sayingNow`), pass a shorter timeout to `callOllama` (about 12 seconds) and do not make the second call for a reply that was cut off: fall to the plain line instead. `callOllama` already takes `timeoutMs`.
5. A line that is said word for word (`exact`) needs nothing from the LLM but an optional remark. Say it at once with `sayPlainly` when the LLM is not free this instant, and ask for a remark only when it is.
6. Make `startTalk` pick the first NPC in the queue that is allowed to speak now, not only `queue[0]`.

Owner's question: how long may a body stand waiting for its words before it says the plain line? Eight seconds is proposed, to match the choice between jobs.

## How to test the fix

- Add a `slow` mode to `tools/llm_crew/sim.ts` beside `dead`: the stand-in for Ollama waits 30 seconds of the simulator's clock before it answers. Run `crew`, `qm` and a meeting scenario with it. Every check that passes with `dead` should pass with `slow`, and no body should stand with a line waiting for more than about 10 seconds.
- Type check from `tgui/`.
- In a round, in `crew_brain.log`: the gap between a `ROUTINE (no LLM)` record whose reply is `say(...)` and the next record for the same NPC should not be more than about 10 seconds even when the decision records around it show `ms` in the tens of thousands.
