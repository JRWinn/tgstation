---
id: SECT-23
title: Try again anywhere in what the Captain sends security, Don't try again until you are healed included, sends a hurt officer back to making arrests
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:782, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:442
fix: Take try again only as the whole order or at its start, with no negation before it, and only while some security member is out hurt
---

## What is wrong

`TRY_AGAIN_WORDS` is `\btry again\b` anywhere in the line. From the Captain it clears `officerOut`, starts the Head of Security's own warrants again, tells the officer "Hale, you are to make arrests again." and answers "Captain, we will try again." It does this whether or not anyone is out hurt, and whatever else the line says.

Concrete cases, from the Captain by PDA to the Head of Security after the officer has broken off hurt:

- "Don't try again until Hale has been to medbay." The officer is sent back out at once, still under half health (and, as ARR-09 says, breaks off again the same second).
- "Tell cargo to try again with the crate." Nobody is hurt; the officer is told "you are to make arrests again" for nothing, and the Captain gets "we will try again."

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:782`:

    export const TRY_AGAIN_WORDS = /\btry again\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:442`, in `deskTakes`:

    if (captain && TRY_AGAIN_WORDS.test(text)) {
      desk.officerOut = null;
      arrestAgain(brain);
      const officer = officerAboard(brain);
      if (officer) {
        tellOfficer(

## How it was found

Read from the code. Not run and not seen in a round.

## How to fix it

1. Take it only when the line is the order: `^\W*(?:\w+,\s*)?(?:ok(?:ay)?,?\s*)?(?:please\s+)?try again\b` or ends with "try again", and with no `not`, `don't`, `dont`, `never`, `until` before it.
2. Take it only while `desk.officerOut` is set or the Head of Security's own `beat.hurt` is true. Otherwise answer nothing for it and let the line go on to the other readers.

## How to test the fix

Add to `tools/llm_crew/security.ts`: with `officerOut` set, "Don't try again until Hale has been to medbay." leaves it set; "Try again." clears it; with nobody hurt, "Tell cargo to try again with the crate." sends no "make arrests again".
