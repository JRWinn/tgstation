---
id: SECT-15
title: Word that a wanted person is somewhere, given by first name or run together, is answered there is no warrant on them, though there is
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 8147881234c
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:599, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:610, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:227
fix: Find the wanted name in a sighting the way a pardon finds it, nameIn then closeIn over the standing names, before saying there is no warrant
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

1. In `deskTakes` (`jobs/desk.ts:599`), find the wanted name as `nameIn(text, standing) ?? closeIn(text, standing)`, as the pardon and the taking-back do. No new `firstOnly` helper is needed: `closeName` (`jobs/security.ts:139`) already matches a word of four letters or more against each name's first name, and gives undefined when two names are as near, so "Dana" with warrants on Dana Reyes and Dana Smith is taken for neither. Checked: `closeIn` gives Dana Reyes for "Dana is in the bar" and "I just saw Dana in the bar", Pun Pun for "Punpun is in the bar", and undefined for two Danas.
2. With step 1 the stranger path is not reached for these lines, so nothing more is needed before `noWarrantLine`. A first name of three letters or less ("Pun is in the bar") is still not matched by `closeName`, and still gets the no-warrant answer; leave that unless the owner wants it, since a short word matches too much.
3. Optional, and a different fault: `sightedName` reads only "X is in the Y", so "I just saw Bob in the bar" about someone with no warrant gets no "there is no warrant" answer and goes to the LLM reader. A second pattern for "saw X in the Y" would fix that. It is not needed for the wanted cases here.
4. Keep `placeNamedIn` and `SIGHTING_WORDS` as the tests that a room was named and that it is word of where someone is.

## How to test the fix

Add to `tools/llm_crew/security.ts`: with warrants on Dana Reyes and Pun Pun, "Dana is in the bar", "Punpun is in the bar" and "I just saw Dana in the bar" each set that warrant's `lastSeen.place` to "Bar" and send no "no warrant" line. With warrants on Dana Reyes and Dana Smith, "Dana is in the bar" is not taken for either. The existing case at `tools/llm_crew/security.ts:163` ("Pun Pun is in the bar" with no warrant gets the no-warrant line) must still pass. Check that a sighting with a room still sets `lastSeen` and is passed to the officer through `syncDesk`. In a round, grep `pda.log` for "there is no warrant on" and check each against the wanted list at that time.

## Check

Checked by Opus 5.5. Read the sighting and stranger steps of `deskTakes` (`jobs/desk.ts:597` to `:622`), the pardon (`:399`) and taking-back (`:360`), and `nameIn`, `closeIn`, `closeName`, `slack`, `SIGHTING_WORDS` and `sightedName` in `jobs/security.ts`. The quotes are what the code says today. `mendWords` leaves "Dana" and "Punpun" as they are (checked), so nothing mends the name before `nameIn`.

Ran a throwaway bun script in the scratchpad: the `head()` fixture, warrants on Dana Reyes and Pun Pun from the Captain, then each line through `deskTakes`. Printed the same as the finding: "Dana is in the bar" and "Punpun is in the bar" each got "there is no warrant on ..." and left `lastSeen` empty; "I just saw Dana in the bar" returned false (on to the LLM reader); "Dana Reyes is in the bar" set Dana Reyes's `lastSeen` to Bar. Nothing in the change log or plans chose a stricter reading for sightings than for pardons. Confirmed.

The fix is simpler than first written: `closeIn` already does what `firstOnly` and step 2 were for, so steps 1 and 2 are mended to one line. Severity medium and effort small are right.
