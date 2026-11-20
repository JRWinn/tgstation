---
id: ENG-12
title: On any map but MetaStation the Captain is told by the Chief Engineer "The engine is not lit - I do not know this engine", the engineer's "I" passed on as the chief's own
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:86, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:576, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:172
fix: Word the unknown-engine reason without I, for example "the engine room is not one engineering has the steps for", as whyNot does for doors
---

## What is wrong

The engineer's reason for not lighting is passed on word for word by the Chief Engineer: to the Captain by PDA (`hearEngineer`), and at every meeting's close and every report (`engineWords`). Every reason the lighting list gives is worded as a fact about a machine ("the nitrogen canister will not connect"), except one:

    export const UNKNOWN_ENGINE = 'I do not know this engine';

Passed on, it becomes the Chief Engineer saying it does not know its own engine:

- PDA to the Captain: "The engine is not lit: I do not know this engine. The emitters have not been switched on."
- Every meeting: "The engine is not lit: I do not know this engine. The meeting is over, thank you."

The change log's 20:19 entry fixed exactly this for door reasons ("No reason for a door not opening has 'I' in it", `whyNot` in `jobs/forcing.ts`), after the Captain was sent "engineering could not open the Bar Backroom: I cannot get to it". The engine's reason was left as it was.

This is not a rare case. `METASTATION` is the only list in `ENGINES` (`jobs/engine.ts`), so on every other map the engineer gets stuck on `UNKNOWN_ENGINE` two minutes in, and the Captain gets this line in every round on that map.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:86`:

    /** What an engineer says stopped it when the engine room is not one it has the steps for. */
    export const UNKNOWN_ENGINE = 'I do not know this engine';

`jobs/engineer.ts:186`, where it becomes the stuck reason:

    if (lighting(engine) && !lightingSteps(brain.machines)) {
      stick(brain, engine, UNKNOWN_ENGINE);
    }

`jobs/chiefengineer.ts:576`, passed on:

    const what = stuck[1].trim();
    if (chief.stuck !== what) {
      chief.stuck = what;
      tellCaptain(
        brain,
        `The engine is not lit: ${what}. The emitters have not been switched on.`,

`jobs/chiefengineer.ts:172`, `engineWords`:

    if (chief.stuck) {
      return `The engine is not lit: ${chief.stuck}.`;
    }

## How it was found

Read from the code. Not seen in a round: every round so far has been on MetaStation.

## How to fix it

1. Change `UNKNOWN_ENGINE` to a reason with no "I" in it, that reads right from either mouth: "engineering has no steps for this engine room". The engineer's own line then reads "Ada, I cannot light the engine: engineering has no steps for this engine room."
2. Nothing else reads the words (`STUCK_WORDS` takes whatever follows the colon), so no other change is needed. Check `tools/llm_crew/engine.ts` for a case that names the old words.

## How to test the fix

- `tools/llm_crew/engine.ts`: run the cases; update any that match the old line.
- Simulator: the scenario with an unknown engine room, if there is one, reads the new words in the Captain's PDA.
