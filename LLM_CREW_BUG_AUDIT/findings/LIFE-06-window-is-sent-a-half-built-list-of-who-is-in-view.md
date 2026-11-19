---
id: LIFE-06
title: The window is sent, and acts on, a list of who is in view that is only half rebuilt, each time someone new comes into sight
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:187, code/modules/llm_crew/crew_npc_senses.dm:98, code/controllers/subsystem/tgui.dm:218, code/modules/tgui/tgui.dm:310, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1413
fix: In look_around build people_in_view in a local list, assign it once the loop is done, and emit the comes-into-view events after that
---

## What is wrong

`look_around` empties `people_in_view` and then fills it again one person at a time. In the same loop, for each person who was not in view a moment ago, it calls `emit_sense`. `emit_sense` calls `brain_link.on_sense_event`, which calls `SStgui.update_uis`. That is not queued: `update_uis` runs `/datum/tgui/process` with force, which calls `ui_interact` → `send_update` → `get_payload` → `ui_data` there and then, and sends the result to the window.

So the window is sent `people_in_view` as it stands in the middle of the loop: everyone the loop has reached so far, and nobody after. The window takes each update in as it comes and drives every body on it (`ingest`, `syncTasks`, `drive`; HOLE-09 describes the cost of that). A decision made on that update is made on a list with people missing from it. The next update, a moment later, has them all again, but a tool sent on the half list has been sent.

Most window code that reads `peopleInView` asks "is this person here", and a person missing for one update is only a step delayed. Some of it asks "is nobody of that kind here", and that acts wrongly:

- `jobs/cargo.ts:1413`, who answers a knock at a door: with nobody named, a technician goes if no cargo worker with a name that sorts before its own is in view. Two technicians at the post, one comes into view of the other just as a third person does: the half list can leave the other technician out, and both go to the door.

(The list is never empty in the half state: the newcomer is added before its event is sent. So the checks for nobody at all in view, `brain.ts:854` and `:1359`, are not hit by this.)

The same half state goes out for everything the loop changes before it: `things_in_view`, `cleanable_messes` and the rest are already built when the first event fires, so they are whole. It is only `people_in_view`, built in the same loop as the events, that goes out half done.

One concrete case. Two cargo technicians stand at the counter of the Cargo Bay. A janitor knocks at the Warehouse door from outside. At the same second the Quartermaster and a crew member walk into view of technician B, in that order of `oview`. The loop reaches the Quartermaster, who is new: `emit_sense` sends B's state with `people_in_view` holding only the Quartermaster. Technician A, standing by B, was already in view but comes later in the list, so is not in it yet. B's window reads "no cargo worker before me by name in view" and sends B to the door. A's window, a whole list in hand, also sends A. Both go to one door.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:187`, in `look_around`:

    	people_in_view = list()
    	for(var/mob/living/carbon/human/person in in_sight)
    		...
    		people_in_view += list(list("handle" = handle_for(person), "name" = person.name, ...))
    		var/already_in_view = recently_saw(person)
    		last_seen_at[person_key(person)] = world.time
    		if(already_in_view)
    			continue
    		...
    		emit_sense(CREW_SENSE_PERSON_IN_VIEW, text, list(

`code/modules/llm_crew/crew_npc_senses.dm:98`, in `emit_sense`:

    	brain_link?.on_sense_event(src)

`code/controllers/subsystem/tgui.dm:226` (base), sent there and then:

    			INVOKE_ASYNC(ui, TYPE_PROC_REF(/datum/tgui, process), wait * 0.1, TRUE)

(`INVOKE_ASYNC` only goes async at a sleep, and `process` → `ui_interact` → `send_update` does not sleep, so the payload is built and sent before `emit_sense` returns.)

## How it was found

Read from the code, following `emit_sense` into the base tgui procs. Not seen in a round; the half list lasts only until the next update.

## How to fix it

1. In `look_around`, build the list in a local `var/list/now_in_view = list()`, and gather the newcomers into a second local list of `(text, details)` pairs instead of calling `emit_sense` in the loop.
2. After the loop: `people_in_view = now_in_view`, then the `last_seen_at` clean-up, then `emit_sense` for each newcomer in turn.
3. Nothing else changes: the events say the same, in the same order, and each update the window gets now has the whole list.

The same rule is worth keeping elsewhere: anything that calls `emit_sense` while it is part way through changing what `ui_data` reads sends the window a half state. `look_around` is the one place found where that happens.

## How to test the fix

- Compile.
- Simulator: `sim.ts` builds its own state, so it cannot show this. A check there could still guard the rule by having the fake server send people in view only whole.
- In a round: two technicians at the counter and a knock with two people walking in at once; only one technician should go to the door.
