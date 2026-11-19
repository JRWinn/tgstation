---
id: HEAD-03
title: Two staff with the same first name both answer one call-on, the second is never given a turn, and the head repeats the call and then walks off with the meeting unclosed
kind: bug
severity: medium
effort: small
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1091, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:858, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:598, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805
fix: In hearReport give a heard turn to anyone present who reports at a started meeting with no turn yet, and call on by full name when two of the staff share a first name
---

## What is wrong

A head calls on each of its staff by first name only: "Alex, your report, please." Every one of its staff who hears its own first name and the word "report" from its head takes it as its own call-on. Afterwards the head works out who it called on by finding the first of those present whose first name is in the line. With two staff of one first name, both answer the first call; the head gives the turn to the first match; and every later "Alex, your report, please." is matched to that same person again, who already has a turn, so no turn is ever recorded for the other one.

Step by step, with janitors Alex Reed, Alex Moor and Bea Hart present (in that order on the head's PDA list) at a Head of Personnel meeting:

1. `nextTurn` gives Alex Reed. The head says "Thank you for coming, everyone. Alex, your report, please."
2. `meetingSaid` finds `present(...).find(name => called.includes("Alex, your report, please"))`, which is Alex Reed, and pushes his turn.
3. Both Alexes' `meetingsOverhear` see `CALLED_ON_WORDS` and `\bAlex\b` from their head and set `summons.askedAt`. Both give their reports. `hearReport` stores both (it goes by the speaker's full name), and marks Alex Reed's turn heard.
4. `nextTurn` now gives Alex Moor: he has no turn. The head says "Alex, your report, please." `meetingSaid` again finds Alex Reed first, who has a turn, so nothing is pushed and `listening` stays false.
5. The plan is the same say again. The driver failed that step's key before saying it ("Asked once; if nothing comes of it, it is left a while"), so it is now held back. The Head of Personnel's next ready task is `back_to_office` (routine, ready whenever it is out of its office and has nothing in `toTell`). It walks to its office.
6. In its office it sees none of its staff. `syncMeeting` finds `startedAt !== null && here.length === 0 && !listening` and closes the meeting. The closing line is never said. Bea, who came after the Alexes, was never called on. She is sent "the staff meeting is over. Send me your report by PDA, please." while she is still standing in the room. The Captain's report says "1 of 3 there, 1 reported by PDA" (`reportToCaptain` counts turns as there, and Alex Moor's spoken report, having no turn, as one by PDA).

Even where the head does not walk off (its next task is not ready, or the meeting room is its office), it says the same call again each time the back-off runs out (20 s, 40 s, up to 120 s) until `MEETING_MAX_DS` ends the meeting, and Bea is still never called on: `nextTurn` always gives Alex Moor first.

With random names, two of a handful of staff sharing a first name is not common, but it will happen, and the same match-by-first-name is used by every head, since `meetStep` and `meetingSaid` are shared by the Quartermaster and the Chief Engineer.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:855`, in `meetStep`:

    return {
      ready: true,
      step: `...It is ${next}'s turn: in "say", ${opening ? 'thank them all for coming and ' : ''}call on ${next}, by name, for their report. Ask for nothing else.`,
      say: `${opening ? 'Thank you for coming, everyone. ' : ''}${first}, ${CALLING_ON}.`,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1091`, in `meetingSaid`:

    if (called.includes(CALLING_ON)) {
      const who = present(brain, meeting).find((name) =>
        called.includes(`${firstName(name)}, ${CALLING_ON}`),
      );
      if (who && !meeting.turns.some((turn) => turn.who === who)) {
        meeting.turns.push({ who, askedAt: brain.now, heard: false });
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:598`, on the staff side:

    if (
      summons.askedAt === null &&
      CALLED_ON_WORDS.test(heard) &&
      new RegExp(`\\b${firstName(brain.name)}\\b`, 'i').test(heard)
    ) {
      summons.askedAt = brain.now;
    }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:805`, a say step is put in back-off before it is said:

    if (step.say) {
      // Asked once; if nothing comes of it, it is left a while before being asked again.
      fail(brain, step.key);

## How it was found

Read from the code, not seen in a round. Step 5 depends on the order `workInOrder` puts the head's tasks in; with `MEET` held back, `back_to_office` is the only other task the Head of Personnel normally has, so that is the likely next step, but it was not run.

## How to fix it

Two parts. The first alone ends the stall; the second stops two people answering one call.

1. In `hearReport` (`head.ts:1040`), when the meeting has started (`meeting.startedAt !== null`), the speaker is in `present(brain, meeting)` and has no turn yet, push `{ who: speaker, askedAt: brain.now, heard: true }`. Someone at the meeting who has given their report aloud has had their turn. `nextTurn` then skips Alex Moor and gives Bea, and `reportToCaptain` counts him as there, not as by PDA. Staff speak a report only when they take a call-on as theirs, so this only fires for a call two of them took. It is shared by every head (`chiefengineer.ts`, `headofsecurity.ts`, `quartermaster.ts` all call `hearReport`).
2. Call on by full name when it is ambiguous. Add `callName(brain, name)` in `head.ts`: the first name, unless another of `staff(brain)` has the same first name, then the full name. Use it in `meetStep` for the `say` and the `needs` pattern, and in `meetingSaid` match `called.includes(`${callName(brain, name)}, ${CALLING_ON}`)`. With "Alex Moor, your report, please." the string "Alex, your report, please" for Alex Reed is no longer a substring, so the first match is right.
3. On the staff side in `meetingsOverhear` (`meetings.ts:598`, and the same test in the branch above it at `:570`), take a call-on as its own unless its first name is followed by a different surname: skip it when `new RegExp(`\b${first}\s+(?!${surname}\b)[A-Z]`)` matches the line. "Alex, your report" (comma after the name) still counts for every Alex, so the first-name form keeps working when names are not shared. No list of workmates is needed.
4. The same first-name test is used in `pickups.ts` (`sendForLine`, by PDA, so addressed and harmless) and in `endMeeting` (by PDA, harmless). Only the spoken lines need the change.

## How to test the fix

- Add a simulator scenario with three janitors, two of them with one first name. Pass if the head records three turns, says its closing line, and the Captain's report says "3 of 3 there".
- Type check from `tgui/`.
- In a round's `game.log`, the call-on lines for staff who share a first name should carry the full name.

## Check

Read `meetStep` (`head.ts:855`), `meetingSaid` (`:1064`, the match at `:1091`), `nextTurn` (`:387`), `listening`, `hearReport` (`:1040`), `syncMeeting`'s close at `:587`, `officeStep` and the `OFFICE` task (`:670`), `reportToCaptain` (`:449`), the staff side in `meetings.ts:570` and `:598` (`CALLED_ON_WORDS` is just `/report/i`), and the driver: `fail(brain, step.key)` before every say (`driver.ts:807`), `keyOf` giving the same key to the same say of the same task, and `inBackoff` skipping it in `nextStep` so the next ready task runs. All quotes match the code. The Head of Personnel meets in the Custodial Closet (`head.ts:162`), not its office, so `back_to_office` is a ready routine task during its meeting and `officeStep` does not look at `brain.meeting`. Not run; the core (Bea never called while both Alexes have reported) follows from `nextTurn` and `meetingSaid` alone and does not depend on step 5. One correction to the write-up: the Captain's report reads "1 of 3 there, 1 reported by PDA". I added a smaller first fix in `hearReport` that needs no change to what is said. Severity medium (two staff of one first name under one head is uncommon). Effort small for step 1, a little more with steps 2 and 3 (two files in the window).
