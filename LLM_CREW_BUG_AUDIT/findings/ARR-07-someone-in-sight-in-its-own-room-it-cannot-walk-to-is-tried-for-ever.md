---
id: ARR-07
title: Someone in sight in the officer's own room whom it cannot walk to is told and tried for ever, and nobody hears why
kind: bug
severity: medium
effort: small
confidence: likely
status: found
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1113, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:534, code/modules/llm_crew/crew_npc_security.dm:757
fix: Count a no_way with nowhere to ask as a failed try, so that it rests after three and reports that it cannot get to them
---

## What is wrong

When the walk up to someone for an arrest fails and they are still in sight, the server answers `reason: 'no_way'` with the room they are in. The window takes that to mean "a door or a counter is between us" and calls `noteShutOut`, then returns without counting a try. `noteShutOut` does nothing when the room named is the room the officer is standing in. So for someone in the same room (the same named area) that it cannot path to, nothing is counted, nothing is noted, and nothing is reported. `toldAt` is set back to null, so the next plan is: walk up, say "you are under arrest", try the arrest, get `no_way`, and round again, with no end. No "I cannot bring in X" is ever sent, because that is sent only from the three-tries branch, from `gaveUp`, and from `blockedPlaces`.

Today the driver slows this to one round every one to two minutes (see ARR-01). Once ARR-01 is mended by numbering the tries, this becomes a tight loop: the arrest line said aloud every few seconds.

One concrete case: Pun Pun pulls a fire alarm in the Central Primary Hallway, which it did in round-19.33.50 in the Brig. The fire doors shut and cut the hallway in two. The officer is in one half and can see the monkey in the other through the fire doors' glass. Both are "in" the Central Primary Hallway. `approach` fails or times out, `warrant.walkedUp` is set, the line is said, `arrest(p2, 'quiet')` is sent, the errand finds no way, `security_details` answers `no_way` with `place` "Central Primary Hallway", and `noteShutOut` returns false at its first line. The same again, for as long as the fire doors stay shut and the monkey stays in sight. The same goes for anyone behind a windoor, a counter or a row of tables that lies inside one named room.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1110`, in `beatAfterActing`:

    const reason = String(details.reason ?? '');
    // It could not get to them, and can still see them: a door or a counter is between them.
    // That is not losing them. It asks to be let in.
    if (reason === 'no_way') {
      warrant.toldAt = null;
      noteShutOut(
        brain,
        warrant,
        String(details.place ?? target(brain, warrant)?.place ?? ''),
        details.keepers,
      );
      return;
    }

`arrests.ts:528`, `noteShutOut`:

    if (!place || place === brain.location) {
      return false;
    }

The same early return is also taken when `keepersOf` is empty: no Captain on the PDA and nobody listed. In both cases the caller ignores the `false`.

`code/modules/llm_crew/crew_npc_security.dm:754`, `security_details`:

    	var/list/details = list("reason" = (tool == CREW_TOOL_ARREST ? "lost" : "no_way"))
    	// Someone it can still see is not lost: there is a door or a counter between them. The brain is told which room they are in.
    	var/mob/living/carbon/human/wanted = arrest_target?.resolve()
    	if(tool == CREW_TOOL_ARREST && !QDELETED(wanted) && !QDELETED(pawn) && (wanted in view(CREW_NPC_VISION_RANGE, pawn)))
    		details["reason"] = "no_way"

## How it was found

Read from the code. Not seen in a round. Not checked on the map: which named rooms of MetaStation are split by a counter or windoor inside one area. The fire door case needs no such room.

## How to fix it

1. In `beatAfterActing`, in the `no_way` branch, use what `noteShutOut` returns. When it is `false` and the warrant has no `shutOut` (so there is no door to ask at and nobody to ask), do not return: fall through to `warrant.tries += 1` and the three-tries branch below, with the reason for the report changed. Add a constant beside `WILL_NOT_STAND`, for example `NO_WAY_TO_THEM = 'I can see them and cannot get to them'`, and use it as the `why` of the `cannot` outcome when the last reason was `no_way`.
2. Keep `warrant.toldAt = null` only when a shut-out was noted. Someone it cannot reach does not need telling again every round.
3. The rest after three tries (`REST_DS`, 30 seconds) then paces it, and the Head of Security and the Captain hear once that it cannot get to them.
4. If fire doors are what is in the way, the driver's own step for a pulled alarm (`reset_alarm` in `nextStep`, `driver.ts`) is what opens them. Nothing more is needed here.

What must keep working: someone in another room behind a locked door still starts the let-in steps. Someone who steps out of sight is still "lost".

## How to test the fix

- Type check and lint.
- Simulator: a suspect in the officer's own room whose `arrest` always answers `ok: false, reason: 'no_way', place: <the officer's room>`. Check that after three tries one "I cannot bring in X: I can see them and cannot get to them." reaches the Head of Security, that the arrest line is said once and not before every try, and that the fourth try comes about 30 seconds after the third.
- Do this together with ARR-01, and run `fight`, `warrant` and the shut-out scenario again.
