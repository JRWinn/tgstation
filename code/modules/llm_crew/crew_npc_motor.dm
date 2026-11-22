/**
 * Behavior tree leaves for crew NPCs. These carry out actions and default behavior; they never choose goals.
 */

/// How many times running a walking body walks into the same person from the same tile before it takes it that they are in its way.
#define CREW_NPC_BLOCKED_BUMPS 4
/// How long a body keeps clear of a room where it found the air bad (CHEAT-11). A vented room is mended in the end.
#define CREW_NPC_BAD_AIR_KEPT (5 MINUTES)
/// Why a walk stopped at the edge of bad air. Kept defined: walk_finished() in crew_npc_tools.dm reads it.
#define CREW_NPC_BAD_AIR "the air in there is bad"

/// Default wandering for crew NPCs. Unlike the generic wander it will not walk the body into places that kill it.
/datum/bt_node/ai_behavior/idle_random_walk/crew_npc

/datum/bt_node/ai_behavior/idle_random_walk/crew_npc/try_random_step(mob/living/living_pawn, seconds_per_tick, step_walk_chance)
	if(LAZYLEN(living_pawn.do_afters))
		return FALSE
	// A crew member taking a break stays where they are.
	var/datum/ai_controller/crew_npc/crew_controller = living_pawn.ai_controller
	if(istype(crew_controller) && (crew_controller.resting || crew_controller.return_to_post()))
		return FALSE
	// One waiting at a door to be let through stays at it. A step away and it is no longer standing
	// at the door: it cannot knock, and whoever comes to open it finds nobody there.
	if(istype(crew_controller) && !isnull(crew_controller.at_door_of()))
		return FALSE
	// Nor does one who has stopped to talk shuffle about meanwhile.
	if(istype(crew_controller) && world.time < crew_controller.talk_hold_until)
		return FALSE
	if(!SPT_PROB(step_walk_chance, seconds_per_tick) || !can_move(living_pawn))
		return FALSE
	// With no gravity nobody shuffles about: a step is a push off, and a drift (MAP-07).
	if(!living_pawn.has_gravity())
		return FALSE

	// Cardinals only: a diagonal step can bump a door beside the destination and open it.
	var/move_dir = pick(GLOB.cardinals)
	var/turf/destination_turf = get_step(living_pawn, move_dir)
	if(!destination_turf?.can_cross_safely(living_pawn) || !crew_npc_safe_turf(destination_turf))
		return FALSE
	// Shuffling about must never open a door. Walking into one does, for anyone it opens to, and a
	// door to a locked room that stands open lets in whoever happens to be passing.
	if(crew_npc_steps_into_door(living_pawn, destination_turf, move_dir))
		return FALSE
	// Crew at their post shift about on the spot. They do not drift off across the room.
	var/turf/post = istype(crew_controller) ? crew_controller.post_turf : null
	if(post && get_dist(living_pawn, post) <= CREW_NPC_POST_LEASH && get_dist(destination_turf, post) > CREW_NPC_POST_LEASH)
		return FALSE

	living_pawn.Move(destination_turf, move_dir)
	return TRUE

/**
 * TRUE if a crew member would be willing to stand on this turf: solid floor, breathable, and not an
 * airlock to space. Given the body, the game's own test for it is asked too (a hole to the floor
 * below, a chasm or lava are no floor: MAP-11); with none to hand, those are looked for by kind.
 */
/proc/crew_npc_safe_turf(turf/destination, mob/living/walker)
	return crew_npc_safe_floor(destination, walker) && crew_npc_air_ok(destination)

/**
 * The part of crew_npc_safe_turf() that is the map, which a body may know of anywhere: solid
 * floor, and not an airlock to space. The air is left out: that is felt or seen, not known from
 * across the station (CHEAT-11).
 */
/proc/crew_npc_safe_floor(turf/destination, mob/living/walker)
	if(!isopenturf(destination) || isspaceturf(destination))
		return FALSE
	if(walker)
		if(!destination.can_cross_safely(walker))
			return FALSE
	else if(HAS_TRAIT(destination, TRAIT_AI_AVOID_TURF))
		return FALSE
	else if(istype(destination, /turf/open/openspace) && !(locate(/obj/structure/lattice) in destination))
		return FALSE
	else if(istype(destination, /turf/open/chasm) && !HAS_TRAIT(destination, TRAIT_CHASM_STOPPED))
		return FALSE
	else if(istype(destination, /turf/open/lava) && !HAS_TRAIT(destination, TRAIT_LAVA_STOPPED))
		return FALSE
	// Stepping into an external airlock opens it and starts it cycling, which ends in vacuum.
	if(locate(/obj/machinery/door/airlock/external) in destination)
		return FALSE
	return TRUE

