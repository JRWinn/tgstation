---
id: CORE-03
title: A body walking up to someone follows them wherever they go, out of sight and through rooms, for 30 seconds, and an officer chases a suspect the same way for 3 minutes
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 63e39e3b704, bd31c16cbb6
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_motor.dm:76, code/modules/llm_crew/crew_npc.bt.json:40, code/datums/ai/generic_behaviors/move_to_target.dm:74, code/modules/llm_crew/crew_npc_storage.dm:200, code/modules/llm_crew/crew_npc_security.dm:857
fix: In the walk and reach leaves, when the target is a mob, read last_seen_at each tick, and once it is a few seconds old end the leaf with they went out of sight and walk to the turf they were last seen on
---

## What is wrong

Both leaves that walk a body up to a person re-plan the route every time that person moves, wherever they are:

- the walk leaf (`crew_npc_walk`) has `update_movement_for_moving_target = TRUE`;
- the errand's reach leaf has it set in `crew_npc.bt.json`, with a time limit of three minutes.

The base `move_to_target` registers `COMSIG_MOVABLE_MOVED` on the target and calls `update_movement_target` on every step they take. Neither crew leaf ever checks that the body can still see them. So the body knows, step by step, where someone is who has gone round a corner, through a door, down a maintenance tunnel, and walks straight after them. The only checks are at the start: `tool_walk_to` and `tool_arrest` want the person to have been in view in the last 15 seconds (`recently_saw`). After that the walk goes on with no look at all.

This breaks the senses-only rule ("A crew member knows what its own body could see, hear or be sent"). A player who loses sight of someone has to guess.

It does not act on the world outside the game's rules (every step is a real step), and it only matters when someone being walked up to moves out of sight, which with the Captain as the only player is mostly a player running from an officer. So medium, not high: a player would notice it, and the work still gets done.

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

1. Add a helper on the controller, `still_in_sight(mob/person)`. Do not call `view()` every tick: `look_around` (`crew_npc_senses.dm:127`) already looks on its timer and writes `last_seen_at[person_key(person)]`, which `recently_saw` reads. Use that with a short window: in sight if `world.time - last_seen_at[person_key(person)] <= CREW_NPC_LOST_SIGHT_GRACE`. Have `look_around` also note the turf each person was last seen on (`last_seen_spot[key] = get_turf(person)`) so the fix has somewhere to walk to. A held person (`pawn.pulling == person`) counts as in sight.
   Turning `update_movement_for_moving_target` off is not enough on its own: the navmap loop's `target` is still the mob, and every re-plan after a blocked step or an empty path (`recalculate_path` in `movement_types_navmap.dm`) plans to `get_turf(target)`, the mob's present tile. The loop has to be pointed at a turf, which means a new walk (see CORE-01: the walk leaf cannot be retargeted mid-walk either).
2. In `crew_npc_walk/perform` and `crew_npc_reach/perform`, when the target is a mob, call it. While it is out of sight for less than a grace of about 3 seconds (`CREW_NPC_LOST_SIGHT_GRACE`), carry on: a corner is turned in a moment.
3. After the grace, stop following them: point the move loop at `last_seen_spot` (a turf, which does not move). Do this by ending the leaf with a new `fail_reason` "they went out of sight", and have `walk_finished` and the errand's fail path start a short walk to that turf with the tool kept (for the arrest, the security code already has a "lost" reason it can report). Arriving there, the body looks again: if the person is in view it may be told to go on (a new `walk_to` or `arrest` from the brain, which knows them by handle); if not, the brain is told "You lost sight of [name] near [room]".
4. Keep the time limits as they are. Three minutes is fine for a chase the body can see.
5. Do not change the base `move_to_target`.

Question for the owner: how long may a body keep after someone it has lost sight of? The proposal is "to where they were last seen, then look", which is what a player does.

## How to test the fix

