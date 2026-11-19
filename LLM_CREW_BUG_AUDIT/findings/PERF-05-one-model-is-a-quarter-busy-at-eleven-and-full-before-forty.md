---
id: PERF-05
title: The one model was a quarter busy with eleven crew and will be full before forty, and then every job choice costs its body eight seconds for nothing and every fixed line waits its turn for an optional remark
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1051, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1167, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:749, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:950, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:161
fix: Under load, say a fixed line at once without its remark, skip the job choice when the talk queue is not empty, give a player's line the front of the queue, and log each call's wait in the queue
---

## What is wrong

See also: DRV-05 (a line waits on the model with no limit), ASYNC-04 (head-of-line wait), HOLE-09 point 3 (one call at a time). Those are about what goes wrong when one call is slow. This one is what the measured load says about forty crew with a healthy model.

**What the model did in the latest round.** `data/logs/2026/11/19/round-20.43.32/crew_brain.log`, 11 crew, 1,066 seconds from its first line to its last: 183 calls with a time on them, 168 to talk and 15 job choices, none of them order readings. Mean 1.44 s a call, longest 3.6 s. 253 seconds of talk calls and about 11 of choices: **the model was busy about 25 % of the round.** What the talk calls asked for, by the reply schema's `say` line:

| asked for | calls |
| --- | --- |
| an answer to someone | 52 |
| a remark to follow a line the body says word for word | 48 |
| a greeting, on first seeing someone | 36 |
| what a report gives it to say | 28 |
| a remark of its own | 2 |

**What forty will ask.** Everything but greetings comes from each body's own work and talk, so it grows at least in step with the crew: 147 calls becomes about 530. Greetings grow faster: each body greets each person it sees for the first time (`shouldWake`, `person_in_view` with "you have not seen them before"), so the count is bodies times people each meets. If each of forty meets 3.6 times as many people as each of eleven did, 36 becomes about 470. That is about 1,000 calls of 1.44 s in the same 1,066 seconds: 135 % of the model. Even if greetings only grew in step with the crew, it is about 90 %. And the same card renders the game.

At 90 % a call waits on average several calls' time before it starts; past 100 % the queue only grows. The window has no limit on how long a body may wait for its turn, and does not log the wait (the brain log's `ms` is the call alone).

**What is then lost, every time:**

1. **Every job choice.** `pump` starts a choice only when no reading and no talk could start (`if (!startReading() && !startTalk()) startChoice()`). Meanwhile `drive` returns null for that body while `brain.choosing` stands (`settleChoice` is false for `CHOICE_WAIT_MS`, 8 seconds), so the body does nothing. With talk always waiting, the choice never gets the model: the body stands eight seconds and then takes the code's own order, which is what it would have done at once. Each body may be asked again after `CHOICE_GAP_MS` (20 s), so a busy body can lose eight seconds in every twenty-eight.
2. **Fixed lines held for a garnish.** 48 of 168 calls were for a line the code already has word for word (`exact`, see `talk.ts:161`, "your own short remark, to follow the line your body is saying"): staff reports, crate numbers, warrant read-backs. The line waits in the queue, and its body stands still (`drive` returns null while `mustSay` is set), only so the model can add a remark the owner's rules call optional. Under load that is the commonest kind of wait that buys nothing.
3. **Greetings ahead of the player.** The queue is first come, first served. A player who speaks to a body waits behind every greeting between two crew NPCs that was queued before.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1051`, `pump`:

    function pump(): void {
      if (running) {
        return;
      }
      if (!startReading() && !startTalk()) {
        startChoice();
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:748`, in `drive`:

      if (step?.choose) {
        if (!settleChoice(brain, step.choose, choose, now)) {
          return null;
        }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:946`, `shouldWake`, the greeting:

        case 'person_in_view':
          ...
          return (
            line.includes('you have not seen them before') &&
            !isWarrantOn(brain, String(event.details.name ?? ''))
          );

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1390`, in `think`, an exact line said only after the call:

        if (mustSay && exact) {
          ...
          actions.push({ tool: 'say', text: withRemark(mustSay, given?.text) });

## How it was found

Counted from `crew_brain.log` of `round-20.43.32`: records without `ROUTINE (no LLM)`, their `"ms"` summed, and the `say` line of each reply schema counted. The forecast for forty is arithmetic on those counts, not a test, which is why this is `likely`. No model was called.

## How to fix it

1. **Log the wait.** Note `queuedAt = Date.now()` when a brain is pushed onto `queue` or `choiceQueue`, and put `"waited": started - queuedAt` in the brain log record (and pass it through `write_brain_log` as a number, as `ms` is). Without this nobody can see the queue.
2. **A fixed line goes at once when the model is busy.** In `ingest`, where `drive`'s `speak` callback sets `brain.mustSay`: if `exact` is set and `running || queue.length > 0`, call `runTool(brain, { tool: 'say', text: fallback })` and the `...AfterSaying` hooks at once, as the error path in `think` does, and do not wake the brain. The remark is dropped only when it would have had to wait.
3. **Skip a choice that cannot be answered in time.** In `settleChoice`, take the code's own order at once (as for `CHOICE_GAP_MS`) when the talk queue is not empty or a call is running. `settleChoice` lives in `driver.ts` and cannot see the queue, so pass a `modelFree: boolean` from `ingest` into `drive`.
4. **A player's line first.** In `startTalk`, take from the queue first any brain whose `pendingSpeakers` holds a handle that is not one of the crew (no brain has that name). HOLE-09 point 3 proposes the same.
5. **Greetings between two crew NPCs.** Question for the owner: should two crew NPCs meeting for the first time greet each other through the model at all, once the crew is large? A coded greeting with the name, or none when the model is busy, would take about half the forecast load away. A player or a crew member owned by another player would still be greeted by the model.

## How to test the fix

- Type check and lint.
- The simulator's model calls are its own, so it cannot show the load, but `crew` and `meeting` scenarios run four times each before and after must show the same work done and the same fixed lines said.
- In a round, with step 1 in, read `"waited"` in `crew_brain.log`: with eleven crew it should be well under a second; spawn a second standing crew and read it again.
