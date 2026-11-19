---
id: SECT-03
title: A warrant on someone the reader does not know by name takes up to four words as the name, so Arrest Pun Pun in the bar is a warrant on Pun Pun in the
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:346, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:72, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:511
fix: For a name it does not know, stop the name at the first word that cannot be part of one (who, in, at, is, he, because, a dash) and prefer a run of capitalised words when the line has capitals
---

## What is wrong

See also: PARSE-03

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

1. In `readWarrant`, add to the cut pattern the words that end a name, and a lone dash: `\s+(?:(?:who|which|that|whom|he|she|they|it|in|at|on|by|near|inside|is|was|are|has|had|because|since|as|after|before|again)\b|[-–](?:\s|$))`. Keep the dash out of the `\b` group: written as `(?:...|-|–)\b` it never matches "Pun Pun - theft", since there is no word boundary between a dash and a space (checked with bun). `[-–](?:\s|$)` leaves "Mary-Ann" whole. "now" need not be in the list: `FILLER` takes it out before this runs.
2. When the line as written has capital letters, take the run of words from the start of `rest` that begin with a capital (allowing "of", "the", "van", "de" inside a run of two or more, and a lone capital such as "Pun Pun III"). Fall back to the cut words only for a line typed all in lower case.
3. Keep at most four words, as now.
4. Run the duplicate check in `deskTakes` with the name both ways round (`sameName(declared.name, it.name) || sameName(it.name, declared.name)`), so that a longer reading of a name already wanted is taken for the same person. Use the same test for `standingOne` just below it, or the time change finds nothing. The cost: an unknown "Dana" already wanted makes a later warrant on "Dana Smith" read as "already a warrant"; that is the safer mistake.
5. The fix for the cancel wording (see SECT-04) stops "is withdrawn" reaching this code at all; this step is for every other wording.
6. Step 1 alone settles every case in the write-up. Step 2 is the larger change and turns "Warrant for Bob the clown, for theft" (which reads as "Bob the clown" today; no case in the table holds it) into "Bob". If time is short, build steps 1 and 4 and leave step 2 for the owner to decide.

## How to test the fix

Add each line above to the `readWarrant` cases in `tools/llm_crew/security.ts` with the name it should give ("Pun Pun", "Bob Smith"), and keep "Warrant for Bob the clown, for theft" reading as "Bob the clown" or decide with the owner that "Bob" is enough. In a round, grep `pda.log` for "I have that: a warrant for" and read each name.
 Also keep "Arrest Pun Pun on site" reading as "Pun Pun" (the 18:05 case), "Mary-Ann Lee in the bar" reading as "Mary-Ann Lee", and through `deskTakes`, with a warrant on Pun Pun standing, "Arrest Pun Pun in the bar, 10 minutes" changing its time rather than adding a second warrant.

## Check

Read `readWarrant` from the match to the return (`jobs/security.ts:302` to `398`), `sameName` and `nameWords` (`security.ts:60` to `92`), `FILLER`, and the duplicate test in `deskTakes` (`jobs/desk.ts:511`). The quotes are what the code says today. For a name not in `known`, the only cuts are punctuation, " for ", "and/then/but" and a time; `closeName` against the known names finds nothing for Pun Pun, so the four words stand.

Ran a throwaway bun script in the scratchpad: `readWarrant(line, ['Dana Reyes', 'Hale Stone'])` gave exactly the names in the write-up ("Pun Pun in the", "Pun Pun who wrecked", "Pun Pun because he", "Pun Pun - theft", "Bob Smith who is"); a capital "Bar." made no difference. Through `deskTakes` with a warrant on Pun Pun standing, "The warrant on Pun Pun is withdrawn." left `["Pun Pun","Pun Pun is withdraw"]` on the list: `CANCEL_WORDS` needs the cancel word before "warrant", and `mendWords` gave "withdraw". Also tested the proposed cut pattern: as first written it missed the dash case, so step 1 is mended.

The changelog's 18:05 entry ("Three wordings") fixed "Arrest Pun Pun on site" with `FILLER` and the and/then/but cut. That was one case of this fault; the other words after a name were not touched, and nothing says they were left on purpose.

Kept high: "Arrest Pun Pun in the bar" is an ordinary way to say it, and the warrant names nobody for the rest of the round. Effort raised to medium: the cut, the capital run and the both-ways duplicate test are two files and more than 20 lines.

## Fix note

Steps 1 and 4 are built (the cut words and the lone dash in `readWarrant`; the both-ways duplicate test and `standingOne` in `deskTakes`). Step 2, the run of capitalised words, is not built: it would turn "Warrant for Bob the clown, for theft" into "Bob", and the finding leaves that to the owner. "Warrant for Bob the clown, for theft" still reads as "Bob the clown", and a table case holds it.
