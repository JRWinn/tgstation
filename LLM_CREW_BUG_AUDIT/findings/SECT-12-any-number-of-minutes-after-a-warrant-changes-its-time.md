---
id: SECT-12
title: Any line from the Captain in the five minutes after a warrant that has it or him and a number of minutes in it changes the warrant's time
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:407, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:578, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:290
fix: Read a time as a term only with a holding verb and him, her or them before it, or as make it N minutes alone, or N minutes for him, and never in a question
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

1. In `readTerm`, after `mendWords`, take a time only in one of three shapes (the `<minutes>` part being the body of `MINUTES_SAID`, or the wider reader proposed in SECT-05):
   - a holding verb with a person as its object: `\b(?:keep|hold|lock|jail|brig|give|put|leave)\s+(?:him|her|them|that\s+one)\b(?:\s+[\w']+){0,4}?\s+(?:for\s+)?<minutes>`. Leave "it" and "make" out of this one: with them, "Give it ten minutes and then search the bar" is read as 10, which is one of the very cases above (checked: the first version of this step did read it as 10);
   - "make it N minutes" as the whole line, with at most a name and a comma before it: `^\s*(?:\w+,\s*)?make\s+(?:it|that)\s+<minutes>\W*$`;
   - `<minutes>\s+(?:for|on)\s+(?:him|her|them|that\s+one)\b` ("10 minutes for him").
2. Return null for a question (ends in "?"). With step 1, "in N minutes" needs no rule of its own: none of the three shapes takes it.
3. Keep the rest of the path as it is: the newest warrant within five minutes, and the "I have that" answer, which lets the Captain see what was taken.
4. A line no longer taken as a term goes on to the LLM reader and, with SECT-10 fixed, to the voice.

## How to test the fix

Add to `tools/llm_crew/security.ts`: after a warrant on Pun Pun, each line above leaves the minutes at 5 and sends no "I have that"; "Keep him in jail for 10 minutes", "Hold them for ten minutes", "Make it 10 minutes", "Joan, make it 10 minutes.", "Lock him up for 15 minutes", "Give him 10 minutes" and "10 minutes for him" set them to 10 (15 for the lock-up). The existing cases at `tools/llm_crew/security.ts:239` to `:244` must still pass: `readTerm('Keep him in jail for 30 minutes')` gives `{ minutes: 15, asked: 30 }`, and "Keep him out of my office" gives null. Add the new lines to `readTerm` directly as well as through `deskTakes`, so a wrong pattern shows on its own.

## Check

Checked by Opus 5.5. Read `readTerm` (`jobs/security.ts:407`), `MINUTES_SAID` (`:291`), the term step in `deskTakes` (`jobs/desk.ts:576` to `:596`), `setTerm` (`:290`) and `TERM_AFTER_DS` (3000 deciseconds, five minutes). The quotes are what the code says today. Nothing earlier in `deskTakes` takes the four lines: no notice, cancel, pardon, "try again" or warrant words (`readWarrant` needs a name).

Ran a throwaway bun script in the scratchpad: the `head()` fixture, "Warrant for Pun Pun, for theft." from the Captain, `brain.now` moved on 60 seconds, then each line through `deskTakes`. All four returned true, set the minutes to 10, 5, 10 and 2, set `given` to "no" and queued "Captain, I have that: Pun Pun, N minutes." The change log entry that brought this in (line 203, "Keep him in jail for 30 minutes") meant a time said about the person, not any time in any line; nothing there chooses the loose reading. Confirmed.

Ran the patterns in step 1 against the twelve lines in "How to test the fix": the tight ones take every term and none of the four wrong lines. The finding's first pattern, with "give" and "it", took "Give it ten minutes and then search the bar", so step 1 is changed. Severity medium and effort small are right: one function, and a wrong term is seen at once in the read-back.
