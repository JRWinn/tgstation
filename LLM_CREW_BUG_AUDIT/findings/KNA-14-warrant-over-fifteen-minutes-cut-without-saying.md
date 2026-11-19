---
id: KNA-14
title: A warrant declared for more than 15 minutes is cut to 15 and the answer does not say so
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:335, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:443
fix: Keep the minutes that were asked for beside the minutes given, and add the sentence about the cell timer to the first answer as the later one already has it
---

## What is wrong

Listed in the change log entry of 2026-11-18, 18:05 to 19:12, "Seen and left alone": "A warrant with more than 15 minutes on it is cut to 15 without saying so, except in the answer to a time sent afterwards."

The Captain says "Place a warrant on Gratian Blyant for violating a goat. Lock them up for 25 minutes." The answer is "Captain, I have that: a warrant for Gratian Blyant, for violating a goat. 15 minutes." Nothing says 25 was heard and could not be had. The Captain may take it for a misreading and say it again. The same order given in two messages (the warrant, then "keep him in jail for 30 minutes") does get the full answer: "... 15 minutes. 15 is the most a cell's timer allows."

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:335`, in `readWarrant`: the number asked for is thrown away.

    const minutes =
      number === null ? null : Math.min(MINUTES_MOST, Math.max(1, number));

`jobs/security.ts:443`, `takenLine`: no place for it.

    return `${to}, I have that: a warrant for ${onWhom(name, reason)}. ${minutes} minutes.${unknown ? ' I do not know that name yet.' : ''}`;

`jobs/security.ts:419` and `:429`, `readTerm` and `termLine`: the later answer keeps `asked` and says it.

    return { minutes: Math.min(MINUTES_MOST, Math.max(1, asked)), asked };
    ...
    return `${to}, I have that: ${name}, ${minutes} minutes.${asked > minutes ? ` ${MINUTES_MOST} is the most a cell's timer allows.` : ''}`;

## How it was found

Read from the code. The round is `data/logs/2026/11/18/round-17.48.05` by the change log's account.

## How to fix it

1. In `readWarrant`, return `asked: number` beside `minutes` (null when no time was said).
2. Give `takenLine` an optional `asked` and add the same sentence `termLine` uses when `asked > minutes`.
3. Pass it through at the call in `jobs/desk.ts` where a declared warrant is answered (`deskTakes`).
4. `TAKEN_WORDS` (`security.ts:452`) matches the start of the line, so readers of the answer are not affected. Check the heads' reader of "Security notice" is not fed this line.
5. The reading by the LLM (`readingAsOrder`, `security.ts:886`) also caps the minutes: carry the uncapped number there too, so the read-back is the same.

## How to test the fix

- `tools/llm_crew/security.ts`: add a case for "Warrant for X, for Y, 25 minutes" expecting the sentence, and one for 10 minutes expecting none. The 152 cases there must still pass.
- Type check from `tgui/`.
