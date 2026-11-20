/**
 * Looking inside storage: closets, lockers and crates.
 *
 * What a container holds cannot be seen from outside, so the body does what a person would: it
 * walks up, opens it, looks, and shuts it again. Each look is reported to the brain as a sense
 * event, which is how a crew NPC learns where things are kept.
 */

/// Returns the storage in sight that is in the body's room and has not been looked inside lately, nearest first.
/datum/ai_controller/crew_npc/proc/storage_to_search(list/in_sight)
	var/static/list/ignored_types = typecacheof(list(
		/obj/structure/closet/body_bag,
		/obj/structure/closet/cardboard,
		/obj/structure/closet/crate/coffin,
		// A large wooden crate does not open by hand: it is pried apart with a crowbar, which breaks it.
		/obj/structure/closet/crate/large,
		/obj/structure/closet/supplypod,
	))
	var/mob/living/carbon/human/body = pawn
	var/area/here = get_area(body)
	var/list/found = list()
	for(var/obj/structure/closet/container in in_sight)
		if(ignored_types[container.type] || get_area(container) != here)
			continue
		var/last_checked = storage_checked_at[REF(container)]
		if(last_checked && world.time - last_checked < CREW_NPC_STORAGE_RECHECK)
			continue
		found += container

	// Nearest first, so the body works its way through the room without doubling back.
	var/list/nearest_first = list()
	while(length(found))
		var/obj/structure/closet/nearest
		var/nearest_distance = INFINITY
		for(var/obj/structure/closet/container as anything in found)
			var/distance = get_dist(body, container)
			if(distance < nearest_distance)
				nearest_distance = distance
				nearest = container
		found -= nearest
		nearest_first += nearest
	return nearest_first

/// Tool: look inside the storage in the room the body is in.
/datum/ai_controller/crew_npc/proc/tool_search()
	var/mob/living/carbon/human/body = pawn
	var/list/found = storage_to_search(oview(CREW_NPC_VISION_RANGE, body))
	if(!length(found))
		action_result(CREW_TOOL_SEARCH, FALSE, "There is no storage here that you have not already looked inside.")
		return
	start_search(found, CREW_TOOL_SEARCH)

/// Sets the body looking through these containers one by one. The storage leaves report back through storage_done().
/datum/ai_controller/crew_npc/proc/start_search(list/containers, tool)
	if(!can_sense())
		return
	storage_queue = containers.Copy(1, min(length(containers), CREW_NPC_STORAGE_PER_SEARCH) + 1)
	search_tool = tool
	search_count = 0
	resting = FALSE
	next_storage()

/// Abandons the search in progress without reporting on it. Used when the body is sent somewhere else.
/datum/ai_controller/crew_npc/proc/cancel_search()
	storage_queue = list()
	search_tool = null
	clear_blackboard_key(BB_CREW_NPC_STORAGE_TARGET)

/// Points the body at the next container still to be looked inside, or ends the search if there are none.
/datum/ai_controller/crew_npc/proc/next_storage()
	while(length(storage_queue))
		var/obj/structure/closet/container = storage_queue[1]
		storage_queue.Cut(1, 2)
		if(QDELETED(container))
			continue
		set_blackboard_key(BB_CREW_NPC_STORAGE_TARGET, container)
		storage_target_at = world.time
		addtimer(CALLBACK(src, PROC_REF(storage_overdue), container, storage_target_at), CREW_NPC_ERRAND_LIMIT)
		return
	finish_search()

/// world.time the body was last pointed at a container to look inside.
/datum/ai_controller/crew_npc/var/storage_target_at = 0

/// The backstop for a look in a container that never ended: the search is given up, and the brain told.
/datum/ai_controller/crew_npc/proc/storage_overdue(obj/structure/closet/container, set_at)
	if(QDELETED(src) || storage_target_at != set_at || blackboard[BB_CREW_NPC_STORAGE_TARGET] != container)
		return
	var/tool = search_tool
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) gave up its search: still not done with one container after [DisplayTimeText(CREW_NPC_ERRAND_LIMIT)].")
	cancel_search()
	if(tool)
		action_result(tool, FALSE, "You could not finish looking through the storage.")

/**
 * Moves a search on past a container that was deleted while the body walked to it or looked in it:
 * the tree dropped the look, and nothing else would (RT-02). `set_at` is the storage_target_at of
 * that container. See sig_remove_from_blackboard().
 */
