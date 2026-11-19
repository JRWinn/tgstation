---
id: PERF-06
title: A body's mess memory stops taking new messes at 300 and keeps the dead ones for good, so after a tour of maintenance it never notes a new mess, and every look searches its sight once for each dead one
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_cleaning.dm:240, code/modules/llm_crew/_defines.dm:44, code/modules/llm_crew/crew_npc_cargo.dm:628, code/modules/llm_crew/crew_brain_link.dm:108
fix: Drop the dead entries in a cheap pass, make room at the cap by forgetting the oldest entry outside the work area, and test sight with a turf set built once per look
---

## What is wrong

`remember_messes` runs on every look, every second, for every body, whatever its job. It keeps each mess it sees in `remembered_messes`, keyed by REF, up to `CREW_NPC_MESSES_REMEMBERED` (300). An entry goes only when the body is looking at the mess's spot and the mess is not there.

Two things follow.

**1. At 300 it stops noting new messes, for good.** The first loop skips every new mess once the list is full (`length(remembered_messes) >= CREW_NPC_MESSES_REMEMBERED` → `continue`). Nothing makes room. Entries leave only when the body sees their spot again, so messes in tunnels it has walked once, and messes someone else has since cleaned in rooms it does not go back to, hold their places for the rest of the round. MetaStation has 567 messes placed in its map alone (counted in `_maps/map_files/MetaStation/MetaStation.dmm`: 172 in maintenance, 79 in security, 78 in service, 59 in commons, 50 in cargo), before any made during the round. Exploring is what every body does when it has nothing else to do.

Once full, a new mess is still seen while it is in view (`cleanable_messes` is worked out from sight), but it never goes into memory, and memory is what the work reads: `mess_places` and `workable_mess_places` (where a janitor goes next), `work_area_messes` (what makes cargo and the others call a janitor, see `crew_npc_cargo.dm:628`), `remembers_mess_in` (whether a technician opens the door for a janitor), `remembered_mess_in`. So a technician that has once walked the tunnels, and then finds oil in its own bay, has no mess in `work_area_messes` and calls nobody.

**2. Each look searches its whole sight once for every dead entry.** The second loop resolves all 300 entries each second, and for every one whose mess is gone or moved and whose spot is not underfoot it does `(spot in in_sight)`, a linear search of everything `oview(7)` returned (up to 224 tiles and all that is on them, several hundred items in a furnished room). Dead entries only build up over a round (every mess anyone cleans that this body once saw), so this grows towards 300 searches of a few hundred items a look, every second, for every body. At forty crew that is of the order of millions of list comparisons a second. On top of that `ui_data` walks the same 300 entries five times for every body on every update (`beyond_kinds_here`, `mess_places`, `workable_mess_places`, `work_area_messes`, and `could_shift` inside two of them), PERF-02.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:240`, `remember_messes`:

    	for(var/obj/effect/decal/cleanable/mess in in_sight)
    		var/key = REF(mess)
    		if(remembered_messes[key] || length(remembered_messes) >= CREW_NPC_MESSES_REMEMBERED)
    			continue
    		var/turf/spot = get_turf(mess)
    		remembered_messes[key] = list(WEAKREF(mess), get_area_name(spot, TRUE), spot)

    	for(var/key in remembered_messes)
    		var/list/memory = remembered_messes[key]
    		var/datum/weakref/mess_ref = memory[1]
    		var/turf/spot = memory[3]
    		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
    		if(!QDELETED(mess) && get_turf(mess) == spot)
    			continue
    		if(spot == here || (spot in in_sight))
    			remembered_messes -= key

`code/modules/llm_crew/_defines.dm:44`: `#define CREW_NPC_MESSES_REMEMBERED 300`.

No other line in `code/modules/llm_crew/` removes from `remembered_messes` (grep).

## How it was found

Read from the code; the map's messes counted with a throwaway script over the `.dmm` (keys whose definition holds `/obj/effect/decal/cleanable`, counted over the grid by area). Whether a body reaches 300 in a played round is not logged anywhere, so that part is `likely`, not seen.

## How to fix it

1. **Forget what is known to be gone without having to look.** A mess that has been deleted is not a mess anyone could find again. The body does not see it go, so keep the rule that it is struck off only when its spot is in sight, but stop paying for the dead ones every second: in the second loop, test sight against a set, not the list. Build `var/list/seen_turfs = list()` once at the top of `remember_messes` from `in_sight` (`for(var/turf/T in in_sight) seen_turfs[T] = TRUE`) and use `seen_turfs[spot]`.
2. **Make room at the cap.** Keep a `world.time` in each entry (a fourth field: when it was last seen there). When the list is full and a new mess is in sight, drop the entry seen longest ago whose room is not in `work_area` or `look_in_rooms`, and take the new one. A mess in the body's own rooms is never pushed out by one in a tunnel.
3. **Optional, for forty:** keep at most, say, 15 entries a room (the window only ever uses which rooms have messes, and `CREW_NPC_MESSES_NAMED` is 3), which caps memory by the rooms the body knows rather than by what it has walked past.
4. Keep the existing rule that a mess is forgotten only when its spot is seen without it: that is the senses rule, and JAN-13 depends on it.

## How to test the fix

- Server compile.
- Add a debug line on the 300th entry: `log_game("Crew NPC [key_name(body)] mess memory full")`, and play a round with exploring on. Without the fix the line comes and new messes in its rooms stop reaching `work_area_messes`; with it, a mess put down in the bay (admin spawn of `/obj/effect/decal/cleanable/oil`) still makes a technician call a janitor.
- The simulator keeps its own mess memory (`seenMesses` in `sim.ts`), so it does not test this.
