---
id: PARSE-10
title: The Captain cannot have the engine shut down - turn the emitters off, shut down the engine and kill the engine are read by nobody, to the Chief Engineer or the engineer
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:672, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:650, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:529, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:126
fix: Read a shut-down order from anyone the Chief Engineer answers to, as LIGHT_AGAIN_WORDS is read, and have it give the engineer the same Emitters off order as a falling crystal does
---

## What is wrong

The only order the Captain can give engineering that code reads is "light the engine" (`LIGHT_AGAIN_WORDS`, and see ENG-05 for how loosely it is read). There is no way to have the engine shut **down**.

- To the Chief Engineer, aloud or by PDA, the Captain's line goes through `isMeetingOrder` and `LIGHT_AGAIN_WORDS` and nothing else. "Turn the emitters off", "shut down the engine", "kill the engine", "emitters off now", "stop the engine" do nothing. The model answers in its voice; its `whenAsked` lines tell it never to say more than its PDA says, so it may well say it is doing it.
- To the engineer, the Captain's line is not read at all: `takeWord` is called only for a speaker whose job is Chief Engineer, and the engineer is told it switches the emitters "on the Chief Engineer's word and nobody else's".

The emitters are only ever switched off when the Chief Engineer's own floor test sees integrity fall (`syncTasks` in `chiefengineer.ts`). A Captain who sees the delamination warning, a fire in the engine room, or a crew member about to walk into the beams, and says "shut the engine down", is ignored by code. The plan (`LLM_CREW_PLAN_ENGINEERING.md`) puts the Captain over the Chief Engineer; `jobs/orders.ts` says "Whoever an NPC answers to can tell it to do its own job's work".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:685`, in `overhears`:

    if (
      event.details.said_to !== 'me' ||
      !brain.peopleInView.find((person) => person.name === speaker)?.superior
    ) {
      return;
    }
    // Someone it answers to telling it to find out how its staff are doing: a meeting is called.
    if (isMeetingOrder(brain, heard)) {
      ...
      return;
    }
    if (LIGHT_AGAIN_WORDS.test(heard)) {
      lightAgain(brain);
    }

`chiefengineer.ts:659`, in `readsMessage`, the same two tests for a PDA message from someone it answers to.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:529`:

    overhears: (brain, event: SenseEvent) => {
      ...
      if (speaker && isChiefEngineer(job)) {
        takeWord(brain, speaker, heard, true);
      }
    },

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineering.ts:126`, the one word list for the Captain:

    export const LIGHT_AGAIN_WORDS = /\blight the engine\b/i;

## How it was found

Read from the code: every reader in `chiefengineer.ts`, `engineer.ts` and `engineering.ts` was followed for a line from someone who is not an engineer. Not run and not seen in a round. Not listed in the change log or the engineering plan as known.

## How to fix it

1. In `jobs/engineering.ts`, add `SHUT_DOWN_WORDS`: `\b(emitters?\s+off|turn\s+(?:the\s+)?emitters?\s+off|switch\s+(?:the\s+)?emitters?\s+off|shut\s+(?:the\s+)?(?:engine|emitters?|sm|supermatter)\s+(?:down|off)|shut\s+down\s+(?:the\s+)?(?:engine|emitters?)|kill\s+(?:the\s+)?(?:engine|emitters?)|stop\s+(?:the\s+)?(?:engine|emitters?))\b`, and refuse it with a negation before it ("don't", "do not", "no need to") as ENG-05 proposes for lighting.
2. In `chiefengineer.ts`, in both `overhears` (from a superior, said to it) and `readsMessage` (from someone it answers to), before `LIGHT_AGAIN_WORDS`: if `SHUT_DOWN_WORDS` matches, set `chief.shut = true` and give the shut order exactly as the falling-integrity branch of `syncTasks` does (the same `chief.order = { what: 'shut', ... }`), so the engineer gets "Emitters off, now." Tell the Captain back with the fixed line "I am having the emitters switched off."
3. In `engineer.ts`, decide with the owner whether the Captain's own word to the engineer counts. If yes: in `overhears`, a line from a speaker with `superior` set, said to it, that matches `SHUT_DOWN_WORDS`, does what `SHUT_WORDS` from the chief does. That keeps working when the Chief Engineer is down or absent (KNB-11).
4. With no Chief Engineer aboard, step 3 is the only way: the question for the owner is whether an engineer with no chief takes the Captain's orders on the engine at all.

## How to test the fix

- `bun tools/llm_crew/sim.ts quiet engine`, then add a variant where the Captain says "shut the engine down" to the Chief Engineer two minutes after it is lit: the emitters must go off and the Captain hear back.
- `quiet enginehot` must still pass.
