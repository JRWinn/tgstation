---
id: MEM-12
title: My body's hands are full is said aloud as I's hands are full, and was becomes am
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/prompt.ts:166
fix: Add rules for my body's and your body's before the bare ones, keep the tense of was, and only strip a third-person s from verbs that are not es-forms
---

## What is wrong

`inOwnVoice` turns "my body" in a model's line into "I", because the reports speak of "your body" and the model says it back. Several common shapes come out as broken English, which the crew member then says aloud:

| Model wrote | Said aloud |
| --- | --- |
| My body's hands are full right now. | I's hands are full right now. |
| Your body's in the way. | You's in the way. |
| My body was told to wait here. | I am told to wait here. |
| My body passes the Bar on the way. | I passe the Bar on the way. |
| My body focuses on the mop. | I focuse on the mop. |
| My body and I are tired. | I and I are tired. |

## Where

`tgui/packages/tgui/interfaces/CrewBrain/prompt.ts:166`, `BODY_TALK`:

    [/\bmy body (is|was)\b/gi, 'I am'],
    ...
    [/\bmy body ([a-z]{3,})s\b/gi, 'I $1'],
    [/\bmy body\b/gi, 'I'],
    ...
    [/\byour body ([a-z]{3,})s\b/gi, 'you $1'],
    [/\byour body\b/gi, 'you'],

There is no rule for "my body's" or "your body's", so the bare rule turns them into "I's" and "you's". "was" is put in the present. The `s` rule drops one letter from "passes", "focuses", "reaches", "washes".

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `CrewBrain/prompt.ts` and printed `inOwnVoice` for each line above. Not seen in a round log (the brain log holds the model's raw reply, not what was said; `game.log` "was told by its brain to say" would show it).

## How to fix it

1. Before the bare rules add: `my body's` → `my` ("my body's hands" → "my hands"; "my body's busy" reads "my busy", so better: `my body's (hands|arms|feet|legs)` → `my $1`, and any other `my body's` → `I'm`). The same for `your body's` → `your $1` / `you're`.
2. Split the first rule: `my body is` → `I am`, `my body was` → `I was`. Likewise `your body was` → `you were`.
3. For the third-person rule, handle `-es` after s, x, z, ch, sh: `my body (\w+?(?:ss|x|z|ch|sh))es\b` → `I $1` before the plain `s` rule ("passes" → "pass", "reaches" → "reach"). "focuses" → "focus" needs `(\w+us)es`. Keep it to these few.
4. `my body and I` → `I`.

## How to test the fix

- A small table for `inOwnVoice` (the rows above, and the plain ones that work today: "Sorry, my body is busy." → "Sorry, I am busy."). HAND-03 proposes a table for the same function; one table can hold both.
- Type check from `tgui/`.
