---
id: CORE-06
title: The careful step near slippery things blocks every move of the body, including being pulled, so a crew member dragged across a peel or soap slips out of the grip
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_senses.dm:70, code/game/atoms_movable.dm:761, code/game/atoms_movable.dm:884, code/game/atoms_movable.dm:671
fix: In mind_its_step, only slow down for a step the body takes itself, and return at once when the move comes from a pull, a throw or being carried
---

## What is wrong

`mind_its_step` is a `COMSIG_MOVABLE_PRE_MOVE` handler on the body. When the tile ahead has a slippery thing the body knows of and it is running, it switches to walk and returns `COMPONENT_MOVABLE_BLOCK_PRE_MOVE`, so that step is not taken. The comment says why: "this one, begun at a run, is not taken". That is right for a step the body takes. But `COMSIG_MOVABLE_PRE_MOVE` fires on every `Move()` of the body, whoever makes it:

- being pulled: the puller's `Move` calls `pulling.move_from_pull(...)`, which calls the pulled body's own `Move`;
- being thrown, pushed by a conveyor belt or a shove, carried off by space wind;

and the handler cannot tell those from its own steps. It blocks them as well.

For a pull this breaks the grip. The puller has already stepped. The pulled body refused its step, so it is now two tiles off, and the puller's `check_pulling` ends the pull (`get_dist(src, pulling) > 1` → `stop_pulling()`).

One concrete case. An officer arrests a cargo technician and walks it to the brig by the arm (`custody_phase`, the officer pulling). The hallway has a bar of soap on it that the technician saw a minute ago, so it is in `slippery_seen`. As the officer drags it onto that tile, the technician's own handler blocks the move and switches it to walk. The officer is now two tiles ahead with nothing in hand. Its walk to the brig fails on `CREW_NPC_GRIP_LOST` or its own lost-hold check, and the arrest reports the prisoner got away. The same happens to anyone walked out of a room by the arm (`throw_out` by a cargo technician of a janitor, `in_hand_until`) and to a crew member the Captain drags. If GAP-04's proposal is built (teaching `knows_slippery` to see a wet floor), every mopped hallway will do this.

Being thrown at a slippery tile, the throw stops short there and counts as hitting it (`/datum/thrownthing` ends on a failed `Move`). That is wrong too, but rarer.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:70`:

    /datum/ai_controller/crew_npc/proc/mind_its_step(mob/living/carbon/human/body, atom/new_loc)
    	SIGNAL_HANDLER
    	if(!isturf(body.loc) || !isturf(new_loc))
    		return
    	// Shoes that grip need no care taken.
    	var/careful = !HAS_TRAIT(body, TRAIT_NO_SLIP_WATER) && !HAS_TRAIT(body, TRAIT_NO_SLIP_ALL) && knows_slippery(new_loc)
    	if(!careful)
    		body.set_move_intent(MOVE_INTENT_RUN)
    		return
    	if(body.move_intent == MOVE_INTENT_WALK)
    		return
    	// It slows to a walk first, and takes the step at that pace: this one, begun at a run, is not taken.
    	body.set_move_intent(MOVE_INTENT_WALK)
    	return COMPONENT_MOVABLE_BLOCK_PRE_MOVE

`code/game/atoms_movable.dm:761` (base), in `Move`:

    		if(SEND_SIGNAL(src, COMSIG_MOVABLE_PRE_MOVE, newloc) & COMPONENT_MOVABLE_BLOCK_PRE_MOVE)

`code/game/atoms_movable.dm:884` and `:915` (base), the puller moving what it pulls through the pulled thing's own `Move`:

    					pulling.move_from_pull(src, target_turf, glide_size)
    ...
    /atom/movable/proc/move_from_pull(atom/movable/puller, turf/target_turf, glide_size_override)
    	moving_from_pull = puller
    	Move(target_turf, get_dir(src, target_turf), glide_size_override)

`code/game/atoms_movable.dm:671` (base), `check_pulling`:

    		if(get_dist(src, pulling) > 1 || (z != pulling.z && !z_allowed))
    			stop_pulling()

## How it was found

Read from the code. Not seen in a round. `likely` because I did not check whether the security code's custody walk keeps its own hold some other way that would survive one dropped pull (it watches `pulling` and calls the prisoner lost when it is null, as the walk leaf does for hauls).

## How to fix it

1. At the top of `mind_its_step`, after the turf checks, return without blocking (and without touching the move intent) when the move is not the body's own:

        if(body.moving_from_pull || body.throwing || body.pulledby || body.buckled)
        	return

   `moving_from_pull` covers the drag itself, `pulledby` covers the body's own shuffles while held (it is going where it is taken), `throwing` covers throws, `buckled` covers chairs and beds being moved.
2. Leave the rest as it is: a step the body takes on its own still slows to a walk first.
3. If later wanted, a body being dragged over something it knows is slippery could say so ("Mind the soap"). That is a brain matter, not this fix.

## How to test the fix

- Server compile.
- In a round, drop a bar of soap in a hallway in sight of a crew NPC, then pull it across the soap's tile. Before the fix the pull breaks on that tile; after, it follows.
- Have a cargo technician throw a janitor out of the bay over a banana peel; grep `game.log` for the eviction's outcome.
