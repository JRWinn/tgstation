/**
 * Tools: the only way a crew NPC's brain can act through its body.
 *
 * Tool calls come from a player's client, so every part of them is untrusted. Each call is checked
 * against what the body can do right now, the way a human player's input would be, and a call the
 * body cannot carry out comes back to the brain as a sense event saying why.
 */

/// Handles one tool call from the owner's brain window.
/datum/ai_controller/crew_npc/proc/handle_tool_call(tool, list/arguments)
	if(!tool_call_allowed())
		return
	if(!istext(tool) || !(tool in list(CREW_TOOL_SAY, CREW_TOOL_WALK_TO, CREW_TOOL_GO_TO, CREW_TOOL_EXPLORE, CREW_TOOL_REST, CREW_TOOL_SEARCH, CREW_TOOL_PICK_UP, CREW_TOOL_PUT_DOWN, CREW_TOOL_GIVE, CREW_TOOL_CLEAN, CREW_TOOL_LOCATE, CREW_TOOL_ORDER, CREW_TOOL_RELEASE, CREW_TOOL_COLLECT, CREW_TOOL_CHECK_HELD, CREW_TOOL_MESSAGE, CREW_TOOL_GRENADE, CREW_TOOL_UNLOAD, CREW_TOOL_MAIL, CREW_TOOL_HAND_MAIL, CREW_TOOL_RECYCLE, CREW_TOOL_SEND, CREW_TOOL_HOLD, CREW_TOOL_DOOR, CREW_TOOL_TIDY, CREW_TOOL_TO_DOOR, CREW_TOOL_EVICT, CREW_TOOL_KNOCK, CREW_TOOL_RESET_ALARM, CREW_TOOL_TAKE_BACK, CREW_TOOL_STOW, CREW_TOOL_STEP_ASIDE, CREW_TOOL_NOTE, CREW_TOOL_PAPER, CREW_TOOL_WORD_PASSED, CREW_TOOL_OPEN_CRATE)))
		action_result(null, FALSE, "Your body does not know how to do that.")
		return
	if(!can_sense())
		action_result(tool, FALSE, "Your body is not responding.")
		return
	// Someone has it by the arm and is walking it out of a room. It can still speak, and that is all.
	if(world.time < in_hand_until && tool != CREW_TOOL_SAY && tool != CREW_TOOL_HOLD)
		action_result(tool, FALSE, "[in_hand_of] has you by the arm and is walking you out.")
		return
	if(!islist(arguments))
		arguments = list()

	switch(tool)
		if(CREW_TOOL_SAY)
			tool_say(arguments["text"])
		if(CREW_TOOL_WALK_TO)
			tool_walk_to(arguments["person"])
		if(CREW_TOOL_GO_TO)
			tool_go_to(arguments["place"])
		if(CREW_TOOL_EXPLORE)
			// Choosing somewhere to explore means testing routes, which takes time.
			INVOKE_ASYNC(src, PROC_REF(tool_explore))
		if(CREW_TOOL_REST)
			tool_rest()
		if(CREW_TOOL_SEARCH)
			tool_search()
		if(CREW_TOOL_PICK_UP)
			tool_pick_up(arguments["item"])
		if(CREW_TOOL_PUT_DOWN)
			tool_put_down()
		if(CREW_TOOL_GIVE)
			tool_give(arguments["person"])
		if(CREW_TOOL_CLEAN)
			tool_clean()
		if(CREW_TOOL_LOCATE)
			tool_locate()
		if(CREW_TOOL_ORDER)
			tool_order(arguments["crate"], arguments["for"], arguments["count"], arguments["items"], arguments["for_name"], arguments["via"], arguments["ref"])
		if(CREW_TOOL_NOTE)
			tool_note(arguments["lines"])
		if(CREW_TOOL_PAPER)
			tool_get_paper()
		if(CREW_TOOL_WORD_PASSED)
			tool_word_passed(arguments["person"], arguments["kind"])
		if(CREW_TOOL_OPEN_CRATE)
			tool_open_own_crate(arguments["number"])
		if(CREW_TOOL_RELEASE)
			tool_release(arguments["number"], arguments["person"])
		if(CREW_TOOL_COLLECT)
			tool_collect(arguments["number"], arguments["place"])
		if(CREW_TOOL_CHECK_HELD)
			tool_check_held()
		if(CREW_TOOL_UNLOAD)
			tool_unload()
		if(CREW_TOOL_MAIL)
			tool_collect_mail()
		if(CREW_TOOL_HAND_MAIL)
			tool_hand_mail(arguments["person"])
		if(CREW_TOOL_RECYCLE)
			tool_recycle()
		if(CREW_TOOL_STOW)
			tool_stow()
		if(CREW_TOOL_STEP_ASIDE)
			tool_step_aside(arguments["person"])
		if(CREW_TOOL_SEND)
			tool_send_shuttle()
		if(CREW_TOOL_HOLD)
			tool_hold(arguments["person"])
		if(CREW_TOOL_DOOR)
			tool_open_door(arguments["person"], arguments["place"], arguments["name"])
		if(CREW_TOOL_TIDY)
			tool_tidy()
		if(CREW_TOOL_TO_DOOR)
			tool_go_to_door(arguments["place"])
		if(CREW_TOOL_KNOCK)
			tool_knock()
		if(CREW_TOOL_TAKE_BACK)
			tool_take_back()
		if(CREW_TOOL_RESET_ALARM)
			tool_reset_alarm(arguments["place"])
		if(CREW_TOOL_EVICT)
			tool_throw_out(arguments["person"])
		if(CREW_TOOL_GRENADE)
			tool_grenade()
		if(CREW_TOOL_MESSAGE)
			tool_message(arguments["person"], arguments["text"])

