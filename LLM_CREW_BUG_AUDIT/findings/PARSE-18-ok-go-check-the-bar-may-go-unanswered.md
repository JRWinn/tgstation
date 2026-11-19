---
id: PARSE-18
title: An order that begins with ok, thanks or alright, ok go check the bar, is taken as a goodbye that needs no answer, so the order is carried out without a word back
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/talk.ts:76, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:178
fix: In buildTalk never allow silence when an order was made out or work was told, and in needsNoAnswer require the line to be nothing but the closing words, give or take a name and please
---

## What is wrong

`needsNoAnswer` lets the model stay silent when all someone said was thanks, agreement or goodbye. It tests only that the line **begins** with one of those words, has no `?`, and is five words or fewer. Typed chat very often begins an order with "ok", "alright" or "thanks", and short orders fit in five words.

`buildTalk` then sets `maySaySilent` from that alone, even when the same line has just been made out as an order from a superior (`ordered`). The prompt then says both "tell Zim you are on it" (from `describeOrdered`) and "If all they did was thank you, agree or say goodbye, that needs no answer", and the reply schema accepts `say: null`. Whichever the model picks, the body goes; if it picks silence, the Captain gets no word that the order was heard.

Run with a janitor, the Captain (superior) speaking to it:

    ok go check the bar             ordered: look Bar      silence allowed: true
    thanks, now check the kitchen   ordered: look Kitchen  silence allowed: true
    ok, blood in the bar            ordered: clean Bar     silence allowed: true
    alright check the library pls   ordered: look Library  silence allowed: true
    later, check the bar            ordered: look Bar      silence allowed: true
    ok whats up                     (none)                 silence allowed: true

The last is a question typed without a question mark.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:76`:

    const CLOSING_WORDS =
      /^\W*(thanks|thank you|cheers|ta|ok|okay|alright|all right|got it|will do|bye|goodbye|see you|see ya|later|never ?mind)\b/i;
    /** The most words such a thing runs to. Anything longer has more in it than a goodbye. */
    const CLOSING_MAX_WORDS = 5;

`talk.ts:178`, in `buildTalk`:

    maySaySilent = mustSay === null && needsNoAnswer(heard.at(-1) ?? '');

## How it was found

Run. A throwaway script (`parse/closing.ts` in the scratchpad) called `buildTalk` for a fixture janitor with each line from the Captain and printed `ordered` and `parts.maySaySilent`. What the model then does with the two instructions was not tried. Not seen in a round log.

## How to fix it

1. In `buildTalk`, `maySaySilent` is false when `ordered` is set or `told` work is being asked about: `maySaySilent = mustSay === null && !ordered && needsNoAnswer(...)`.
2. In `needsNoAnswer`, after taking off the closing word, what is left must be only a name, "please"/"pls", "then", "man", "mate", "buddy" or punctuation. "ok go check the bar" and "ok whats up" then need an answer.
3. Treat a line that begins with a question word (`what|whats|where|why|how|who|when|can|could|do|does|is|are`) after the closing word as a question even without `?`.

## How to test the fix

- A table in `tools/llm_crew/` calling `buildTalk` with the lines above, wanting `maySaySilent` false for all six, and true for "thanks", "ok", "thanks Tolly", "see you later".
