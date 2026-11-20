---
id: SIM-09
title: The model test voice.ts judges prompts the game never sends - no "speaking to you" on any line heard, everyone in view counted as having spoken, and word-for-word lines never marked
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/fixtures.ts:37, tools/llm_crew/voice.ts:129, tools/llm_crew/voice.ts:132, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:910
fix: Build each voice case's report line with describeEvent from a real speech_heard event, pass only the speaker's handle as speakers, and pass exact from the driver's step
---

## What is wrong

`voice.ts` says of itself: "The call is built by the same code the game builds it with, so what is tested is what is sent." The code is the same (`buildTalk`), but three of its inputs are not what the game gives it, so the prompt each case puts to the model is not one the game would send.

1. **No line heard says who it was said to.** In the game, `describeEvent` (`brain.ts:910`) writes a heard line as `[time] Zim Fire says: "..." (person p1, 1 tiles away, speaking to you)`, or `speaking to Josh Reed`, or `speaking to everyone there`, from the `said_to` worked out in `addressing.ts`. That tail is how the model is told plainly whether it was spoken to (`addressing.ts`: "The LLM is then told plainly who it was said to"). The test's report lines come from `says` in `fixtures.ts`, which writes `(person p1, 1 tiles away)` and nothing more. Every spoken case in the test is put to the model with no word of who was addressed.
2. **Everyone in view is a speaker.** `voice.ts:129` passes `speakers = b.peopleInView.map((p) => p.handle)` for every spoken case. `buildTalk` uses `speakers` to decide whom the model is asked how it feels about (`feelAbout`), whose superior it is (`superior`), who told it of any work (`toldBy`) and which moves are offered. In the game `speakers` is only those who spoke. In `guard: janitor asked why it is in the bay`, Vik spoke and Donna did not, but the model is asked to feel about both; likewise Donna in `rule: the Captain tells the janitor to leave`, and Tolly in the two `guard: tech asked...` cases.
3. **A word-for-word line is never marked.** The game passes `exact: brain.mustSayExact` (`brain.ts:1303`), which changes the call to "here is your line, give a remark to follow it". `voice.ts:132` passes `mustSay` from the driver's step but never `exact`, so a case whose step is word for word would be sent as an ordinary "say this" call. Whether any of today's 39 cases builds such a step was not checked (the dry run stops at case 26, `CHK-01`); the non-spoken cases are greetings, a request to cargo and "finished what it was told", which mostly are not word for word. Any case added for a report, a warrant notice or an order passed on would hit it.

So the scores in `runs/before.json` and `runs/after.json`, and any run made now, measure the model on prompts that differ from the game's in what matters most to whether it answers: whether it was spoken to.

## Where

`tools/llm_crew/fixtures.ts:37`:

    export const says = (who: any, text: string, tiles = 1) => `[22:40:32] ${who.name} says: "${text}" (person ${who.handle}, ${tiles} tiles away)`;

`tools/llm_crew/voice.ts:129` and `:132`:

    const speakers = c.spoken ? b.peopleInView.map((p: any) => p.handle) : [];
    // A line its work calls for comes from the driver, as it does in the game.
    const step = c.spoken ? null : nextStep(b);
    const call = buildTalk(b, { report: report ? [report] : [], speakers, mustSay: step?.say ?? null, remark: !!c.remark });

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:910`, what the game writes:

    } else if (handle) {
      const to = event.details.said_to;
      const toWhom =
        to === 'me'
          ? ', speaking to you'
          ...
      line += ` (person ${handle}, ${where}${toWhom})`;

## How it was found

Read from the code: `fixtures.ts`, `voice.ts`, `talk.ts` (`buildTalk`'s use of `speakers`) and `brain.ts` (`describeEvent`, `think`). Not run against the model.

## How to fix it

1. Export `describeEvent` from `brain.ts` (or move it to `memory.ts`), and in `fixtures.ts` make `says` build a `speech_heard` event (speaker, handle, distance, message, and `said_to` from the window's own `saidTo`), and return `describeEvent(event, brain)`. The test line is then the game's line, and stays so when the game's changes.
2. In `voice.ts`, give each spoken case the handle of whoever spoke (the `who` passed to `says`) and pass `speakers: [that handle]`.
3. Pass `exact: step?.exact ?? false` to `buildTalk`.
4. Run the model test once (with the card free, `num_ctx` 8192), keep it as a new run, and compare with `after.json`: the pass rates of the spoken cases are likely to change, since the model is now told when it was spoken to.

## How to test the fix

`DRY=1 SHOW=1 voice.ts "tech:"` shows report lines ending `speaking to you` and reply schemas whose `feel.person` lists only the speaker. `DRY=1 voice.ts` still builds every case (after `CHK-01` is fixed).
