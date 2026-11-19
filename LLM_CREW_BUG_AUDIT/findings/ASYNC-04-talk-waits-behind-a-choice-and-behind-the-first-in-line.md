---
id: ASYNC-04
title: A reply that is sitting out its short cooldown lets a job choice take the model first, and holds up every other NPC's reply behind it
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1138, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1051, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1167
fix: In startTalk take the first queued NPC that is ready, not only the head of the queue, and do not start a choice while a talk is due within a few seconds
---

## What is wrong

See also: DRV-05, which names the first point below (only the head of the queue is looked at) as one of the waits a line to say sits behind. This finding adds the second point, the choice that takes the model in the gap, and the fix for both.

The model serves one call at a time. The comments say talk goes first, "because someone is waiting on an answer", and a choice between jobs "goes when no talk is ready to". Two things in `startTalk` undo that.

1. **Only the head of the queue is looked at.** If the first NPC in the talk queue has to wait (1.5 s after its last call, or 4.2 s after it last spoke, `SAY_COOLDOWN_MS`), `startTalk` sets a timer and returns FALSE, even when the next NPC in the queue could be asked this instant. That NPC waits for the first one's cooldown for nothing.
2. **A choice is started in the gap.** `pump` reads FALSE from `startTalk` as "no talk is ready" and starts a choice (`startChoice`), which may hold the model for up to `CHOICE_TIMEOUT_MS` (15 s). When the retry timer fires, `pump` finds `running` TRUE and returns. The reply that was due in a second or two waits for the whole choice call.

The second is the one people notice. Someone in a back-and-forth with an NPC is the usual case of a queued NPC with a cooldown: it has just spoken, so `lastSayAt` is under 4.2 s old when the next line comes. And a choice is asked by any NPC with two routine jobs ready, every 20 s at most, so with a crew of eight there is nearly always one waiting. A body whose choice is put to the model after its own 8 s wait has run out (`CHOICE_WAIT_MS`) gets "Too late" anyway, so the 15 s of model time can buy nothing at all while the reply waits.

Concrete case: the Captain asks the Quartermaster a question; it answers at t = 0. The Captain answers back at t = 1.5 s. The Quartermaster is queued with `wait` = 2.7 s. A janitor has been `choosing` since t = 0. `pump` → `startTalk` returns FALSE → `startChoice` starts the janitor's choice. The model is slow under the game's load and takes 9 s. The Quartermaster's reply call starts at t = 10.5 s instead of t = 4.2 s, and the Captain stands there for ten seconds. Meanwhile the janitor's body gave up waiting at t = 8 s and the answer is thrown away.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1138`, `startTalk`:

    while (queue.length > 0 && !brains.get(queue[0])) {
      queue.shift();
    }
    const brain = brains.get(queue[0]);
    if (!brain) {
      return false;
    }
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

`brain.ts:1051`, `pump`:

    if (!startReading() && !startTalk()) {
      startChoice();
    }

`brain.ts:1167`, `startChoice`, which does not look at whether the body is still waiting long enough for the answer to be used:

    const brain = brains.get(choiceQueue.shift() ?? '');
    // The body may have stopped waiting and gone on with the code's own order.
    if (brain?.choosing) {

## How it was found

Read from the code. Not timed in a round. How long a choice call takes under load was not measured; the log records `ms` for each `CHOICE (LLM)` record, which would show it.

## How to fix it

1. In `startTalk`, look through the whole queue for the first NPC whose `wait` is 0 or less and take that one (splice it out). Only if none is ready, set the retry timer for the smallest `wait`, and return a third value, say `'soon'`, with how long that is.
2. In `pump`, when `startTalk` says a talk is due within `SAY_COOLDOWN_MS`, do not start a choice. Leave choices for when the talk queue is empty.
3. In `startChoice`, skip a body whose `brain.choosing.until` is less than about 2 s away: by the time the model answers it will have gone on with the code's own order, and the call buys nothing. The body already falls back to its own order, so nothing waits on this.

Nothing here changes what is asked or what is done without the model.

## How to test the fix

- A small table case for `startTalk` (or the simulator with two NPCs spoken to one after the other): the second NPC is asked at once while the first sits out its cooldown.
- Simulator: one NPC in conversation with the Captain and another with two routine jobs; check in the brain log that no `CHOICE (LLM)` record starts between a line to the first NPC and its answer.
- In the next round's `crew_brain.log`, compare the time between a line said to an NPC and its decision record before and after.
