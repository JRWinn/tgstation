---
id: SENSE-11
title: Once emergency maintenance access is on, or the AI opens a door's emergency access, everyone belongs in every post that has such a door, and no stranger is ever questioned there
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
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

One concrete case. A meteor shower; the Head of Security and the Captain swipe for emergency maintenance access. The Cargo Bay's maintenance airlock stands on a maintenance tile. From then on, every look of the two technicians gives `belongs: true` for each assistant who wanders in through maintenance. They are never questioned. If one had already been asked, `syncGuarding` sees `seen.belongs` and deletes their record ("they are gone, and so is the matter").

It outlasts the emergency. `syncGuarding` adds every person seen with `belongs` to `brain.workmates` (`guarding.ts:347`), and nothing ever takes a name out of that set. So each assistant seen in the bay while the doors were open is a workmate for the rest of the round: when they later ask a stranger "what are you doing in here?", the technician stands back and leaves it to them (`handledBy`), and a stranger who says one of them sent for them is taken at that workmate's word.

(Confidence is "likely" and not "sure" because whether a given post's maintenance door stands on the maintenance tile or the room's tile depends on the map; on a map where it stands on the room's own tile, that door is not set by the keycard and this case needs the AI's per-door toggle.)

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
2a. In `syncGuarding`, only add a person to `workmates` when they also share the body's department by the job on their card (or keep the set but drop a name the moment the person is seen with `belongs` false). Otherwise any one wrong `belongs` lasts the round.
3. Note CHEAT-10, which asks whether reading a card's access is fair at all. If the owner takes CHEAT-10's fix (going by the job on the card), this finding goes with it; if not, this one-line change is still wanted.

## How to test the fix

- Compile.
- In a round, set `emergency = TRUE` on the post's maintenance door (or swipe for emergency access), and walk an assistant into the Cargo Bay: `people_in_view` in the window should show `belongs: false`, and the technician should ask them their business.
