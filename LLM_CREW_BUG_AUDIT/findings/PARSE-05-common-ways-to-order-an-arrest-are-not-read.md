---
id: PARSE-05
title: Cuff Bob, brig Bob, Bob needs arresting, I want Bob arrested, bring Dana in and arrest the monkey are none of them read as a warrant
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:272, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:710
fix: Add the missing verbs and the passive and wish forms to readWarrant, read bring X in with the name between, and let the X be a job or the monkey when exactly one known person fits
---

## What is wrong

See also: GAP-15 (loose wording is forgiven only by PDA), SECT-03, SECT-05. Those say the LLM reader is the last resort for PDA messages only and that times in words are lost. This one lists, with the reader's real output, the plain orders a Captain types that `readWarrant` itself does not read, so that whoever widens it has the cases.

`readWarrant` knows a warrant by a verb followed by the name (`WARRANT_WORDS`), "lock/throw/put X up / in the brig" (`LOCK_AROUND`), and "X is wanted" (`WANTED_AFTER`). It reads none of these:

| Captain says | readWarrant |
| --- | --- |
| cuff bob | null |
| brig bob for 10 min | null |
| book dana reyes | null |
| bob needs arresting | null |
| bob needs to be arrested | null |
| i want bob arrested | null |
| have bob arrested | null |
| bob hale should be locked up | null |
| take dana into custody | null |
| please bring dana in | null (`bring\s+in` needs the two words together) |
| arrest the monkey | null (Pun Pun, the monkey in every test round) |
| arrest the clown / arrest the janitor | null (`NOT_A_NAME` refuses anything beginning "the") |
| arrest the guy in the red jumpsuit | null |

And it reads these wrong:

| Captain says | readWarrant |
| --- | --- |
| arrest whoever broke into the vault | name "whoever broke into the" (`NOT_A_NAME` has `who`, not `whoever`) |
| arrest dana for -5 minutes | name Dana Reyes, reason "-", 5 minutes |
| arrest mr hale | name "mr hale", matching nobody |

Said aloud to security, a line `readWarrant` cannot read is not put to the LLM reader (`deskHears` calls `deskTakes` only), so it is answered by the voice, which is told an officer arrests "on a warrant and on nothing else". Sent by PDA from a head, it goes to the LLM reader if the model is up. With the model down, neither.

The owner has asked for "arrest" against "detain" against "lock up" against "bring in", and "the monkey" for Pun Pun, to be understood.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257`:

    const WARRANT_WORDS =
      /\b(?:warrant\s+(?:out\s+)?(?:for|on)|apb\s+(?:out\s+)?(?:on|for)|wanted:|arrest|bring\s+in|lock\s+up|jail|detain|apprehend|capture)\s+(.+)/is;
    /** With the name in the middle: "lock Pun Pun up for 10 minutes", "throw Dana Reyes in the brig". */
    const LOCK_AROUND =
      /\b(?:lock|throw|put|toss|stick|chuck)\s+(.+?)\s+(?:up\b|in(?:to|side)?\s+(?:the\s+|a\s+)?(?:brig|cells?|jail|lock-?up)\b)(.*)$/is;

`security.ts:272`:

    const NOT_A_NAME =
      /^(?:him|her|them|that|this|it|the|a|an|any|anyone|someone|somebody|...

`desk.ts:710`, `deskHears`, spoken lines: `return deskTakes(brain, speaker, job, heard, true);` with no reader after it.

## How it was found

Run. A throwaway script (`parse/warrant.ts` in the scratchpad) called `readWarrant` with Pun Pun, Bob Hale, Dana Reyes, Marisol Burris, Ann Moss, Liam O'Neil and Jean-Luc Picard known, and printed what it returned for about forty lines; the rows above are copied from its output. The same run showed the reader does well with misspelt verbs ("arest bob"), apostrophes and hyphens in names ("liam oneil", "jean-luc"), capitals and "!!!", and a full name with words after it. Not seen in a round log.

## How to fix it

All in `jobs/security.ts`, code only, so it works with the model down.

1. Add verbs to `WARRANT_WORDS`: `cuff`, `brig`, `book`, `nab`, `grab`, `pick\s+up`, `take\s+in`. Add `arest`-style mends for them to `KEY_WORDS` (`cuff`, `brig` are four letters, so `mendWords` needs `slack` 0 for them: leave them out of `KEY_WORDS`).
2. Add a name-in-the-middle form beside `LOCK_AROUND` for `bring|take|haul (.+?) in\b`, `take (.+?) into custody`, `have (.+?) (arrested|detained|locked up|brigged|cuffed)`, `(i want|get) (.+?) (arrested|detained|locked up|brigged|cuffed)`.
3. Add a passive form beside `WANTED_AFTER`: `^(.+?)\s+(?:needs|need|should|must|has|have)\s+(?:to\s+)?(?:be\s+)?(?:arrested|arresting|detained|locked\s+up|brigged|cuffed|jailed)\b(.*)$`.
4. Add `whoever|whomever|whatever` to `NOT_A_NAME`, and refuse a minutes figure with a minus sign before it (read "-5 minutes" as no time, and say so in the read-back).
5. For a description: if what follows the verb is "the X" and exactly one person the reader knows (in view, met, or on its PDA) has a job whose title has X in it ("the clown", "the janitor", "the new assistant"), take that person. For "the monkey", take the one non-crew person in view or met whose name or kind the server gives as a monkey; the owner should say whether Pun Pun counts as "known" for this. With none or several, do not guess: answer with `SECT-25`'s fixed line asking for the name, not "Warrant for The clown".
6. Strip titles before matching a name: `mr|mrs|ms|miss|dr|doctor|officer|captain|chief` as a whole first word.

## How to test the fix

- Add each row of the two tables to the `readWarrant` cases in `tools/llm_crew/security.ts`, with the name it should give or null where it should ask.
- Keep every existing case there passing; run `bun tools/llm_crew/security.ts`.
- Simulator: the `loose` scenario with the model dead, the Captain saying "cuff bob" aloud to an officer keeping the list: a warrant on Bob Hale should be taken.
