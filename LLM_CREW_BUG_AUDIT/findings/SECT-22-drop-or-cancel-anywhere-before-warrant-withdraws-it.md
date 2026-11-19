---
id: SECT-22
title: Drop, call off or cancel anywhere before the word warrant takes a warrant back, even Don't cancel the warrant, and a new warrant in the same line is lost
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:779, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:359
fix: Take a warrant back only when the cancel verb has the warrant (or "the arrest of" the person) as its object within two words, with no negation in front; otherwise fall through to the pardon and warrant readers as now
---

## What is wrong

`CANCEL_WORDS` is any of cancel, withdraw, drop, call off or take back, followed anywhere later in the line by "warrant". It is the first thing `deskTakes` tests for a head or the Captain, ahead of a pardon or a new warrant. So:

- "Don't cancel the warrant on Pun Pun, he did it" withdraws the warrant on Pun Pun. The Captain is told "Captain, the warrant on Pun Pun is withdrawn." and the officer is told to let Pun Pun go.
- "Drop everything, the warrant on Pun Pun comes first" withdraws it too.
- "Hale, drop what you are doing, warrant for Dana Reyes, for theft" declares nothing. It is taken as a taking-back, finds no warrant on Dana, and answers "Captain, there is nothing against them."
- "Call off your patrol, I have a warrant for Dana Reyes" does the same.

The first two let someone go whom the Captain meant to be held. The last two lose a warrant the Captain declared, with an answer that does not say what went wrong.

This is the opposite of SECT-04 (ordinary ways of taking a warrant back are missed). The fix for both is the same reader.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:779`:

    export const CANCEL_WORDS =
      /\b(?:cancel|withdraw|drop|call off|take back)\b.*\bwarrant\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:359`, in `deskTakes`, first of the head's and Captain's orders:

    if (CANCEL_WORDS.test(text)) {
      const name = nameIn(text, standing) ?? closeIn(text, standing);
      const warrant = desk.warrants.find((it) => it.name === name);
      if (!declarer) {
      ...
      } else if (!warrant) {
        reply(
          brain,
          from,
          nothingAgainstLine(to, pardonNamed(text)),
      ...
      } else {
        strike(brain, warrant.name, false);

## How it was found

A bun script in the system temp folder (fixtures from `tools/llm_crew/fixtures`, `jobs/desk`), the Captain sending each line by PDA, with a warrant on Pun Pun standing for the first and third:

    "Drop everything, the warrant on Pun Pun comes first" [] [ "Captain, the warrant on Pun Pun is withdrawn." ]
    "Hale, drop what you are doing, warrant for Dana Reyes, for theft" [] [ "Captain, there is nothing against them." ]
    "Don't cancel the warrant on Pun Pun, he did it" [] [ "Captain, the warrant on Pun Pun is withdrawn." ]
    "Call off your patrol, I have a warrant for Dana Reyes" [] [ "Captain, there is nothing against them." ]

Not seen in a round.

## How to fix it

1. Replace the `CANCEL_WORDS` test with a reader that needs the verb's object to be the warrant or the person: "cancel the warrant (on|for) X", "cancel X's warrant", "withdraw the warrant", "drop the warrant on X", "call off the arrest of X", "take back the warrant", and the after-forms in SECT-04 ("the warrant on X is withdrawn"). At most two words ("the", "my", "that") between the verb and "warrant".
2. Return no taking-back when a negation (`not`, `don't`, `dont`, `never`) stands before the verb.
3. If the line does not read as a taking-back, go on to the pardon and warrant readers as now, so "Hale, drop what you are doing, warrant for Dana Reyes" is read as a warrant.
4. When a line could be both, ask: "Captain, do you want the warrant on Pun Pun withdrawn?" is safer than either guess. That is a design choice for the owner; steps 1 to 3 alone are enough to stop the four cases above.

Do not fix it by running `readWarrant` before the cancel test: "Cancel the warrant on Pun Pun." also reads as a warrant ("warrant on Pun Pun"), so the order alone cannot tell them apart. The verb must be bound to its object.

Build this as one reader with SECT-04, and use it in all three places that test `CANCEL_WORDS`: `deskTakes` (desk.ts:359, reached from the Head of Security's `readsMessage` at headofsecurity.ts:219 and from an officer running the desk alone at officer.ts:448) and the officer's `sendOn` (officer.ts:381, which only decides whether to send the head on to the Head of Security). After the fix, "Don't cancel the warrant on Pun Pun, he did it" falls to `readWarrant` and is answered "there is already a warrant on Pun Pun", which is right.

## How to test the fix

Add to the desk cases in `tools/llm_crew/security.ts`, using its `head()` and `said()`, the Captain sending by PDA:

- With "Warrant for Pun Pun." standing: "Drop everything, the warrant on Pun Pun comes first", "Don't cancel the warrant on Pun Pun, he did it" and "Do not withdraw the warrant on Pun Pun" each leave `deskOf(b).warrants` as `['Pun Pun']` and no line says "withdrawn".
- With nothing standing: "Hale, drop what you are doing, warrant for Dana Reyes, for theft" and "Call off your patrol, I have a warrant for Dana Reyes" each put a warrant on Dana Reyes, and the answer is the "I have that: a warrant for Dana Reyes" line.
- Kept: "Cancel the warrant on Pun Pun." still withdraws it, and the two existing take-back cases (a head its own, not the Captain's) still pass.
- Run `bun run security.ts` in `tools/llm_crew/` and check nothing else in it changed.

## Check

Read `CANCEL_WORDS` (security.ts:779-780) and `deskTakes` (desk.ts:311-420): both quotes are what the code says today. The cancel test is the first of the head's and Captain's orders, before the pardon and `readWarrant`, and returns TRUE in every branch, so nothing later sees the line. `mendWords` leaves "Don't", "drop" and "call off" alone. `strike` (desk.ts:259) takes the warrant off the list and tells the officer to let the person go if it had been given the warrant. The callers are the Head of Security's `readsMessage` (headofsecurity.ts:219) and an officer alone (officer.ts:448), with no guard on the wording before them.

Ran a throwaway bun script (outside the repo) with the fixtures and the same `head()` as `tools/llm_crew/security.ts`. All four lines in the write-up give exactly the results shown, and "Do not withdraw the warrant on Pun Pun" withdraws it too. `readWarrant` on its own reads Dana Reyes out of both lost-warrant lines, so the warrant is lost only because the cancel test is first. Nothing in LLM_CREW_CHANGELOG.md or the plans chose this; the plan (LLM_CREW_PLAN_SECURITY.md:328) gives only "Cancel the warrant on Pun Pun." as the form.

Confirmed. Severity lowered from high to medium: the right person is acted on, but wrongly, and only for these wordings, which will not come up in most rounds. The Captain is told "withdrawn" or "nothing against them" each time, so the mistake is seen and can be put right by declaring again.
