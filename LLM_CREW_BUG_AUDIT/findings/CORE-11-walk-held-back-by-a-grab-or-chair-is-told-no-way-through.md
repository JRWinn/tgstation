---
id: CORE-11
title: A walk the body cannot take because someone has hold of it, it is cuffed and pulled, or it is buckled to a chair, is told there is no way through, with all that follows
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:135, code/datums/ai/movement/_ai_movement.dm:49, code/datums/ai/movement/_ai_movement.dm:93, code/modules/llm_crew/crew_npc_controller.dm:316, code/modules/llm_crew/crew_npc_tools.dm:487
fix: In the walk leaf, when the move loop gave up because the body was not allowed to move, say why from what the body can feel (held, cuffed and held, buckled, off its feet) instead of CREW_NPC_NO_WAY, and do not count it as a way out that failed
---

## What is wrong

See also: LIFE-01, which is the stunned case: the walk ended by the controller switching off. This is the other half: the controller stays on, but the body is not allowed to step.

The crew controller keeps running while the body is cuffed or in an aggressive grab (`get_able_to_run` ignores `INCAPABLE_RESTRAINTS` and `INCAPABLE_GRAB`, on purpose: "Cuffed or grabbed crew can still shuffle about and talk"). So a walk carries on. But the base move loop will not step a body that is incapacitated in any way while someone pulls it, nor one that cannot move (`MOBILITY_MOVE` gone, as when buckled to a chair or a bed), nor one inside something. Each refused step is counted by `increment_pathing_failures`, and after `max_pathing_attempts` (20) `fail_movement` sends `COMSIG_MOB_AI_MOVEMENT_FAILED`. The walk leaf takes every such failure to mean the route is shut:

    	if(movement_failed)
    		fail_reason = CREW_NPC_NO_WAY

`walk_finished` then does everything it does for a shut route: it writes "You stop on the way to X: there is no way through" to the brain, puts X in `blocked_places` and `blocked_tries` (left alone 5 minutes, 15 after twice), calls `note_way_out_failed` (one is enough to set `shut_in` and `wants_out` when the body has a trail), may start `clear_the_way` looking for a crate to move, and logs a `walk failed` line that sends whoever reads `game.log` looking for a shut door.

Cases:

1. The Captain, or any player, cuffs a crew member and drags it to the brig. It was walking to the Bar when cuffed. Every step is refused (`INCAPACITATED_IGNORING(pawn_mob, INCAPABLE_STASIS) && pawn.pulledby`), and after 20 the Bar is "no way through". (Crew security's own arrests clear the walk first, `crew_npc_security.dm:1399`, so this is a player's arrest or any other pull of a cuffed body.)
2. A player puts a crew member in a chair and buckles it (or it is strapped to a medbay bed). Every walk it is told to take fails at once as "no way through", the room it was going to is written off, and it soon decides it is shut in where it sits.
3. A player holds it in an aggressive grab for a few seconds while it was walking: the same.

None of these is a shut route, and a body that feels a hand on its arm or a strap across its lap knows it.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:135`, in `crew_npc_walk/perform`:

    	if(movement_failed)
    		fail_reason = CREW_NPC_NO_WAY
    	return ..()

`code/datums/ai/movement/_ai_movement.dm:49` (base), `allowed_to_move`:

    	if(!isturf(pawn.loc)) //No moving if not on a turf
    		return FALSE

    	if(isliving(pawn))
    		var/mob/living/pawn_mob = pawn
    		if(!(pawn_mob.mobility_flags & MOBILITY_MOVE))
    			return FALSE
    		...
    		if(INCAPACITATED_IGNORING(pawn_mob, INCAPABLE_STASIS) && pawn.pulledby)
    			return FALSE

`code/datums/ai/movement/_ai_movement.dm:93` (base), `pre_move`, which counts each refusal as a failed try:

    	if(allowed_to_move(source))
    		return NONE
    	increment_pathing_failures(controller)
    	return MOVELOOP_SKIP_STEP

`code/modules/llm_crew/crew_npc_controller.dm:316`:

    	// Cuffed or grabbed crew can still shuffle about and talk; stunned or unconscious crew cannot.
    	if(INCAPACITATED_IGNORING(living_pawn, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB))

`code/modules/llm_crew/crew_npc_tools.dm:484` onwards, `walk_finished`, what a no-way-through sets off:

    			if(tool == CREW_TOOL_GO_TO && goal)
    				blocked_places[goal] = world.time
    				if(reason == CREW_NPC_NO_WAY)
    					blocked_tries[goal]++
    ...
    			if(reason == "there is no way through" && !length(fire_doors) && ...)
    				note_way_out_failed()

## How it was found

Read from the code, including the base `allowed_to_move` and `pre_move`. Not seen in a round.

## How to fix it

1. In `crew_npc_walk/perform`, before setting `fail_reason = CREW_NPC_NO_WAY`, look at the body as the base `allowed_to_move` does and name what stopped it:
   - `body.buckled`: "you are strapped into the [buckled]";
   - `body.pulledby` and the body is cuffed or in an aggressive grab: "[pulledby] has hold of you";
   - `!(body.mobility_flags & MOBILITY_MOVE)`: "you cannot move your legs";
   - `!isturf(body.loc)`: "you are shut inside the [loc]".
   Only when none of these holds is it `CREW_NPC_NO_WAY`. Add the new reasons as defines beside `CREW_NPC_NO_WAY`.
2. In `walk_finished`, only a `CREW_NPC_NO_WAY` or a timeout writes `blocked_places`; the new reasons do not (LIFE-01 asks for the same rule for the stunned case, so do both at once).
3. Better still, while the body is held or buckled, do not let the loop count failures at all: in the leaf, reset `controller.consecutive_pathing_attempts = 0` each tick while one of the first three holds, as `keep_still` already does for a talk hold, and end the walk after a short wait (say 10 seconds) with the reason. A body pulled along by someone for a few steps then carries on with its walk when let go, which is what a person does.
4. HOLE-11 (the body never presses resist) is the place for whether it should try to get free.

## How to test the fix

- Server compile.
- In a round, tell a crew member by PDA to go to the Bar, then cuff it and pull it the other way for ten seconds. Without the fix `game.log` has `walk failed (go_to, to Bar): there is no way through` and the window's blocked list shows the Bar. With it the reason is "[you] has hold of you" and the Bar is not blocked.
- Buckle one to a chair and send it somewhere: it should say it is strapped in, not that there is no way.
