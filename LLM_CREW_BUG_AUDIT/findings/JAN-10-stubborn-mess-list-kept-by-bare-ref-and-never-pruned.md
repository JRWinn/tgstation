---
id: JAN-10
title: Messes given up on are kept by their bare ref for the whole round, so a new mess that is given a dead one's ref is passed over unseen
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:526, code/modules/llm_crew/crew_npc_cleaning.dm:393, code/modules/llm_crew/crew_npc_hands.dm:412, code/modules/llm_crew/crew_npc_controller.dm:206, code/modules/llm_crew/crew_npc_cleaning.dm:268
fix: Keep stubborn_messes as REF to WEAKREF and treat an entry as live only while the weakref resolves to the same mess, and drop dead entries in remember_messes
---

## What is wrong

`stubborn_messes` is a list of `REF(mess) = TRUE`. Nothing takes an entry out except `mind_what_it_holds`, which clears the whole list when the kind of tool the body holds changes. A janitor that keeps its mop all round keeps every entry all round, long after those messes were cleaned by someone else, swept up by a cleanbot, or merged into another decal.

A `REF` is BYOND's text id for the object, like `[0x2003a1f]`. Once an object is really deleted (after the garbage queue), its id is free and BYOND hands it to the next object made. Decals are made and deleted all the time (footprints, blood drips, dirt from walking). So a new mess can come into being with the id of one in `stubborn_messes`, and every check made by id then takes the new mess for the old one:

- `messes_to_clean`: `!stubborn_messes[REF(mess)]` leaves it out of what is cleaned in sight;
- `remembered_mess_in` and `workable_mess_places`: `stubborn_messes[key]` leaves it out of the rooms worth going to;
- `beyond_kinds_here` reports its kind as beyond the body if it is of a kind the tool cannot shift.

`remembered_messes` has the same shape but heals itself: its entries hold a weak reference, and a dead one is dropped when its spot is next in sight. `stubborn_messes` holds no weak reference and is never checked.

Concrete case: at 10 minutes a janitor with a mop writes off a pool of oil it could not walk to (HAND-02 is one way in) as stubborn. At 20 minutes another janitor cleans that oil up; it is deleted and, a few minutes on, hard-deleted. At 30 minutes someone is sick in the Bar, and the vomit decal is given the oil's old id. The first janitor walks into the Bar with a wet mop and does not clean the vomit: `stubborn_messes["[0x...]"]` is TRUE. It reports the Bar done.

How likely this is in one round was not measured: it needs a freed id to be reused by a decal that the same janitor then meets. With hundreds of decals made and freed in a round, and the list never cleared, it is not rare over a long round.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:526`, in `clean_mess`:

    	stubborn_messes[REF(mess)] = TRUE

`code/modules/llm_crew/crew_npc_hands.dm:412`, in `crew_npc_fail_errand`:

    	if(istype(target, /obj/effect/decal/cleanable))
    		crew_controller.stubborn_messes[REF(target)] = TRUE

`code/modules/llm_crew/crew_npc_cleaning.dm:393`, in `messes_to_clean`, the lookup by id alone:

    		if(get_area(mess) == here && (tool_for_mess(mess) || (dry && can_clean_mess(dry, mess))) && !stubborn_messes[REF(mess)])

`code/modules/llm_crew/crew_npc_cleaning.dm:268`, the only clearing, `mind_what_it_holds`:

    	if(stubborn_with)
    		stubborn_messes = list()
    		stubborn_kinds = list()

## How it was found

Read from the code. That BYOND reuses the text ref of a deleted object is how the engine works (the weak reference code in `code/datums/weakrefs.dm` exists for that reason: `resolve()` checks `D.weak_reference == src`). Not seen in a round.

## How to fix it

1. Make `stubborn_messes` map `REF(mess)` to `WEAKREF(mess)`, in both places that write it.
2. Add `is_stubborn(obj/effect/decal/cleanable/mess)`: TRUE only if `stubborn_messes[REF(mess)]?.resolve() == mess`. Use it in `messes_to_clean`, `remembered_mess_in` and `workable_mess_places` in place of the bare lookups. Those two read it by `key` from `remembered_messes`: resolve the mess first, then call `is_stubborn`.
3. In `remember_messes`, where a remembered mess is found gone, also `stubborn_messes -= key`.
4. The same pattern is in `tidy_skipped` and `fire_alarms_failed`, but those lapse after a few minutes, so a wrong match there does little harm. Leave them unless it is cheap to change.

## How to test the fix

- Server compile to a side copy.
- No round test can force an id to be reused. Check by reading: every read of `stubborn_messes` goes through `is_stubborn`.