- Server compile.
- In a round, give a crew NPC a `walk_to` on you and run through a door and two rooms. With the fix it stops at the door you went through and the brain gets "You lost sight of ...". Grep `game.log` for `walk failed (walk_to` with the new reason.
- Declare a warrant on yourself, let the officer see you, and run into maintenance. It should stop where it lost you, not arrive beside you.

## Check

Confirmed, by reading the code; nothing was run.

- The quotes are what the code says: `crew_npc_walk` has `update_movement_for_moving_target = TRUE` (`crew_npc_motor.dm:76`), the errand's reach leaf sets it in `crew_npc.bt.json` with `"time_limit": "3 MINUTES"`, and `crew_npc_reach/perform` (`crew_npc_storage.dm:200`) checks only the time.
- Base `track_moving_target` registers `COMSIG_MOVABLE_MOVED` on a movable target, and `on_tracked_target_moved` (`move_to_target.dm:74`) calls `update_movement_target`, which for navmap re-plans to the loop's target, the mob, wherever it now is. Neither crew leaf looks at `last_seen_at`, `view()` or `recently_saw` while running. The only sight checks are before the walk: `tool_walk_to` (`crew_npc_tools.dm:181`) and `tool_arrest` (`crew_npc_security.dm:844`), both `recently_saw`, a 15-second memory.
- So a body walked at a person who goes through a door and round two corners is routed after them step by step, with no sense behind it. Nothing in `LLM_CREW_CHANGELOG.md` or the plans chooses this; the security entries talk of the chase only in sight.

Changes made: severity lowered to medium (it gives the body knowledge it should not have, but it does no act a player could not, and it needs the person to leave sight mid-walk; the no-cheats line in FORMAT's "high" is about acting outside the game's rules). Fix step 1 now uses the existing `last_seen_at` that `look_around` writes rather than a `view()` call every tick, adds the last-seen turf, and says why switching off the moving-target flag would not be enough. Effort medium stands: both leaves, a new walk to a turf after the leaf ends, a new reason the window must read (security's "lost" reason already exists for the arrest). The question for the owner (how far to keep after someone lost from sight) is still open.

## Fix so far (round A1, a-secsrv, compile only)

On the owner's answer A (to where they were last seen, look, then "You lost sight of X near ROOM"):
- `look_around` (`crew_npc_senses.dm`) keeps the square each person was last seen on (`last_seen_spot`, pruned with `last_seen_at`). New procs there: `lost_sight_spot(target)` (that square once a person has been out of sight more than `CREW_NPC_LOST_SIGHT_GRACE`, 3 s; null while seen, while held by the body, or for anything not a human), `sees_again(target, look)`, `lost_sight_words(target, spot, whole)`.
- The walk leaf (`crew_npc_walk/perform`, `crew_npc_motor.dm`) and the errand's reach leaf (`crew_npc_reach/perform`, `crew_npc_storage.dm`), walking to a person, point the move loop at that square instead of the person once they are lost (so their steps no longer re-plan it), go on after them if they are seen again on the way, and on arrival look once more (`crew_npc_sees`). Not found: the walk fails with the reason "you lost sight of X near ROOM" (`walk_finished` words it "You stop walking to X: you lost sight of X near ROOM."), and the errand ends by `lost_sight_errand` with "You lost sight of X near ROOM." and details `reason: "lost"`, `lost_sight: TRUE`, `near` (the room) and `handle`. Every walk and errand at a person is covered (walk_to, arrest, give, hand mail, throw_out's walk up, free).
- Not changed: the base `move_to_target`, the time limits. `walk_finished` (`crew_npc_tools.dm`) could pass `lost_sight`/`near` in its details too (held, a-srv's file).

Round A2 (a2-server, compile only): `walk_finished` (`crew_npc_tools.dm`) adds `lost_sight: TRUE` and `near` (the room) to a walk_to's failed result when the reason is the lost-sight words (`you lost sight of X near ROOM`, read back from the reason). No `reason` key is added there, as the walk_to result never had one. Not played.
