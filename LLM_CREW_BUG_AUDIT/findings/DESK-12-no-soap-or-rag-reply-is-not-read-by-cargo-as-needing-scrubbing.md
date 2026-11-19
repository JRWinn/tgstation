---
id: DESK-12
title: A janitor's I have no soap or rag reply is not read by cargo as the mess wanting scrubbing, so the next janitor is asked plainly to come and try
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:826, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2312, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1634
fix: Word the janitor's reply with NEEDS_SCRUBBING (it needs scrubbing with soap or a rag), or widen cargo's test to soap or (a )?rag
---

## What is wrong

Two janitor lines tell cargo a mess is beyond them. Cargo reads both with `beyondRoom`, and then decides whether to tell the next janitor that the mess wants scrubbing by testing the words for "soap or a rag":

- After trying: "I cannot shift the mess in the Cargo Bay with my mop. What is left (cobweb) needs scrubbing with soap or a rag." Has "soap or a rag": `call.wantsScrub = true`.
- Before setting off, when the call names only scrubbing kinds and it has neither: "I have no soap or rag, so I cannot shift the mess in the Cargo Bay." Has "soap or rag", without the "a": `call.wantsScrub = false`.

The second is the more certain of the two that the mess wants scrubbing, and it is the one read as not saying so. The next call then goes out as "Lance could not shift it with what they had. Could you come and try, please?", not "... it needs scrubbing with soap or a rag. Could you come and clean it up if you have one, please?".

When the call names the kinds ("There is a mess in the Cargo Bay: cobweb."), the next janitor still works it out from the kinds (`kindsCalled`, `SCRUB_KINDS`), so the harm is limited to calls where cargo had no kinds to name, or where the kind is not in the janitor's short list.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:826`, in `readsMessage`:

    line: `I have no soap or rag, so I cannot shift the mess in the ${named}.`,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2312`, in cargo's `readsMessage`:

    // What they said it wants, if they said: only then is the next janitor told so. A
    // janitor whose mop had only run dry was once passed on as "it needs soap".
    call.wantsScrub = /soap or a rag/i.test(text);

`cargo.ts:1634`, what the next janitor is sent:

    : call?.wantsScrub
      ? `There is a mess in the ${place}${what ? `: ${what}` : ''}. ${tried.split(' ')[0]} could not shift it: ${NEEDS_SCRUBBING}. Could you come and clean it up if you have one, please?${wayIn}`
      : `There is a mess in the ${place}${what ? `: ${what}` : ''}. ${tried.split(' ')[0]} could not shift it with what they had. Could you come and try, please?${wayIn}`,

## How it was found

Read from the code: the two strings compared by hand. Not seen in a round.

## How to fix it

1. Change the janitor's line to carry the shared words: `I have no soap or rag, so I cannot shift the mess in the ${named}: ${NEEDS_SCRUBBING}.` `NEEDS_SCRUBBING` is already exported from `janitor.ts` and imported by `cargo.ts`. Check the line still fits in a PDA message (200 characters) with a long room name.
2. Keep `BEYOND_WORDS` reading the room right. Today its first half stops at " with" or at "." or ",", so on the new line it would stop at "scrubbing with" and read the room as "Cargo Bay: it needs scrubbing". Add ":" to the stop characters, `[.,:]`, so the room is read as "Cargo Bay".
3. Alternatively widen cargo's test to `/soap or (a )?rag/i`. Step 1 is better: one set of words, defined once.

## How to test the fix

- Add a case to a table in `tools/llm_crew/` (or a small script): `beyondRoom` of the new line gives the room; cargo's `readsMessage` on it sets `wantsScrub` TRUE.
- Type check from `tgui/`.
