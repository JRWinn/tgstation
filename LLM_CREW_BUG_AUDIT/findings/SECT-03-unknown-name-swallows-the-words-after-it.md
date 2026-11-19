---
id: SECT-03
title: A warrant on someone the reader does not know by name takes up to four words as the name, so Arrest Pun Pun in the bar is a warrant on Pun Pun in the
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:346, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:72, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:511
fix: For a name it does not know, stop the name at the first word that cannot be part of one (who, in, at, is, he, because, a dash) and prefer a run of capitalised words when the line has capitals
---

## What is wrong

When the name after "arrest" or "warrant for" is nobody the Head of Security knows, `readWarrant` takes the words up to the first comma, full stop, " for ", " and ", " then ", " but " or a time, and keeps the first four. Anything else that follows the name becomes part of it.

Who it does not know: anyone it has not seen and who has no PDA. Pun Pun, the monkey every test round uses, is one. So is anyone who has lost their PDA, or who came aboard late.

Concrete cases, read with only Dana Reyes and Hale Stone known:

- "Arrest Pun Pun in the bar" gives a warrant on "Pun Pun in the".
- "Warrant for Pun Pun who wrecked the bar" gives "Pun Pun who wrecked".
- "Arrest Pun Pun because he stole my id" gives "Pun Pun because he".
- "Warrant on Pun Pun - theft" gives "Pun Pun - theft".
- "Lock up Pun Pun in the brig" gives "Pun Pun in the".
- "Arrest Bob Smith who is in the bar" gives "Bob Smith who is".

A warrant name is matched to a person by `sameName`, which needs every word of the warrant's name in the person's. "Pun Pun in the" is never matched to Pun Pun. No sighting is ever sent (`syncWanted` finds nobody on the list in view), and the officer never sees anyone it is after. It walks the hallways on that warrant for the rest of the round, and every head reads "Pun Pun in the" out at every meeting.

It also slips past the check for a warrant already standing. With Pun Pun already wanted, "The warrant on Pun Pun is withdrawn." is read as a new warrant on "Pun Pun is withdraw" (`mendWords` has turned "withdrawn" into "withdraw" first). `sameName("Pun Pun is withdraw", "Pun Pun")` is false, so a second warrant is put on the list.

The Captain is told "I have that: a warrant for Pun Pun in the. 5 minutes. I do not know that name yet.", so a careful player can see it. Nothing else says it is wrong.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:346`, in `readWarrant`:

    // Anyone else is named by the words up to where the reason or the time begins.
    const cut = rest.search(
      new RegExp(
        `[,.:;!?]|\\s+for\\s+|\\s+(?:and|then|but)\\s+|\\s+(?:\\d{1,2}|${NUMBER_WORDS.join('|')})\\s*min`,
        'i',
      ),
    );
    const raw = cut === -1 ? rest : rest.slice(0, cut);
    const every = raw.split(/\s+/);
    const words = every.slice(0, 4);
    name = tidyName(words.join(' '));

`security.ts:72`, `sameName`, needs all of the warrant's words:

    if (wordsIn(have, nameWords(wanted))) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:511`, the check for one already standing, goes by `sameName` too:

    } else if (desk.warrants.some((it) => sameName(declared.name, it.name))) {

## How it was found

A bun script in the system temp folder importing `jobs/security.ts` called `readWarrant(line, ['Dana Reyes', 'Hale Stone'])` for each line above and printed the names given. A second script through `deskTakes` with a warrant on Pun Pun standing showed "The warrant on Pun Pun is withdrawn." leaving two warrants on the list. Not seen in a round.

## How to fix it

1. In `readWarrant`, add to the cut pattern the words that end a name: `\s+(?:who|which|that|whom|he|she|they|it|in|at|on|by|near|inside|is|was|are|has|had|because|since|as|after|before|now|again|-|–)\b`, and a lone dash.
2. When the line as written has capital letters, take the run of words from the start of `rest` that begin with a capital (allowing "of", "the", "van", "de" inside a run of two or more, and a lone capital such as "Pun Pun III"). Fall back to the cut words only for a line typed all in lower case.
3. Keep at most four words, as now.
4. Run the duplicate check in `deskTakes` with the name both ways round (`sameName(declared.name, it.name) || sameName(it.name, declared.name)`), so that a longer reading of a name already wanted is taken for the same person.
5. The fix for the cancel wording (see SECT-04) stops "is withdrawn" reaching this code at all; this step is for every other wording.

## How to test the fix

Add each line above to the `readWarrant` cases in `tools/llm_crew/security.ts` with the name it should give ("Pun Pun", "Bob Smith"), and keep "Warrant for Bob the clown, for theft" reading as "Bob the clown" or decide with the owner that "Bob" is enough. In a round, grep `pda.log` for "I have that: a warrant for" and read each name.
