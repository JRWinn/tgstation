---
id: SECT-02
title: Any line from the Captain with free, release or let go in it that names someone wanted or in a cell pardons them
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:778, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:399
fix: Take a pardon only when the pardon word comes right before the name, with no negation in front of it, and read the warrant words before the pardon words
---

## What is wrong

`deskTakes` tests the whole line for `PARDON_WORDS` and then for any wanted or jailed name anywhere in it. Both found, and the Captain sent it, the person is pardoned: the warrant is struck, the officer is told to let them go, and a prisoner is let out of the cell. Where in the line the word stands, and whether "not" is in front of it, is never looked at.

Concrete cases, each run against a Head of Security with a warrant on Pun Pun, the Captain sending by PDA:

- "Don't release Pun Pun until his time is up." gives "Captain, Pun Pun is pardoned."
- "Pun Pun broke free of the cuffs, find him" gives "Captain, Pun Pun is pardoned."
- "Do not let go of Pun Pun" gives "Captain, Pun Pun is pardoned."
- With Pun Pun in Cell 1 (`desk.held`), "Keep Pun Pun locked up, don't let him go free" sends the officer "Hale, Pun Pun is to be let go: the Captain has pardoned them." and empties `held`.

The pardon test comes before the warrant test, so a fresh warrant that has the word in its reason loses to it too: with Pun Pun already wanted, "Warrant for Pun Pun, for setting the slimes free, 10 minutes" pardons Pun Pun instead of changing the time. From a head of department the same lines get "a pardon is the Captain's to give", which is a wrong answer and drops whatever the head was saying.

The Captain says the opposite of a pardon and gets one. Someone the Captain wanted kept in is let out.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:778`:

    export const PARDON_WORDS = /\b(?:pardon|release|let go|set free|free)\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:399`, in `deskTakes`:

    const pardoned = PARDON_WORDS.test(text)
      ? (nameIn(text, anyone) ?? closeIn(text, anyone))
      : undefined;
    if (pardoned || /\bpardon\b/i.test(text)) {
      if (!captain) {
      ...
      } else {
        const warrant = desk.warrants.find((it) => it.name === pardoned);
        strike(brain, pardoned, true);

`closeIn` makes it wider still: any one to three words a letter or two from a wanted name will do.

## How it was found

A bun script in the system temp folder, using `tools/llm_crew/fixtures` and `jobs/desk`: a Head of Security brain, `deskTakes(b, 'Zim Fire', 'Captain', 'Warrant for Pun Pun, for theft.', false)`, then each line above. Printed:

    Don't release Pun Pun until his time is up. => warrants 0 [ "PDA to Zim Fire: Captain, Pun Pun is pardoned." ]
    Pun Pun broke free of the cuffs, find him => warrants 0 [ "PDA to Zim Fire: Captain, Pun Pun is pardoned." ]
    Do not let go of Pun Pun => warrants 0 [ "PDA to Zim Fire: Captain, Pun Pun is pardoned." ]
    held => {} [ "PDA to Hale Stone: Hale, Pun Pun is to be let go: the Captain has pardoned them.", ... ]

Not seen in a round.

## How to fix it

1. In `security.ts`, add `readPardon(text, names)` that returns a name only when a pardon word is followed, within a word or two ("pardon", "release", "set free", "free", "let ... go"), by the name: `pardon Pun Pun`, `release Dana`, `let Pun Pun go`, `set Dana Reyes free`. Use `nameIn`/`closeIn` on the words just after (or, for "let ... go" and "set ... free", between) the verb, not on the whole line.
2. Return null if a negation (`not`, `don't`, `dont`, `never`, `no`) stands in the last two or three words before the verb within the same clause (after the last `,.;:!?`), or the line ends in `?`. Keep it to the clause so that "Don't worry, release Pun Pun" still pardons. The same clause test is proposed for warrants in SECT-01: write it once, as a helper both use.
3. In `deskTakes`, use `readPardon` in place of the `PARDON_WORDS` test. Keep `/\bpardon\b/` as the trigger for "a pardon is the Captain's to give" only when the word "pardon" itself is there.
4. Try the warrant reading before the loose pardon words (`free`, `release`, `let go`), or at least do not take a pardon when `readWarrant` reads a warrant on the same name. "Pardon" said outright can stay first. With step 1 this is mostly belt and braces: in "Warrant for Pun Pun, for setting the slimes free, 10 minutes" no name follows "free", so `readPardon` is null anyway.
5. A line that is now neither goes on to `deskUnread`, and the LLM reader answers it; its reading comes back as "Pardon X." which `readPardon` still takes.
6. Note for the tester: today "Let Pun Pun go" is not a pardon at all, since `let go` in `PARDON_WORDS` needs the two words side by side; it goes to the LLM reader. "Set Pun Pun free" is taken only because "free" is in the list on its own. So "Let Pun Pun go" pardoning after the fix is new behaviour, not kept behaviour.

## How to test the fix

Add to `tools/llm_crew/security.ts`, with a warrant on Pun Pun and Pun Pun in `held`: none of "Don't release Pun Pun until his time is up.", "Do not let go of Pun Pun", "Pun Pun broke free of the cuffs, find him", "Keep Pun Pun locked up, don't let him go free" changes the list or `held`; "Pardon Pun Pun", "Release Pun Pun", "Let Pun Pun go" and "Set Pun Pun free" each pardon. In a round, grep `pda.log` for "is pardoned" and check each against what the Captain sent just before.
