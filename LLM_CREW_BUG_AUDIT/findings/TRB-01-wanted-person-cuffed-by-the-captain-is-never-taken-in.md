---
id: TRB-01
title: Someone wanted whom the Captain or any player has cuffed is left standing in cuffs, the warrant never served and nobody told
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:740, code/modules/llm_crew/crew_npc_security.dm:876, code/modules/llm_crew/crew_npc_senses.dm:191
fix: In serveStep leave a cuffed person to someone else only while another security crew member is in sight beside them, otherwise take them by the arm with how quiet, which the server already handles
---

## What is wrong

When the officer (or the Head of Security serving a warrant itself) sees the person it has a warrant on and they are in handcuffs it did not put on, it does nothing. The step says "Someone else from security has made the arrest, and you are leaving them to it", and it is not even a wait: it is a step that is not ready, so the driver goes on to other work and comes back to the same answer every time the person is in sight.

The window cannot tell who put the cuffs on. The guard was written for one case (the change log, entry with "A prisoner in another's cuffs is left to whoever cuffed them. Found by the simulator: the hurt officer took hold of the Head of Security's prisoner"), but it fires for every pair of cuffs in the game: the Captain's, a human security player's, a pair from a locker anyone snapped on, zipties, or cuffs left on from an earlier arrest.

The Captain is the human player, and helping with an arrest is the obvious thing for them to do. The concrete case:

1. The Captain declares "Warrant for Pun Pun, for theft." The officer is given it.
2. The Captain meets Pun Pun first, cuffs the monkey and pulls it to the Security Office, where the officer stands.
3. The officer's `syncBeat` sees Pun Pun (`target`), the SERVE task becomes an emergency. `serveStep`: `seen.cuffed` is TRUE, `warrant.cuffedByMe` is undefined, so the step is `ready: false`.
4. The Captain lets go. Pun Pun stands in cuffs in front of the officer for the rest of the round. The warrant stays on the list, the heads keep reading Pun Pun out at their meetings, and `onLead` stays TRUE while the monkey is in sight, so the officer also skips staff meetings and its kit trip.

Nothing is sent to anyone: no `cannot` outcome is pushed for this case, so the Head of Security and the Captain are not told why there is no arrest.

The server would have done it. `make_arrest` has a path for exactly this: someone already in cuffs is only taken by the arm.

The same guard also leaves a prisoner in cuffs for good when the officer that cuffed them goes down and the Head of Security takes the warrant into its own hands (its own `BeatWarrant` is new, so `cuffedByMe` is not set), and in the ARR-08 case (see that file).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:738`, in `serveStep`:

    // In cuffs that it did not put on: someone else from security has them. Two do not pull at
    // one prisoner, so it leaves them to whoever made the arrest.
    if (seen.cuffed && !warrant.cuffedByMe) {
      return {
        ready: false,
        step: `${seen.name} is in cuffs already. Someone else from security has made the arrest, and you are leaving them to it.`,
      };
    }

`code/modules/llm_crew/crew_npc_security.dm:875`, in `make_arrest`, the server's way of taking over someone already cuffed:

    // In cuffs already: someone has done that part. It only has to be taken by the arm.
    if(person.handcuffed && how != CREW_ARREST_STOP)
        if(!close_with(person))
            return list(FALSE, "[person_name] got away from you.", list("handle" = handle, "reason" = "lost", "hits" = 0))
        return hold_arrested(person, 0, FALSE)

`code/modules/llm_crew/crew_npc_senses.dm:191`: what the window is told of a person is `"cuffed" = !isnull(person.handcuffed)`, nothing about who cuffed them or who holds them.

## How it was found

Read from the code, both halves. Not seen in a round: no round log so far has a player cuffing someone wanted.

## How to fix it

1. In `serveStep`, keep the "leave them to it" answer only when another security crew member is in sight within a tile or two of the prisoner (`brain.peopleInView`, `isSecurity(person.job)`, and `distance`). That is what the guard was written for: two of security pulling at one prisoner.
2. Otherwise fall through to the existing "In its own cuffs and got loose of its hold" branch: `act: { tool: 'arrest', person: seen.handle, how: 'quiet' }`. The server's `make_arrest` takes a cuffed person by the arm without a second pair of cuffs, and `beatAfterActing` already reads `details.cuffed` and pushes the `cuffed` outcome.
3. Better still, have `people_in_view` say who is pulling a person (`person.pulledby`, by name), since that is what anyone standing there would see. Then the guard can be "someone else has them by the arm", exactly as the comment means.
4. When the guard does hold, push a `cannot` outcome once (`I am leaving them to <name>`), so the desk knows why there is no arrest.

## How to test the fix

- Simulator: add a scenario like `warrant` in which the suspect is reported `cuffed: true` before the officer reaches them and nobody of security is near. The officer should send `arrest` with `how: 'quiet'` and then `jail`.
- Keep the scenario where the Head of Security has the prisoner by the arm: the officer must still leave them.
- Type check.
- In a round, have the Captain cuff someone wanted and walk them to the officer. `game.log` should show "take Pun Pun, who is in cuffs, by the arm" and then the cell.