/// Counts this tool call against the rate limit. Returns FALSE if it should be dropped.
/datum/ai_controller/crew_npc/proc/tool_call_allowed()
	if(world.time - tool_window_started > CREW_NPC_TOOL_WINDOW)
		tool_window_started = world.time
		tool_calls_in_window = 0
	tool_calls_in_window++
	if(tool_calls_in_window <= CREW_NPC_TOOL_CALL_LIMIT)
		return TRUE
	// Say so once per window, then drop the rest quietly so a runaway brain cannot flood its own senses.
	if(tool_calls_in_window == CREW_NPC_TOOL_CALL_LIMIT + 1)
		action_result(null, FALSE, "You are trying to do too many things at once. Slow down.")
	return FALSE

/// Tells the brain how an action went.
/datum/ai_controller/crew_npc/proc/action_result(tool, succeeded, text, list/extra_details)
	// The brain decides what to do next the moment it hears how this went. It has to decide on what
	// the body sees now, not on its last look, which may be from before it walked into the room.
	if(can_sense())
		look_around()
	var/list/details = list("tool" = tool, "ok" = succeeded)
	if(extra_details)
		details += extra_details
	emit_sense(CREW_SENSE_ACTION_RESULT, text, details)

/// Tool: say something aloud to whoever is nearby.
/datum/ai_controller/crew_npc/proc/tool_say(text)
	var/mob/living/carbon/human/body = pawn
	if(!istext(text))
		action_result(CREW_TOOL_SAY, FALSE, "You open your mouth but have nothing to say.")
		return

	var/static/regex/line_breaks = regex(@"[\r\n\t]+", "g")
	// Plain speech only: these prefixes would turn it into a radio message, an emote, a whisper or a special say mode.
	var/static/regex/say_prefixes = regex(@"^[\s;:.,*#%!^]+")
	text = line_breaks.Replace(text, " ")
	text = say_prefixes.Replace(text, "")
	text = trim(copytext_char(text, 1, CREW_NPC_SAY_MAX_LENGTH + 1))
	if(!length(text))
		action_result(CREW_TOOL_SAY, FALSE, "You open your mouth but have nothing to say.")
		return
	// Bodies without a client skip the server's word filter, so apply it here.
	if(is_ic_filtered(text))
		action_result(CREW_TOOL_SAY, FALSE, "You stop yourself before saying something you should not.")
		return
	if(!body.can_speak())
		action_result(CREW_TOOL_SAY, FALSE, "You try to speak but cannot.")
		return
	if(!COOLDOWN_FINISHED(src, say_cooldown))
		action_result(CREW_TOOL_SAY, FALSE, "You only just spoke. Wait a moment before speaking again.")
		return

	COOLDOWN_START(src, say_cooldown, CREW_NPC_SAY_COOLDOWN)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told by its brain to say: [text]")
	INVOKE_ASYNC(body, TYPE_PROC_REF(/atom/movable, say), text)
	// Nobody says their piece over their shoulder on the way out. It stops for it, and a moment after.
	stand_still(CREW_NPC_TALK_PAUSE)

