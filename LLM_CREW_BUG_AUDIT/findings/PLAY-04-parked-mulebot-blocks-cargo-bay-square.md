---
id: PLAY-04
title: A parked MULEbot stops every walk through its square, and the next walk is planned through it again
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: code/modules/llm_crew/crew_npc_motor.dm:142, code/modules/llm_crew/crew_npc_controller.dm:317, code/modules/llm_crew/crew_npc_tools.dm:414, code/datums/ai/movement/ai_movement_navmap_astar.dm:27, code/controllers/subsystem/movement/movement_types_navmap.dm:148, code/modules/mob/living/basic/bots/mulebot/mulebot.dm:76
fix: When the body bumps a blocker that can never be swapped with and cannot be asked, set the running walk's avoid turf to the blocker's square so the re-plan goes round it, and drop it when the blocker leaves
---

## What is wrong

A crew body that walks into someone it cannot swap places with is stopped after four bumps. The walk fails with "[name] is standing in your way". That is right for a person: the brain can ask them to move. It is wrong for a MULEbot. A MULEbot can never be swapped with or pushed, and a parked one does not move. Nobody can ask it to move.

The route planner does not see mobs at all. So the next walk, to the same place or to anywhere past that square, is planned through the same square. The body walks up to the MULEbot, bumps it four times, and fails again with the same words. It never goes round, even where the room is wide open on both sides.

