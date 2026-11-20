---
id: LIFE-07
title: A body knocked down or killed while pushing a crate clear goes on stepping and pushing it
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_grip.dm:247, code/modules/mob/living/living.dm:1046, code/datums/ai/movement/_ai_movement.dm:49
fix: Before each body.Move in push_clear, stop unless the body can move as the walk loop would let it, and say why it stopped
---

## What is wrong

See also: SEC-01, which found the same hole in the security steps (`close_with`, `walk_steps`). `push_clear` in `crew_npc_grip.dm` has it too, and SEC-01's fix does not name it.

`push_clear` pushes a crate clear of a door by walking the body into it, a tile at a time, with a bare `body.Move` and a `sleep` between steps. After each sleep it checks only that the controller, the body and the crate exist and that the errand is still the same one. `/mob/living/Move` does not refuse a mob that cannot move: that is the job of whoever asks for the step (the player's key press, or the AI walk loop's `allowed_to_move`, which checks `MOBILITY_MOVE`, a grab and being pulled while incapacitated). So a body that is paralysed, out cold or dead in the middle of a push goes on stepping, and the crate goes on moving, up to `CREW_NPC_PUSH_REACH` tiles.

Being knocked down switches the controller off and resets the errand leaf, but the push is asleep in its own `sleep` and is not stopped. `errand_serial` does not change on a stun, so the serial check does not stop it either. And when the body is up again a second push can start beside it (LIFE-05).

One concrete case. A cargo technician has given up a haul and is pushing the crate out of the Warehouse doorway (`haul_clear` → `push_clear`). Pun Pun, loose in the bay, tackles it: `Paralyze(40)`. The technician lies on the floor, and every 0.3 seconds `push_clear` wakes and calls `body.Move(get_step(body, push_dir), push_dir)`. The paralysed body slides a tile into the crate and the crate moves on. No player could do that.

## Where

`code/modules/llm_crew/crew_npc_grip.dm:263`, in `push_clear`:

    	for(var/pushes in 1 to CREW_NPC_PUSH_REACH)
    		if(crew_npc_clear_of_doors(crate))
    			break
    		var/turf/before = get_turf(crate)
    		// Walking into a loose crate pushes it a tile on, and the body steps into where it was.
    		body.Move(get_step(body, push_dir), push_dir)
    		sleep(pace)
    		if(QDELETED(src) || QDELETED(body) || QDELETED(crate) || errand_serial != serial)
    			return list(FALSE, "You were called away.")

and the step behind it at line 257, the same.

`code/datums/ai/movement/_ai_movement.dm:49` (base), the check a walk gets and these steps do not:

    /datum/ai_movement/proc/allowed_to_move(datum/move_loop/source)
    	...
    		if(!(pawn_mob.mobility_flags & MOBILITY_MOVE))
    			return FALSE

## How it was found

Read from the code, after SEC-01, by grepping every `.Move(` in `code/modules/llm_crew/`. The others are the wander leaf (which asks `can_move` first), the security steps (SEC-01) and one step in `freight_hauled`, which is only taken on a walk that just succeeded, with the controller running.

## How to fix it

1. Add one helper on the controller, `can_step()`: TRUE if the body is on a turf, has `MOBILITY_MOVE`, is not incapacitated (`INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB)`), is not buckled, and has no `TRAIT_AI_MOVEMENT_HALTED`. It is the same test as the walk loop's, and SEC-01's fix can use the same helper.
2. In `push_clear`, before each `body.Move`, `if(!can_step()) return list(FALSE, "You were knocked off your feet before the crate was clear.")`.
3. Nothing else: `put_clear_finished` already reports where the crate was left.

## How to test the fix

- Compile.
- In a round: start a technician pushing a crate clear and stun it (an admin can `Paralyze` it). The crate should stop where it is.
