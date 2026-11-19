---
id: SECT-15
title: Word that a wanted person is somewhere, given by first name or run together, is answered there is no warrant on them, though there is
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:610, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:227
fix: Find the wanted name in a sighting the way a pardon finds it, with closeIn and a first name that only one wanted person has, before saying there is no warrant
---

## What is wrong

A sighting is taken only when the whole of a wanted name is in the message (`nameIn`). A pardon or a taking-back also tries `closeIn`, which forgives a misspelling, a name run together and a first name alone. A sighting does not. When the Captain or a head gives a wanted person's first name only, the sighting is not taken, and the answer is that there is no warrant on them.

Concrete cases. Warrants stand on Dana Reyes and Pun Pun. The Captain sends the Head of Security:

- "Dana is in the bar". `nameIn(text, ['Dana Reyes', 'Pun Pun'])` is undefined. The stranger path reads "Dana" and answers "Captain, there is no warrant on Dana. To declare one, say: Warrant for Dana." Nothing is passed to the officer. If the Captain does as told, "Warrant for Dana" is read (Dana Reyes is the only Dana it knows), and the answer is "there is already a warrant on Dana Reyes".
- "Punpun is in the bar". The same: "there is no warrant on Punpun."
- "I just saw Dana in the bar". No sighting, no stranger either (`sightedName` needs the name first); it goes to the LLM reader, which can only answer warrant, pardon or neither, and ends in "I did not follow that".

The officer is not sent where the Captain saw them. The Captain is told something false.

Word from crew NPCs is not hit: `sightLine` uses the name from the list in full.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599`, in `deskTakes`:

    // Word of where someone wanted is.
    const seen = nameIn(text, standing);
    const place = seen ? placeNamedIn(brain, text.toLowerCase()) : undefined;
    if (seen && place && SIGHTING_WORDS.test(text)) {

`desk.ts:610`, what follows when that fails:

    const stranger =
      declarer && SIGHTING_WORDS.test(text) ? sightedName(text) : '';
    if (stranger && placeNamedIn(brain, text.toLowerCase())) {
      reply(
        brain,
        from,
        noWarrantLine(to, stranger),

Compare `desk.ts:399`, the pardon, which does use the forgiving reader:

    ? (nameIn(text, anyone) ?? closeIn(text, anyone))

## How it was found

A bun script in the system temp folder (fixtures from `tools/llm_crew/fixtures`, `jobs/desk`): warrants on Dana Reyes and Pun Pun from the Captain, then each line above. Printed:

    "Dana is in the bar" true [["Dana Reyes",null],["Pun Pun",null]] [ "Captain, there is no warrant on Dana. To declare one, say: Warrant for Dana." ]
    "Punpun is in the bar" true [...] [ "Captain, there is no warrant on Punpun. To declare one, say: Warrant for Punpun." ]
    "I just saw Dana in the bar" false [...] []

Not seen in a round.

## How to fix it

1. In `deskTakes`, find the wanted name as `nameIn(text, standing) ?? closeIn(text, standing) ?? firstOnly(text, standing)`, where `firstOnly` returns the one standing warrant whose first name is a word in the text, if only one has it.
2. Before answering `noWarrantLine`, run `sameName` and `closeName` of the stranger's name against the standing names; if one matches, treat it as a sighting of that warrant.
3. Have `sightedName`, or a second pattern, take "saw X in the Y", "X was in the Y", "X is hiding in the Y" with the name after "saw" as well as before "is in".
4. Keep `placeNamedIn` as the test that a room was named.

## How to test the fix

Add to `tools/llm_crew/security.ts`: with warrants on Dana Reyes and Pun Pun, "Dana is in the bar", "Punpun is in the bar" and "I just saw Dana in the bar" each set that warrant's `lastSeen.place` to "Bar" and send no "no warrant" line. With warrants on Dana Reyes and Dana Smith, "Dana is in the bar" is not taken for either.
