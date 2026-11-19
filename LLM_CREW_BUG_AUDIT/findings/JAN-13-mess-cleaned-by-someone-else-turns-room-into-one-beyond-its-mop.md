---
id: JAN-13
title: A mess someone else cleaned up, out of the janitor's sight, makes the room one its mop will not shift, and the room is left unvisited with the old mess still on its list
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:328, code/modules/llm_crew/crew_npc_cleaning.dm:366, code/modules/llm_crew/crew_npc_cleaning.dm:240, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:432, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:493
fix: Make workable_mess_places judge a remembered mess by what was seen of it (its kind, kept in the memory entry), not by whether it still exists, so it agrees with mess_places until the body has looked
---

## What is wrong

The server sends the brain two lists of rooms. `mess_places` is every room where the body remembers a mess. `workable_mess_places` is meant to be those of them where what it holds would shift something. The brain takes a room that is in the first and not in the second as one that is beyond its tool (`beyondIt` in `jobs/janitor.ts`), blocks the task `BEYOND` with `blockedWith` set to its tool, and does not go there.

But the two lists differ for a second reason. `workable_mess_places` skips a remembered mess that is `QDELETED`, that is, one that no longer exists anywhere. `mess_places` does not look (rightly: the body has not seen it go, and "a mess is only forgotten once the body is looking at the spot", `remember_messes`). So a room whose remembered messes were all cleaned by another janitor, a cleanbot or a player, out of this body's sight, is in `mess_places` and not in `workable_mess_places`: the brain takes it as beyond its mop.

Then it stays that way. The task is blocked, so the body does not go to look; not looking, the memory is not cleared; not cleared, `mess_places` keeps the room. It heals only if the body happens to pass with the old spot in view, or sees a new mess in that room.

It is also a small break of the senses rule: `workable_mess_places` knows a mess across the station is gone without the body seeing it go. `remembered_mess_in` does the same for messes in the body's own room but out of sight.

Concrete case: the standing test crew has more than one janitor. Janitor A, passing the Bar door, sees vomit by the far counter and remembers it (`remembered_messes`, room "Bar"). Janitor B cleans it. A, in the hallway, still has the Bar in `mess_places`. `workable_mess_places`: the one entry's weak reference resolves to null, `QDELETED(null)` is TRUE, skipped, so the Bar is not workable. In `jobs/janitor.ts`, `beyondIt = !!brain.cleaningTool && messy.has("Bar") && !workable.has("Bar")` is TRUE; the Bar task is blocked `BEYOND` with `blockedWith = "mop"`. A never goes back to the Bar for it. If A had been called there by someone (`source: 'told'`) and is in the Bar but cannot see the spot, it sends the caller "I cannot shift the mess in the Bar with my mop." The mess was gone.

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:328`, `workable_mess_places`:

    		var/datum/weakref/mess_ref = memory[1]
    		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
    		if(QDELETED(mess) || (tool && !could_shift(mess)))
    			continue
    		places += memory[2]

`code/modules/llm_crew/crew_npc_cleaning.dm:366`, `mess_places`, which does not:

    	for(var/key in remembered_messes)
    		var/list/memory = remembered_messes[key]
    		var/place = memory[2]
    		...
    		places += place

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:432`:

    const workable = new Set(brain.workablePlaces);
    ...
      const beyondIt =
        !!brain.cleaningTool &&
        messy.has(task.place) &&
        !workable.has(task.place);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:493`:

    blockTask(task, noWayIn ? NO_WAY_IN : beyondIt ? BEYOND : null);
    task.blockedWith = beyondIt ? brain.cleaningTool : undefined;

## How it was found

Read from the code, both sides. Not seen in a round. How often it bites depends on how often two cleaners work the same rooms, which they do with the standing test crew's janitors.

## How to fix it

1. When `remember_messes` stores a mess, store what the body saw of it as well: `list(WEAKREF(mess), place, spot, mess.type, mess.clean_type, mess.is_mopped, format_text(mess.name))`. Every reader of `memory[1..3]` keeps working.
2. Split `can_clean_mess` so it can be asked of the stored kind (`clean_type`, `is_mopped`) as well as of a live mess, and use that in `could_shift` when the mess no longer resolves.
3. In `workable_mess_places` (and `remembered_mess_in`, and `beyond_kinds_here`, which reads `mess.name`), do not skip a mess because it is `QDELETED`. Judge it by the stored kind. The room stays workable until the body has looked at the spot and `remember_messes` has forgotten it, which is what `mess_places` already says.
4. The walk then happens: the janitor goes to the Bar, sees the spot clean, `remember_messes` drops the entry, the room leaves both lists, and the task is finished as "seen clean" by the existing code.
5. This also takes the knowledge leak out: the body no longer knows a far-off mess is gone.

## How to test the fix

- Server compile to a side copy; type check is not needed if the brain side is not touched.
- Simulator: if a scenario has two janitors and one mess, run it and check the second janitor does not block the room `BEYOND` (look at the task list in the output).
- In a round: let one janitor see a mess, have another clean it out of the first's sight. The first should walk there, look, and drop the room, not report it beyond its mop.
