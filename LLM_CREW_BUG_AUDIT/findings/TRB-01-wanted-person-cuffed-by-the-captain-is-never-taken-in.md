---
id: TRB-01
title: Someone wanted whom the Captain or any player has cuffed is left standing in cuffs, the warrant never served and nobody told
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: f9ffa7c97dd, 1db0bddd76f
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:740, code/modules/llm_crew/crew_npc_security.dm:876, code/modules/llm_crew/crew_npc_senses.dm:191
fix: Have people_in_view say who is pulling each person, and in serveStep leave a cuffed person to someone else only while another is pulling them, otherwise take them by the arm with how quiet, which the server already handles
---

## What is wrong

When the officer (or the Head of Security serving a warrant itself) sees the person it has a warrant on and they are in handcuffs it did not put on, it does nothing. The step says "Someone else from security has made the arrest, and you are leaving them to it", and it is not even a wait: it is a step that is not ready, so the driver goes on to other work and comes back to the same answer every time the person is in sight.

The window cannot tell who put the cuffs on. The guard was written for one case (the change log, entry with "A prisoner in another's cuffs is left to whoever cuffed them. Found by the simulator: the hurt officer took hold of the Head of Security's prisoner"), but it fires for every pair of cuffs in the game: the Captain's, a human security player's, a pair from a locker anyone snapped on, zipties, or cuffs left on from an earlier arrest.

The Captain is the human player, and helping with an arrest is the obvious thing for them to do. The concrete case:

1. The Captain declares "Warrant for Dana Reyes, for theft." Dana is a crew NPC. The officer is given the warrant.
2. The Captain meets Dana first, cuffs her and pulls her to the Security Office, where the officer stands.
3. The officer's `syncBeat` sees Dana (`target`), the SERVE task becomes an emergency. `serveStep`: `seen.cuffed` is TRUE, `warrant.cuffedByMe` is undefined, so the step is `ready: false`.
4. The Captain lets go. Dana stands in cuffs in front of the officer for the rest of the round: a crew NPC works cuffs off only once `being_arrested` has put it in custody (`custody_tick`, crew_npc_security.dm:1469), and a player's cuffs never call that (HOLE-11). The warrant stays on the list, the heads keep reading Dana out at their meetings, and `onLead` stays TRUE while she is in sight, so the officer also skips staff meetings and its kit trip.

(Checker's note: with Pun Pun in place of Dana the harm is short. Pun Pun's monkey AI resists when restrained (`escape_captivity` subtree, `pawn_is_restrained`, in `code/datums/ai/basic_mobs/basic_subtrees/escape_captivity.bt.json`), handcuffs take a minute to break out of, and once out of them the officer arrests the monkey the usual way. A human player wanted and cuffed by someone else also resists out. The case that lasts for good is a crew NPC cuffed by a player.)

Nothing is sent to anyone: no `cannot` outcome is pushed for this case, so the Head of Security and the Captain are not told why there is no arrest.

The server would have done it. `make_arrest` has a path for exactly this: someone already in cuffs is only taken by the arm.

The same guard also stops the Head of Security taking a prisoner when the officer that cuffed them goes down and the Head of Security takes the warrant into its own hands (its own `BeatWarrant` is new, so `cuffedByMe` is not set), and in the ARR-08 case (see that file). (Checker's note: in those two cases a crew NPC prisoner is in custody, so after `CREW_NPC_CUFFED_ALONE`, two minutes with nobody's hand on it, it works the cuffs off and is then arrested the usual way. That is a delay of a few minutes, not for good.)

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

