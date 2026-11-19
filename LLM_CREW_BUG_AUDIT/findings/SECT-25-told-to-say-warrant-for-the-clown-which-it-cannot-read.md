---
id: SECT-25
title: Told the clown is in the bar, security answers To declare one, say Warrant for The clown, and then cannot read those very words
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:596, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:606, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:272
fix: Do not offer words the reader refuses, test sightedName's result against NOT_A_NAME, and for a description ask for the name instead
---

## What is wrong

When the Captain or a head sends word of where someone is who has no warrant on them, security answers with the words that would declare one: "To declare one, say: Warrant for X." X is whatever came before "is in". When that is a description ("The clown", "The new assistant", "Someone"), the words offered are ones `readWarrant` will not read, because it refuses any name that begins with "the", "a", "someone" and the like (`NOT_A_NAME`).

Concrete case, run in a script. The Captain sends "The clown is in the bar". The answer is "Captain, there is no warrant on The clown. To declare one, say: Warrant for The clown." The Captain sends exactly "Warrant for The clown." `deskTakes` returns false, no warrant is taken, and the message goes on to the LLM reader, whose reading is put back into the same words and refused again, so the Captain is told "I did not follow that". He did what he was told and it did not work.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:596`, `sightedName`:

    const found = text
      .trim()
      .match(
        /^(?:security:\s*)?(?:[A-Za-z'-]+,\s*)?(.+?)\s+(?:is|was|are|has been)\s+(?:in|at|by|near|outside)\b/i,
      );
    return found ? tidyName(found[1].split(/\s+/).slice(-4).join(' ')) : '';

`security.ts:606`:

    export function noWarrantLine(to: string, name: string): string {
      return `${to}, there is no warrant on ${name}. To declare one, say: Warrant for ${name}.`;
    }

`security.ts:272`, the words a warrant's name may not begin with:

    const NOT_A_NAME =
      /^(?:him|her|them|that|this|it|the|a|an|any|anyone|someone|...

## How it was found

A bun script in the system temp folder (fixtures from `tools/llm_crew/fixtures`, `jobs/desk`) sent the two lines above from the Captain. It printed the answer quoted, then `false 0`: not taken, no warrant. Not seen in a round.

## How to fix it

1. Export a `mayBeName(name)` from `security.ts` that is `!NOT_A_NAME.test(name)` and at least two letters.
2. In `deskTakes`, when `sightedName` gives something that is not `mayBeName`, answer "Captain, there is no warrant on anyone of that description. A warrant needs a name: say Warrant for the name, for a reason." (a new line beside `noWarrantLine`).
3. Whether a warrant may be declared on a description ("the clown") at all is the owner's to say. Officers match by name only today, so a description would need its own matching (by job, say) before it could be served.

## How to test the fix

Add to `tools/llm_crew/security.ts`: "The clown is in the bar" from the Captain does not answer with "Warrant for The clown"; "Pun Pun is in the bar" with no warrant on Pun Pun still answers "To declare one, say: Warrant for Pun Pun.", and "Warrant for Pun Pun." then declares one.
