---
id: HEAD-04
title: Anything a janitor says near the Head of Personnel with "I need", "out of" or "supplies" in it is noted as asking for supplies, and a crate is ordered
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:136, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1203, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1040, tgui/packages/tgui/interfaces/CrewBrain/jobs/reports.ts:163, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:481
fix: Take an ask only from the set asking line or a line that says I need something for my work, and take a report only from the person whose turn it is, or one that begins with the head's first name and reads as a report
---

## What is wrong

The Head of Personnel notes a need from anything one of its staff says in its hearing that matches `NEED_WORDS`, unless it is said to someone else by name. `NEED_WORDS` matches the bare words "out of", "supply" or "supplies", "I need", "we need" and "could you get". Those turn up in ordinary talk. Each match on a janitor makes an ask of "something to clean with", and asks are ordered as a crate of janitorial supplies, paid from cargo's budget, with a janitor sent across the station to fetch it and the asker told "what you asked for has come".

Two fixed lines of our own match:

- The driver's step-aside line, said by a body hauling a crate to whoever is in its way: "Excuse me, <first>, could you step aside, please? I need to get this past you." (`driver.ts:481`). A janitor hauling the head's own crate back from the Cargo Lobby, with the head standing in the lobby or a hallway, says it to the head: `said_to` is `'me'`, "I need" matches, "need nothing" does not, and the head notes that the janitor is short of supplies, minutes after sending it for some.
- Any LLM line said to the head, or to nobody in particular: "Just on my way out of the closet", "Morning! I need to get back to the hallway", "The supply closet is a mess". `said_to` of `'group'` and `'nobody'` both pass the `!== 'other'` test.

During a meeting it is worse. `hearReport` takes any line from any of its staff, at any time from the call to the end, that `readReport` accepts, and `readReport` accepts any line with "I need" in it as a report (`told` is true, with no counts). So a janitor greeting the head on its way in with "I need a minute to put my mop away" has given its report: `need: true`, `noteAsk` runs, and an order follows, whatever it says when it is actually called on.

Concrete case: no janitor is short. At 14:00 the head is at the counter for some other reason, or simply in the hallway, and a janitor hauling a crate says to it "Excuse me, Hop, could you step aside, please? I need to get this past you." `overhears` reaches the last `if`: `said_to` is `'me'`, `NEED_WORDS` matches "I need", `NO_NEED_WORDS` does not match, `noteAsk` pushes `{ who: janitor, what: 'something to clean with' }`. Two minutes later (`BATCH_DS`) the head orders a crate of janitorial supplies.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:136`:

    const NEED_WORDS =
      /\bi need\b|\bwe need\b|nothing to clean with|could you get|get it ordered|\bsuppl(y|ies)\b|\bout of\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1203`, at the end of `overhears`:

    if (
      event.details.said_to !== 'other' &&
      NEED_WORDS.test(heard) &&
      !NO_NEED_WORDS.test(heard)
    ) {
      noteAsk(brain, speaker, brain.now);
    }

and the same test on any PDA message from its staff at `head.ts:1338`.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1046`, in `hearReport`, which takes a line from anyone on its staff while a meeting is on, not only the one whose turn it is:

    const report = meeting ? readReport(heard) : null;
    if (
      !meeting ||
      !report ||
      !staff(brain).some((person) => person.name === speaker)
    ) {
      return null;
    }
    meeting.reports[speaker] = report;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/reports.ts:163`, in `readReport`:

    const told = /\bI need\b/i.test(text);
    ...
    if (!told && Object.keys(counts).length === 0) {
      return null;
    }
    return { counts, need: told && !/\bI need nothing\b/i.test(text) };

`addressing.ts:24` gives the four values of `said_to`: `'me' | 'other' | 'group' | 'nobody'`.

## How it was found

Read from the code, not seen in a round. The step-aside case needs the head in a hauler's way, which is not common; the LLM-chat case depends on what the model says, which was not tried.

## How to fix it

1. Make the outside-a-meeting ask strict. Our own staff ask in set words: `needStep` says or sends "<first>, I need <need> for my work. Could you get it ordered, please?" Take an ask only when the line has `could you get it ordered`, or matches `/\bI need (.+?) for my work\b/i`. Drop "out of", "supply" and the bare "I need" from `NEED_WORDS`.
2. For a player's loose wording ("we're out of mops"), the owner has approved an LLM as last-resort reader in its own small prompt (memory: loose wording for orders). Route a line that is near the old pattern but not the set words to that reader instead of taking it straight. If that reader is not built yet, leave such lines alone; the next meeting asks every janitor anyway.
3. In `hearReport`, take a report only from the person whose turn it is (`meeting.turns.at(-1)?.who === speaker` and not yet heard), or from a line that begins with the head's first name and a comma, which is how `spokenReport` begins. Anything else from its staff during a meeting is not a report.
4. In `readReport`, a line with "I need" and no counts is a report only if it is the whole of the need sentence (`needWords` writes "I need <x>." or "I need nothing."), not any line with the two words in it. Keep the reading in step with `reportWords` in the same file.

## How to test the fix

- Add cases to `tools/llm_crew/reports.ts`: "Excuse me, Hop, could you step aside, please? I need to get this past you." is not a report and not an ask; "Hop, I need something to clean with for my work. Could you get it ordered, please?" is an ask.
- Simulator: a janitor that says the step-aside line to the head while hauling; pass if no new order is made.
- Type check from `tgui/`.
- In the next round's `pda.log`, every "I need to order" from the Head of Personnel should follow a janitor's "Could you get it ordered" or a meeting report with a need.