1. Do this one first (checker's order): have `people_in_view` in `crew_npc_senses.dm:191` say who is pulling a person (`"pulled_by" = person.pulledby?.name`, null if nobody), since that is what anyone standing there would see. Add `pulled_by?: string | null` to `PersonInView` in `types.ts`. Then in `serveStep` the guard becomes "in cuffs, and someone other than me is pulling them": `seen.cuffed && !warrant.cuffedByMe && seen.pulled_by && seen.pulled_by !== brain.name`. That is exactly what the comment means: two do not pull at one prisoner.
2. Otherwise fall through to the existing "In its own cuffs and got loose of its hold" branch: `act: { tool: 'arrest', person: seen.handle, how: 'quiet' }`. The server's `make_arrest` (crew_npc_security.dm:876) takes a cuffed person by the arm without a second pair of cuffs, and `beatAfterActing` already reads `ok`/`details.cuffed`, sets `cuffedByMe` and pushes the `cuffed` outcome. This matters because `hold_arrested` calls `body.start_pulling(person)`, and the base game's `/mob/living/start_pulling` (code/modules/mob/living/living.dm:415) pulls a mob out of whoever else has it: without the `pulled_by` guard the officer would take a prisoner out of the Head of Security's hand, the case the guard was written for.
3. The finder's first idea, "another security crew member within a tile or two", is a weaker stand-in for step 1: a Head of Security standing beside a prisoner it is not holding would still block the arrest. Use it only if the server side cannot be changed.
4. When the guard does hold, push a `cannot` outcome once (`I am leaving them to <name>`), so the desk knows why there is no arrest.
5. HOLE-11 (a crew member cuffed by a player never resists) would make this case end on its own a minute or two later. It is not a fix for this one: the arrest should be made at once, by the officer standing there.

## How to test the fix

- Simulator: add a scenario like `warrant` in which the suspect is reported `cuffed: true` with `pulled_by: null` before the officer reaches them. The officer should send `arrest` with `how: 'quiet'` and then `jail`, and the Head of Security should get the `cuffed` and `jailed` outcomes.
- The same with `pulled_by: 'Joan ...'` (the Head of Security): the officer must leave them. Keep the existing `hurt` scenario that found the guard passing.
- Type check.
- In a round, have the Captain cuff a wanted crew NPC (not Pun Pun, who breaks out by itself) and let go of them beside the officer. `game.log` should show "took hold of Dana Reyes" from `hold_arrested` and then the cell.

## Check

Read `serveStep` (arrests.ts:664-820), `beatAfterActing` (arrests.ts:1022), `target`, `onLead`, `syncBeat`; the `people_in_view` line in crew_npc_senses.dm:191; `make_arrest` and `hold_arrested` in crew_npc_security.dm:865 and :1027; `custody_tick` and `being_arrested` (:1391, :1442); the driver's handling of a step that is not ready (driver.ts:513, :535, `orderToDrop`); the base game's `start_pulling` (living.dm:415) and Pun Pun's controller (`/datum/ai_controller/monkey/pun_pun`, monkey.bt.json with the `escape_captivity` subtree). The quotes match today's code. The change log entry that added the guard (LLM_CREW_CHANGELOG.md:586) meant it for another of security's prisoners only; nothing chose to leave a player's prisoner alone.

Ran a throwaway bun script (outside the repo) that gives an officer a warrant, shows it the person `cuffed: true` beside it, and calls `syncBeat` and `planBeat`: the SERVE task is an emergency and the plan is `ready: false`, "is in cuffs already. Someone else from security has made the arrest, and you are leaving them to it". Nothing else in desk.ts, officer.ts or security.ts acts on a wanted person in cuffs, and `syncWanted` sends no sighting of someone in cuffs.

Confirmed, with two corrections: Pun Pun, the finder's example, breaks out of cuffs by itself through its monkey AI, as do human players and crew NPCs already in custody (after two minutes alone), so in those cases it is a delay; the case that lasts for good is a crew NPC cuffed by a player, since only `being_arrested` starts a crew NPC working its cuffs off. Severity lowered to medium: the Captain cuffing a wanted crew member is a less common case, not most rounds. The fix now leads with saying who pulls each person, because the server's `start_pulling` would take a prisoner out of another's hand.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: f9ffa7c97dd.

- TRB-01 (window part): part done. Someone wanted, in cuffs it did not put on, is left only while someone else pulls them (heldByAnother). With pulled_by null it takes them by the arm (arrest, how quiet). Held by someone who is not security, the list hears once 'X has them in cuffs'. Nothing changes until the server sends pulled_by. Left: crew_npc_senses.dm, people_in_view (about line 191): add "pulled_by" = person.pulledby?.name, null when nobody is pulling (it must be sent as null, not left out: the window reads a missing key as 'do not know' and keeps the old guard). sim.ts: a warrant variant with the suspect cuffed: true, pulled_by: null (expect arrest how quiet, then jail), and one with pulled_by set to the Head of Security (expect it to be left).

Round two (branch crew-bug-fixes-medium): 1db0bddd76f. This finishes the parts left above, apart from any step that waits on the owner.
