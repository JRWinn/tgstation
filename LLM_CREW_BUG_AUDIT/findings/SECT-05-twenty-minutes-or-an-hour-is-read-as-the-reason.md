---
id: SECT-05
title: A time in words past fifteen, or given as half an hour or an hour, is read as the reason and the warrant gets five minutes
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:274, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:291, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:407
fix: Read the tens as words and half an hour or an hour as 30 and 60, then cap at the most a cell allows as digits are capped now
---

## What is wrong

The minutes on a warrant are read by `MINUTES_SAID`, which knows digits and the words one to fifteen. "Twenty minutes", "thirty minutes", "half an hour" and "an hour" are not times to it. They are left in the words after the name, and `readWarrant` takes them for the reason.

Concrete case. The Captain sends "Warrant for Pun Pun, twenty minutes". `readWarrant` gives name "Pun Pun", reason "twenty minutes", minutes null. The desk gives it `MINUTES_USUAL`, 5. The Captain is told "Captain, I have that: a warrant for Pun Pun, for twenty minutes. 5 minutes." Every head is sent "Wanted: Pun Pun, for twenty minutes", and the officer is told "warrant: Pun Pun, for twenty minutes. Bring them in, 5 minutes." "Warrant for Pun Pun for half an hour" and "... for an hour" go the same way, with reasons "half an hour" and "an hour".

`readTerm`, the time said after the warrant ("Keep him in for twenty minutes"), uses the same pattern and so reads nothing at all: the message falls through to the LLM reader, which has no way to change a time either (`readingAsOrder` writes a fresh "Warrant for ..." and the desk answers "there is already a warrant").

Digits past fifteen are cut to fifteen, and KNA-14 covers the first answer not saying so. This is the case where the time is lost altogether and turns up as the reason.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:274`:

    const NUMBER_WORDS = [
      'one',
      ...
      'fifteen',
    ];
    const MINUTES_SAID = new RegExp(
      `\\b(\\d{1,2}|${NUMBER_WORDS.join('|')})\\s*min(?:ute)?s?\\b`,
      'i',
    );

`security.ts:329`, in `readWarrant`:

    const said = rest.match(MINUTES_SAID)?.[1].toLowerCase();

`security.ts:414`, in `readTerm`:

    const said = text.match(MINUTES_SAID)?.[1].toLowerCase();
    if (!said) {
      return null;
    }

## How it was found

A bun script in the system temp folder importing `jobs/security.ts`:

    "Warrant for Pun Pun, twenty minutes" => {"name":"Pun Pun","reason":"twenty minutes","minutes":null}
    "Warrant for Pun Pun for half an hour" => {"name":"Pun Pun","reason":"half an hour","minutes":null}
    "Warrant for Pun Pun for an hour" => {"name":"Pun Pun","reason":"an hour","minutes":null}

Not seen in a round.

## How to fix it

1. In `security.ts`, add a small `minutesIn(text)` that returns the number of minutes said, or null. It reads digits as now; the words one to nineteen; twenty, thirty, forty, fifty, sixty, with an optional "-one" to "-nine" or " one" to " nine"; "a quarter of an hour" and "quarter hour" as 15; "half an hour" and "half hour" as 30; "an hour", "one hour", "1 hour" as 60; "N hours" as N times 60. It also returns the matched span.
2. Use it in `readWarrant` and `readTerm` in place of `MINUTES_SAID`, and cut the matched span out of the reason the same way the digits are cut now (`security.ts:384`).
3. Keep the cap at `MINUTES_MOST`, and keep the asked number beside it so that the answer can say the cell timer allows less (the fix for KNA-14 needs that anyway).
4. Keep `\d{1,2}` from matching inside a longer number: "120 minutes" should read as 120 (then capped), not as nothing.

## How to test the fix

Add to the `readWarrant` cases in `tools/llm_crew/security.ts`: "Warrant for Pun Pun, twenty minutes" gives minutes 15 and reason ""; "Warrant for Pun Pun for half an hour" gives 15 and ""; "Warrant for Pun Pun, for theft, an hour" gives 15 and "theft". `readTerm('Keep him in for twenty minutes')` gives `{ minutes: 15, asked: 20 }`.
