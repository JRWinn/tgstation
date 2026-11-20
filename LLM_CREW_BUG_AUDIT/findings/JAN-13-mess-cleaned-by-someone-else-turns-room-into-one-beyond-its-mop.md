---
id: JAN-13
title: A mess someone else cleaned up, out of the janitor's sight, makes the room one its mop will not shift, and the room is left unvisited with the old mess still on its list
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 37e8f4240e8
found_by: Opus 5.5
checked_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:328, code/modules/llm_crew/crew_npc_cleaning.dm:366, code/modules/llm_crew/crew_npc_cleaning.dm:240, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:432, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:493
fix: Make workable_mess_places judge a remembered mess by what was seen of it (its kind, kept in the memory entry), not by whether it still exists, and let the body walk to the spot of a remembered mess that no longer resolves so it can look
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
4. The walk then happens: the janitor goes to the Bar, sees the spot clean, `remember_messes` drops the entry, the room leaves both lists, and the task is finished as "seen clean" by the existing code. But only if the spot comes into view. `remember_messes` forgets an entry only when its turf is in `view(7)` or underfoot, and in the room `tool_clean` walks only to a live mess (`messes_to_clean`, then `remembered_mess_in`, which can return no deleted mess). In a big room, or with the spot round a corner, the body would stand in the room, `tool_clean` would answer "There is no mess here...", the room would stay in both lists, and the window would send `clean` again: a loop in place of the stall. So `remembered_mess_in` (or `tool_clean`) must also give the spot of a remembered mess that no longer resolves, `memory[3]`, as somewhere to walk to and look, and drop the entry if the body gets there and cannot see it. A walk errand to a turf, as the cleaning errands already make for a bucket in hand (`start_errand(get_turf(body), ...)`), will do.
5. Simplest form, if the owner does not want the kind stored: in `workable_mess_places` change the test to `if(!QDELETED(mess) && tool && !could_shift(mess))`, so a mess not seen to go keeps its room workable, plus step 4's walk to the spot. A room whose only mess was one the tool could not shift and which someone else cleaned then costs one walk to look, which is what a player would do.
6. This also takes the knowledge leak out: the body no longer knows a far-off mess is gone.

## How to test the fix

- Server compile to a side copy; type check is not needed if the brain side is not touched.
- Simulator: if a scenario has two janitors and one mess, run it and check the second janitor does not block the room `BEYOND` (look at the task list in the output).
- In a round: let one janitor see a mess, have another clean it out of the first's sight. The first should walk there, look, and drop the room, not report it beyond its mop.
- Also in a round: the same, with the mess at the far end of a big room from the door (more than 7 tiles). The janitor should walk to the spot, not stand at the door and try `clean` again and again.

## Check

Checked by Opus 5.5. Read `remember_messes`, `workable_mess_places`, `mess_places`, `remembered_mess_in`, `beyond_kinds_here`, `could_shift`, `tool_clean` and `more_to_clean` in `crew_npc_cleaning.dm`, the two lists as sent in `crew_brain_link.dm`, and in `jobs/janitor.ts` the building of `messy`, `workable`, `beyondIt`, the "I cannot shift" message and `blockTask(... BEYOND)`. Searched the change log and plans: `LLM_CREW_PLAN_ROUND_0912.md` names `workable_mess_places` only for the room staying listed while another mess is remembered; nothing on deleted messes.

The fault stands as written. `workable_mess_places` drops a QDELETED entry; `mess_places` keeps it, because `remember_messes` keeps the entry until the spot is seen. The window takes "messy and not workable" as beyond the tool and blocks the task, so the body does not go to look, so the entry is never cleared. Other janitors (the standing crew has two), cleanbots and players all delete messes out of a body's sight, so this comes up; medium is right. The senses leak is real too, and `work_area_messes` (`crew_npc_cargo.dm`) and `remembers_mess_in` (`crew_npc_doors.dm`) read QDELETED the same way, which may be wanted there (those say what is still there to report) but is worth a look at the same time.

The fix as first written would not finish the job: once the room is workable again, the body has to be able to walk to the spot, and today nothing walks to a remembered mess that no longer resolves. Step 4 now says so, step 5 gives the smallest form, and effort is raised to medium (the stored kind, the split `can_clean_mess`, three readers, and a walk to a turf). DESK-08 (a janitor told of a mess in a room bigger than it can see) is the same blind spot from the other side; whoever builds the walk to a remembered spot should look at both.

## Fix so far

Built on branch `m-janitor` in the smallest form (step 5 plus step 4's walk), server compile only, not played. `workable_mess_places` no longer drops a remembered mess the body has not seen go: only a live mess its tool cannot shift keeps a room out. In the room, when `tool_clean` finds no mess in sight and none remembered still there, `gone_mess_in` gives the nearest remembered spot whose mess is no longer on it, and the body is sent there on a cleaning errand to that turf (errand item `CREW_NPC_LOOK_FOR_MESS` plus the key). On arrival `look_at_mess_spot` looks (`remember_messes`), forgets that entry, and goes on to any mess now in sight; if nothing, the brain is told "The mess you remembered here is gone." If it set off once and did not get there, the next `clean` forgets the entry (`looked_for_messes`) instead of walking again, so it cannot loop.

Not done: storing the mess's kind (steps 1 to 3), so a room whose only remembered mess was one the tool could not shift, cleaned by someone else, now costs one walk to look. `remembered_mess_in` and `beyond_kinds_here` still skip a deleted mess (they name or walk to live ones only). `work_area_messes` and `remembers_mess_in` in other files were not looked at.