/// Tool: walk up to a person the body can see.
/datum/ai_controller/crew_npc/proc/tool_walk_to(handle)
	var/mob/living/carbon/human/body = pawn
	if(!istext(handle))
		action_result(CREW_TOOL_WALK_TO, FALSE, "You did not pick anyone to walk to.")
		return

	var/datum/weakref/person_ref = handle_people[handle]
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person) || !recently_saw(person))
		action_result(CREW_TOOL_WALK_TO, FALSE, "You cannot see that person.")
		return
	// Already there: nothing to do. The brain is still told, or it waits to hear how the walk went.
	if(get_dist(body, person) <= 1)
		action_result(CREW_TOOL_WALK_TO, TRUE, "You are already next to [person.name].", list("handle" = handle))
		return

	start_walk(person, CREW_TOOL_WALK_TO, person.name, CREW_NPC_WALK_TIMEOUT)

/// Tool: walk to a room the body has been in before.
/datum/ai_controller/crew_npc/proc/tool_go_to(place)
	var/known_place = istext(place) ? find_known_place(place) : null
	if(isnull(known_place))
		action_result(CREW_TOOL_GO_TO, FALSE, "You do not know of anywhere aboard by that name.")
		return
	// Where the body stands this instant, not the room it last noted being in: pushed out of a room
	// since its last look, it is not in it, and telling it that it is sends it nowhere.
	var/turf/here = get_turf(pawn)
	if(known_place == get_area_name(here, TRUE))
		// In the room, but in its doorway: in the way of everyone who comes through, and one push
		// from being out of the room again. It goes in properly. Not at its own post, though: the
		// counter it works at has a window in it, and that is where it is meant to stand.
		var/turf/inside = known_place == post_place ? null : spot_inside(here)
		if(isnull(inside))
			action_result(CREW_TOOL_GO_TO, TRUE, "You are already in [known_place].", list("place" = known_place))
			return
		start_walk(inside, CREW_TOOL_GO_TO, known_place, CREW_NPC_WALK_TIMEOUT)
		return

	// It walks to the spot it knows the room by, if it has stood in it, and otherwise to somewhere
	// safe inside. A mess out of sight from there is clean's business: clean walks the body to a mess
	// it remembers, and copes if it cannot be reached.
	var/turf/destination = place_spot(known_place)
	if(isnull(destination))
		action_result(CREW_TOOL_GO_TO, FALSE, "You cannot work out the way back to [known_place].")
		return
	start_walk(destination, CREW_TOOL_GO_TO, known_place, CREW_NPC_TRAVEL_TIMEOUT)

/// Matches a place name from the brain against the station's rooms: those the body has been in first. Returns the room's real name, or null.
/datum/ai_controller/crew_npc/proc/find_known_place(place)
	var/wanted = LOWER_TEXT(trim(place))
	if(!length(wanted))
		return null
	for(var/list/names as anything in list(visited_places, crew_npc_station_places()))
		var/partial_match
		var/unclear = FALSE
		for(var/known_place in names)
			var/known_lower = LOWER_TEXT(known_place)
			if(known_lower == wanted)
				return known_place
			if(findtext(known_lower, wanted) || findtext(wanted, known_lower))
				// Two rooms fit a loose name, so it is not clear which is meant.
				if(partial_match)
					unclear = TRUE
				partial_match = known_place
		if(partial_match && !unclear)
			return partial_match
	return null