/datum/ai_controller/crew_npc/proc/storage_target_gone(set_at)
	if(QDELETED(src) || isnull(search_tool) || storage_target_at != set_at || blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET))
		return
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) lost a container it was going to look in: it was gone. Moving the search on.")
	next_storage()

/// Ends the search and tells the brain how it went.
/datum/ai_controller/crew_npc/proc/finish_search()
	clear_blackboard_key(BB_CREW_NPC_STORAGE_TARGET)
	var/tool = search_tool
	if(isnull(tool))
		return
	search_tool = null
	var/place = get_area_name(pawn, TRUE)
	room_searched_at[place] = world.time
	var/arrival = tool == CREW_TOOL_EXPLORE ? "You arrive in [place]. " : ""
	if(search_count)
		action_result(tool, TRUE, "[arrival]You have looked through the storage in [place].", list("place" = place))
	else
		action_result(tool, TRUE, "[arrival]You could not get into any of the storage in [place].", list("place" = place))

/**
 * Opens a container, sees what is in it, and shuts it again. Sleeps while the body looks.
 *
 * Returns a list with "state" ("looked", "open", "locked" or "unreached") and, when the body
 * could see inside, "contents": item names with how many of each.
 */
/datum/ai_controller/crew_npc/proc/look_inside(obj/structure/closet/container)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(container) || QDELETED(body) || !can_reach_target_now(container))
		return list("state" = "unreached")
	body.face_atom(container)
	// Already standing open: whatever it held is lying about in plain view, in front of it. Seen as
	// what it holds, as a person standing there would. Often a workmate has it open for a look, and
	// shuts it again with all that inside.
	if(container.opened)
		var/list/in_front = list()
		for(var/obj/item/thing in container.drop_location())
			in_front[format_text(thing.name)]++
		return list("state" = "looked", "contents" = in_front)
	// A large wooden crate is pried apart with a crowbar, not opened by hand.
	if(istype(container, /obj/structure/closet/crate/large))
		return list("state" = "locked")

	// Opening a container tips what it holds out onto its tile, and a container that has never been
	// opened does not even have its contents until then. So note what is lying there first, open it,
	// and whatever is newly there is what was inside.
	var/atom/spill = container.drop_location()
	var/list/already_there = list()
	for(var/atom/movable/thing in spill)
		already_there[thing] = TRUE
	if(!container.open(body))
		return list("state" = "locked")
	var/list/inside = list()
	for(var/obj/item/thing in spill)
		if(!already_there[thing])
			inside[format_text(thing.name)]++
	var/list/people = came_out_of(container, already_there)
	sleep(CREW_NPC_LOOK_TIME)
	// Shut again, unless someone has come to be on its tile meanwhile, the body included: they would be shut inside.
	if(!QDELETED(container) && container.opened && !crew_npc_someone_on(get_turf(container)))
		container.close(body)
	return list("state" = "looked", "contents" = inside, "people" = people)

/**
 * Who tumbled out of a container on opening it: anyone alive on its tile who was not there before
 * (already_there holds what was). Each as the body sees them, "Joe Bloggs, out cold". Logged.
 */
/datum/ai_controller/crew_npc/proc/came_out_of(obj/structure/closet/container, list/already_there)
	var/list/people = list()
	for(var/mob/living/someone in container.drop_location())
		if(someone == pawn || already_there[someone])
			continue
		var/state = ""
		if(someone.stat >= HARD_CRIT)
			state = ", out cold"
		else if(someone.body_position == LYING_DOWN)
			state = ", lying down"
		people += "[someone.name][state]"
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) found [key_name(someone)] inside the [format_text(container.name)] at [AREACOORD(container)].")
	return people

/// Called by the storage leaves when the body has finished with a container, whether or not it saw inside.
/datum/ai_controller/crew_npc/proc/storage_done(obj/structure/closet/container, list/result)
	if(!QDELETED(container))
		// Recorded even on failure, so a locked or blocked container is not tried again straight away.
		storage_checked_at[REF(container)] = world.time
		var/state = result?["state"] || "unreached"
		if(state != "unreached")
			report_storage(container, state, result["contents"], result["people"])
		if(state == "looked")
			search_count++
	next_storage()

