---
id: KNA-06
title: An officer in the middle of an arrest stops to greet people it has not met
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Fable 5.2
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:947, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:457
fix: In shouldWake, do not wake the voice for a first meeting while the job says the body cannot leave what it is doing
---

## What is wrong

Seeing someone for the first time wakes the model for a greeting, and the body stands still while it talks. Nothing holds that back while security is after someone. The one exception built so far is the suspect, who is not greeted.

Listed in the change log entry of 2026-11-18, 19:38 to 20:00, under "Seen and left alone": "Eighteen seconds went by between walking up to the monkey and the second try (19:36:57 to 19:37:15) while the officer greeted two people it had not met. Greetings are not held back for an arrest." In the same list: the officer said to the room "I'm busy with Pun Pun who won't stand still!", which is that greeting.

The case: the officer has a warrant on Pun Pun and Pun Pun is in sight in the Bar Lounge. The cuffs alone have failed once, so the next step is `arrest(force)`. Two patrons come into view for the first time. Each `person_in_view` event wakes the model. The reply is a `say`, and on the server `tool_say` calls `stand_still(CREW_NPC_TALK_PAUSE)`; the driver holds the body as well (`TALK_PAUSE_MS`, `AFTER_SAYING_MS` in `driver.ts`). The monkey wanders off meanwhile.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:947`, in `shouldWake`:

    case 'person_in_view':
      // Someone security has a warrant on is not greeted. The first thing they hear is that
      // they are under arrest: see jobs/arrests.ts.
      return (
        line.includes('you have not seen them before') &&
        !isWarrantOn(brain, String(event.details.name ?? ''))
      );

The test for "it is after someone and cannot break off" already exists as a job hook, used for staff meetings. `tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:457`:

    keptFromMeeting: (brain) =>

which rests on `onLead` in `jobs/arrests.ts:326` (someone wanted is in sight, by the arm, or was seen by it in the last two minutes).

## How it was found

Read from the code. The eighteen seconds are the change log's reading of `data/logs/2026/11/19/round-19.33.50`; I did not reread that log, and I did not trace the hold through `drive` line by line, which is why this is "likely".

## How to fix it

1. In `shouldWake` (`brain.ts`), for `person_in_view`, also return false when `jobFor(brain.job).keptFromMeeting?.(brain)` is not null. That hook means "cannot leave what it is doing", for any job that sets it, so the rule is general: a body that will not leave for its own head's meeting does not stop to say hello.
2. The person is still noted as met (the event is observed before `shouldWake`), so there is no greeting later either. If the owner wants the greeting made afterwards, keep a short list of names to greet and wake for the first of them once the hook returns null. **Question for the owner:** greet later, or not at all?
3. Consider the same test for `speech_heard` from a fellow NPC that is only talk. Leave speech from the Captain or a head alone: an order ("try again", a pardon) must get through. I would not change `speech_heard` without a round that shows it is needed.
4. The hook's name is now wrong for what it does. Rename it `cannotBreakOff` in `jobs/job.ts`, `jobs/officer.ts`, `jobs/meetings.ts` if doing a tidy-up; not needed for the fix.

Keeps the rules: the model is only the voice, and here it is simply not asked.

## How to test the fix

- Type check from `tgui/`.
- `tools/llm_crew/sim.ts`: the security scenarios (`warrant`, `fight`, `hurt`) with a chatty LLM. Add a bystander the officer has never met to `warrant`, in the room with the suspect, and check that no `say` goes out between the arrest line and the `arrest` tool call.
- Next round: in `game.log`, between "you are under arrest" and "arrested" (or "with its baton") for one suspect, no "was told by its brain to say" from the officer other than the arrest line.
