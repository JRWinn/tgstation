---
id: HEAD-07
title: Any line from its head with a staff member's first name and the word report in it makes that one give its report, and the head then calls on it again and stands 45 seconds waiting for a report already given
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:598, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:387, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:857, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:394
fix: Have staff take only "first name, your report" as a call-on, have nextTurn skip anyone whose report is already in, and forbid other names in the call-on line through its needs pattern
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

1. Staff side: take a call-on only when the line has the head's call-on shape for this person: `new RegExp(`\\b${first}\\b,? (your report|.{0,30}\\byour report\\b)`, 'i')` or simpler, `${first}` followed within a few words by "your report", and no other present workmate's first name between them. Keep the existing "called on with no meeting it knows of" branch (it already looks for "your report").
2. Head side: in `nextTurn`, skip anyone with `meeting.reports[name]` already set. They have been heard; there is nothing to call them on for. Keep the walk-up step for those who have not reported.
3. Head side: make the call-on `needs` refuse a line that names another of those present: build it as the current pattern plus a check in `sayIf`, or simply make the call-on `exact: true` with no remark. The opening "thank you for coming" is the only part that wants the model's voice; it can be kept by saying the thanks as its own line first.
4. Optional: in `hearReport`, if a report comes from someone whose turn has not come, push a turn for them marked heard, so the Captain's count of who was there is right.

## How to test the fix

- Add a case to `tools/llm_crew/addressing.ts` or a new small table: "Thanks for coming, Alex, Bea and Carl. Alex, let's hear your report." is a call-on for Alex only.
- Simulator: make the fake model's call-on name all three staff. Pass if only the one called on reports, and no turn waits the full 45 seconds.
- Type check from `tgui/`.
- In a round's `game.log`, look for two reports said within a few seconds of one call-on.
