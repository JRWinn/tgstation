---
id: KNA-09
title: A warrant given to an officer who then goes down or falls silent is never served by anyone
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:802
fix: Have whoever keeps the list take a warrant back when the officer it went to has sent no word on it for some minutes, or is seen lying on the floor
---

## What is wrong

The Head of Security serves warrants with its own hands in two cases only: there is no officer on its PDA, or its officer has sent the words "I am hurt". An officer that is knocked down before it can write, or whose PDA is gone, or who is in a cell, or simply stuck, still counts as the one the warrants go to. Every warrant handed to it waits for good, and the Captain is told nothing.

Listed in the change log entry of 2026-11-18, 20:53 to 21:05: "The Captain's second warrant, on the Head of Personnel, was given to the officer 40 seconds before the fight and was never acted on." And: "Nothing more of it in any log by 20:55. No word was sent to the Head of Security, who went on believing the warrant was being served."

The word that it is hurt is now sent before it walks off (`sayingHurt`), which mends the round that showed this. The hole is still there for an officer that goes down in fewer than five seconds, or is hit from full health to the floor, or loses its PDA.

The case: the officer has two warrants. It is tackled and beaten down in the Courtroom without getting below half health while still able to act (a toolbox does 8 a hit; two thrown hits and a tackle can take it from 55 to under 0 inside the five seconds it stands sending). Or the message is lost to a "PDA glitch" trait and is being resent every 20 seconds while it lies there. The Head of Security's `desk.officerOut` stays null, `serving(brain)` goes on returning the officer's name, and both warrants sit.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152`:

    export function officerAboard(brain: NpcBrain): string | null {
      const isOther = (person: { name: string; job: string }) =>
        isOfficer(person.job) && person.name !== brain.name;
      return (
        brain.peopleInView.find(isOther)?.name ??
        brain.pdaPeople.find(isOther)?.name ??
        null
      );
    }

    /** The officer its warrants go to, or null if it serves them itself: there is none, or the one there is has broken off. */
    function serving(brain: NpcBrain): string | null {
      return deskOf(brain).officerOut ? null : officerAboard(brain);
    }

`jobs/desk.ts:802`, in `deskOutcome`: the only place `officerOut` is set.

    case 'hurt':
      ...
        desk.officerOut = 'hurt';

The body does see when someone is down: `people_in_view` carries `"down" = crew_npc_person_down(person)` (`code/modules/llm_crew/crew_npc_senses.dm:191`). Nothing on the desk reads it for its own officer.

## How it was found

Read from the code, against the change log's account of `data/logs/2026/11/19/round-20.43.32`.

## How to fix it

1. Keep, on each warrant the desk has handed out, when it was given and when the officer last sent any word about it (an outcome, "in cuffs", "cannot bring in", a sighting acknowledged). The desk already stores warrants with who they went to: add `givenAt` and `heardAt`.
2. In the desk's sync (where `serving` is used to decide who gets a warrant), treat the officer as out when either:
   - it is in view and `down` is set on it; or
   - a warrant has been with it for longer than a limit with no word (five minutes is a fair first value: an arrest takes under one, a room nobody opens is reported after about three).
   Set `desk.officerOut = 'silent'` and tell the Captain once, in fixed words: "Captain, I have had no word from Nova on the warrant for X. I am serving the warrants myself." The existing path after `officerOut` (the Head of Security fetches a baton and goes) then runs unchanged.
3. Clear `officerOut` when the officer next sends any word, as "try again" clears it now (`desk.ts:441`), and hand back what is not yet served.
4. With no Head of Security aboard the officer keeps the list itself, so there is nobody to take over. Then the Captain should at least be told nothing is happening: out of reach of this fix, since the one who would say so is the one who is down. Leave it.
5. The owner ruled on 2026-11-18 that nothing is built for crew who are down until there is a medical department ("We have no medical yet so not important"). This fix does not go to the officer or help it. It only stops the warrants being lost. **Check with the owner** that taking the warrants back falls outside that ruling.

Keeps the rules: the Head of Security acts on what it sees and on the absence of PDA messages it would have received. No hidden channel.

## How to test the fix

- `tools/llm_crew/sim.ts`: a variant of `hurt` where the officer is taken straight to the floor with its PDA taken (the simulator can drop its messages). Pass when the Head of Security tells the Captain and goes for the suspect itself within the limit.
- `tools/llm_crew/security.ts`: a case for the new line to the Captain.
- Next round, `pda.log`: "I have had no word from".
