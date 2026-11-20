---
id: SENSE-06
title: A body that knows a banana peel, soap or foam lies ahead slows to a walk and steps on it anyway, and walking does not stop those from slipping anyone
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 82954ebe6a4
found_by: Opus 5.5
checked_by: Opus 5.5
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

Read from the code and the base slip procs. Not seen in a round. `LLM_CREW_CHANGELOG.md` (the entry at about line 913) lists "Oil, a peel, soap, foam" as what the body walks for; it does not say walking does not help for three of them. `LLM_CREW_PLAN_NO_CHEATS.md` section 4.1 has the accepted design: walk onto a tile that would slip a runner, and "where a way round the tile costs only a few steps, the route takes it". Its Status line says the way round was not built. This finding adds why that matters: for peels, soap and foam the walk alone does nothing.

## How to fix it

1. Split the test. Add `/proc/crew_npc_walking_helps(atom/movable/thing)` that reads the thing's slippery component and returns `lube_flags & NO_SLIP_WHEN_WALKING`. In `mind_its_step`, walk (as now) only if the known slippery thing on `new_loc` is one walking helps with.
2. For one walking does not help with, the body has to keep off the tile. Two ways, for the owner to choose:
   - **Step round it.** In `mind_its_step`, refuse the step (`COMPONENT_MOVABLE_BLOCK_PRE_MOVE`) and take a side step instead onto a free tile that is next to both where it stands and where it was going, and is not itself slippery. One side step lets the path carry on from there; if no such tile exists, let it walk on and slip, as a player in a one-tile corridor would. Keep the side step out of a pull or a throw (CORE-06).
   - **Pick it up.** Report it to the brain as a thing in the way; janitors and anyone with a free hand pick it up and drop it to one side (the tidying tools exist). Slower, but it clears the hazard for everyone.
   I would take the side step: it is general, needs no brain change, and is what a player does without thinking. It is also the "way round" that plan 4.1 already accepted, built at the step rather than in the route, so it needs no new decision from the owner unless the pick-up way is wanted. The route planner itself cannot be told cheaply to keep off a remembered tile: `navmap_pathfind` takes only one `avoid` turf.
   The side step must be refused while the body is being pulled, thrown or pushed (CORE-06's fix: `moving_from_pull`, `throwing`, `pulledby`, `buckled`), or it will slip out of a grip as CORE-06 describes.
3. Keep the walk for oil and blood as now.

## How to test the fix

- Compile.
- A DM unit test or a round: drop a banana peel in a corridor in sight of a crew body, then send it walking past. Before the fix `game.log` and `attack.log` show `slipped on the banana peel`; after, the body steps round.
- Check the walk still reaches its goal after the side step (no `walk failed` line).

## Check

Checked by Opus 5.5. The quotes at `crew_npc_senses.dm:29` and `:70` to `:83` are what the code says: `crew_npc_slippery_thing` asks only for a slippery component, and `mind_its_step` sets walk and nothing else. In the base, `handle_slip` (`_open.dm:589`) lets a walker off only when the lube flags hold `NO_SLIP_WHEN_WALKING`, and `/datum/component/slippery/Slip` (`slippery.dm:174`) checks walking nowhere else. Soap (`clown_items.dm:35`, no flags), the slip gene on peels (`plant_genes.dm:292`, `NONE`) and slippery foam (`effects_foam.dm:46`, no flags) all slip a walker, so a body that knows of one still falls on it. Nothing in the crew code steers the route off the tile; the changelog and `LLM_CREW_PLAN_NO_CHEATS.md` 4.1 list the way round as not built, which is the known gap, and the cause added here is new. Severity medium (a fall of a few seconds, the work goes on, rare things on the floor) and effort medium stand. Added the plan's accepted design to the write-up and the CORE-06 caution to the fix. Nothing was run.

## Fix so far

Group m-senses, 2026-11-19. Built in `crew_npc_senses.dm` only, as the way round the plan (NO_CHEATS 4.1) already accepted, at the walk's plan rather than by a side step: `crew_npc_walking_helps(thing)` reads the slippery component's `lube_flags & NO_SLIP_WHEN_WALKING`; `known_slippery_on(turf)` returns the known slippery thing on a tile (one walking does not help with first), and `knows_slippery` now wraps it. In `mind_its_step`, for a thing walking does not help with, the step is refused once per tile and the controller's PLAY-04 go-round slot is set (`avoid_ref` = the thing, `avoid_turf` = its tile), so the blocked step makes the move loop plan again and `repath_incoming` (`crew_npc_motor.dm`) leaves the tile out through `tile_to_go_round`. If the plan finds no way round (`avoid_gave_up`), the tile is the walk's goal, or the same tile is stepped on again (a move that plans no route), it walks on with care as before and may slip. Oil and blood are as before. A side step was not used: a `Move` from inside the pre-move signal would re-enter the move, and the next plan would as often as not lead back over the peel.

Not done: the log line the go-round writes (`route_planned`, `crew_npc_motor.dm`) says "went round banana peel ... which will not move"; held for that file's owner to word it for a thing on the floor if wanted. The one go-round slot is shared with PLAY-04's blocker: a parked MULEbot and a peel on one walk overwrite each other. Picking the thing up (the other way) is not built. Compile only; not played.
