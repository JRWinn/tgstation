---
id: SENSE-06
title: A body that knows a banana peel, soap or foam lies ahead slows to a walk and steps on it anyway, and walking does not stop those from slipping anyone
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_senses.dm:70, code/modules/llm_crew/crew_npc_senses.dm:29, code/game/turfs/open/_open.dm:589, code/game/objects/items/clown_items.dm:35, code/modules/hydroponics/plant_genes.dm:292, code/game/objects/effects/effect_system/fluid_spread/effects_foam.dm:46
fix: Walk only for a slippery thing whose lube_flags hold NO_SLIP_WHEN_WALKING, and for the rest refuse the step and go round the tile (or pick the thing up), the owner to choose
---

## What is wrong

`mind_its_step` makes the body walk, not run, onto a tile where it knows something slippery lies. Its comment names the things it is for: "oil, a peel, soap, foam". But in this codebase walking only saves you from a slippery thing that carries the flag `NO_SLIP_WHEN_WALKING`. The base check, in `handle_slip`:

    if(slipper.move_intent == MOVE_INTENT_WALK && (lube & NO_SLIP_WHEN_WALKING))
    	return FALSE

Which things carry it:

- slippery motor oil (`/obj/effect/decal/cleanable/blood/oil/slippery`, `robots.dm:52`): `NO_SLIP_WHEN_WALKING | SLIDE`. Walking helps.
- fresh blood and oil splats (`blood_types.dm:401`), a mopped floor (`wet_floor.dm:92`, water only). Walking helps.
- **soap** (`clown_items.dm:35`): `AddComponent(/datum/component/slippery, 80)`, no flags. Walking does not help.
- **banana peels** (`plant_genes.dm:292`): lube flags `NONE`. Walking does not help.
- **foam** (`effects_foam.dm:46`): no flags. Walking does not help.

`crew_npc_slippery_thing` treats all of them alike: it asks only whether the thing has a slippery component. So for a peel, soap or foam, the body slows down (and the step it was about to take is thrown away, see CORE-06), then steps onto the thing at a walk and slips just as it would have at a run: knocked down for 4 to 8 seconds, in a hallway, maybe with a crate in tow. A player who sees a peel ahead steps round it or picks it up; holding the walk key past a peel is a mistake every player learns once.

The routes do not avoid the tile either: the walk is a navmap A* path that knows nothing of what lies on the floor.

One concrete case. Pun Pun drops a banana peel in the Cargo Bay doorway. A technician sees it on its next look, `remember_slippery` keeps it. Later the technician is hauling a crate out through that doorway. On the step onto the peel `mind_its_step` finds it in `slippery_seen`, sets walk and blocks the step. The next try goes ahead at a walk. The peel's `Slip` calls `victim.slip(40, peel, NONE, ...)`; `handle_slip` does not return early (no `NO_SLIP_WHEN_WALKING`) and the technician falls and lies in the doorway for four seconds, the haul stalled behind it. (Whether the fall also loses the grip on the crate was not checked.) Every crew body that has seen that peel does the same at every pass.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:29`:

    /proc/crew_npc_slippery_thing(atom/movable/thing)
    	return isturf(thing.loc) && !thing.invisibility && thing.alpha > 0 && !isnull(thing.GetComponent(/datum/component/slippery))

`code/modules/llm_crew/crew_npc_senses.dm:75` to `:83`, in `mind_its_step`:

    	var/careful = !HAS_TRAIT(body, TRAIT_NO_SLIP_WATER) && !HAS_TRAIT(body, TRAIT_NO_SLIP_ALL) && knows_slippery(new_loc)
    	...
    	body.set_move_intent(MOVE_INTENT_WALK)
    	return COMPONENT_MOVABLE_BLOCK_PRE_MOVE

`code/game/turfs/open/_open.dm:589` (base), the only place walking matters:

    		if(slipper.move_intent == MOVE_INTENT_WALK && (lube & NO_SLIP_WHEN_WALKING))
    			return FALSE

Also: `careful` is dropped for a body with `TRAIT_NO_SLIP_WATER` (galoshes). Galoshes do not help on things with `GALOSHES_DONT_HELP` (lube), but they do on soap and peels (`human_movement.dm:16`), so that part is right.

## How it was found

Read from the code and the base slip procs. Not seen in a round. `LLM_CREW_CHANGELOG.md` (the entry at about line 913) lists "Oil, a peel, soap, foam" as what the body walks for; it does not say walking does not help for three of them.

## How to fix it

1. Split the test. Add `/proc/crew_npc_walking_helps(atom/movable/thing)` that reads the thing's slippery component and returns `lube_flags & NO_SLIP_WHEN_WALKING`. In `mind_its_step`, walk (as now) only if the known slippery thing on `new_loc` is one walking helps with.
2. For one walking does not help with, the body has to keep off the tile. Two ways, for the owner to choose:
   - **Step round it.** In `mind_its_step`, refuse the step (`COMPONENT_MOVABLE_BLOCK_PRE_MOVE`) and take a side step instead onto a free tile that is next to both where it stands and where it was going, and is not itself slippery. One side step lets the path carry on from there; if no such tile exists, let it walk on and slip, as a player in a one-tile corridor would. Keep the side step out of a pull or a throw (CORE-06).
   - **Pick it up.** Report it to the brain as a thing in the way; janitors and anyone with a free hand pick it up and drop it to one side (the tidying tools exist). Slower, but it clears the hazard for everyone.
   I would take the side step: it is general, needs no brain change, and is what a player does without thinking.
3. Keep the walk for oil and blood as now.

## How to test the fix

- Compile.
- A DM unit test or a round: drop a banana peel in a corridor in sight of a crew body, then send it walking past. Before the fix `game.log` and `attack.log` show `slipped on the banana peel`; after, the body steps round.
- Check the walk still reaches its goal after the side step (no `walk failed` line).