Concrete case, round-15.44.36: MULEbot vGjkP stood parked at (77,151,2) in the Cargo Bay, its home beacon, the square just north of (77,150,2). The map puts it there and it never left (see Check). Tyson Jones was sent to the Quartermaster's Office again and again. Every walk was planned through the bot's square (11 or 12 steps), stopped at (77,150,2), and failed. Four other bodies, heading for the door out of the bay, Fore Port Maintenance, the Mining Office and the Bitrunning Den, were stopped on the same square. Eleven walks failed this way in 25 minutes. The brain could only say "I cannot move the MULEbot myself" and pass the job on to someone else.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:142`, in `crew_npc_walk/perform`. The comment says the fault outright:

    	// Someone it cannot get past is standing in its way: in combat mode, holding a prisoner, or the
    	// body is on walk intent. It is stopped, as a player would be, and it knows who by. The route
    	// planner does not see people, so planning again only walks it into them again.
    	var/mob/living/blocker = crew_controller.blocked_by?.resolve()
    	if(!QDELETED(blocker) && crew_controller.blocked_bumps >= CREW_NPC_BLOCKED_BUMPS && world.time - crew_controller.blocked_at < 2 SECONDS && get_turf(puller) == crew_controller.blocked_from && blocker != target && blocker != puller.pulling)
    		fail_reason = "[blocker.name] is standing in your way"
    		crew_controller.blocked_by = null
    		crew_controller.blocked_bumps = 0
    		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED

The blocker is forgotten here (`blocked_by = null`) before `walk_finished` runs, so nothing later can know who or where it was.

`code/modules/llm_crew/crew_npc_controller.dm:317`, in `on_bump`. Any living thing counts, bots included:

    /datum/ai_controller/crew_npc/proc/on_bump(datum/source, atom/bumped)
    	SIGNAL_HANDLER
    	if(!isliving(bumped))
    		return

`code/modules/llm_crew/crew_npc_tools.dm:414`, in `walk_finished`. A failed walk is logged and reported. There is a retry for a crate jammed in a doorway (`clear_the_way`, only on `CREW_NPC_NO_WAY`), and none for this reason:

    	if(!succeeded)
    		log_walk_failed(target, tool, goal, why)
    		// A loose crate jammed in a doorway may be all that shuts the way. Anyone would move it and go on.
    		if(reason == CREW_NPC_NO_WAY && clear_the_way(target, tool, goal))
    			return

`code/datums/ai/movement/ai_movement_navmap_astar.dm:27`, in `setup_moveloop`, which the crew movement datum does not override. No `avoid` turf is ever passed:

    	var/datum/move_loop/has_target/navmap_astar/loop = GLOB.move_manager.navmap_astar_move(moving,
    		current_movement_target,
    		delay,
    		repath_delay = 0.1 SECONDS,
    		simulated_only = !HAS_TRAIT(controller.pawn, TRAIT_SPACEWALK),

The planner can leave out one square. `code/__HELPERS/paths/navmap.dm:319`, in `navmap_astar_turf_open`:

    	if(isnull(tile) || tile == avoid || (max_distance && max(abs(start.x - tile.x), abs(start.y - tile.y)) > max_distance))
    		return FALSE

Why the MULEbot can never be got past. `code/modules/mob/living/basic/bots/mulebot/mulebot.dm:76`:

    	ADD_TRAIT(src, TRAIT_NOMOBSWAP, INNATE_TRAIT)
    	add_traits(list(TRAIT_NOMOBSWAP, TRAIT_COMBAT_MODE_LOCK), INNATE_TRAIT)

and `code/modules/mob/living/living.dm:275`, in `can_mobswap_with`:

    	if (HAS_TRAIT(other, TRAIT_NOMOBSWAP) || HAS_TRAIT(src, TRAIT_NOMOBSWAP))
    		return FALSE

It also has `move_resist = MOVE_FORCE_STRONG` (mulebot.dm:17), so it is not pushed either.

## How it was found

Seen in a round log, `data/logs/2026/11/19/round-15.44.36/game.log`. Eleven lines name the same bot and the same square. The first and last:

    [2026-11-19 21:49:16.365] GAME: Crew NPC *no key*/(Tyson Jones) (owner: zimfire) walk failed (go_to, to Quartermaster's Office): MULEbot vGjkP is standing in your way. Stopped at Cargo Bay (77,150,2), heading for The floor at Quartermaster's Office (80,151,2); the last route planned was 12 steps.
    [2026-11-19 22:14:47.315] GAME: Crew NPC *no key*/(Kailyn Patterson) (owner: zimfire) walk failed (go_to, to Bitrunning Den): MULEbot vGjkP is standing in your way. Stopped at Cargo Bay (77,150,2), heading for The dark plated catwalk floor at Bitrunning Den (67,166,2); the last route planned was 28 steps.

Between them: Tyson Jones six times in all (21:49:16, 21:54:28, 21:59:30, 21:59:54, 22:01:55, 22:02:16), Hayden Griffiths once going for the door out of Cargo Bay (21:58:57), Netta Rader twice for Fore Port Maintenance (22:10:15, 22:10:18), Kailyn Patterson twice (22:13:10, 22:14:47). Every one stopped at (77,150,2). Each walk planned a fresh route of about the same length, so the planner kept going through the bot's square. The brain could do nothing with it:

    [2026-11-19 21:59:39.452] GAME-SAY: *no key*/(Tyson Jones) (mob_3017) "H-Hayden! I... I cannot move the MULEbot myself. Please wait a moment while I check with Jace in the lobby; they handle the crates and exits." (Cargo Bay (77,150,2))

Then read from the code as quoted above. The finder did not look at the map. The checker did: the bot's square, why it was there and the way round are now in the Check section.

See also: CHEAT-01 (fixed), whose step 3 added this stop and expected the brain to say "Excuse me". That works for people, not for bots.

## How to fix it

Checker's note: the steps below are the finder's. They work for this case, but they let the walk fail first and then start it again. There is a smaller way that never fails the walk, and I would take it. It is written first, as way A. The finder's steps are way B.

### Way A (preferred): go round during the walk

The move loop already plans again after every step that did not go through (`handle_move_attempt_failure` in `movement_types_navmap.dm`). Each new plan reads the loop's own `avoid` var (`movement_types_navmap.dm:149`), and the signal `COMSIG_MOVELOOP_NAVMAP_REPATH` is sent just before that (`:148`). Our movement datum already listens to it through the base `repath_incoming`. So:

1. Add `blocker_will_not_move(mob/living/blocker)` on the controller, as in way B step 2: TRUE for `TRAIT_NOMOBSWAP`, and for anything that is neither a player nor a crew NPC. A player or a crew NPC can be asked, so they stay as today.
2. In `on_bump` (`crew_npc_controller.dm`), when the bumped mob passes that test, keep `avoid_ref = WEAKREF(bumped)` and `avoid_turf = get_turf(bumped)` on the controller. Do it on the first bump: such a blocker will never swap, so there is nothing to wait for.
3. Override `repath_incoming` on `/datum/ai_movement/navmap_astar/crew_npc`. Call `..()`, then set `source.avoid` to the controller's `avoid_turf`, but only while the blocker still stands on it, and never when it is the body's own turf or the walk's target turf (the planner gives up at once when start is the avoid turf, `navmap.dm:239`). Otherwise set `source.avoid = null` and clear the controller's copy.
4. Clear `avoid_ref` and `avoid_turf` in `crew_npc_walk/setup`, next to `blocked_by = null`, so each walk starts clean.

The re-plan then goes round on the next step. The four-bump stop never fires, the brain is told nothing, and nothing is retried. Only one turf can be avoided. That is enough here: with straight steps only (`DIAGONAL_REMOVE_ALL`), once (77,151) is avoided the way down column 76 is shorter than any way through the second bot at (77,152). Two bots side by side across a one-wide way would still stop the body, and then today's "standing in your way" failure is the right answer.

### Way B (the finder's): fail, then walk again once

1. In `crew_npc_walk/perform` (`crew_npc_motor.dm`), before `blocked_by` is cleared, keep the blocker on the controller as `last_blocker` (a weakref) and its turf as `last_blocker_turf`.
2. Add a helper on the controller, `blocker_will_not_move(mob/living/blocker)`: TRUE when the blocker has `TRAIT_NOMOBSWAP`, or is not a human (bots, animals), or is a human with no mind and no client that is not a crew NPC. A crew NPC or a player can be asked, so they stay as today.
3. Give `/datum/ai_movement/navmap_astar/crew_npc` its own `setup_moveloop` that copies the base one and adds `avoid = crew_controller.avoid_turf` when the controller has one. Only one turf can be avoided; that is enough for one parked bot.
4. In `walk_finished` (`crew_npc_tools.dm`), when the reason is "standing in your way" and `blocker_will_not_move(last_blocker)`: set `avoid_turf = last_blocker_turf`, note when, and start the same walk again once (`start_walk(target, tool, goal)`), as `clear_the_way` does for a crate. Mark the walk so it is retried only once. If the second walk also fails, report it to the brain as today.
5. Drop `avoid_turf` when the blocker is gone from that turf (check on each new walk: `get_turf(last_blocker) != avoid_turf` or the blocker is deleted), or after a few minutes, so the square is not shunned for the rest of the round.
6. Do not avoid the turf when it is the walk's own target or the body's own turf; the planner fails at once if start is the avoid turf (`navmap.dm:239`).

For way B, step 3 does not need a copy of `setup_moveloop`: the loop that `start_moving_towards` returns can have its `avoid` var set, or the `repath_incoming` override from way A can do it.

What must keep working, for either way: a person in combat mode or holding a prisoner still stops the body with the same words, so the brain can ask them to move. Hauling (the load trails behind) must still work with the new `setup_moveloop`. This keeps the no-cheats rule: a player who finds a MULEbot in the way walks round it.

## How to test the fix

- Compile.
- The simulator does not model bodies or bots, so a scenario cannot show this. A round is needed.
- In a round, park a MULEbot in the Cargo Bay on the way from the counter to the Quartermaster's Office and send a technician to the office. Look in `game.log` for one "MULEbot ... is standing in your way" line for that body, then no second one, and the body arriving. Stand as a player in combat mode in the same spot and check the old behaviour still happens: the walk fails and the brain asks you to move.
- Grep the next round's `game.log` for `is standing in your way` and count lines per blocker name and square. More than two for one bot on one square means the fix did not take. With way A there should be none for a MULEbot at all.
- On MetaStation no setup is needed: both MULEbots start parked at (77,151) and (77,152). Send a technician from the counter to the Quartermaster's Office and watch it walk up column 76.

## Check

Opus 5.5, 2026-11-19. Confirmed.

What I read:

- The quotes. `crew_npc_motor.dm:142-150` (`perform`), `crew_npc_controller.dm:317-328` (`on_bump`), `crew_npc_tools.dm:414` and `:422-426` (`walk_finished`), `ai_movement_navmap_astar.dm:27` (`setup_moveloop`), `navmap.dm:239` and `:319`, `mulebot.dm:17` and `:76-77`, `living.dm:275-277`. All still say what the finding says. `on_bump` takes any `isliving` thing. The crew movement datum (`crew_npc_motor.dm:59-78`) overrides `start_moving_towards` only, so no `avoid` is ever passed. Nothing in `navmap.dm` looks at mobs.
- The round. `game.log` has the eleven lines, as listed. All stop at (77,150,2) and all name vGjkP.
- Where the bot was, and why. `transport.log`: "vGjkP: MULEbot successfuly set home location to ID QM #2 at 77, 151, 2", and the other bot, 79sNu, "QM #1 at 77, 152, 2", both at 21:46:05 (round start). The MetaStation map file puts both MULEbots on navbeacons at (77,151) and (77,152). No log line shows either one sent anywhere. So vGjkP sat on its home square, right in front of every walker, the whole round. It will do so in every MetaStation round.
- The way round. I read the map squares around it. Column 77 from y 149 to 153 is a catwalk along the wall of the Quartermaster's Office. Its north end is shut by a railing facing north at (77,153). Column 76 beside it, y 150 to 154, is open iron floor; the railing pieces at (76,153) and (75,149) are corners, which are not dense (`railings.dm:33`). With straight steps only, (77,150) to the square outside the office door at (78,154) is 7 steps up the catwalk and 7 steps up column 76. The planner broke the tie through the bots each time. A way round of the same length was open the whole round.
- Did the work stop for good. No. Tyson Jones was in the Quartermaster's Office talking at 22:03:25, so one walk got there, likely by another way in. It cost him about 14 minutes and six failed walks, and others five more. That fits medium, not high.
- Duplicates. I searched every finding, `NEXT_ROUND_CHECKS.md`, `LLM_CREW_CHANGELOG.md` and the plans for "standing in your way", MULEbot, `TRAIT_NOMOBSWAP` and avoid. CHEAT-01 (fixed) is where the stop came from; it does not cover blockers that cannot be asked. SENSE-06 is about the planner not seeing floor items, a different fault. No other round log has a MULEbot line. Not a duplicate.

What I changed: the bot's square in the first paragraph, the fix line, and way A added before the finder's steps. The finder's fix would work here too, but it lets each walk fail once, reports a failure the brain cannot use, and needs a retry flag. Way A goes round inside the walk with the hooks the move loop already has. Severity, effort and confidence stand.

Not checked: nothing was built or run. I did not prove that the planner's tie-break would pick column 76 once (77,151) is avoided; it must, since the only other ways are longer, but that is read from the map, not seen.
