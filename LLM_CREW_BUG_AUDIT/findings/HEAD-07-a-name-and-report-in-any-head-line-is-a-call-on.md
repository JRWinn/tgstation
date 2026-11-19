---
id: HEAD-07
title: Any line from its head with a staff member's first name and the word report in it makes that one give its report, and the head then calls on it again and stands 45 seconds waiting for a report already given
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:598, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:387, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:857, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:394
fix: Make the call-on needs pattern require "first, your report, please" and have staff take only "first, your report" as a call-on, and in hearReport give an early reporter a heard turn so nextTurn skips them
---

## What is wrong

On the staff side, being called on is any line from its head that has the word "report" and its own first name anywhere in it. The head's call-on is not said word for word: the LLM is given the plain line "Thank you for coming, everyone. Alex, your report, please." and told to "thank them all for coming and call on Alex, by name". Its own words are used if they match `needs`, which only asks for Alex's name followed later by "report". A line like "Thanks for coming, Alex, Bea and Carl. Alex, let's hear your report first." passes. Bea and Carl hear their own names and "report", set `summons.askedAt`, and give their reports at once, over Alex.

The same happens before the meeting begins, while the head stands waiting and talks: "Hello Bea, we will start once everyone is here, so have your report ready." Bea gives her report on the spot.

On the head's side `hearReport` stores every report it hears, whoever gives it. But `nextTurn` picks the next person by whether they have had a turn, not by whether their report is in. So when it comes to Bea, the head calls on her again. Bea has `summons.said` set and is told "You have given your report, and are staying at the staff meeting until X says it is over", so she says nothing. The head's new turn for Bea is `heard: false`, and `listening` holds the meeting for `TURN_WAIT_DS`, 45 seconds, before it moves on. Each early report costs 45 seconds of the whole room standing in silence, and all of it counts towards `MEETING_MAX_DS`.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:598`, in `meetingsOverhear`:

    if (
      summons.askedAt === null &&
      CALLED_ON_WORDS.test(heard) &&
      new RegExp(`\\b${firstName(brain.name)}\\b`, 'i').test(heard)
    ) {
      summons.askedAt = brain.now;
    }

with `const CALLED_ON_WORDS = /\breport\b/i;` at `meetings.ts:75`.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:855`, in `meetStep`, the call-on, not exact:

    step: `...It is ${next}'s turn: in "say", ${opening ? 'thank them all for coming and ' : ''}call on ${next}, by name, for their report. Ask for nothing else.`,
    say: `${opening ? 'Thank you for coming, everyone. ' : ''}${first}, ${CALLING_ON}.`,
    // Whoever is called on has to hear their own name, and that it is their report that is wanted.
    needs: new RegExp(`\\b${first}\\b.*\\breport\\b`, 'i'),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:387`, `nextTurn`, which does not look at `meeting.reports`:

    return present(brain, meeting).find(
      (name) => !meeting.turns.some((turn) => turn.who === name),
    );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:394`, `listening`:

    const turn = meeting.turns.at(-1);
    return !!turn && !turn.heard && brain.now - turn.askedAt < TURN_WAIT_DS;

`hearReport` only marks turns that already exist as heard (`for (const turn of meeting.turns) if (turn.who === speaker) turn.heard = true`), so a report given before the turn leaves the later turn unheard.

## How it was found

Read from the code, not seen in a round. Whether the model names everyone in its opening was not tried; the Status section of `LLM_CREW_PLAN_MEETING_FOLLOWUPS.md` ("A janitor called on while still walking in answered its head with small talk") shows the call-on is the moment where model wording matters most.

## How to fix it

1. Put both sides on the same set words, as other hand-offs are (`HEARD_WORDS` and the like). Head side: make the call-on `needs` `new RegExp(`\\b${first}, ${CALLING_ON}\\b`, 'i')`, so the model may thank them in its own words but its line must hold "<first>, your report, please"; any line without it is replaced by the plain one (`brain.ts:1409`). Staff side: in `meetingsOverhear`, take a call-on only on `new RegExp(`\\b${first},? your report\\b`, 'i')`, and use the same test in the "called on with no meeting it knows of" branch, whose `${first}\b.*\byour report` has the same fault ("Bea and Carl. Alex, your report, please" matches for Bea). A looser "name within 30 characters of your report" does not work: in "Thanks, Alex, Bea, Carl. Alex, let's hear your report" Bea is 25 characters from it, and "Hello Bea, ... have your report ready" is no call-on either.
2. Head side, for a report that still comes early (a player head, or one heard before the meeting began): in `hearReport`, when the speaker has no turn yet, add one marked heard. Put it before the last turn if that one is still unheard, so `listening` (which reads `turns.at(-1)`) does not stop waiting for the one actually called on. `nextTurn` then skips them, and `reportToCaptain` counts them as there, not as "reported by PDA". Skipping on `meeting.reports[name]` in `nextTurn` alone, as first proposed, would make `reportToCaptain` count each early reporter as reporting by PDA, since it counts `turns` as those there.
3. Leave `exact: true` off the call-on: the meeting design keeps the model's voice on these lines (memory "Crew meeting design"), and step 1 makes that safe.

## How to test the fix

- Add a case to `tools/llm_crew/addressing.ts` or a new small table: "Thanks for coming, Alex, Bea and Carl. Alex, your report, please." is a call-on for Alex only; "Hello Bea, we will start once everyone is here, so have your report ready." is no call-on for Bea; "Thanks for coming, Alex, Bea and Carl. Alex, let's hear your report." fails the head's `needs` and is replaced by the plain line.
- A case for the Captain's copy: a meeting where Bea reports before her turn ends with "3 of 3 there", not "2 of 3 there, 1 reported by PDA".
- Simulator: make the fake model's call-on name all three staff. Pass if only the one called on reports, and no turn waits the full 45 seconds.
- Type check from `tgui/`.
- In a round's `game.log`, look for two reports said within a few seconds of one call-on.

## Check

Read `meetingsOverhear`, `planMeetings`, `spokenReport` and `meetingsAfterSaying` in `jobs/meetings.ts`; `nextTurn`, `listening`, `present`, `hearReport`, `meetingSaid`, `reportToCaptain` and the call-on step in `jobs/head.ts`; and in `brain.ts` how a `needs` pattern lets the model's own words stand (`brain.ts:1409`) and that `afterSaying` gets the plain line (`mustSay`), not the model's. The quotes are what the code says today. Traced: the model's "Thanks for coming, Alex, Bea and Carl. Alex, let's hear your report first." passes `\bAlex\b.*\breport\b`, so it is said; Bea's summons is from that head, `askedAt` is null, the line has "report" and "Bea", so `askedAt` is set and `planMeetings` gives her report word for word; `hearReport` stores it but makes no turn; `meetingSaid` pushes Alex's turn from the plain line; when Alex is heard `nextTurn` returns Bea, the head calls on her, Bea's plan is the silent "You have given ... your report" wait, and `listening` holds for `TURN_WAIT_DS` (450). A model reply from Bea on being named could end the wait only if it has "I need" or a count in it. Searched the change log and plans for `nextTurn`, `CALLED_ON_WORDS` and early reports: nothing fixes or chooses this. Fix steps rewritten: the proposed "within 30 characters" test still fires on the example, and `nextTurn` skipping reported names alone would make `reportToCaptain` count early reporters as reporting by PDA. Whether the model does name everyone in its opening was not tried. Not run; not seen in a round.
