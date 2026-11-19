---
id: SECT-12
title: Any line from the Captain in the five minutes after a warrant that has it or him and a number of minutes in it changes the warrant's time
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:407, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:578, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:290
fix: Read a time as a term only with a holding verb before it (keep, hold, lock, jail, give him, make it) and the minutes as its object
---

## What is wrong

`readTerm` takes any line that has "him", "her", "them", "it" or "that one" anywhere in it, and a number of minutes anywhere in it, as the time a person is to be held. In `deskTakes`, from the Captain, it then goes on the newest warrant anyone declared in the last five minutes (`TERM_AFTER_DS`), and from a head on the newest one it declared.

Concrete cases. The Captain declares "Warrant for Pun Pun, for theft." Within five minutes he sends one of these:

- "It's been 10 minutes, where is he?" sets Pun Pun's warrant to 10 minutes.
- "Tell them the meeting is in 5 minutes" sets it to 5.
- "Give it ten minutes and then search the bar" sets it to 10.
- "I will be at the bridge in 2 minutes, bring him there" sets it to 2.

Each is answered "Captain, I have that: Pun Pun, N minutes." and `setTerm` resets the warrant to `given: 'no'`, so the officer is given the warrant once more: walked up to and told again, or sent it again by PDA. The question the Captain asked is not answered.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:407`:

    export function readTerm(
      written: string,
    ): { minutes: number; asked: number } | null {
      const text = mendWords(written);
      if (!/\b(?:him|her|them|it|that\s+one)\b/i.test(text)) {
        return null;
      }
      const said = text.match(MINUTES_SAID)?.[1].toLowerCase();

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:578`, in `deskTakes`:

    const term = declarer ? readTerm(text) : null;
    const theirs = term
      ? [...desk.warrants]
          .reverse()
          .find(
            (it) =>
              (it.by === from || captain) && brain.now - it.at < TERM_AFTER_DS,
          )
      : undefined;
    if (term && theirs) {
      setTerm(brain, theirs, term.minutes);

`desk.ts:290`, `setTerm`, gives the warrant to the officer again:

    if (warrant.given !== 'no') {
      warrant.given = 'no';
      warrant.gives = 0;
    }

## How it was found

A bun script in the system temp folder (fixtures from `tools/llm_crew/fixtures`, `jobs/desk`): a Head of Security brain, a warrant on Pun Pun from the Captain, then each line above sent by the Captain 60 seconds later. Printed for the first:

    "It's been 10 minutes, where is he?" true 10 [ "Captain, I have that: Pun Pun, 10 minutes." ]

and the same shape for the other three, with 5, 10 and 2. Not seen in a round.

## How to fix it

1. In `readTerm`, require a holding verb with the person as its object before the time: `\b(?:keep|hold|lock|jail|brig|give|make|put|leave)\s+(?:him|her|them|it|that\s+one)\b(?:\s+\w+){0,4}?\s+(?:for\s+)?<minutes>` (the `<minutes>` part being `MINUTES_SAID`, or the wider reader proposed in SECT-05), or "make it N minutes", or "N minutes for him/her/them".
2. Return null for a question (ends in "?"), and when "in N minutes" is the only time ("in 5 minutes" is when, not how long).
3. Keep the rest of the path as it is: the newest warrant within five minutes, and the "I have that" answer, which lets the Captain see what was taken.
4. A line no longer taken as a term goes on to the LLM reader and, with SECT-10 fixed, to the voice.

## How to test the fix

Add to `tools/llm_crew/security.ts`: after a warrant on Pun Pun, each line above leaves the minutes at 5; "Keep him in jail for 10 minutes", "Hold them for ten minutes" and "Make it 10 minutes" set them to 10.
