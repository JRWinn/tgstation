---
id: CHK-01
title: voice.ts crashes part way through because the test brain in fixtures.ts lacks fields the window code now reads
kind: bug
severity: low
effort: small
confidence: sure
status: found
area: tools
files: tools/llm_crew/fixtures.ts:25, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:224, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:459, tools/llm_crew/voice.ts:92
fix: Make the blank brain in one exported function in the window code and have both ingest and fixtures.ts call it
---

## What is wrong

`tools/llm_crew/fixtures.ts` builds a test brain by hand: one very long object literal in `makeBrain`. The game builds its brains in `ingest` in `brain.ts`. The two lists have drifted apart. The test brain is missing these fields that every real brain has:

    stowed, beyondKinds, waterFrom, bucketToFill, wantsBucket, doorOutTo, atDoorLabel
    (and id, lastSeq, seenHandles, pending, wake, chained, talks, pendingSpeakers, lastSayAt, lastThinkEnd, loggedCard, lastActiveAt, which the test tools do not reach)

`beyondKinds` is read without a guard in `jobs/janitor.ts`, so the model test `voice.ts` dies with a TypeError on its 26th case of 39 ("guard: janitor asked why it is in the bay").

The concrete case, as run:

    DRY=1 tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe tools/llm_crew/voice.ts

prints nothing but:

    459 |           : `I cannot shift the mess in the ${task.place} with my ${brain.cleaningTool}.${brain.beyondKinds.length > 0 ? ` ${whatIsLeft(brain)}` : ''}`,
    TypeError: undefined is not an object (evaluating 'brain.beyondKinds.length')
          at syncTasks (...\CrewBrain\jobs\janitor.ts:459:97)
          at syncTasks (...\CrewBrain\tasks.ts:137:21)
          at at (...\tools\llm_crew\fixtures.ts:33:3)
          at build (...\tools\llm_crew\voice.ts:92:370)
          at ...\tools\llm_crew\voice.ts:127:29

and exits 1. In a dry run the list of prompt sizes is only printed at the end, so nothing at all comes out. In a real run it is worse: the first 25 cases are sent to the model (25 cases times every personality card, several minutes of graphics card time), then the crash comes, and the `RUN=name` file is only written after the loop, so the whole run is lost.

So the one fixed set of cases "every change to the prompt, and every model, is judged on" (the head of `voice.ts`) cannot be run at all at this commit. Any entry in the change log after the 13:32 round that says a prompt change was checked with `voice.ts` could not have been.

`choose.ts` with `DRY=1` still runs (42 lines, exit 0), and the five tables (`security.ts`, `addressing.ts`, `engine.ts`, `reports.ts`, `book.ts`) all pass, because none of their cases reaches the unguarded reads. That is luck, not design: `brain.stowed.find(...)` in `jobs/janitor.ts:132` and `brain.waterFrom` at `:566` are one new test case away from the same crash.

## Where

`tools/llm_crew/fixtures.ts:25`, `makeBrain`: a single line of about 3,000 characters that starts

    export function makeBrain(name: string, job: string) {
      return { name, job, location: '', placeKind: 'room', resting: false, exploredEverything: false, storageHere: 0, cleaningTool: null, poorTool: false, workDone: {}, workReported: {}, mustSayExact: false, ...

and ends `} as any;`. The `as any` is why nothing warns: and `tools/` is not in `tgui/tsconfig.json`'s `include` in any case, so the type check never sees this file.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:224`, in `ingest`, the real list:

    brain = {
      id: npc.id,
      name: npc.name,
      job: npc.job,
      card: pickPersonCard(npc.name),
      ...
        beyondKinds: [],        (line 266)
      ...
        waterFrom: null,        (line 271)
        bucketToFill: false,
        wantsBucket: false,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:459`, in the job's `syncTasks`:

    : `I cannot shift the mess in the ${task.place} with my ${brain.cleaningTool}.${brain.beyondKinds.length > 0 ? ` ${whatIsLeft(brain)}` : ''}`,

`LLM_CREW_PLAN_DROPPED_CRATES.md:166` and `LLM_CREW_PLAN_SECURITY.md:408` both list `tools/llm_crew/fixtures.ts` as a file to touch "if a brain field is added", so the need was known: the 13:32 round's work (commit `99461136f6d`, which added `beyondKinds`) and the water work missed it.

## How it was found

A check that was run: the command above, at commit `b4284e5fe54`. The field lists were compared with a throwaway script that reads the keys of the literal in `ingest` and the keys of `makeBrain('A B', 'Janitor')`.

To be sure there is no second crash behind the first, `voice.ts` and `fixtures.ts` were copied to the temp folder, `beyondKinds: [], waterFrom: null, bucketToFill: null, wantsBucket: false, doorOutTo: null, atDoorLabel: null, stowed: []` was added to the copy of `makeBrain`, and the dry run then built all 39 calls and exited 0. No model was called. What the model would say to the 39 prompts was not seen.

## How to fix it

1. In the window code, take the object literal out of `ingest` into one exported function, for example `blankBrain(id: string, name: string, job: string): NpcBrain` in `brain.ts` (or `memory.ts` if `brain.ts` should not be imported by tools for its side effects: check what `brain.ts` does at import; `sim.ts` already imports it). `ingest` calls it and then sets `awake` and `location` from the server's data as it does now.
2. In `tools/llm_crew/fixtures.ts`, make `makeBrain` call `blankBrain('t1', name, job)` and then lay the test's own starting values over it (`hasLocator: true, locatorUsed: true, supplyPlaces: ['Custodial Closet'], supplyPlacesSearched: new Set(['Custodial Closet']), hasPda: true, card: PERSON_CARDS[0]`, and whatever else differs from the blank). Compare the two literals key by key when doing this: a test value that differs from the blank on purpose must be kept.
3. The quick way, if step 1 is not wanted now: add the seven missing fields to the literal in `makeBrain` with the values `ingest` gives them (`stowed: [], beyondKinds: [], waterFrom: null, bucketToFill: false, wantsBucket: false, doorOutTo: null, atDoorLabel: null`). This mends today's crash and leaves the cause.
4. Either way, make `voice.ts` write its `RUN=` file as it goes (or in a `finally`), so a crash in a late case does not throw away the calls already paid for.

I would do 1 and 2: the list has drifted twice and will again.

## How to test the fix

- `DRY=1 tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe tools/llm_crew/voice.ts` must print 39 lines and "39 calls built, none sent", exit 0.
- `DRY=1 ... tools/llm_crew/choose.ts` must still exit 0, and the five tables must still say "all passed".
- From `tgui/`, the type check must still be clean.
- Run two or three simulator scenarios (`sim.ts quiet crew`, `quiet qm`, `quiet warrant`) to see that `ingest` still builds a working brain.