/// Tool: walk to a part of the station the body has not been in.
/datum/ai_controller/crew_npc/proc/tool_explore()
	if(choosing_where_to_explore)
		return
	choosing_where_to_explore = TRUE
	var/turf/destination = pick_somewhere_new()
	choosing_where_to_explore = FALSE
	if(QDELETED(src) || QDELETED(pawn))
		return
	if(isnull(destination))
		if(nowhere_new_left)
			action_result(CREW_TOOL_EXPLORE, FALSE, "You have seen every part of the station you can reach, and no storage is due a second look yet.")
		else
			note_way_out_failed()
			action_result(CREW_TOOL_EXPLORE, FALSE, "You look for a way to somewhere new but find none from here. There may be more to find another time.")
		return
	start_walk(destination, CREW_TOOL_EXPLORE, "somewhere new", CREW_NPC_TRAVEL_TIMEOUT)

/**
 * Picks a spot to explore: the nearest room the body has not been in and can walk to.
 *
 * Ordinary rooms and hallways come first. Maintenance tunnels are only chosen once every ordinary
 * room has been seen or found to be out of reach.
 * Sleeps while routes are tested. Returns a turf, or null if there is nowhere new left.
 */
/datum/ai_controller/crew_npc/proc/pick_somewhere_new()
	var/mob/living/carbon/human/body = pawn
	var/turf/here = get_turf(body)
	if(isnull(here))
		return null

	// Now and then, go back to storage looked through a while ago, to see what has changed.
	var/turf/second_look = stalest_storage_room()
	if(second_look && prob(CREW_NPC_REVISIT_CHANCE))
		return second_look

	var/list/rooms = list()
	var/list/tunnels = list()
	for(var/area/station/place in GLOB.areas)
		var/place_name = format_text(place.name)
		if(visited_places[place_name] || unreachable_places[place_name])
			continue
		if(!length(place.get_turfs_by_zlevel(here.z)))
			continue
		if(istype(place, /area/station/maintenance))
			tunnels += place
		else
			rooms += place

	// One group at a time: tunnels are not even considered while a room is left to try.
	for(var/list/group as anything in list(rooms, tunnels))
		var/tries_left = CREW_NPC_EXPLORE_TRIES
		while(length(group) && tries_left > 0)
			tries_left--
			var/area/station/nearest = nearest_place(group, here)
			if(isnull(nearest))
				break
			group -= nearest
			var/turf/spot = safe_spot_in(nearest, here)
			var/list/route
			if(spot)
				route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
				if(QDELETED(src) || QDELETED(body))
					return null
			if(length(route))
				return spot
			// No way in with this body's access. Do not keep trying it.
			unreachable_places[format_text(nearest.name)] = TRUE
		// Rooms were left over but none could be reached this time; leave the tunnels for later.
		if(length(group))
			nowhere_new_left = FALSE
			return null
	nowhere_new_left = TRUE
	// Nothing new to find, so keep up with what is already known.
	return second_look

/// Returns whichever of these areas has a turf closest to the given turf.
/datum/ai_controller/crew_npc/proc/nearest_place(list/places, turf/here)
	var/area/station/nearest
	var/nearest_distance = INFINITY
	for(var/area/station/place as anything in places)
		var/list/place_turfs = place.get_turfs_by_zlevel(here.z)
		if(!length(place_turfs))
			continue
		// A few samples are enough to rank rooms by how near they are.
		for(var/sample in 1 to 3)
			var/distance = get_dist(here, pick(place_turfs))
			if(distance < nearest_distance)
				nearest_distance = distance
				nearest = place
	return nearest

/**
 * Returns a turf in this area that is safe to stand on, as near the given turf as a quick search finds, or null.
 *
 * The nearest part of a room is its doorway, and a body left standing there is walked into by
 * everyone who comes through. So a spot clear of the doors is taken if the search finds one, and
 * one beside a door only if it does not: a closet may have no other.
 */
