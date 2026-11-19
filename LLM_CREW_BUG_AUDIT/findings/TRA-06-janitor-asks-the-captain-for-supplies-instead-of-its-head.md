---
id: TRA-06
title: A janitor short of supplies with the Captain in sight asks the Captain to their face, not its head, and then waits eight minutes before it tells its head
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:102, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:196, code/modules/llm_crew/crew_npc_guarding.dm:59
fix: In needStep ask the head of the body's own department, in view or by PDA, and treat the Captain as the one to ask only when the department has no head aboard
---

## What is wrong

`needStep` is how any staff member takes what it is short of to its head. It works out who that is with `headName`, and the first thing `headName` looks at is `headInView`: the first person in sight who is `superior` or whom `answersTo` says it answers to. Both include the Captain. The server's `answers_to` returns TRUE for the Captain before anything else, and `answersTo` in `hierarchy.ts` does the same.

The PDA list is sorted so that "its own head before the Captain: the Captain has a station to run". The in-sight test is not. So a janitor that runs short with the Captain in sight, and its own head not, says to the Captain: "Ada, I need something to clean with for my work. Could you get it ordered, please?". The step's own words to the model call that person "who you answer to" and add "Cargo only takes orders from heads of department".

Then `meetingsAfterSaying` sees `ASKING_HEAD` in the line and sets `toldHeadAt`. For `TELL_AGAIN_DS` (eight minutes) `needStep` returns "You have told Ada, and are waiting to hear that it has come". Nothing has gone to the Head of Personnel. The Captain is the human player: nothing in the code expects them to pass it on, and the Quartermaster would take an order from them only if they sent one themselves.

The meeting path is not affected (the report at a staff meeting goes to whoever called it), so the delay is until the next meeting or the eight minutes, whichever is first: up to eight minutes of a janitor standing idle with nothing to clean with.

Concrete case: Sue's space cleaner runs dry in the Bridge, where the Captain is working. Sue has searched the closet already. `supplyStep` reaches `needStep`. `headInView` finds the Captain (`superior` is set) before any other check, `headName` returns "Ada Stone", and the step says the line to the Captain's face. The Head of Personnel's next meeting is six minutes off. Sue reports there; the order goes in six minutes late. Had the meeting been nine minutes off, Sue would have sent its head the PDA after eight.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:102`:

    /** The head this NPC answers to who is in view, if one is. */
    function headInView(brain: NpcBrain): PersonInView | undefined {
      return brain.peopleInView.find(
        (person) => !!person.superior || answersTo(brain.job, person.job),
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:109`, `headName`, which puts the Captain last only on the PDA list:

    const seen = headInView(brain);
    if (seen) {
      return seen.name;
    }
    // Its own head before the Captain: the Captain has a station to run.
    const listed = brain.pdaPeople
      .filter((person) => answersTo(brain.job, person.job))
      .sort(
        (a, b) => Number(/captain/i.test(a.job)) - Number(/captain/i.test(b.job)),
      );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:214`, in `needStep`:

    if (headInView(brain)?.name === head) {
      return {
        ready: true,
        step: `You need ${need}. ${head}, who you answer to, is here: in "say", tell ${head} what you need and ask them to get it ordered. Cargo only takes orders from heads of department.`,
        say: `${first}, I need ${need} for my work. C${ASKING_HEAD.slice(1)}, please?`,

`code/modules/llm_crew/crew_npc_guarding.dm:64`, `answers_to`:

    if(istype(their_job, /datum/job/captain))
        return TRUE

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `meetings.ts`, split the two ideas: `ownHeadInView` (a person in view whose job is `headOf(brain.job)`, not the Captain) and `headName` that prefers the own head in view, then the own head on the PDA, and only then the Captain (in view or on the PDA). The Captain is the last resort for a department with no head aboard, as the PDA sort already intends.
2. In `needStep`, say the line aloud only to the own head in view; otherwise send the PDA to the own head; only with no own head aboard go to the Captain.
3. Leave `headInView` as it is for its other use, `inMeeting`-style checks about whoever called a meeting, or rename it so it is not mistaken for "my head" again.

## How to test the fix

- Type check from `tgui/`.
- Simulator: put the Captain in the room with a janitor who has just run out, with the Head of Personnel elsewhere. Pass if the janitor sends the head a PDA at once and says nothing to the Captain about supplies.
