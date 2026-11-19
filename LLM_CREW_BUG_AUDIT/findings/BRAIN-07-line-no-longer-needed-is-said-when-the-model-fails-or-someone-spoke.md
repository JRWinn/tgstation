---
id: BRAIN-07
title: A line that has stopped needing saying while the model thought is said all the same when the call fails, and is kept inside the answer when someone had also spoken
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: f490acef150
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1612, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1364, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1379
fix: Test mustSayIf again in the catch of think before the plain line is said, and when it is false with speakers present ask that the line be left out or say the plain answer only
---

## What is wrong

A step that is a line to say may carry `sayIf`, a test of whether the line still needs saying: a workmate may have asked the stranger first, the crate may have been put out, the door may be held. `think` tests it twice, before the call (`brain.ts:1277`) and after the reply (`brain.ts:1364`, "if the line no longer needs saying, it is not said, and nor is whatever the LLM made of it"). Two paths miss it:

1. **The call fails.** The `catch` of `think` says the plain line whenever there is someone in view (`if (mustSay && brain.peopleInView.length > 0)`), and runs every after-saying hook on it, without asking `mustSayIf`. The call fails on a time-out (60 seconds, twice over for a cut-off retry), an HTTP error, or a reply cut off for want of context (`callOllama` throws at once for that). After 60 seconds the thing the line was about is very likely settled. (A throw from `parseReply` or later is not this path: by then `dropped` has been worked out and `mustSay` set to null if the line was no longer needed, `brain.ts:1364-1370`, so the `catch` says nothing.)
2. **Someone also spoke.** When the line is `dropped` and `speakers` is not empty, the model's `say` is kept as it is (`!(alone || (dropped && speakers.length === 0) || ...)`). That `say` was written to the prompt that told the model to work the line in (`MOMENTS.line` is added when `spokenTo` and `mustSay` are both there, `talk.ts:172`), so the answer usually carries the request that is no longer wanted. Only the after-saying hooks are spared (they get `mustSay = null`).

The three `sayIf`s there are today, and what each path then says:

- `jobs/guarding.ts:598`, a stranger in a locked post: "Ann, why are you in here? This room is locked to the crew." to someone a workmate has already vouched for, or who has already been given a verdict. `guardAfterSaying` then counts the question as asked again.
- `jobs/pickups.ts:219`, at the cargo counter: "Sam, I am here to collect crate 12 for ..., please." when the crate is already out in the lobby.
- `jobs/janitor.ts:686`, at a door: "Arielle, ... Could you let me in, please?" while the door is being held open for it.

One concrete case (path 1):

1. Two cargo technicians are in the Cargo Bay. A visitor walks in. Technician A's next step is the stranger question; its `sayIf` is `() => { const now = brain.strangers[name]; return !!now && !now.verdict && !standingBack(brain, now); }`.
2. A's call goes out and the model hangs (BRAIN-02's case). Meanwhile technician B asks, the visitor says the Quartermaster sent for them, the Quartermaster vouches, and A's own brain records the verdict from what it overhears.
3. At 60 seconds the fetch is aborted. The `catch` says "Ann, why are you in here? This room is locked to the crew." and runs `guardAfterSaying(brain, mustSay)`.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1611`, in the `catch` of `think`:

      // The LLM being down must not leave the body dumb: what had to be said is said plainly.
      if (mustSay && brain.peopleInView.length > 0) {
        runTool(brain, { tool: 'say', text: mustSay });
        decision.calls.push(`say(${JSON.stringify(mustSay)}) [the LLM gave none]`);
        brain.lastSayAt = Date.now();
        jobFor(brain.job).afterSaying?.(brain, mustSay);
        guardAfterSaying(brain, mustSay);

`mustSayIf` is in scope there (`const mustSayIf = brain.mustSayIf;`, `brain.ts:1301`) and not used.

`brain.ts:1364` and `brain.ts:1379`, the success path:

      const dropped = mustSay !== null && !!mustSayIf && !mustSayIf();
      if (dropped) {
        mustSay = null;
      }
      ...
      const actions = replied.filter(
        (action) =>
          action.tool !== 'say' ||
          !(
            alone ||
            (dropped && speakers.length === 0) ||

## How it was found

Read from the code. Not seen in a round: in the recent rounds on disk the model almost never failed (from 2026-11-18 on, the error field of `crew_brain.log` is empty for every talk call; the one error is a READING), so path 1 has had no chance to show. Path 2 needs a speaker and a dropped line in the same call; not looked for in the logs.

## How to fix it

1. In the `catch` of `think`, change the test to `if (mustSay && brain.peopleInView.length > 0 && !(mustSayIf && !mustSayIf()))`. Leave the rest of the block as it is.
2. For path 2: when `dropped && speakers.length > 0` and `mustSayNeeds` is set, a `say` that matches `mustSayNeeds` (the line's own test of "this is that line"; all three `sayIf` steps have one or say the asker's name) is the stale request, so drop it. Do not leave the speaker with nothing: put the speakers back (`brain.pendingSpeakers.add`), skip the `talk.replies++` loop for them and set `brain.wake = true`, so the next call is an ordinary "someone has spoken to you" call with no line in it (BRAIN-09 needs the same put-back; build one helper for both). A `say` that does not match `needs` is kept. Where there is no `needs`, keep today's behaviour. The owner may prefer the other way round (say the answer and accept the stale request in it); this is a choice of how much of the model's answer to trust, not a rule question.
3. Keep: a line with `exact` is not affected (its `sayIf` is never set today; check that stays so).

## How to test the fix

In `tools/llm_crew/`, a scenario where the stand-in model throws (or returns non-JSON) on a call for a line that has a `sayIf`, with the condition turned false while the call is out (for the pickup line, have the server mark the crate `out` in the next state). Before the fix `game.log` shows the line said; after it, no say. Run the type check. In a round, grep `crew_brain.log` for `[the LLM gave none]` and compare each with the state just before it.

## Check

Read `think` in `brain.ts` (1273-1644) end to end, `callOllama` (1693), the `speak` hook in `ingest` (753), `buildTalk` in `talk.ts` (157-200), `MOMENTS.line` in `person.ts`, the three `sayIf`s (`guarding.ts:598`, `pickups.ts:219`, `janitor.ts:686`) and `guardAfterSaying` (`guarding.ts:847`). The quotes are what the code says today.

Path 1 holds: `mustSayIf` is read at 1301 and never used in the `catch` (1612). A time-out, HTTP error or context cut-off throws from `callOllama` before 1364, so `mustSay` is still set and the plain line and every hook run. `sayIf` closures read live brain state, and `ingest` keeps updating it while the fetch is awaited, so the condition can turn false in that time. One correction made in the body: a `parseReply` throw does not take this path, because `dropped` has already nulled `mustSay`.

Path 2 holds: with speakers, `buildTalk` takes the `spokenTo` branch and adds `MOMENTS.line` ("Say it now, in your own words, to that person by name"), and the filter at 1384 keeps that answer when `dropped`.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers either path. Fix 1 is a one-line guard and right. Fix 2 was mended so the speaker is answered on the next call rather than left with nothing. Medium and small stand: path 1 needs a failed call, which has been rare since 2026-11-18.
