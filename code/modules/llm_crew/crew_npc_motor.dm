/**
 * Behavior tree leaves for crew NPCs. These carry out actions and default behavior; they never choose goals.
 */

/// Default wandering for crew NPCs. Unlike the generic wander it will not walk the body into places that kill it.
/datum/bt_node/ai_behavior/idle_random_walk/crew_npc

/datum/bt_node/ai_behavior/idle_random_walk/crew_npc/try_random_step(mob/living/living_pawn, seconds_per_tick, step_walk_chance)
	if(LAZYLEN(living_pawn.do_afters))
		return FALSE
	// A crew member taking a break stays where they are.
	var/datum/ai_controller/crew_npc/crew_controller = living_pawn.ai_controller
	if(istype(crew_controller) && (crew_controller.resting || crew_controller.return_to_post()))
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

/datum/bt_node/ai_behavior/move_to_target/crew_npc_walk/perform(seconds_per_tick, datum/ai_controller/controller)
	var/atom/target = controller.blackboard[target_key]
	if(!QDELETED(target) && target != walking_to_ref?.resolve())
		// Told to walk to someone else mid-walk; the parent retargets, we restart the clock.
		walking_to_ref = WEAKREF(target)
		started_at = world.time

	var/datum/ai_controller/crew_npc/crew_controller = controller
	if(world.time - started_at > (crew_controller.walk_timeout || CREW_NPC_WALK_TIMEOUT))
		fail_reason = "it was taking too long"
		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
	// A crate that catches on someone or something is let go of. There is no hauling on without it.
	var/mob/living/puller = controller.pawn
	if((crew_controller.walk_tool == CREW_TOOL_BRING || crew_controller.walk_tool == CREW_TOOL_UNLOAD || crew_controller.walk_tool == CREW_TOOL_RECYCLE) && isnull(puller.pulling))
		fail_reason = "it caught on something and you lost your grip on it"
		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
	// For a walk to a room, standing in the room close to the remembered spot is arrival enough;
	// the spot itself may have someone or something on it.
	if(isturf(target) && get_dist(controller.pawn, target) <= 2 && get_area(controller.pawn) == get_area(target))
		// Hauling something, it is the load that has to be in the room, and well clear of the way
		// in. The load trails a step behind, so a body that stops the moment it is through the door
		// leaves it in the doorway, where nobody else can get past it.
		var/mob/living/hauler = controller.pawn
		var/hauling = crew_controller.walk_tool == CREW_TOOL_BRING || crew_controller.walk_tool == CREW_TOOL_UNLOAD || crew_controller.walk_tool == CREW_TOOL_RECYCLE
		if(!hauling || (hauler.pulling && get_area(hauler.pulling) == get_area(target) && crew_npc_clear_of_doors(hauler.pulling)))
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED
	if(movement_failed)
		fail_reason = "there is no way through"
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
