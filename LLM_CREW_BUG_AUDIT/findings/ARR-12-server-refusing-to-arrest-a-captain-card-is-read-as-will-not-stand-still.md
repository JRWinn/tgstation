---
id: ARR-12
title: The server refusing an arrest because the person carries a Captain's ID is read as them not standing still, and the arrest line is said to them for ever
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: a0e27527203
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1132, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:286, code/modules/llm_crew/crew_npc_security.dm:853
fix: Read the reason captain in beatAfterActing as final for that person for a while, pass over them in target, and tell whoever keeps the list the true reason once
---

## What is wrong

See also: TRUST-06 (a warrant served on anyone whose name fits) and SECT-13 (a warrant on Unknown). Both are ways the person in front of the officer can be one the server will not let it arrest. This file is about what the window does with that refusal, which neither covers.

`tool_arrest` refuses anyone whose worn or held ID is a Captain's (`crew_npc_job_of`, which goes by the card's trim), with `reason: 'captain'`. It also refuses with `self` and `how`. The window's `beatAfterActing` knows `no_way`, `moved`, `no_baton`, `no_cuffs` and `lost`. Anything else falls through to "a try that came to nothing":

- `warrant.tries += 1`, and after three a 30 second rest and the outcome "I cannot bring in X: they will not stand still for the baton or the cuffs". That is false: nobody was touched.
- After the rest `toldAt` is null, so the next plan is the arrest line again: "X, you are under arrest, for theft. Stand still." Then the arrest, refused again. Round and round for the rest of the round: three refused tries, a 30 second rest (`REST_DS`), the line again, slowed only by the driver's back-off (ARR-01). The false "will not stand still" goes to the list only once a round (`cannotTold`); the line is said every cycle.
- `target()` takes the first person in view whose name fits. While the refused person is in view, the officer never looks past them, even when the person really meant is standing next to them.

The case that needs no name mix-up: someone steals the Captain's spare ID, or the Captain's own, and wears it. A head declares a warrant on them for theft, under their own name. The officer finds them. Their face shows, so they are seen under their own name, and `sameName` matches. The server sees a Captain's card and refuses. The officer says "Dana Reyes, you are under arrest, for theft. Stand still." to them every minute or so, and the Captain is told "Hale cannot bring in Dana Reyes: they will not stand still for the baton or the cuffs." The thief is never arrested, and the Captain is never told that the card is why.

The same loop happens when the Captain is the one in view: a warrant on a first name the Captain shares (SECT-16), or on "Unknown" while the Captain wears a mask or a helmet (SECT-13). Then the arrest line is said to the Captain's face every 45 seconds, and the Captain is reported as resisting.

## Where

`code/modules/llm_crew/crew_npc_security.dm:853`, in `tool_arrest`:

    if(istype(crew_npc_job_of(person), /datum/job/captain))
    	action_result(CREW_TOOL_ARREST, FALSE, "[person.name] is the Captain. Nobody lays a hand on the Captain.", list("handle" = handle, "reason" = "captain"))
    	return

`code/modules/llm_crew/crew_npc_guarding.dm:45`, the job read from the card:

    /proc/crew_npc_job_of(mob/living/carbon/human/person)
    	var/obj/item/card/id/card = person.get_idcard(FALSE)
    	...
    	if(istype(trim) && istype(trim.job))
    		return trim.job

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1132`, in `beatAfterActing`, where every reason not named above it ends up:

    warrant.tries += 1;
    if (reason === 'lost' || warrant.tries >= ARREST_TRIES) {
      warrant.tries = 0;
      warrant.toldAt = null;
      ...
      } else {
        warrant.restUntil = brain.now + REST_DS;
        ...
          beat.outcomes.push({
            what: 'cannot',
            name: warrant.name,
            why: WILL_NOT_STAND,
          });

`jobs/arrests.ts:286`, `target`, the first fit in view:

    return brain.peopleInView.find(
      (person) =>
        sameName(warrant.name, person.name) &&
        person.name !== brain.name &&
        !shut.includes(person.name),
    );

## How it was found

Read from the code, the window and the server. Not seen in a round.

## How to fix it

1. In `beatAfterActing`, in the `arrest` branch after `const reason = ...` and before `warrant.tries += 1`, handle `reason === 'captain'` (and `self`, which cannot come up with the `person.name !== brain.name` guard, but should not loop if it does): note `{ handle: details.handle, at: brain.now }` in a new `warrant.refused` list, set `toldAt = null`, and push one `cannot` outcome with a true reason, for example `why: 'they carry a Captain\'s ID, and I may not lay a hand on them'`, keyed in `beat.cannotTold` as the other `cannot` outcomes are. Return without counting a try.
2. In `target`, pass over anyone whose handle is in `warrant.refused` and was refused in the last few minutes, so that the officer looks past them to anyone else whose name fits. Keep it timed, not for good: a thief may take the card off, and then the arrest is lawful again. (`PersonInView.job`, from `get_assignment`, shows the card's job; dropping the refusal when `seen.job` is no longer "Captain" is a better end to it than a timer, if the server's `crew_npc_job_of` and `get_assignment` agree for the card in question.)
3. `how` cannot come from today's window (every `arrest` it sends has `quiet`, `force` or `stop`). Count nothing for it; a log line is enough.
4. The owner may want a say in what happens next to someone wearing a Captain's card on a warrant. The question: should security take the card off them first (a strip, as a player would), or leave it to the Captain? Until that is answered, telling the Captain is the safe thing.

## How to test the fix

- `tools/llm_crew/security.ts`: feed `beatAfterActing` an `arrest` result with `reason: 'captain'`; expect no `tries` increase, one `cannot` outcome whose `why` names the card, and `target()` then returning a second person in view with a fitting name, or nothing.
- A simulator scenario where the stand-in server refuses the arrest with `captain`: the arrest line should be said once, not again.
- In the next round, look in `crew_brain.log` for the arrest line said to the same person more than once, and in `pda.log` for "will not stand still" about someone who was never touched. (Whether the server's refusal text reaches `game.log` was not checked.)

## Check

Checked by Opus 5.5 on 2026-11-19. Read `tool_arrest` (crew_npc_security.dm:837-858; the `captain` refusal is at :853-855 and goes out through `action_result` with `reason` in its details, crew_npc_tools.dm:129), `crew_npc_job_of` (crew_npc_guarding.dm, by the card's trim, then its assignment), `beatAfterActing` (arrests.ts:1022-1167), `serveStep` (arrests.ts:728-830), `target` (arrests.ts:281) and `sameName` (security.ts:72). The quotes are what the code says today. `beatAfterActing` names only `no_way`, `moved`, `no_baton`, `no_cuffs` and `lost`; `captain` reaches `warrant.tries += 1`, and on the third the rest and the `WILL_NOT_STAND` outcome follow, with `toldAt = null`, so after `restUntil` `serveStep` says the arrest line again. Nothing in `serveStep` looks at `seen.job` or `seen.superior` before saying the line or sending the arrest. The thief's case holds: with the face showing, `person.name` is "Real Name (as Card Name)", and `sameName` matches on the words, so the warrant on the real name fits. No change log or plan entry deals with this refusal. Severity medium stands: it needs a stolen Captain's card or a name the Captain shares, which is not most rounds, but then it loops for good and tells the list a falsehood. Window only, under 20 lines: small. The fix was made timed in step 2, so that a thief who drops the card can still be taken.
