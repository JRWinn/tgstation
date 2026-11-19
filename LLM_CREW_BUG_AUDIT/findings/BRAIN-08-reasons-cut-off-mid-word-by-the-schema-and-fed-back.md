---
id: BRAIN-08
title: One reason in four for a feeling and one in eight for a job choice is cut off mid-word by the reply schema, and the stump is fed back into later prompts
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/choice.ts:135, tgui/packages/tgui/interfaces/CrewBrain/prompt.ts:260, tgui/packages/tgui/interfaces/CrewBrain/choice.ts:179, tgui/packages/tgui/interfaces/CrewBrain/relationships.ts:78
fix: Ask for a reason in a few words in the prompt, raise the schema maxLength well above the kept length, and cut the kept text back to its last whole word or clause
---

## What is wrong

The reply schemas set `maxLength: 80` on the `why` of a job choice (`choice.ts:135`) and of a feeling (`prompt.ts:260`). Ollama turns a JSON schema into a grammar, so `maxLength` is not a hint: at the 80th character the string is closed, whatever the model was in the middle of. The model is not told of the limit (the choice asks for "a few words of your own"), so it often writes a full sentence and is cut off mid-word.

The cut text is kept and goes back to the model in later calls:

- a choice's reason, through `describeChoice` (`choice.ts:179`): `Of the work on your list, you chose to ... first. Your reason: "Service Hallway sees more folks, so it deserves my attention first while the low"` (seen in `round-22.29.47`, `crew_brain.log`);
- a feeling's reason, through `describeFeelingWithReason` (`relationships.ts:78`, `` `${text} (${why})` ``), which `memory.ts:375` and `memory.ts:468` write into the "Where you last saw people, and how you feel about them" lines: `- Finn Wright: Bar, a minute ago. As for Finn Wright, <feeling> (his loud voice makes my skin pr).`

Small models copy the shape of what they are shown. A half-word in the prompt is noise at best, and a reason the NPC may quote aloud when asked why ("I'd sooner do the hallway first while the low").

Counted in every `crew_brain.log` from 2026-11-18 on (script under "How it was found"):

- feelings: 435 of 1,785 `why`s are at the 80-character cap (24 percent);
- job choices: 101 of 754 (13 percent).

Examples at the cap from `round-20.43.32`: "his loud voice makes my skin pr", "before someone slips and breaks an e", "without the usual '".

The `think` field has `maxLength: 160` and hits it 13 times in 2,074, so the same cap is fine there.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/choice.ts:131`, in `buildChoice`:

      schema: {
        type: 'object',
        properties: {
          // The reason comes first, so that the pick follows from it.
          why: { type: 'string', maxLength: WHY_MAX_LENGTH },
          pick: { type: 'string', enum: Object.keys(letters) },

`tgui/packages/tgui/interfaces/CrewBrain/prompt.ts:256`, in `buildReplySchema`:

              person: { type: 'string', enum: feelAbout },
              change: { type: 'string', enum: ['same', 'warmer', 'cooler'] },
              why: { type: 'string', maxLength: 80 },

`choice.ts:179`, `describeChoice`:

      return `Of the work on your list, you chose to ${describeTask(brain, task)} first. Your reason: "${choice.why}"`;

## How it was found

Seen in round logs, then counted. A throwaway script (bun, in the system temp folder) read every `crew_brain.log` under `data/logs/2026/11/18` and `19`, parsed the `reply` of each CHOICE and each talk call, and counted `why` strings of 80 characters or more. Not checked: whether the model, once shown a cut reason, says it aloud; that is a guess from how small models behave.

## How to fix it

1. In `buildChoice`, raise the schema's `maxLength` to 160 and keep `WHY_MAX_LENGTH` (80) as the length kept. Do the same for the feeling's `why` in `buildReplySchema`.
2. Where the reason is kept (`readChoice` in `choice.ts`, `shiftFeeling` in `relationships.ts`), cut it to the last whole clause or word that fits in 80: take the text up to 80, and if it was longer, cut back to the last `,`, `;`, `.` or space, and drop a trailing "and", "but" or "while".
3. Say the length in the question: the choice already asks for "a few words of your own"; add "under twelve words". The feeling's line in the reply guide says "why in a few words"; add the same. That costs a few tokens of prompt, which is within budget.
4. Keep the reason before the pick in the choice schema: the comment says that order is on purpose.

## How to test the fix

Run the type check. In the next round, run the same count over `crew_brain.log`: reasons at the schema cap should be near zero, and no kept reason (as shown in later prompts, `Your reason: "..."` and the people-in-view lines) should end mid-word.
