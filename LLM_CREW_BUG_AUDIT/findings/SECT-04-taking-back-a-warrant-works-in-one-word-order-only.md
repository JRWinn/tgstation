---
id: SECT-04
title: A head can take back its warrant only with the verb before the word warrant, and neither the LLM reader nor the not-followed line knows taking back exists
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:779, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:832, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:611, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:359
fix: Read cancel words on either side of warrant and with their endings, give the LLM reader a withdraw kind, and put the take-back wording in the not-followed line
---

## What is wrong

`CANCEL_WORDS` needs one of its verbs, as a whole word, somewhere before the word "warrant". Ordinary ways of taking a warrant back miss it:

- "The warrant on Pun Pun is withdrawn." The verb comes after "warrant", and `mendWords` has already turned "withdrawn" into "withdraw". It falls to `readWarrant`, which reads "warrant on Pun Pun ..." as a new warrant. The head is told "there is already a warrant on Pun Pun." If Pun Pun is not known by name, a second warrant is put on "Pun Pun is withdraw" (see SECT-03).
- "Forget the warrant on Pun Pun": "forget" is not a cancel word. Answered "there is already a warrant on Pun Pun."
- "Pun Pun's warrant is cancelled", "Call off the arrest of Pun Pun", "Never mind about Pun Pun, my mistake": no cancel match, no warrant match, so the message goes to the LLM reader.

The LLM reader can only answer `warrant`, `pardon` or `neither` (`buildReading`). There is no "take back". So the best a model can do with a head's "call off the arrest of Pun Pun" is "pardon", and the head is told "Walker, a pardon is the Captain's to give." That is wrong: a head may take back its own warrant. If the model answers "neither", the head is told "I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name." A head cannot pardon, and the line never says how to take a warrant back, so the head is given no wording that would work.

A head that declared a warrant by mistake has no way to find the words that undo it. The person stays wanted, and is arrested.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:779`:

    export const CANCEL_WORDS =
      /\b(?:cancel|withdraw|drop|call off|take back)\b.*\bwarrant\b/i;

`security.ts:842`, in `buildReading`:

    'Does it ask for someone to be arrested, locked up or put on the wanted list ("warrant")? Does it ask for someone to be let go, freed or forgiven ("pardon")? Or is it something else ("neither")?',

`security.ts:611`:

    export function notFollowedLine(to: string): string {
      return `${to}, I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name.`;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:359`, in `deskTakes`, is the only place a warrant is taken back:

    if (CANCEL_WORDS.test(text)) {

## How it was found

A bun script in the system temp folder (fixtures from `tools/llm_crew/fixtures`) declared a warrant on Pun Pun as the Head of Personnel, then passed each line above to the Head of Security's `readsMessage`. "The warrant on Pun Pun is withdrawn." and "Forget the warrant on Pun Pun" were answered "there is already a warrant on Pun Pun." The other three were put to the LLM reader. Fed the reading `{ kind: 'pardon', name: 'Pun Pun' }` (the nearest of the three kinds; no model was called), `deskRead` answered "Walker, a pardon is the Captain's to give." and the warrant stayed. Not seen in a round.

## How to fix it

1. Widen `CANCEL_WORDS` to take the verb on either side of "warrant" or "arrest", with its endings: `\b(?:cancel(?:led|ed)?|withdraw(?:n)?|drop(?:ped)?|call(?:ed)? off|take(?:n)? back|forget|scrap|never mind|lift(?:ed)?|void)\b` and `\b(?:warrant|arrest)\b` in either order.
2. Add `withdrawn` and `cancelled` to the words `mendWords` leaves alone (or test `CANCEL_WORDS` on the text before mending), so the ending is not cut off.
3. Give `buildReading` a fourth kind, `"withdraw"`: "Does it take back a warrant, or call off an arrest, that was asked for before?" Have `readingAsOrder` write it as "Cancel the warrant on <name>." so `deskTakes` takes it through the path that already works.
4. Change `notFollowedLine` to add, for a head: "To take one back: Cancel the warrant on a name." Keep the line under 200 characters; it is about 170 with the extra sentence, so check it.
5. Check this before the warrant reading in `deskTakes`, as now, so "warrant on X is withdrawn" never reaches `readWarrant`.

## How to test the fix

In `tools/llm_crew/security.ts`, after a head declares a warrant on Pun Pun, each of "The warrant on Pun Pun is withdrawn.", "Pun Pun's warrant is cancelled", "Forget the warrant on Pun Pun" and "Call off the arrest of Pun Pun" leaves no warrant and answers "the warrant on Pun Pun is withdrawn". `deskRead` with `{ kind: 'withdraw', name: 'Pun Pun' }` does the same. `notFollowedLine('Walker').length <= 200`.