/// TRUE if the air on this turf is fit to breathe: its pressure between the warning limits a player's HUD shows.
/proc/crew_npc_air_ok(turf/destination)
	var/datum/gas_mixture/air = destination?.return_air()
	if(isnull(air))
		return FALSE
	var/pressure = air.return_pressure()
	return pressure >= WARNING_LOW_PRESSURE && pressure <= WARNING_HIGH_PRESSURE

/// Room name -> world.time the body last found the air bad there, on a square next to it or in sight (CHEAT-11).
/datum/ai_controller/crew_npc/var/list/bad_air_seen = list()

/// Notes that the body has found the air bad on this square, so that the room is kept clear of for a while.
/datum/ai_controller/crew_npc/proc/note_bad_air(turf/spot)
	var/room_name = get_area_name(spot, TRUE)
	if(!bad_air_seen[room_name])
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) found the air bad at [AREACOORD(spot)].")
	bad_air_seen[room_name] = world.time

/**
 * TRUE if the body would pick this square, which may be rooms away, to walk to or stand at
 * (CHEAT-11). The floor is the map, which it knows. The air it knows only as a player would: on a
 * square it can see now, or in a room where it found the air bad not long ago. A square out of
 * its sight in a room it has no such memory of is taken to have good air. The walk itself stops
 * at the edge of bad air (crew_npc_walk/perform), so a body is never walked into it unawares.
 */
/datum/ai_controller/crew_npc/proc/far_spot_safe(turf/spot)
	if(!crew_npc_safe_floor(spot, pawn))
		return FALSE
	var/room_name = get_area_name(spot, TRUE)
	var/seen_at = bad_air_seen[room_name]
	if(seen_at)
		if(world.time - seen_at < CREW_NPC_BAD_AIR_KEPT)
			return FALSE
		bad_air_seen -= room_name
	if(can_see(pawn, spot, CREW_NPC_VISION_RANGE) && !crew_npc_air_ok(spot))
		note_bad_air(spot)
		return FALSE
	return TRUE

/**
 * TRUE if the body has no gravity and nothing it could push off from, so that a player in its place
 * could not take a step (client/Move's Process_Spacemove). Pushes nothing off, as the step test must
 * not: the side-free part of /mob/Process_Spacemove. Buckled, pulled, flying or in magboots is no float.
 */
/proc/crew_npc_floating(mob/living/body)
	if(!isturf(body.loc) || body.has_gravity() || body.buckled || body.pulledby || body.throwing)
		return FALSE
	if(HAS_TRAIT(body, TRAIT_SPACEWALK) || HAS_TRAIT(body, TRAIT_FREE_FLOAT_MOVEMENT) || (body.movement_type & FLYING))
		return FALSE
	return isnull(body.get_spacemove_backup())

/// Pathfinding for crew NPCs. Crew walk across the whole station, far beyond the reach AI mobs normally need.
/datum/ai_movement/navmap_astar/crew_npc
	maximum_length = CREW_NPC_MAX_PATH_LENGTH
	// Straight steps only. People are got past by swapping places with them, and the game swaps
	// only head-on: a diagonal step into someone just stops.
	diagonal_flags = DIAGONAL_REMOVE_ALL

/datum/ai_movement/navmap_astar/crew_npc/start_moving_towards(datum/ai_controller/controller, atom/current_movement_target, min_distance, delay_override)
	var/datum/move_loop/loop = ..()
	// How long a route was planned, if any was. A walk that fails is logged with it, so that a round's
	// log tells a way that was shut from a way the planner thought was open and the body could not walk.
	if(loop)
		RegisterSignal(loop, COMSIG_MOVELOOP_NAVMAP_FINISHED_PATHING, PROC_REF(route_planned), override = TRUE)
	return loop

/// A step with no gravity and nothing to push off from is one a player could not take (MAP-07).
/datum/ai_movement/navmap_astar/crew_npc/allowed_to_move(datum/move_loop/source)
	. = ..()
	if(!.)
		return
	var/mob/living/walker = source.moving
	if(isliving(walker) && crew_npc_floating(walker))
		return FALSE

