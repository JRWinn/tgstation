---
id: SENSE-11
title: Once emergency maintenance access is on, or the AI opens a door's emergency access, everyone belongs in every post that has such a door, and no stranger is ever questioned there
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_guarding.dm:24, code/game/machinery/doors/door.dm:330, code/modules/security_levels/keycard_authentication.dm:168, code/modules/llm_crew/crew_npc_doors.dm:248
fix: In belongs_in_post test the person's access against the door's own requirements (check_access_list on their access) instead of door.allowed, so an emergency-open door is not taken for a right to be there
---

## What is wrong

`belongs_in_post` says a person has a right to be in the body's post if any door into it opens for them, and it asks the door with `door.allowed(person)`. For every door, `allowed` is:

    /obj/machinery/door/allowed(mob/accessor)
    	return ..() || emergency

So a door with emergency access on opens for everyone, and `belongs_in_post` returns TRUE for everyone. Emergency access is on:

- for **every airlock in maintenance** once two heads swipe for "emergency maintenance access" at the keycard devices (`make_maint_all_access` sets `airlock.emergency = TRUE` on each airlock standing in a maintenance area), and it stays on until revoked;
- for **any one door** the AI or a silicon toggles to emergency access from its door panel.

`post_doors` takes the doors of the post from `crew_npc_doors_of`, which counts a door standing "on the last tile of the room, or on the first tile outside it". A maintenance hatch into a post that stands on the maintenance side is in a maintenance area, and is in the list. While its emergency access is on, every person in view in the post is `belongs: true`: the window adds them to `workmates`, never makes them a stranger, never asks them their business, and `why_not_put_out` refuses to walk anyone out ("has every right to be in ..."). The keeper's post is open to all for as long as the emergency lasts, though nobody has been given any right to be there.

A player keeping the room sees that the maintenance doors are open to anyone, and still asks an assistant standing at the cargo counter what they want. Being able to walk in is not the same as having business there.

The same `allowed` call is used for the body's own way in and out (`locked_out_of`), where the door opening for it is what matters, so that use is right. Only "has a right to be here" is wrong.

One concrete case, on MetaStation. A meteor shower; the Head of Security and the Captain swipe for emergency maintenance access. The Security Office's "Security Maintenance" airlock stands on a maintenance tile (checked in `MetaStation.dmm`), and the Security Office is the officer's post (`crew_npc_security.dm`). From then on, every look of the officer gives `belongs: true` for each assistant who wanders in through maintenance. (The write-up first gave the Cargo Bay here; on MetaStation no maintenance-area airlock opens into the supply console's room, so the cargo case needs another map or the AI's per-door toggle.) They are never questioned. If one had already been asked, `syncGuarding` sees `seen.belongs` and deletes their record ("they are gone, and so is the matter").

It outlasts the emergency. `syncGuarding` adds every person seen with `belongs` to `brain.workmates` (`guarding.ts:347`), and nothing ever takes a name out of that set. So each assistant seen in the bay while the doors were open is a workmate for the rest of the round: when they later ask a stranger "what are you doing in here?", the technician stands back and leaves it to them (`handledBy`), and a stranger who says one of them sent for them is taken at that workmate's word.

(Which posts are hit by the keycard depends on the map: only a door standing on a maintenance tile is set. On MetaStation that is the Security Office; the AI's per-door toggle can do it to any post on any map.)

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:24`, `belongs_in_post`:

    	for(var/datum/weakref/door_ref as anything in post_doors())
    		var/obj/machinery/door/airlock/door = door_ref.resolve()
    		...
    		if(door.allowed(person))
    			return TRUE

`code/game/machinery/doors/door.dm:330` (base):

    /obj/machinery/door/allowed(mob/accessor)
    	return ..() || emergency

`code/modules/security_levels/keycard_authentication.dm:168` (base), `make_maint_all_access`:

    	for(var/area/station/maintenance/area in GLOB.areas)
    		...
    				for(var/obj/machinery/door/airlock/airlock in area_turf)
    					airlock.emergency = TRUE

## How it was found

Read from the code and the base procs. Not seen in a round; the maps were not checked for which side each post's maintenance door stands on.

## How to fix it

1. In `belongs_in_post`, ask whether the person's own access meets the door's requirement, not whether the door would open: `door.check_access_list(person.get_access())`. That is the same as `allowed` without the emergency and silicon exceptions. A door with no requirement at all (`!length(req_access) && !length(req_one_access)`) still passes, as now.
2. Leave `locked_out_of` and the door tool on `allowed`: there the question is whether the door opens.
2a. In `syncGuarding` (`guarding.ts`), drop a name from `brain.workmates` the moment that person is seen in view with `belongs` false. Otherwise any one wrong `belongs` lasts the round. Do not narrow `workmates` to the body's own department instead: today a head of staff with access to the room is a workmate too, and that would change who the body stands back for, which is the owner's call.
3. Note CHEAT-10, which asks whether reading a card's access is fair at all. If the owner takes CHEAT-10's fix (going by the job on the card), this finding goes with it; if not, this one-line change is still wanted.

## How to test the fix

- Compile.
- In a round on MetaStation, spawn the test crew with a security officer, then set `emergency = TRUE` on the "Security Maintenance" airlock with View Variables (or have two heads swipe for emergency maintenance access), and walk an assistant into the Security Office from maintenance: `people_in_view` in the window should show `belongs: false` for them, and the officer should ask their business. A security officer walking in should still show `belongs: true`.
- Turn emergency access off again: the assistant, if seen with `belongs: false` while it was on, must not be in `workmates` (check in the Crew Brain window's state, or that the officer still questions them).

## Check

Checked by Opus 5.5. The quotes match the code today. `belongs_in_post` (`crew_npc_guarding.dm:24`) asks `door.allowed(person)`; `/obj/machinery/door/allowed` (`door.dm:330`) is `..() || emergency`, and no airlock subtype but the cult door overrides it, so emergency access opens every airlock to everyone. `make_maint_all_access` (`keycard_authentication.dm:168`) sets `emergency` on every airlock standing in a `/area/station/maintenance` area. `crew_npc_doors_of` (`crew_npc_doors.dm:241`) takes a door on the first tile outside the room when its far side is an open `/area/station` tile, which maintenance is. `people_in_view` (`crew_npc_senses.dm:191`) sends `belongs` from `belongs_in_post`; `why_not_put_out` refuses on it; `syncGuarding` (`guarding.ts:347`) adds every `belongs` name to `workmates` and nothing removes one; `guardOverhears` (`guarding.ts:810`) stands back for a workmate. I parsed `MetaStation.dmm` with a throwaway bun script for maintenance-area airlocks next to a non-maintenance room: the Security Office's "Security Maintenance" door is one, so the officer's post is hit on the main map; no cargo console room is. Confidence raised to sure for that reason and the concrete case moved there. Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose this. The fix is sound: `check_access_list(person.get_access())` is the part of the base `allowed` that reads the card, without the emergency and silicon exceptions, and a door with no requirement still passes; the door-opening uses of `allowed` should stay. Not run in game.
