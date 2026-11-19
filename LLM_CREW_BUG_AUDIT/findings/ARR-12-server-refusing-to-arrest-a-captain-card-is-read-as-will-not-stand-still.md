---
id: ARR-12
title: The server refusing an arrest because the person carries a Captain's ID is read as them not standing still, and the arrest line is said to them for ever
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1132, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:286, code/modules/llm_crew/crew_npc_security.dm:853
fix: Read the reasons captain, self and how in beatAfterActing as final for that person, stop trying them, and tell whoever keeps the list why in plain words
---

## What is wrong

See also: TRUST-06 (a warrant served on anyone whose name fits) and SECT-13 (a warrant on Unknown). Both are ways the person in front of the officer can be one the server will not let it arrest. This file is about what the window does with that refusal, which neither covers.

`tool_arrest` refuses anyone whose worn or held ID is a Captain's (`crew_npc_job_of`, which goes by the card's trim), with `reason: 'captain'`. It also refuses with `self` and `how`. The window's `beatAfterActing` knows `no_way`, `moved`, `no_baton`, `no_cuffs` and `lost`. Anything else falls through to "a try that came to nothing":

- `warrant.tries += 1`, and after three a 30 second rest and the outcome "I cannot bring in X: they will not stand still for the baton or the cuffs". That is false: nobody was touched.
- After the rest `toldAt` is null, so the next plan is the arrest line again: "X, you are under arrest, for theft. Stand still." Then the arrest, refused again. Round and round for the rest of the round, every 45 seconds or so, slowed only by the driver's back-off (ARR-01).
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

1. In `beatAfterActing`, before the `tries` count, handle `reason === 'captain'` (and `self`, which cannot come up with the `person.name !== brain.name` guard, but should not loop if it does): note the handle in a new `warrant.refused` list, set `toldAt = null`, and push one `cannot` outcome with a true reason, for example `why: 'they carry a Captain\'s ID, and I may not lay a hand on them'`, through the existing `cannot` once-only key.
2. In `target`, pass over anyone whose handle is in `warrant.refused`, so that the officer looks past them to anyone else whose name fits.
3. `how` means the window sent a bad `how`: log it and do not count it as a try.
4. The owner may want a say in what happens next to someone wearing a Captain's card on a warrant. The question: should security take the card off them first (a strip, as a player would), or leave it to the Captain? Until that is answered, telling the Captain is the safe thing.

## How to test the fix

- `tools/llm_crew/security.ts`: feed `beatAfterActing` an `arrest` result with `reason: 'captain'`; expect no `tries` increase, one `cannot` outcome whose `why` names the card, and `target()` then returning a second person in view with a fitting name, or nothing.
- A simulator scenario where the stand-in server refuses the arrest with `captain`: the arrest line should be said once, not again.
- In the next round, look in `crew_brain.log` for the arrest line said to the same person more than once, and in `pda.log` for "will not stand still" about someone who was never touched. (Whether the server's refusal text reaches `game.log` was not checked.)