/datum/ai_controller/crew_npc/proc/safe_spot_in(area/station/place, turf/here)
	var/list/place_turfs = place.get_turfs_by_zlevel(here.z)
	var/turf/best
	var/best_distance = INFINITY
	var/turf/best_clear
	var/best_clear_distance = INFINITY
	for(var/sample in 1 to min(length(place_turfs), 40))
		var/turf/candidate = pick(place_turfs)
		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf())
			continue
		// Keep well clear of airlocks to space.
		if(locate(/obj/machinery/door/airlock/external) in range(2, candidate))
			continue
		var/distance = get_dist(here, candidate)
		if(distance < best_distance)
			best_distance = distance
			best = candidate
		if(distance < best_clear_distance && crew_npc_clear_of_doors(candidate))
			best_clear_distance = distance
			best_clear = candidate
	return best_clear || best

/// Tool: settle down where the body is and take a break. It stops wandering until it is next told to go somewhere.
/datum/ai_controller/crew_npc/proc/tool_rest()
	resting = TRUE

/// Sets the body walking to a person or a spot. The walk leaf reports back through walk_finished().
/datum/ai_controller/crew_npc/proc/start_walk(atom/target, tool, goal, timeout)
	walk_tool = tool
	walk_goal = goal
	walk_timeout = timeout
	last_route_steps = null
	resting = FALSE
	// Being sent somewhere ends any search or errand the body was on.
	cancel_search()
	cancel_errand()
	set_blackboard_key(BB_CREW_NPC_WALK_TARGET, target)

