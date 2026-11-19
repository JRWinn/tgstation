---
id: SECT-24
title: A prisoner who fought back on a warrant of eleven minutes or more is reported as having five of their minutes for resisting, when the cap took some or all of them
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:686, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:656
fix: Carry the minutes actually added for resisting in the outcome and say that number, or leave the clause out when it is nought
---

## What is wrong

Someone who fights back has five minutes added, up to fifteen in all (`minutesFor`). The report always says five were for resisting, whatever was really added.

Concrete case. The Captain declares "Warrant for Pun Pun, for theft, 15 minutes." Pun Pun fights the officer. `minutesFor` gives `min(15, 15 + 5)`, 15. The officer reports "Joan, Pun Pun is in Cell 1 for 15 minutes, 5 of them for resisting arrest." The Head of Security passes the same line to the Captain and to whoever declared the warrant. Fighting back added nothing, and the Captain is told it added five. On a 12-minute warrant it added three, and is reported as five.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:686`, in `outcomeLine`:

    case 'jailed':
      return `${to}, ${name} is in ${outcome.cell} for ${outcome.minutes} minutes${outcome.resisted ? `, ${MINUTES_RESISTING} of them for resisting arrest` : ''}.`;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:656`:

    function minutesFor(warrant: BeatWarrant): number {
      return Math.min(
        MINUTES_MOST,
        warrant.minutes + (warrant.resisted ? MINUTES_RESISTING : 0),
      );
    }

## How it was found

Read from the code. Not run and not seen in a round.

## How to fix it

1. In `arrests.ts`, where the `jailed` outcome is pushed, set `added = minutes - warrant.minutes` (never below 0) alongside `resisted`.
2. In `outcomeLine`, say `${added} of them for resisting arrest` when `added > 0`, and when it was resisted but `added` is 0 say ", the most a cell allows" instead.
3. `readOutcome` already reads any number there (`, \d+ of them for resisting arrest`); keep the line in that shape so it still reads back.

## How to test the fix

In `tools/llm_crew/security.ts`, a jailed outcome with `minutes: 15, resisted: true, added: 0` reads "for 15 minutes, the most a cell allows."; with `minutes: 15, added: 3` reads "3 of them for resisting arrest", and both read back through `readOutcome`.
