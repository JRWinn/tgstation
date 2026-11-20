---
id: SEC-12
title: A prisoner who steps out of the cell behind the officer, in plain sight and in its cuffs, is reported to the Head of Security as lost
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1200, code/modules/llm_crew/crew_npc_security.dm:1199, code/modules/llm_crew/crew_npc_security.dm:1125
fix: In beatAfterActing for jail, push the lost outcome only when got_away comes without a handle, and set lastSeen from details.place
---

## What is wrong

See also: TRB-07 (a crew prisoner freed early by the arrest grace walks out the same way; that file names the wrong "lost" message as a symptom but its fix is the grace). This finding is the message itself, which is wrong whoever walks out.

In `put_in_cell` the officer lets go of the prisoner at the back of the cell and steps out to the timer. A player prisoner in cuffs is not held any more and can walk; cuffs do not stop walking. If they follow the officer out before the timer is started, `put_in_cell` answers "X walked out of Cell 1 before you could shut it", reason `got_away`, and `got_away_details` adds `handle` and `place` because they are in sight, often one tile away.

The window does not look at those. On `got_away` it always pushes a `lost` outcome, and sets `lastSeen` to where the officer stands. So the Head of Security is told "I lost Dana Reyes in the Brig", passes it to the Captain, and the desk drops her from "in cuffs" back to "wanted". A second later the officer, which can see her in its own cuffs (`seen.cuffed && warrant.cuffedByMe`), takes her by the arm again and jails her, and the Captain is told she is jailed. Two false-then-true messages for one step out of a door.

The same happens on the third `got_away` path, "got out of Cell 1 as the door shut", and when the hold slips in the doorway, both of which come with the person usually still in view.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1199`, `put_in_cell`:

    if(QDELETED(prisoner) || !(get_turf(prisoner) in cell.turfs))
        log_game("... had [prisoner_name] walk out of [cell.name] before the timer was started.")
        return list(FALSE, "[prisoner_name] walked out of [cell.name] before you could shut it.", got_away_details(prisoner, prisoner_name))

`:1125`, `got_away_details`, which already says whether they are in sight:

    if(!QDELETED(prisoner) && !QDELETED(body) && (prisoner in view(CREW_NPC_VISION_RANGE, body)))
        details["place"] = get_area_name(prisoner, TRUE)
        details["handle"] = handle_for(prisoner)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1200`, `beatAfterActing`, `jail` branch:

    // Got away on the walk, or was never in its hold. It looks for them again from here.
    warrant.toldAt = null;
    warrant.lastSeen = { place: brain.location, at: brain.now };
    warrant.lookedAt = null;
    if (reason === 'got_away') {
      beat.outcomes.push({
        what: 'lost',
        name: warrant.name,
        place: brain.location,
      });
    }

## How it was found

Read from the code on both sides. Not seen in a round: the prisoners so far were Pun Pun, who stays put in cuffs, and no player has been jailed.

## How to fix it

1. In the `jail` branch of `beatAfterActing`, when `reason === 'got_away'` and `details.handle` is a string, do not push `lost`. Set `lastSeen` to `{ place: String(details.place ?? brain.location), at: brain.now }` and leave `lookedAt` as it is. The next plan sees them, in its cuffs, and takes hold again (`serveStep`, "In its own cuffs and got loose of its hold").
2. When `details.handle` is absent, keep today's `lost` outcome, but with `details.place` if the server sent it (today it sends the officer's own room in that case, which is what `brain.location` already is).
3. Do not clear `warrant.toldAt` when they are in sight: the arrest line was said already, and saying it again to someone in its own cuffs is wrong. Today `serveStep` happens to take hold before it reaches the line, so this is only for safety.

## How to test the fix

- `tools/llm_crew/security.ts`: a case for `beatAfterActing` with `act.tool = 'jail'`, `ok = false`, `details = { reason: 'got_away', handle: 'p3', place: 'Brig' }`: no `lost` outcome, `lastSeen.place` is `Brig`. A second case without `handle`: `lost` is pushed.
- Window type check.
- In a round, as a player arrested by an officer: once let go in the cell, step out behind the officer. `pda.log` must not show "I lost" for you; `game.log` shows the officer taking hold again.
