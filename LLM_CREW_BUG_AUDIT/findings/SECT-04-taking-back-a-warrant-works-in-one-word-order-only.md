---
id: SECT-04
title: A head can take back its warrant only with the verb before the word warrant, and neither the LLM reader nor the not-followed line knows taking back exists
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 7e347f5e69e, e499cd0c751
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:779, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:832, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:611, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:359
fix: Also read a warrant said to be withdrawn or cancelled after the word warrant, give the LLM reader a withdraw kind, and put the take-back wording in the not-followed line
---

## What is wrong

`CANCEL_WORDS` needs one of its verbs, as a whole word, somewhere before the word "warrant". Ordinary ways of taking a warrant back miss it:

- "The warrant on Pun Pun is withdrawn." The verb comes after "warrant", and `mendWords` has already turned "withdrawn" into "withdraw". It falls to `readWarrant`, which reads "warrant on Pun Pun ..." as a new warrant. The head is told "there is already a warrant on Pun Pun." If Pun Pun is not known by name, a second warrant is put on "Pun Pun is withdraw" (see SECT-03).
- "Forget the warrant on Pun Pun": "forget" is not a cancel word. Answered "there is already a warrant on Pun Pun."
- "Pun Pun's warrant is cancelled", "Call off the arrest of Pun Pun", "Never mind about Pun Pun, my mistake": no cancel match, no warrant match, so the message goes to the LLM reader.

The LLM reader can only answer `warrant`, `pardon` or `neither` (`buildReading`). There is no "take back". So the best a model can do with a head's "call off the arrest of Pun Pun" is "pardon", and the head is told "Walker, a pardon is the Captain's to give." That is wrong: a head may take back its own warrant. If the model answers "neither", the head is told "I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name." A head cannot pardon, and the line never says how to take a warrant back, so the head is given no wording that would work.

A head that declared a warrant by mistake is never told the words that undo it. Unless it happens to write "Cancel (or withdraw, or drop) the warrant on ...", the person stays wanted, and is arrested.

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

1. Keep `CANCEL_WORDS` as it is for the verb before "warrant", and add to it, by `|`, a tight form for the verb after the noun: `\b(?:warrant|arrest)\b.*\b(?:is|be|was|been|are)\s+(?:cancel(?:l?ed)?|withdrawn?|dropped|lifted|called\s+off|void(?:ed)?|off)\b`. Before the noun, take the endings as well: `cancel(?:l?ed)?`, `call(?:ed)?\s+off`, and "arrest" beside "warrant" as the noun. Take "forget" only at the start of the message (`^\W*forget\s+(?:about\s+)?the\s+(?:warrant|arrest)\b`). Do not add bare "forget", "drop(ped)" or "never mind" anywhere in the line: "Don't forget the warrant on Pun Pun" or "he dropped a wrench, warrant for Pun Pun" would then take a warrant back. The test stays where it is in `deskTakes`, on the mended `text`, before `readWarrant`.
2. No change to `mendWords` is needed: it already turns "withdrawn" into "withdraw", which the new form takes, and it leaves "cancelled" alone (three letters longer than "cancel").
3. Give the LLM reader a fourth kind, `withdraw`: in `Reading`, in the schema's `enum` in `buildReading`, in the question ("Does it take back a warrant, or call off an arrest, asked for before (\"withdraw\")?"), and in `readReading`, which today returns null for anything but `warrant` and `pardon` (`security.ts:871`). Have `readingAsOrder` write it as `Cancel the warrant on <name>.` so that `deskTakes` takes it through the path that already works, with its checks of who may take back what.
4. Change `notFollowedLine` to add "To take one back: Cancel the warrant on a name." It is 117 characters now and about 165 with this.

## How to test the fix

In `tools/llm_crew/security.ts`, after a head declares a warrant on Pun Pun, each of "The warrant on Pun Pun is withdrawn.", "Pun Pun's warrant is cancelled", "Forget the warrant on Pun Pun" and "Call off the arrest of Pun Pun" leaves no warrant and answers "the warrant on Pun Pun is withdrawn". `deskRead` with `{ kind: 'withdraw', name: 'Pun Pun' }` does the same. `notFollowedLine('Walker').length <= 200`.

Also check that "Don't forget the warrant on Pun Pun" and "Warrant for Pun Pun, he dropped the crate" still declare nothing new and take nothing back.

## Check

Read `CANCEL_WORDS` (`security.ts:779`), `mendWords` (178), `readWarrant` (302), `buildReading`, `readReading` and `readingAsOrder` (832 to 896), `notFollowedLine` (611), and `deskTakes`, `deskNotFollowed`, `deskUnread` and `deskRead` in `desk.ts` (313 to 705). The quotes match the code. A bun script in the scratchpad ran the mended text of each line through `CANCEL_WORDS` and `readWarrant` with Pun Pun known: "The warrant on Pun Pun is withdrawn." mends to "... is withdraw." and gives no cancel and a warrant on Pun Pun (reason "is withdraw"); "Forget the warrant on Pun Pun" gives no cancel and a warrant; "Pun Pun's warrant is cancelled" and "Call off the arrest of Pun Pun" give neither, so they go to the LLM reader. With nobody known, the first gives a warrant on "Pun Pun is withdraw", and `sameName` with "Pun Pun" is false, so a second warrant is put on that name. A head's "Pardon Pun Pun." from the reader gets `REFUSALS.notPardoner` ("a pardon is the Captain's to give"). Nothing in the change log or `LLM_CREW_PLAN_SECURITY.md` (line 328 gives only "Cancel the warrant on Pun Pun.") says the other wordings were left out on purpose. Confirmed. The proposed regex was too loose ("forget", "drop" and "never mind" anywhere, either side of the noun) and step 2 was not needed, so both were mended; `readReading` and the schema were added to step 3, without which a `withdraw` answer is thrown away.