/// Called by the walk leaf when a walk ends for any reason.
/datum/ai_controller/crew_npc/proc/walk_finished(atom/target, succeeded, reason)
	// A newer walk has replaced this one; it will report for itself.
	if(blackboard[BB_CREW_NPC_WALK_TARGET] != target)
		return
	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
	var/tool = walk_tool
	var/goal = walk_goal
	var/why = reason || "you were interrupted"
	if(!succeeded)
		log_walk_failed(target, tool, goal, why)

	if(tool == CREW_TOOL_RELEASE)
		crate_released(succeeded, reason)
		return
	if(tool == CREW_TOOL_COLLECT)
		crate_collected(succeeded, reason)
		return
	if(tool == CREW_TOOL_UNLOAD || tool == CREW_TOOL_RECYCLE || tool == CREW_TOOL_STOW)
		freight_hauled(tool, succeeded, reason)
		return
	// Getting out of someone's way is over when the body is standing clear, wherever that is.
	if(tool == CREW_TOOL_STEP_ASIDE)
		action_result(tool, succeeded, succeeded ? "You step aside, out of the way." : "You could not get out of the way: [why].")
		return
	if(tool == CREW_TOOL_TAKE_BACK)
		crate_taken_back(succeeded, reason)
		return
	if(tool == CREW_TOOL_EVICT)
		put_out(succeeded, reason)
		return
	// A walk to a door ends at the door, whichever room that turns out to be the edge of.
	if(tool == CREW_TOOL_TO_DOOR)
		var/at_it = succeeded || !isnull(at_door_of())
		var/list/door_details = list("place" = get_area_name(pawn, TRUE))
		var/fire_doors = at_it ? "" : fire_door_report(door_details)
		// The door of another room that it cannot even get to, from inside rooms it was let into:
		// the door it came in by is what stands between it and there.
		if(!at_it && !wanted_door_leaving && reason == "there is no way through" && !length(fire_doors) && length(trail))
			shut_in = TRUE
		action_result(tool, at_it, at_it ? "You are at [goal]." : "You could not get to [goal]: [why].[fire_doors]", door_details)
		return
	// The body went back to its spot of its own accord. There is nothing to tell the brain.
	if(tool == CREW_TOOL_RETURN)
		return

	if(tool == CREW_TOOL_WALK_TO)
		if(QDELETED(target))
			action_result(tool, FALSE, "You stop walking: the person you were heading for is gone.")
			return
		var/list/details = list("handle" = handle_for(target))
		if(succeeded)
			action_result(tool, TRUE, "You arrive next to [goal].", details)
		// Someone behind a counter cannot be walked up to, but near enough to talk to is what was wanted.
		else if(get_dist(pawn, target) <= CREW_NPC_NEAR_ENOUGH && (target in view(CREW_NPC_VISION_RANGE, pawn)))
			action_result(tool, TRUE, "You cannot get any closer to [goal], but you are near enough to talk.", details)
		else
			action_result(tool, FALSE, "You stop walking to [goal]: [why].", details)
		return

	// Walks to places end with where the body actually is, which is what it would notice.
	var/arrived_in = get_area_name(pawn, TRUE)
	// The exact spot may be taken by someone or something. Being in the room is what was asked for.
	if(!succeeded && tool == CREW_TOOL_GO_TO && arrived_in == goal)
		succeeded = TRUE
	if(succeeded && tool == CREW_TOOL_EXPLORE)
		var/list/storage = storage_to_search(oview(CREW_NPC_VISION_RANGE, pawn))
		if(length(storage))
			// Exploring a room includes seeing what is kept in it. The report comes once that is done.
			addtimer(CALLBACK(src, PROC_REF(start_search), storage, CREW_TOOL_EXPLORE), 0.2 SECONDS)
			return
	if(succeeded)
		blocked_places -= arrived_in
		action_result(tool, TRUE, "You arrive in [arrived_in].", list("place" = arrived_in))
	else
		// A room it cannot find a way into is left alone for a while: a locked door does not open for asking twice.
		if(tool == CREW_TOOL_GO_TO && goal)
			blocked_places[goal] = world.time
		// The spot a head holds its meetings at is picked from a map, not walked to. If there turns
		// out to be no way to it, it takes another in the same room, the way anyone else would.
		if(tool == CREW_TOOL_GO_TO && goal && goal == meeting_place && reason == "there is no way through")
			var/area/station/meeting_room = crew_npc_station_places()[goal]
			var/turf/other_spot = meeting_room ? safe_spot_in(meeting_room, get_turf(pawn)) : null
			if(other_spot)
				visited_places[goal] = list(other_spot.x, other_spot.y, other_spot.z)
		// Somewhere new that turned out not to be reachable after all is not tried again.
		if(tool == CREW_TOOL_EXPLORE && isturf(target))
			unreachable_places[get_area_name(target, TRUE)] = TRUE
		// Fire doors shut across the way are not a locked room. It is not shut in, only held up, and
		// it is told so: a body that knows why it cannot get on can do something about it, or say so.
		var/list/stop_details = list("place" = arrived_in)
		var/fire_doors = reason == "there is no way through" ? fire_door_report(stop_details) : ""
		// Each way to a room it knows that comes to nothing adds up to being shut in. A room that is
		// locked to it does not count: failing to get into one says nothing about getting out of here.
		var/area/goal_room = isturf(target) ? get_area(target) : null
		if(reason == "there is no way through" && !length(fire_doors) && !(tool == CREW_TOOL_EXPLORE && isturf(target)) && !(goal_room && locked_out_of(goal_room)))
			note_way_out_failed()
		action_result(tool, FALSE, "You stop on the way to [goal]: [why].[fire_doors] You are in [arrived_in].", stop_details)

/**
 * Writes a walk that came to nothing to the round's game log: where the body stopped, where it
 * was heading, and whether a route was ever planned. "No way through" with a route planned means
 * the planner took something for open that the body could not walk through.
 */
/datum/ai_controller/crew_npc/proc/log_walk_failed(atom/target, tool, goal, why)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body))
		return
	var/route = isnull(last_route_steps) ? "no route had been planned yet" : (last_route_steps ? "the last route planned was [last_route_steps] steps" : "no route could be found")
	var/heading = QDELETED(target) ? "something that is gone" : "[target] at [AREACOORD(target)]"
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) walk failed ([tool], to [goal]): [why]. Stopped at [AREACOORD(body)], heading for [heading]; [route].")