/// Tells the brain what the body found on looking at a container.
/datum/ai_controller/crew_npc/proc/report_storage(obj/structure/closet/container, state, list/inside, list/people)
	var/container_name = format_text(container.name)
	var/place = get_area_name(container, TRUE)
	var/list/contents = list()
	var/list/described = list()
	for(var/item_name in inside)
		var/count = inside[item_name]
		contents += list(list("name" = item_name, "count" = count))
		described += count > 1 ? "[item_name] x[count]" : item_name

	// The body's own memory of the container, used when it is later asked to fetch something.
	if(state != "locked")
		var/list/item_names = list()
		for(var/item_name in inside)
			item_names += item_name
		storage_memory[REF(container)] = list("container" = WEAKREF(container), "items" = item_names)
	else
		// Found shut to it: what it held last time is still remembered, and still true as far as the body
		// knows, but it is not gone to for that for a while. Each pick up walked back to a welded or locked
		// locker and was told so again, and a janitor that had lost its mop never asked for another (HAND-05).
		var/list/known = storage_memory[REF(container)]
		var/datum/weakref/known_ref = known?["container"]
		if(known && known_ref?.resolve() == container)
			known["shut_at"] = world.time
		else
			storage_memory[REF(container)] = list("container" = WEAKREF(container), "items" = list(), "shut_at" = world.time)

	var/text
	switch(state)
		if("looked")
			text = "You look inside the [container_name] in [place]: [length(described) ? described.Join(", ") : "it is empty"]."
		if("open")
			text = "The [container_name] in [place] is standing open with nothing left inside."
		if("locked")
			text = "The [container_name] in [place] is locked."
	// Someone who tumbled out of it on opening is said first.
	if(length(people))
		text = "Inside the [container_name] in [place] you find [english_list(people)]! [text]"
	emit_sense(CREW_SENSE_STORAGE_SEEN, text, list(
		"place" = place,
		"container" = container_name,
		"state" = state,
		"contents" = contents,
		"people" = people || list(),
	))

/// Returns a spot in the room whose storage was looked through longest ago and is due a second look, or null.
/datum/ai_controller/crew_npc/proc/stalest_storage_room()
	var/stalest_place
	var/stalest_time = world.time - CREW_NPC_STORAGE_RECHECK
	for(var/place in room_searched_at)
		if(place == current_place)
			continue
		if(room_searched_at[place] < stalest_time)
			stalest_time = room_searched_at[place]
			stalest_place = place
	if(isnull(stalest_place))
		return null
	var/list/spot = visited_places[stalest_place]
	return isnull(spot) ? null : locate(spot[1], spot[2], spot[3])

/// Walks to something with a time limit, so one that cannot be reached does not hold the body up for ever.
/datum/bt_node/ai_behavior/move_to_target/crew_npc_reach
	/// How long the walk may take.
	var/time_limit = CREW_NPC_REACH_TIMEOUT
	/// world.time this walk started.
	var/started_at = 0
	/// The square it is walking round to, when the target is one tile off but cut off from it. Null otherwise.
	var/turf/stand_at
	/// TRUE once this walk has had to go round to such a square.
	var/walked_round = FALSE

/datum/bt_node/ai_behavior/move_to_target/crew_npc_reach/setup(datum/ai_controller/controller)
	var/datum/ai_controller/crew_npc/crew_controller = controller
	required_dist = crew_controller.reach_distance(controller.blackboard[target_key])
	. = ..()
	if(.)
		started_at = world.time

/datum/bt_node/ai_behavior/move_to_target/crew_npc_reach/perform(seconds_per_tick, datum/ai_controller/controller)
	// An errand's run from before a stun is still at work: the walk does not pull the body against its
	// steps, and the wait is not counted against the walk's time.
	var/datum/ai_controller/crew_npc/crew_controller = controller
	if(target_key == BB_CREW_NPC_ERRAND_TARGET && crew_controller.errand_in_flight)
		controller.ai_movement.stop_moving_towards(controller)
		started_at = world.time
		return AI_BEHAVIOR_DELAY
	if(world.time - started_at > time_limit)
		return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
	var/atom/target = controller.blackboard[target_key]
	// Walking round to a square the target can be touched from: done when it can be (HAND-08).
	if(stand_at)
		if(movement_failed || QDELETED(target))
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
		if(crew_controller.can_reach_target_now(target))
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED
		if(get_turf(controller.pawn) == stand_at)
			// There, and still cut off from it: the thing has moved, or the way has changed. Look again.
			stand_at = null
		else
			if(!controller.ai_movement.moving_controllers[controller])
				controller.ai_movement.start_moving_towards(controller, stand_at, 0)
			return AI_BEHAVIOR_INSTANT
	// One tile off counts as there to the walk, but a windoor, a thin window, a shut border fire door
	// or a corner between can be in the way. The body stood there, was told it could not get to it,
	// and did the same on every try, where a player walks round (HAND-08). A thing thrown from a few
	// tiles off, and someone being arrested, who will not stand still, are left to their own code.
	if(required_dist == 1 && !QDELETED(target) && get_dist(controller.pawn, target) <= 1 && !crew_controller.can_reach_target_now(target) \
		&& !(target_key == BB_CREW_NPC_ERRAND_TARGET && crew_controller.errand_tool == CREW_TOOL_ARREST))
		stand_at = crew_controller.spot_to_reach(target)
		if(isnull(stand_at))
			log_game("Crew NPC [key_name(controller.pawn)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) is by the [target.name] at [AREACOORD(target)] but cut off from it, and there is nowhere beside it to reach it from.")
			return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_FAILED
		log_game("Crew NPC [key_name(controller.pawn)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) is by the [target.name] at [AREACOORD(target)] but cut off from it: walking round to [AREACOORD(stand_at)].")
		// The way round may be a long one: the first time, it has its own time to walk it in.
		if(!walked_round)
			walked_round = TRUE
			started_at = world.time
		controller.ai_movement.start_moving_towards(controller, stand_at, 0)
		return AI_BEHAVIOR_INSTANT
	return ..()