/// The first airlock on the newest route planned for the body that is shut and will not open for it, if any (KNA-03).
/datum/ai_controller/crew_npc/var/datum/weakref/route_shut_door
/// The first few squares of the newest route planned, for the log of a walk that fails (KNA-03).
/datum/ai_controller/crew_npc/var/route_head
/// The door a route was last logged as running through, so that each replan does not log it again.
/datum/ai_controller/crew_npc/var/datum/weakref/route_shut_logged

/// Notes on the body's controller how many steps the route just planned for it runs to. None at all means no way was found.
/datum/ai_movement/navmap_astar/crew_npc/proc/route_planned(datum/move_loop/has_target/navmap_astar/source, list/path)
	SIGNAL_HANDLER
	var/datum/ai_controller/crew_npc/crew_controller = source.extra_info
	if(!istype(crew_controller))
		return
	crew_controller.last_route_steps = length(path)
	crew_controller.note_route_doors(path)
	if(isnull(source.avoid))
		return
	var/atom/movable/blocker = crew_controller.avoid_ref?.resolve()
	// Someone in the way will not move; a thing on the floor (a peel, soap: SENSE-06) is gone round
	// rather than stepped on.
	var/someone = isnull(blocker) || isliving(blocker)
	// No way round what will not move: the next plan goes through it, and the body is stopped by it,
	// knowing who by, as before.
	if(!length(path))
		crew_controller.avoid_gave_up = TRUE
		crew_controller.avoid_ref = null
		crew_controller.avoid_turf = null
		log_game("Crew NPC [key_name(source.moving)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) found no way round [blocker?.name || "something"] at [AREACOORD(source.avoid)], [someone ? "which will not move" : "lying on the floor"].")
		return
	if(!crew_controller.avoid_logged)
		crew_controller.avoid_logged = TRUE
		log_game("Crew NPC [key_name(source.moving)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) went round [blocker?.name || "something"] at [AREACOORD(source.avoid)], [someone ? "which will not move" : "lying on the floor, rather than step on it"]: [length(path)] steps.")

/**
 * Looks along a route just planned for an airlock that is shut and will not open for the body:
 * locked to its ID, bolted, welded or without power (KNA-03). The planner has been seen to send a
 * janitor at the Cargo Bay's lobby door, locked to it, again and again, and the walk then bumped
 * the door for five seconds or more. The first such door is noted, and the walk ends on it at once
 * (crew_npc_walk/perform). The first squares of the route are kept for the log. A signal handler:
 * notes and logs only.
 */
/datum/ai_controller/crew_npc/proc/note_route_doors(list/path)
	route_shut_door = null
	var/list/head = list()
	for(var/turf/tile as anything in path)
		if(length(head) < 3)
			head += "([tile.x],[tile.y])"
		if(route_shut_door)
			if(length(head) >= 3)
				break
			continue
		var/obj/machinery/door/airlock/door = locate() in tile
		if(isnull(door) || !door.density)
			continue
		var/why
		if(door.welded)
			why = "welded"
		else if(door.locked)
			why = "bolted"
		else if(!door.hasPower())
			why = "without power"
		else if(!door.allowed(pawn))
			why = "does not open for it"
		if(isnull(why))
			continue
		route_shut_door = WEAKREF(door)
		if(route_shut_logged?.resolve() != door)
			route_shut_logged = route_shut_door
			log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) was routed through [door] at ([door.x],[door.y]), which is shut and [why], from [AREACOORD(pawn)].")
	route_head = length(head) ? head.Join(", ") : null

/// Each new plan of a walk leaves out the tile of something in the way that will never move (PLAY-04).
/datum/ai_movement/navmap_astar/crew_npc/repath_incoming(datum/move_loop/has_target/navmap_astar/source)
	. = ..()
	var/datum/ai_controller/crew_npc/crew_controller = source.extra_info
	source.avoid = istype(crew_controller) ? crew_controller.tile_to_go_round(source.target) : null

/// Walks the body to the person or spot held in the walk target key, then reports how it went to the controller.
/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk
	update_movement_for_moving_target = TRUE
	/// The person this walk is heading for.
	var/datum/weakref/walking_to_ref
	/// world.time this walk started, or was pointed at someone new.
	var/started_at = 0
	/// Why the walk failed, in words the body could have noticed.
	var/fail_reason
	/// The square the person it walks to was last seen on, once it has lost sight of them (CORE-03). Null while it can see them.
	var/turf/lost_at

/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/setup(datum/ai_controller/controller)
	// People are walked up to; places are walked into.
	required_dist = isturf(controller.blackboard[target_key]) ? 0 : 1
	. = ..()
	if(!.)
		return
	walking_to_ref = WEAKREF(controller.blackboard[target_key])
	started_at = world.time
	fail_reason = null
	lost_at = null
	var/datum/ai_controller/crew_npc/crew_controller = controller
	if(istype(crew_controller))
		crew_controller.blocked_by = null
		crew_controller.blocked_bumps = 0
		crew_controller.avoid_ref = null
		crew_controller.avoid_turf = null
		crew_controller.avoid_gave_up = FALSE
		crew_controller.avoid_logged = FALSE
		crew_controller.route_shut_door = null
		crew_controller.route_head = null

/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/perform(seconds_per_tick, datum/ai_controller/controller)
	var/atom/target = controller.blackboard[target_key]
	// A new target always comes with a fresh setup: start_walk ends the old walk first.

	var/datum/ai_controller/crew_npc/crew_controller = controller
	if(world.time - started_at > (crew_controller.walk_timeout || CREW_NPC_WALK_TIMEOUT))
		fail_reason = "it was taking too long"
		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
	// A crate that catches on someone or something is let go of. There is no hauling on without it.
	var/mob/living/puller = controller.pawn
	if(CREW_NPC_HAULS(crew_controller.walk_tool) && isnull(puller.pulling))
		fail_reason = crew_controller.walk_tool == CREW_TOOL_EVICT ? "they got away from you" : CREW_NPC_GRIP_LOST
		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
	// A walk to a door is over when the body is standing at the door, and not before. Close to the
	// spot beside it is not enough: that can be a tile too far to count as standing at the door, and
	// the body was then told it had arrived while still being asked to go.
	if(crew_controller.walk_tool == CREW_TOOL_TO_DOOR)
		if(!isnull(crew_controller.at_door_of()))
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED
	// For a walk to a room, standing in the room close to the remembered spot is arrival enough;
	// the spot itself may have someone or something on it.
	// Not for stepping aside, though. That is a walk of a tile or two, so close to the spot is
	// where it began, and the body was told it had stepped aside without having moved.
	else if(isturf(target) && crew_controller.walk_tool != CREW_TOOL_STEP_ASIDE && get_dist(controller.pawn, target) <= 2 && get_area(controller.pawn) == get_area(target))
		// Hauling something, it is the load that has to be in the room, and well clear of the way
		// in. The load trails a step behind, so a body that stops the moment it is through the door
		// leaves it in the doorway, where nobody else can get past it.
		var/mob/living/hauler = controller.pawn
		var/hauling = CREW_NPC_HAULS(crew_controller.walk_tool)
		if(hauling)
			if(hauler.pulling && get_area(hauler.pulling) == get_area(target) && crew_npc_clear_of_doors(hauler.pulling))
				return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED
		// Not hauling, it does not stop short in a doorway either. Two tiles short of a spot that
		// is clear of the doors is as often as not right beside one, and a body left there is
		// walked into by everyone who comes through. Where the spot itself is by a door, a closet
		// or the counter of a post, there is no better place to stop, and close is close enough.
		else if(!crew_npc_clear_of_doors(target) || crew_npc_clear_of_doors(hauler))
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED
	// Someone it cannot get past is standing in its way: in combat mode, holding a prisoner, or the
	// body is on walk intent. It is stopped, as a player would be, and it knows who by. The route
	// planner does not see people, so planning again only walks it into them again.
	var/mob/living/blocker = crew_controller.blocked_by?.resolve()
	if(!QDELETED(blocker) && crew_controller.blocked_bumps >= CREW_NPC_BLOCKED_BUMPS && world.time - crew_controller.blocked_at < 2 SECONDS && get_turf(puller) == crew_controller.blocked_from && blocker != target && blocker != puller.pulling)
		fail_reason = "[blocker.name] is standing in your way"
		crew_controller.blocked_by = null
		crew_controller.blocked_bumps = 0
		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
	// The route runs through a shut door that will not open for the body (KNA-03). It goes no
	// further: walking into the door only bumps it until the walk gives up. walk_finished() says
	// which door it was.
	var/obj/machinery/door/airlock/shut_door = crew_controller.route_shut_door?.resolve()
	if(!QDELETED(shut_door))
		if(shut_door.density)
			fail_reason = CREW_NPC_NO_WAY
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
		crew_controller.route_shut_door = null
	// The next square of the way has bad air (CHEAT-11). A body feels the cold and sees its HUD's
	// warning on the square in front of it, and goes no further. Out of good air already, it walks
	// on: that is the way out of it. Its room is kept clear of for a while.
	var/datum/move_loop/has_target/navmap_astar/loop = GLOB.move_manager.processing_on(controller.pawn, SSai_movement)
	if(istype(loop) && length(loop.movement_path))
		var/turf/standing = get_turf(puller)
		var/turf/next_square = loop.movement_path[1]
		if(isturf(next_square) && get_dist(standing, next_square) <= 1 && crew_npc_air_ok(standing) && !crew_npc_air_ok(next_square))
			crew_controller.note_bad_air(next_square)
			fail_reason = CREW_NPC_BAD_AIR
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
		// Standing in good air in a room it once found bad: the room is mended.
		if(istype(crew_controller) && length(crew_controller.bad_air_seen) && crew_npc_air_ok(standing))
			crew_controller.bad_air_seen -= get_area_name(standing, TRUE)
	// Someone it walks up to who goes out of sight is not followed by their steps (CORE-03). It walks
	// to where they were last seen and looks there: seen again, it goes on after them; not, it stops.
	if(ismob(target))
		if(lost_at)
			if(crew_controller.sees_again(target))
				log_game("Crew NPC [key_name(controller.pawn)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) saw [target.name] again at [AREACOORD(target)], and goes on after them.")
				lost_at = null
				controller.ai_movement.start_moving_towards(controller, target, required_dist)
				return AI_BEHAVIOR_INSTANT
			if(movement_failed || get_dist(controller.pawn, lost_at) <= 1)
				if(!movement_failed && crew_controller.sees_again(target, TRUE))
					lost_at = null
					controller.ai_movement.start_moving_towards(controller, target, required_dist)
					return AI_BEHAVIOR_INSTANT
				log_game("Crew NPC [key_name(controller.pawn)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) lost sight of [target.name] near [AREACOORD(lost_at)], and stops walking to them.")
				fail_reason = crew_controller.lost_sight_words(target, lost_at, FALSE)
				return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
			if(!controller.ai_movement.moving_controllers[controller])
				controller.ai_movement.start_moving_towards(controller, lost_at, 0)
			return AI_BEHAVIOR_INSTANT
		var/turf/last_spot = crew_controller.lost_sight_spot(target)
		if(last_spot)
			lost_at = last_spot
			log_game("Crew NPC [key_name(controller.pawn)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) lost sight of [target.name] on its walk to them: walking to where they were last seen, [AREACOORD(last_spot)].")
			controller.ai_movement.start_moving_towards(controller, last_spot, 0)
			return AI_BEHAVIOR_INSTANT
	if(movement_failed)
		// The move loop gives up on steps the body is not let take, as well as on a way that is shut.
		// A body held, strapped in or shut in something knows that is what stopped it (CORE-11).
		var/mob/living/walker = controller.pawn
		if(crew_npc_floating(walker))
			fail_reason = "you are floating, with nothing to push off from"
		else if(!isturf(walker.loc))
			fail_reason = "you are shut inside \the [walker.loc]"
		else if(walker.buckled?.anchored)
			fail_reason = "you are strapped into \the [walker.buckled]"
		else if(walker.pulledby && INCAPACITATED_IGNORING(walker, INCAPABLE_STASIS))
			fail_reason = "[walker.pulledby.name] has hold of you"
		else if(!(walker.mobility_flags & MOBILITY_MOVE))
			fail_reason = "you cannot move your legs"
		else
			fail_reason = CREW_NPC_NO_WAY
	return ..()

/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/finish_action(datum/ai_controller/controller, succeeded)
	var/atom/finished_target = walking_to_ref?.resolve()
	var/reason = fail_reason
	walking_to_ref = null
	fail_reason = null
	lost_at = null
	. = ..()
	var/datum/ai_controller/crew_npc/crew_controller = controller
	// Ended from outside, by the body going down: it was stunned, knocked out or tackled, not stopped
	// by the way (LIFE-01). Any other walk ended from outside was replaced, and reports for itself.
	if(!succeeded && isnull(reason) && (!controller.able_to_run || controller.ai_status == AI_STATUS_OFF))
		reason = CREW_NPC_WALK_KNOCKED_DOWN
	if(istype(crew_controller))
		crew_controller.walk_finished(finished_target, succeeded, reason)

#undef CREW_NPC_BLOCKED_BUMPS
#undef CREW_NPC_BAD_AIR_KEPT
