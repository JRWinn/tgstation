---
id: CORE-03
title: A body walking up to someone follows them wherever they go, out of sight and through rooms, for 30 seconds, and an officer chases a suspect the same way for 3 minutes
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:76, code/modules/llm_crew/crew_npc.bt.json:40, code/datums/ai/generic_behaviors/move_to_target.dm:74, code/modules/llm_crew/crew_npc_storage.dm:200, code/modules/llm_crew/crew_npc_security.dm:857
fix: In the walk and reach leaves, when the target is a mob, check each tick that it is still in view, and once it has been out of view a few seconds walk to the spot it was last seen and end there with they went out of sight
---

## What is wrong

Both leaves that walk a body up to a person re-plan the route every time that person moves, wherever they are:

- the walk leaf (`crew_npc_walk`) has `update_movement_for_moving_target = TRUE`;
- the errand's reach leaf has it set in `crew_npc.bt.json`, with a time limit of three minutes.

The base `move_to_target` registers `COMSIG_MOVABLE_MOVED` on the target and calls `update_movement_target` on every step they take. Neither crew leaf ever checks that the body can still see them. So the body knows, step by step, where someone is who has gone round a corner, through a door, down a maintenance tunnel, and walks straight after them. The only checks are at the start: `tool_walk_to` and `tool_arrest` want the person to have been in view in the last 15 seconds (`recently_saw`). After that the walk goes on with no look at all.

This breaks the senses-only rule ("A crew member knows what its own body could see, hear or be sent"). A player who loses sight of someone has to guess.

Cases:

1. **An officer chasing a suspect.** `tool_arrest` starts an errand on the person. The reach leaf walks to them for up to `time_limit` = 3 minutes (`"time_limit": "3 MINUTES"` in `crew_npc.bt.json`), re-routing on each of their steps. The suspect runs out of the Bar, through two doors and into maintenance. The officer, which saw none of it, takes the same turns and arrives. Only when it is next to them does `make_arrest` look (`view()` for its "moved" or "lost" reasons).
2. **Walking up to someone.** `walk_to` the Captain, who walks off into the bridge. For 30 seconds (`CREW_NPC_WALK_TIMEOUT`) the body follows by the Captain's every step, then reports "You arrive next to ..." if it caught up.
3. The same for every other errand aimed at a person: `give`, `hand_mail`, `throw_out`, `free`.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:75`:

    /datum/bt_node/ai_behavior/move_to_target/crew_npc_walk
    	update_movement_for_moving_target = TRUE

`code/modules/llm_crew/crew_npc.bt.json:36`, the errand's reach leaf:

    "behavior": "/datum/bt_node/ai_behavior/move_to_target/crew_npc_reach",
    "vars": {
        "target_key": "BB_crew_npc_errand_target",
        "required_dist": 1,
        "time_limit": "3 MINUTES",
        "update_movement_for_moving_target": true
    }

`code/modules/llm_crew/crew_npc_storage.dm:200`, the reach leaf's only check:

    /datum/bt_node/ai_behavior/move_to_target/crew_npc_reach/perform(seconds_per_tick, datum/ai_controller/controller)
    	if(world.time - started_at > time_limit)
    		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
    	return ..()

`code/datums/ai/generic_behaviors/move_to_target.dm:74` (base), which re-plans on every step of the target:

    /datum/bt_node/ai_behavior/move_to_target/proc/on_tracked_target_moved(atom/movable/source)
    	SIGNAL_HANDLER
    	...
    	controller.ai_movement.update_movement_target(controller, source)

`code/modules/llm_crew/crew_npc_security.dm:844`, the only sight check, before the chase starts:

    	if(QDELETED(person) || !recently_saw(person))
    		action_result(CREW_TOOL_ARREST, FALSE, "You cannot see that person.", list("reason" = "lost"))

## How it was found

Read from the code: both leaves, the base `move_to_target`, the JSON tree, `tool_walk_to` and `tool_arrest`. Not seen in a round log. I did not check how often a suspect actually runs from an officer in the rounds played so far; with the Captain the only player, perhaps never yet.

## How to fix it

1. Add a helper on the controller, `still_in_sight(mob/person)`: TRUE if `person in view(CREW_NPC_VISION_RANGE, pawn)`, and while it is, note `last_seen_spot = get_turf(person)` and `last_seen_time = world.time`. A held person (`pawn.pulling == person`) counts as in sight.
2. In `crew_npc_walk/perform` and `crew_npc_reach/perform`, when the target is a mob, call it. While it is out of sight for less than a grace of about 3 seconds (`CREW_NPC_LOST_SIGHT_GRACE`), carry on: a corner is turned in a moment.
3. After the grace, stop following them: point the move loop at `last_seen_spot` (a turf, which does not move). Do this by ending the leaf with a new `fail_reason` "they went out of sight", and have `walk_finished` and the errand's fail path start a short walk to that turf with the tool kept (for the arrest, the security code already has a "lost" reason it can report). Arriving there, the body looks again: if the person is in view it may be told to go on (a new `walk_to` or `arrest` from the brain, which knows them by handle); if not, the brain is told "You lost sight of [name] near [room]".
4. Keep the time limits as they are. Three minutes is fine for a chase the body can see.
5. Do not change the base `move_to_target`.

Question for the owner: how long may a body keep after someone it has lost sight of? The proposal is "to where they were last seen, then look", which is what a player does.

## How to test the fix

- Server compile.
- In a round, give a crew NPC a `walk_to` on you and run through a door and two rooms. With the fix it stops at the door you went through and the brain gets "You lost sight of ...". Grep `game.log` for `walk failed (walk_to` with the new reason.
- Declare a warrant on yourself, let the officer see you, and run into maintenance. It should stop where it lost you, not arrive beside you.