/datum/bt_node/ai_behavior/move_to_target/crew_npc_reach/finish_action(datum/ai_controller/controller, succeeded)
	stand_at = null
	walked_round = FALSE
	return ..()

/**
 * Returns the open square nearest the body from which this can be touched, with no windoor, thin
 * window or corner between, or null if there is none. The thing's own square counts if it can be
 * stood on. A square someone is standing on counts: they can be asked or swapped past.
 */
/datum/ai_controller/crew_npc/proc/spot_to_reach(atom/target)
	var/turf/target_turf = get_turf(target)
	if(isnull(target_turf))
		return null
	// Not where it stands: it is cut off from there, or it would not be asking.
	var/turf/here = get_turf(pawn)
	var/turf/best
	var/best_distance = INFINITY
	for(var/turf/open/spot in range(1, target_turf))
		if(spot == here || isspaceturf(spot) || isgroundlessturf(spot) || spot.is_blocked_turf(exclude_mobs = TRUE))
			continue
		if(spot != target_turf && !target_turf.Adjacent(spot, target = spot, mover = ismovable(target) ? target : null))
			continue
		var/distance = get_dist(pawn, spot)
		if(distance < best_distance)
			best_distance = distance
			best = spot
	return best

/// Opens the container the body is standing by, looks inside and shuts it.
/datum/bt_node/ai_behavior/crew_npc_look_inside
	/// Blackboard key holding the container.
	var/target_key

/datum/bt_node/ai_behavior/crew_npc_look_inside/perform(seconds_per_tick, datum/ai_controller/controller)
	var/async_flags = handle_async()
	if(async_flags)
		return async_flags
	if(QDELETED(controller.blackboard[target_key]))
		return AI_BEHAVIOR_DELAY | AI_BEHAVIOR_FAILED
	return start_async()

/datum/bt_node/ai_behavior/crew_npc_look_inside/perform_async(datum/ai_controller/controller)
	var/datum/ai_controller/crew_npc/crew_controller = controller
	var/obj/structure/closet/container = controller.blackboard[target_key]
	var/list/result
	// An error in the look must not leave the search stuck: it is logged, and the search moved on.
	try
		result = crew_controller.look_inside(container)
	catch(var/exception/error)
		log_game("Crew NPC [key_name(controller.pawn)] (owner: [crew_controller.brain_link?.owner_ckey || "none"]) look inside stopped on an error: [error.name] at [error.file]:[error.line].")
		stack_trace("crew NPC look inside: [error.name] at [error.file]:[error.line]")
		result = list("state" = "unreached")
	if(!async_still_valid())
		return
	finish_async(AI_BEHAVIOR_SUCCEEDED)
	crew_controller.storage_done(container, result)

/// Gives up on a container the body could not get to, and moves the search on.
/datum/bt_node/ai_behavior/crew_npc_skip_storage
	/// Blackboard key holding the container.
	var/target_key

/datum/bt_node/ai_behavior/crew_npc_skip_storage/perform(seconds_per_tick, datum/ai_controller/controller)
	var/datum/ai_controller/crew_npc/crew_controller = controller
	crew_controller.storage_done(controller.blackboard[target_key], null)
	return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED
