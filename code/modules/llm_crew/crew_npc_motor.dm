/**
 * Behavior tree leaves for crew NPCs. These carry out actions and default behavior; they never choose goals.
 */

/// How many times running a walking body walks into the same person from the same tile before it takes it that they are in its way.
#define CREW_NPC_BLOCKED_BUMPS 4

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

/// TRUE if a crew member would be willing to stand on this turf: solid floor, breathable, and not an airlock to space.
/proc/crew_npc_safe_turf(turf/destination)
	if(!isopenturf(destination) || isspaceturf(destination))
		return FALSE
	// Stepping into an external airlock opens it and starts it cycling, which ends in vacuum.
	if(locate(/obj/machinery/door/airlock/external) in destination)
		return FALSE
	var/datum/gas_mixture/air = destination.return_air()
	if(isnull(air))
		return FALSE
	var/pressure = air.return_pressure()
	return pressure >= WARNING_LOW_PRESSURE && pressure <= WARNING_HIGH_PRESSURE

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

/// Notes on the body's controller how many steps the route just planned for it runs to. None at all means no way was found.
/datum/ai_movement/navmap_astar/crew_npc/proc/route_planned(datum/move_loop/has_target/navmap_astar/source, list/path)
	SIGNAL_HANDLER
	var/datum/ai_controller/crew_npc/crew_controller = source.extra_info
	if(istype(crew_controller))
		crew_controller.last_route_steps = length(path)

/// Walks the body to the person or spot held in the walk target key, then reports how it went to the controller.
/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk
	update_movement_for_moving_target = TRUE
	/// The person this walk is heading for.
	var/datum/weakref/walking_to_ref
	/// world.time this walk started, or was pointed at someone new.
	var/started_at = 0
	/// Why the walk failed, in words the body could have noticed.
	var/fail_reason

/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/setup(datum/ai_controller/controller)
	// People are walked up to; places are walked into.
	required_dist = isturf(controller.blackboard[target_key]) ? 0 : 1
	. = ..()
	if(!.)
		return
	walking_to_ref = WEAKREF(controller.blackboard[target_key])
	started_at = world.time
	fail_reason = null
	var/datum/ai_controller/crew_npc/crew_controller = controller
	if(istype(crew_controller))
		crew_controller.blocked_by = null
		crew_controller.blocked_bumps = 0

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
	if(movement_failed)
		fail_reason = CREW_NPC_NO_WAY
	return ..()

/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/finish_action(datum/ai_controller/controller, succeeded)
	var/atom/finished_target = walking_to_ref?.resolve()
	var/reason = fail_reason
	walking_to_ref = null
	fail_reason = null
	. = ..()
	var/datum/ai_controller/crew_npc/crew_controller = controller
	if(istype(crew_controller))
		crew_controller.walk_finished(finished_target, succeeded, reason)

#undef CREW_NPC_BLOCKED_BUMPS
