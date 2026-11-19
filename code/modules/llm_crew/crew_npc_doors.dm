/**
 * Doors, and the people on either side of them.
 *
 * A body finds out whether it is really shut in, not just having no luck with one route. Cargo
 * staff open the door of their post for a janitor they have called to a mess in there, and for
 * anyone inside who wants out. And a body that could not get a crate past someone knows who was
 * standing in the way, so it can ask them to move.
 */

/**
 * Stops the body where it stands for a moment, the way someone stops to talk. Whatever walk it was
 * on carries on by itself afterwards.
 */
/datum/ai_controller/crew_npc/proc/stand_still(time, atom/facing)
	var/mob/living/carbon/human/body = pawn
	var/already_still = world.time < talk_hold_until
	talk_hold_until = max(talk_hold_until, world.time + time)
	ADD_TRAIT(body, TRAIT_AI_MOVEMENT_HALTED, CREW_NPC_TALK_TRAIT)
	if(!already_still)
		keep_still()
	if(!QDELETED(facing) && facing != body)
		body.face_atom(facing)

/// Keeps the body standing still until its moment to talk is over, then lets it walk on.
/datum/ai_controller/crew_npc/proc/keep_still()
	if(QDELETED(src) || QDELETED(pawn))
		return
	if(world.time >= talk_hold_until)
		REMOVE_TRAIT(pawn, TRAIT_AI_MOVEMENT_HALTED, CREW_NPC_TALK_TRAIT)
		return
	// A walk that is held up gives itself up as lost after so many tries. This one is only waiting.
	consecutive_pathing_attempts = 0
	addtimer(CALLBACK(src, PROC_REF(keep_still)), 0.5 SECONDS)

/// Tool: stop walking for a moment, because the body is about to talk with someone.
/datum/ai_controller/crew_npc/proc/tool_hold(handle)
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	stand_still(CREW_NPC_TALK_HOLD, (person && recently_saw(person)) ? person : null)

/// Notes that the body tried to leave the room it is in and found no way out, and looks into whether it is shut in.
/datum/ai_controller/crew_npc/proc/note_way_out_failed()
	ways_out_failed++
	// A body that came in through a door it cannot open knows that door is shut behind it. One walk
	// that came to nothing is enough: it goes back the way it came, and means to until it is out.
	if(length(trail))
		shut_in = TRUE
		wants_out = TRUE
		return
	if(ways_out_failed >= CREW_NPC_SHUT_IN_AFTER && !shut_in)
		INVOKE_ASYNC(src, PROC_REF(check_shut_in))

/**
 * Keeps the trail true to a step from one room into another. Called once, as the body arrives.
 *
 * Nothing here takes a room to be locked for good: a wall may be blown open, a door left standing.
 * The trail is only what the body remembers of how it came, to fall back on when it cannot walk out.
 */
/datum/ai_controller/crew_npc/proc/follow_trail(came_from, place)
	// Back where the trail began: it is out.
	if(length(trail) && trail[1]["from"] == place)
		forget_trail()
		return
	// Back in a room it came through: the way out from here is the way it first came into it.
	for(var/index in 1 to length(trail))
		var/list/entry = trail[index]
		if(entry["place"] == place)
			trail.Cut(index + 1)
			return
	// Somewhere its own ID lets it out of, however it got there: it is out.
	if(!out_of_bounds)
		forget_trail()
		return
	// It has not walked in from anywhere: the round has only just begun, or it was put here.
	if(isnull(came_from))
		return
	var/held_for_it = let_into_place == place
	trail += list(list(
		"place" = place,
		"from" = came_from,
		"door" = held_for_it ? let_in_door : null,
		"by" = held_for_it ? let_in_by : null,
	))

/// Drops the trail: the body is out, and how it came no longer matters.
/datum/ai_controller/crew_npc/proc/forget_trail()
	trail = list()
	wants_out = FALSE

/// Returns what the trail says of the room the body is in, or null if it did not come into it by a way it remembers.
/datum/ai_controller/crew_npc/proc/trail_entry()
	for(var/list/entry as anything in trail)
		if(entry["place"] == current_place)
			return entry
	return null

/// Returns the name of the room the body is trying to get back out to: where it was last out. Null if it has no trail.
/datum/ai_controller/crew_npc/proc/way_out_to()
	if(!length(trail))
		return null
	var/list/first = trail[1]
	return first["from"]

/**
 * Returns the door the body came into this room by, or null if it does not know of one. If
 * nobody held one for it, it is the nearest door that leads back to the room it came from.
 */
/datum/ai_controller/crew_npc/proc/trail_door()
	var/list/entry = trail_entry()
	if(isnull(entry))
		return null
	var/datum/weakref/door_ref = entry["door"]
	var/obj/machinery/door/airlock/held = door_ref?.resolve()
	if(!QDELETED(held))
		return held
	var/mob/living/carbon/human/body = pawn
	var/list/doors = crew_npc_doors_of(get_area(body), body.z)
	var/obj/machinery/door/airlock/nearest
	var/nearest_distance = INFINITY
	for(var/obj/machinery/door/airlock/door as anything in doors)
		var/list/sides = doors[door]
		if(get_area_name(sides[2], TRUE) != entry["from"])
			continue
		var/distance = get_dist(body, door)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = door
	return nearest

/**
 * Returns the names of those on the body's PDA whose own ID opens the door it came in by: who it
 * can send word to when nobody comes to let it out. Empty unless it is shut in and knows the door.
 */
/datum/ai_controller/crew_npc/proc/door_keepers()
	var/list/names = list()
	var/list/heads = list()
	var/list/captains = list()
	if(!shut_in)
		return names
	var/obj/machinery/door/airlock/door = trail_door()
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(isnull(door) || isnull(own_messenger))
		return names
	for(var/messenger_ref in GLOB.pda_messengers)
		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
		if(candidate == own_messenger || isnull(candidate.computer) || !candidate.computer.saved_identification)
			continue
		var/turf/where = get_turf(candidate.computer)
		if(isnull(where) || !is_station_level(where.z))
			continue
		// The card in the PDA, or failing that the one its holder wears: most of the crew wear
		// theirs. Going only by a card in the PDA, nobody was ever found to write to, and a janitor
		// shut in a cargo room wrote to its own head and to no technician.
		var/obj/item/card/id/card = candidate.computer.stored_id
		if(isnull(card))
			var/mob/living/holder = get(candidate.computer, /mob/living)
			card = holder?.get_idcard(TRUE)
		if(!card || !door.check_access(card))
			continue
		// Whoever works behind that door before a head, and a head before the Captain, whose card
		// opens every door on the station: a janitor shut in a cargo room wrote to the Captain,
		// with two cargo technicians a room away.
		var/datum/job/their_job = SSjob.get_job(candidate.computer.saved_job)
		if(istype(their_job, /datum/job/captain))
			captains += candidate.computer.saved_identification
		else if(their_job?.departments_bitflags & DEPARTMENT_BITFLAG_COMMAND)
			heads += candidate.computer.saved_identification
		else
			names += candidate.computer.saved_identification
	return names + heads + captains

/// Returns the name of whoever let the body into the room it is in, or null if nobody did.
/datum/ai_controller/crew_npc/proc/who_let_in()
	var/list/entry = trail_entry()
	if(entry && entry["by"])
		return entry["by"]
	return let_into_place == current_place ? let_in_by : null

/**
 * Works out whether the body really cannot get out of the room it is in, by looking for a way to
 * the nearest few rooms it knows. One route that came to nothing, or a part of the station it
 * cannot reach, is not being shut in. Sleeps while routes are tested.
 */
/datum/ai_controller/crew_npc/proc/check_shut_in()
	if(checking_shut_in)
		return
	checking_shut_in = TRUE
	var/mob/living/carbon/human/body = pawn
	var/turf/here = get_turf(body)
	var/room = current_place
	var/list/spots = list()
	for(var/place in visited_places)
		if(place == room)
			continue
		var/list/spot = visited_places[place]
		var/turf/there = spot[3] == here.z ? locate(spot[1], spot[2], spot[3]) : null
		if(there)
			spots[there] = get_dist(here, there)
	var/way_out = FALSE
	var/tries_left = CREW_NPC_SHUT_IN_ROUTES
	// What the test found, for the round's log: where it found a way to, and how long a way.
	var/found
	while(length(spots) && tries_left > 0 && !way_out)
		tries_left--
		var/turf/nearest
		for(var/turf/candidate as anything in spots)
			if(isnull(nearest) || spots[candidate] < spots[nearest])
				nearest = candidate
		spots -= nearest
		var/list/route = get_path_to(body, nearest, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
		if(QDELETED(src) || QDELETED(body))
			return
		if(length(route))
			way_out = TRUE
			found = "a way of [length(route)] steps to [AREACOORD(nearest)]"
	checking_shut_in = FALSE
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) tested whether it is shut in [room] at [AREACOORD(here)]: found [found || "no way out"].")
	// It may have got out, or been let out, while the routes were being tested.
	if(current_place != room)
		return
	if(way_out)
		ways_out_failed = 0
	else
		shut_in = TRUE

/// TRUE if the body remembers a mess, still there, in the room of this name.
/datum/ai_controller/crew_npc/proc/remembers_mess_in(place)
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		if(memory[2] != place)
			continue
		var/datum/weakref/mess_ref = memory[1]
		if(!QDELETED(mess_ref.resolve()))
			return TRUE
	return FALSE

/**
 * Returns the doors between a room and the rest of the station, as door -> list(the tile just
 * inside the room, the tile just outside it). Doors to space do not count.
 */
/proc/crew_npc_doors_of(area/room, z_level)
	var/list/doors = list()
	// Asked from no level at all, by a body that is not standing on a floor: there are none to find.
	if(!isnum(z_level) || z_level < 1)
		return doors
	for(var/turf/room_turf as anything in room.get_turfs_by_zlevel(z_level))
		// A door may stand on the last tile of the room, or on the first tile outside it.
		var/obj/machinery/door/airlock/own_door = locate() in room_turf
		for(var/direction in GLOB.cardinals)
			var/turf/next = get_step(room_turf, direction)
			if(isnull(next) || get_area(next) == room)
				continue
			var/obj/machinery/door/airlock/door = own_door || (locate(/obj/machinery/door/airlock) in next)
			if(isnull(door) || doors[door] || istype(door, /obj/machinery/door/airlock/external))
				continue
			var/turf/inside = own_door ? get_step(room_turf, REVERSE_DIR(direction)) : room_turf
			var/turf/outside = own_door ? next : get_step(next, direction)
			if(!isopenturf(inside) || !isopenturf(outside) || !istype(get_area(outside), /area/station))
				continue
			doors[door] = list(inside, outside)
	return doors

/**
 * What a door of a room is called, to tell it from the room's other doors: the name on the door.
 * A door that only carries the name of the room it leads into is called by where it opens from:
 * the door "Cargo Bay" in the lobby is the Cargo Lobby door of the Cargo Bay.
 */
/proc/crew_npc_door_label(obj/machinery/door/airlock/door, area/room, turf/outside)
	var/own_name = format_text(door.name)
	if(LOWER_TEXT(own_name) != LOWER_TEXT(format_text(room.name)))
		return own_name
	return outside ? get_area_name(outside, TRUE) : own_name

/// Returns what the door the body is standing at is called, or null if it is at none.
/datum/ai_controller/crew_npc/proc/at_door_label()
	return isnull(at_door_of()) ? null : wanted_door_label

/// Returns the name of the room whose door the body is standing at, wanting through, or null.
/datum/ai_controller/crew_npc/proc/at_door_of()
	var/obj/machinery/door/airlock/door = wanted_door?.resolve()
	if(QDELETED(door) || get_dist(pawn, door) > CREW_NPC_AT_DOOR)
		return null
	return wanted_door_place

/**
 * Tool: go and stand at the door into a room, or with no room named, at the door out of the room
 * the body is in. Whoever can open it then knows which door is wanted, and for whom.
 */
/datum/ai_controller/crew_npc/proc/tool_go_to_door(place)
	var/mob/living/carbon/human/body = pawn
	var/named = istext(place) && length(trim(place))
	var/known = named ? find_known_place(place) : null
	if(named && isnull(known))
		action_result(CREW_TOOL_TO_DOOR, FALSE, "You do not know of anywhere aboard by that name.")
		return
	// Already looking for a way to a door: the routes are still being tested.
	if(finding_door)
		return
	var/leaving = isnull(known)
	var/area/room = leaving ? get_area(body) : crew_npc_station_places()[known]
	var/room_name = leaving ? current_place : known
	if(!leaving && get_area(body) == room)
		action_result(CREW_TOOL_TO_DOOR, TRUE, "You are already in [room_name].", list("place" = room_name))
		return
	var/list/doors = crew_npc_doors_of(room, body.z)
	var/obj/machinery/door/airlock/came_in_by = leaving ? trail_door() : null
	// Every door it could make for, each with how good a choice it is: the lower the better.
	var/list/scores = list()
	var/list/spots = list()
	for(var/obj/machinery/door/airlock/door as anything in doors)
		var/list/sides = doors[door]
		var/turf/spot = leaving ? sides[1] : sides[2]
		// Nobody waits at a door where the air is bad, on this side of it or the other.
		if(!crew_npc_safe_turf(spot) || (leaving && !crew_npc_safe_turf(sides[2])))
			continue
		var/area/beyond = get_area(sides[2])
		var/score = get_dist(body, spot)
		// A door onto a hallway or a lobby is where someone will come and open it. One onto a
		// maintenance tunnel is not, and one into another room is not much better.
		if(istype(beyond, /area/station/maintenance))
			score += 50
		else if(!istype(beyond, /area/station/hallway) && !findtext(beyond.name, "lobby"))
			score += 25
		// A door that opens from a room it cannot get into either is the last one to make for: it
		// would have to be let into that room first. Any door it can walk up to comes before it.
		if(!leaving && beyond != get_area(body) && locked_out_of(beyond))
			score += 200
		// The door it came in by is the one it goes back to: that is the way it knows leads out.
		if(leaving && came_in_by == door)
			score -= 100
		scores[door] = score
		spots[door] = spot
	var/goal = "the door [leaving ? "out of" : "into"] [room_name]"
	if(!length(scores))
		action_result(CREW_TOOL_TO_DOOR, FALSE, "You cannot find [goal].")
		return
	// The best of them, and for a door into a room, the best of them that it can walk up to. A door
	// may open from somewhere it has no way to: the far side of a security post, say. Making for
	// that one gets it nowhere, however near it lies, so each is tried for a way to it, best first.
	var/obj/machinery/door/airlock/best
	var/turf/best_spot
	var/tries_left = CREW_NPC_DOORS_TRIED
	finding_door = TRUE
	while(length(scores) && tries_left > 0)
		tries_left--
		var/obj/machinery/door/airlock/nearest
		for(var/obj/machinery/door/airlock/door as anything in scores)
			if(isnull(nearest) || scores[door] < scores[nearest])
				nearest = door
		scores -= nearest
		var/turf/spot = spots[nearest]
		if(leaving || get_dist(body, nearest) <= CREW_NPC_AT_DOOR)
			best = nearest
			best_spot = spot
			break
		// A locked room inside a locked room: the door it wants opens from a room it cannot get into
		// either. It is told which, so that it goes and asks at that one first.
		var/list/nearest_sides = doors[nearest]
		var/area/outer = get_area(nearest_sides[2])
		if(outer != get_area(body) && locked_out_of(outer))
			finding_door = FALSE
			var/outer_name = format_text(outer.name)
			action_result(CREW_TOOL_TO_DOOR, FALSE, "You cannot get to [goal]: it opens from [outer_name], which is locked to you as well.", list("place" = current_place, "door_of" = room_name, "door_through" = outer_name))
			return
		var/list/route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
		if(QDELETED(src) || QDELETED(body))
			return
		if(length(route))
			best = nearest
			best_spot = spot
			break
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) found no way to [nearest] at [AREACOORD(nearest)], a door into [room_name], and looks for another.")
	finding_door = FALSE
	if(isnull(best))
		action_result(CREW_TOOL_TO_DOOR, FALSE, "You cannot find a way to [goal].")
		return
	wanted_door = WEAKREF(best)
	wanted_door_place = room_name
	wanted_door_leaving = leaving
	var/list/best_sides = doors[best]
	wanted_door_label = crew_npc_door_label(best, room, best_sides ? best_sides[2] : null)
	if(get_dist(body, best) <= CREW_NPC_AT_DOOR)
		action_result(CREW_TOOL_TO_DOOR, TRUE, "You are at [goal].", list("place" = current_place))
		return
	start_walk(best_spot, CREW_TOOL_TO_DOOR, goal, CREW_NPC_TRAVEL_TIMEOUT)

/**
 * Returns the door of one of the body's rooms that this person wants opened, and that the body can
 * open, or null. The door they are standing at is the one. If they are not at any, it is the nearest
 * to them, with a door onto the lobby chosen ahead of one that leads anywhere else.
 */
/datum/ai_controller/crew_npc/proc/room_door_for(mob/living/carbon/human/person, area/room, room_name, door_label)
	var/mob/living/carbon/human/body = pawn
	var/list/doors = crew_npc_doors_of(room, body.z)
	// The door they named is the one, if the room has a door of that name that the body can open.
	// That is what a name is for: a room with three doors was opened at the wrong one for a janitor
	// who was standing in the lobby.
	if(istext(door_label) && length(trim(door_label)))
		var/wanted_label = LOWER_TEXT(trim(door_label))
		for(var/obj/machinery/door/airlock/door as anything in doors)
			var/list/sides = doors[door]
			// By what it is called among the room's doors, or by the name on it: a door someone was
			// only heard to be standing at is known by the name on it.
			if((LOWER_TEXT(crew_npc_door_label(door, room, sides[2])) == wanted_label || LOWER_TEXT(format_text(door.name)) == wanted_label) && door.allowed(pawn))
				return door
	// The door they have gone to stand at, and knocked on, is the one they want. Opening another
	// that happens to be as near lets them out into the wrong place, or leaves them where they are.
	// A door of this room, that is, and one they are still standing at. The door they wanted out
	// of the room before, which is a door of this room too if the one opens off the other, is not it:
	// let out of the Delivery Office into the Cargo Bay, they do not want the Delivery Office again.
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller) && (isnull(room_name) || their_controller.wanted_door_place == room_name))
		var/obj/machinery/door/airlock/wanted = their_controller.wanted_door?.resolve()
		if(!QDELETED(wanted) && doors[wanted] && wanted.allowed(pawn) && get_dist(person, wanted) <= CREW_NPC_AT_DOOR)
			return wanted
	var/obj/machinery/door/airlock/best
	var/best_score = INFINITY
	// Being let out, a door that only leads into another room that is locked to them is no way
	// out at all. A janitor let out of the Bitrunning Den into the Mining Office had the Den's
	// door opened for it a second time, as the nearest door of the Mining Office, walked back
	// through it, and was shut in the Den for the rest of the round.
	var/letting_out = get_area(person) == room
	for(var/obj/machinery/door/airlock/door as anything in doors)
		if(!door.allowed(pawn))
			continue
		var/list/sides = doors[door]
		var/distance = get_dist(door, person)
		var/score = distance
		if(distance > CREW_NPC_AT_DOOR)
			score += istype(get_area(sides[2]), /area/station/cargo/lobby) ? CREW_NPC_AT_DOOR : CREW_NPC_DOOR_SEARCH
		// Of two doors as near, the one onto a hallway or a lobby: the other may only lead into
		// another room that is locked to them.
		var/area/beyond = get_area(sides[2])
		if(letting_out && istype(their_controller) && their_controller.locked_out_of(beyond))
			score += 200
		if(istype(beyond, /area/station/maintenance))
			score += 50
		else if(!istype(beyond, /area/station/hallway) && !findtext(beyond.name, "lobby"))
			score += 25
		if(score < best_score)
			best_score = score
			best = door
	return best

/// Returns the name of a room that is the body's to open the door of, from a name it was given, or null: its post, or another room of its department.
/datum/ai_controller/crew_npc/proc/own_room_named(place)
	if(!istext(place) || !length(trim(place)))
		return post_place
	var/known = find_known_place(place)
	if(isnull(known))
		return null
	if(known == post_place || (known in work_area) || (known in look_in_rooms))
		return known
	return null

/// Returns the area that goes by a room's name, as the body knows it.
/datum/ai_controller/crew_npc/proc/room_by_name(room_name)
	if(room_name == post_place && post_turf)
		return get_area(post_turf)
	return crew_npc_station_places()[room_name]

/**
 * Tool: open the door of one of the body's rooms for someone. Cargo staff only.
 *
 * The room is its post unless another room of its department is named. Anyone inside is let out.
 * Only a janitor is let in, and only when there is a mess in there for them to clean: the door is
 * locked to the rest of the crew for a reason. Whether this janitor was sent for is the brain's to
 * know. Someone standing at the door, or shut inside, need not be in sight: a door hides them.
 */
/datum/ai_controller/crew_npc/proc/tool_open_door(handle, place, person_name, door_label)
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_DOOR, FALSE, "You have no door of your own to open for anyone.")
		return
	var/room_name = own_room_named(place)
	var/area/room = room_name ? room_by_name(room_name) : null
	if(isnull(room))
		action_result(CREW_TOOL_DOOR, FALSE, "That is not a room whose door is yours to open.")
		return
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	// Someone the body has never set eyes on, because a door has always stood between them, is
	// known by name: whoever of that name is at a door of the room, or inside it.
	if(QDELETED(person) && istext(person_name))
		person = person_at_room(person_name, room)
		if(person)
			handle = handle_for(person)
	// A knock from inside says where, and not who. Whoever is standing inside at a door of the
	// room, and cannot open it for themselves, is who knocked.
	if(QDELETED(person))
		person = shut_in_at_door(room) || janitor_at_door(room)
		if(person)
			handle = handle_for(person)
	if(QDELETED(person))
		action_result(CREW_TOOL_DOOR, FALSE, "You do not know who that is, and there is nobody of that name at the door of [room_name].")
		return
	var/inside = get_area(person) == room
	var/obj/machinery/door/airlock/door = room_door_for(person, room, room_name, door_label)
	var/at_the_door = !isnull(door) && get_dist(person, door) <= CREW_NPC_AT_DOOR
	if(!recently_saw(person) && !inside && !at_the_door)
		action_result(CREW_TOOL_DOOR, FALSE, "You cannot see that person, and they are not at the door of [room_name].")
		return
	// A mess in this room, or in a room of the department that can only be got into through it.
	var/mess_beyond = remembers_mess_in(room_name)
	for(var/inner in reached_through)
		if(mess_beyond)
			break
		var/through = inner
		// Followed outwards, room by room, until it comes to this one or runs out.
		for(var/step in 1 to length(reached_through))
			through = reached_through[through]
			if(isnull(through) || through == room_name)
				break
		mess_beyond = through == room_name && remembers_mess_in(inner)
	if(!inside && !(findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor") && mess_beyond))
		action_result(CREW_TOOL_DOOR, FALSE, "You have no call to let [person.name] into [room_name].")
		return
	if(isnull(door))
		action_result(CREW_TOOL_DOOR, FALSE, "You cannot see which door [person.name] needs opening.")
		return
	door_room = room_name
	start_errand(door, CREW_TOOL_DOOR, handle)

/// Returns whoever of this name is standing at a door of a room, or is inside it, or null.
/datum/ai_controller/crew_npc/proc/person_at_room(person_name, area/room)
	var/mob/living/carbon/human/body = pawn
	var/wanted = LOWER_TEXT(trim(person_name))
	if(!length(wanted))
		return null
	for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(room, body.z))
		for(var/mob/living/carbon/human/person in range(CREW_NPC_AT_DOOR, door))
			if(person != body && LOWER_TEXT(person.name) == wanted)
				return person
	for(var/mob/living/carbon/human/person in room)
		if(person != body && LOWER_TEXT(person.name) == wanted)
			return person
	return null

/// Returns someone standing inside a room at one of its doors who cannot open that door for themselves, or null.
/datum/ai_controller/crew_npc/proc/shut_in_at_door(area/room)
	var/mob/living/carbon/human/body = pawn
	for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(room, body.z))
		for(var/mob/living/carbon/human/person in range(CREW_NPC_AT_DOOR, door))
			if(person != body && get_area(person) == room && !door.allowed(person))
				return person
	return null

/// Returns a janitor standing outside a room at one of its doors, or null: whoever knocked there, when the name the brain gave is not who is standing at it.
/datum/ai_controller/crew_npc/proc/janitor_at_door(area/room)
	var/mob/living/carbon/human/body = pawn
	for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(room, body.z))
		for(var/mob/living/carbon/human/person in range(CREW_NPC_AT_DOOR, door))
			if(person != body && get_area(person) != room && findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor"))
				return person
	return null

/// Opens the door the body is standing by, holds it open a while, and lets whoever it is for know. Sleeps while it opens.
/datum/ai_controller/crew_npc/proc/hold_door_for(obj/machinery/door/airlock/door)
	var/mob/living/carbon/human/body = pawn
	var/datum/weakref/person_ref = handle_people[errand_item]
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person))
		return list(FALSE, "Whoever wanted the door has gone.")
	if(door.locked || door.welded || !door.hasPower() || !door.allowed(body))
		return list(FALSE, "The door will not open for you.")
	var/room_name = door_room || post_place
	var/area/room = room_by_name(room_name)
	if(isnull(room))
		return list(FALSE, "You have lost track of which room the door was for.")
	var/inside = get_area(person) == room
	door.autoclose = FALSE
	if(door.density && !door.open())
		door.autoclose = TRUE
		return list(FALSE, "The door will not open for you.")
	// The door shuts behind them the moment they are through, so that nobody else walks in after.
	// Failing that, it shuts when it has been held long enough. If it is being held for someone
	// else as well, whoever has longest to go is the one it shuts behind.
	var/held_until = world.time + CREW_NPC_DOOR_HELD
	GLOB.crew_npc_door_holds[REF(door)] = max(GLOB.crew_npc_door_holds[REF(door)], held_until)
	watch_door(WEAKREF(door), WEAKREF(person), inside, held_until, room)
	// Having opened it, the body gets out of the doorway and back to where it works.
	addtimer(CALLBACK(src, PROC_REF(step_away_from_door)), 0.5 SECONDS)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) opened [door] to let [key_name(person)] [inside ? "out of" : "into"] [room_name].")
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		// A spot inside the room, so that they know which side of the door is in.
		var/list/sides = crew_npc_doors_of(room, body.z)[door]
		var/turf/spot = room_name == post_place ? post_turf : (sides ? sides[1] : get_turf(door))
		their_controller.door_opened_for(body, room_name, spot, door)
	// A door opened to let one person out lets out anyone else who is shut in there with them. A
	// janitor shut in the Bitrunning Den watched its door opened for another janitor and shut
	// again, and stayed where it was for another forty minutes.
	if(inside)
		var/list/room_sides = crew_npc_doors_of(room, body.z)[door]
		var/turf/way_out = room_sides ? room_sides[1] : get_turf(door)
		for(var/mob/living/carbon/human/other in room)
			if(other == person || other == body)
				continue
			var/datum/ai_controller/crew_npc/other_controller = other.ai_controller
			if(!istype(other_controller) || !other_controller.is_shut_in())
				continue
			other_controller.door_opened_for(body, room_name, way_out, door)
			// Each is watched a tick longer than the last, so that the door shuts behind whoever
			// is last through it and not on them: see watch_door.
			held_until += 1
			GLOB.crew_npc_door_holds[REF(door)] = max(GLOB.crew_npc_door_holds[REF(door)], held_until)
			watch_door(WEAKREF(door), WEAKREF(other), TRUE, held_until, room)
	return list(TRUE, "You open the door for [person.name] and hold it, to let them [inside ? "out of" : "into"] [room_name].")

/// Watches a door held open for someone, and lets it shut once they are through it or time is up.
/datum/ai_controller/crew_npc/proc/watch_door(datum/weakref/door_ref, datum/weakref/person_ref, was_inside, until, area/room, extended = 0)
	var/obj/machinery/door/airlock/door = door_ref?.resolve()
	if(QDELETED(door) || QDELETED(src) || isnull(room))
		let_door_close(door_ref)
		return
	var/mob/living/carbon/human/person = person_ref?.resolve()
	var/through = QDELETED(person)
	if(!through)
		// Through means on the other side of it, and off the doorway itself.
		var/now_inside = get_area(person) == room
		through = now_inside != was_inside && get_turf(person) != get_turf(door)
	// Time is up and they are in sight of the door and not through it: it is held a little longer,
	// a few times over. A janitor let into the Delivery Office reached the door five seconds after
	// it had shut, and had to ask all over again.
	if(!through && world.time >= until && extended < CREW_NPC_DOOR_HELD_ON_TIMES && person.stat == STABLE && !IS_UNCONSCIOUS(person) && person.z == door.z && get_dist(person, door) <= CREW_NPC_VISION_RANGE)
		until = world.time + CREW_NPC_DOOR_HELD_ON
		extended++
		GLOB.crew_npc_door_holds[REF(door)] = max(GLOB.crew_npc_door_holds[REF(door)], until)
		// They are told nothing new: only that the door they were making for is open that much longer.
		var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
		if(istype(their_controller))
			their_controller.door_held_until = max(their_controller.door_held_until, until)
			if(was_inside)
				their_controller.let_out_until = max(their_controller.let_out_until, until)
	if(through || world.time >= until)
		// Held for someone else too, who came to it later and is not through yet: one janitor going
		// in must not shut the door on the one behind. Whoever is holding it for them shuts it.
		if(GLOB.crew_npc_door_holds[REF(door)] > until)
			return
		GLOB.crew_npc_door_holds -= REF(door)
		let_door_close(door_ref)
		return
	addtimer(CALLBACK(src, PROC_REF(watch_door), door_ref, person_ref, was_inside, until, room, extended), CREW_NPC_DOOR_WATCH)

/// Doors being held open for someone, by REF: the world.time the longest of those holds runs to.
GLOBAL_LIST_EMPTY(crew_npc_door_holds)

/**
 * Tool: knock at the door the body is standing at. A voice does not carry through a shut door, so
 * this is how someone on the far side learns that anyone is there. Crew NPCs near the door are told
 * of it, and anyone else near it hears the knocking. A knock says where, and from which side of
 * the door, and does not say who.
 */
/datum/ai_controller/crew_npc/proc/tool_knock()
	var/mob/living/carbon/human/body = pawn
	var/obj/machinery/door/airlock/door = wanted_door?.resolve()
	if(QDELETED(door) || isnull(at_door_of()))
		action_result(CREW_TOOL_KNOCK, FALSE, "You are not standing at a door to knock at.")
		return
	body.face_atom(door)
	playsound(door, 'sound/effects/glass/glassknock.ogg', 50, TRUE)
	body.visible_message(span_notice("[body] knocks on [door]."), span_notice("You knock on [door]."))
	var/place = wanted_door_place
	for(var/mob/living/carbon/human/listener in range(CREW_NPC_KNOCK_RANGE, door))
		if(listener == body)
			continue
		var/datum/ai_controller/crew_npc/their_controller = listener.ai_controller
		if(istype(their_controller) && their_controller.can_sense())
			their_controller.emit_sense(CREW_SENSE_KNOWLEDGE, "Someone is knocking at the [wanted_door_label ? "[wanted_door_label] " : ""]door of [place], from [wanted_door_leaving ? "inside" : "outside"].", list("knock_door" = wanted_door_label,"knock" = place, "knock_from_inside" = wanted_door_leaving))
	action_result(CREW_TOOL_KNOCK, TRUE, "You knock at the door [wanted_door_leaving ? "out of" : "into"] [place].")

/// TRUE if a room's fire alarm is on because someone pulled it, and no fire door there has found anything wrong with the air.
/proc/crew_npc_alarm_was_pulled(area/room)
	if(!(room.fire || LAZYLEN(room.active_firelocks)) || room.fault_status != AREA_FAULT_MANUAL)
		return FALSE
	for(var/obj/machinery/door/firedoor/door as anything in room.firedoors)
		if(door.alarm_type && door.alarm_type != FIRELOCK_ALARM_TYPE_GENERIC)
			return FALSE
	return TRUE

/**
 * If a shut fire door is what stopped the body, says so: adds the room whose alarm shut it, and
 * whether that alarm was only pulled by hand, to the details for the brain, and returns the words
 * for it. Returns "" if there is no shut fire door in sight.
 */
/datum/ai_controller/crew_npc/proc/fire_door_report(list/details)
	var/mob/living/carbon/human/body = pawn
	var/obj/machinery/door/firedoor/nearest
	var/nearest_distance = INFINITY
	for(var/obj/machinery/door/firedoor/door in view(CREW_NPC_FIRE_DOOR_RANGE, body))
		if(!door.density)
			continue
		var/distance = get_dist(body, door)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = door
	if(isnull(nearest))
		return ""
	// The door may stand between two rooms. The one whose alarm is on is the one that shut it.
	var/area/alarmed
	for(var/area/place as anything in nearest.affecting_areas)
		if(place.fire || LAZYLEN(place.active_firelocks))
			alarmed = place
			break
	alarmed ||= get_area(nearest)
	var/alarmed_name = format_text(alarmed.name)
	details["fire_doors"] = alarmed_name
	details["alarm_pulled"] = crew_npc_alarm_was_pulled(alarmed)
	return " The fire doors are shut in [alarmed_name]."

/**
 * Tool: go to the fire alarm of a room and reset it. Only an alarm that someone pulled by hand,
 * with nothing wrong with the air, is ever reset. One set off by fire or a breach is left alone.
 *
 * Resetting does not hold anything open: the fire doors go on watching the air for themselves, and
 * shut again without anyone's help if it turns bad.
 */
/datum/ai_controller/crew_npc/proc/tool_reset_alarm(place)
	var/mob/living/carbon/human/body = pawn
	var/known = istext(place) ? find_known_place(place) : null
	var/area/room = known ? crew_npc_station_places()[known] : null
	if(isnull(room))
		action_result(CREW_TOOL_RESET_ALARM, FALSE, "You do not know of anywhere aboard by that name.")
		return
	if(!(room.fire || LAZYLEN(room.active_firelocks)))
		action_result(CREW_TOOL_RESET_ALARM, TRUE, "The fire alarm in [known] is off already.", list("place" = known))
		return
	if(!crew_npc_alarm_was_pulled(room))
		action_result(CREW_TOOL_RESET_ALARM, FALSE, "The alarm in [known] is not one that someone pulled: something is wrong with the air there. You leave it alone.", list("real_alarm" = known))
		return
	if(!crew_npc_safe_turf(get_turf(body)))
		action_result(CREW_TOOL_RESET_ALARM, FALSE, "The air where you stand is not right. You leave the alarm alone.", list("real_alarm" = known))
		return
	var/obj/machinery/firealarm/best
	var/best_distance = INFINITY
	for(var/obj/machinery/firealarm/alarm as anything in room.firealarms)
		if(QDELETED(alarm) || alarm.z != body.z)
			continue
		var/gave_up_at = fire_alarms_failed[REF(alarm)]
		if(gave_up_at && world.time - gave_up_at < CREW_NPC_ALARM_RETRY)
			continue
		var/distance = get_dist(body, alarm)
		if(distance < best_distance)
			best_distance = distance
			best = alarm
	if(isnull(best))
		action_result(CREW_TOOL_RESET_ALARM, FALSE, "You cannot get to a fire alarm for [known].", list("alarm_out_of_reach" = known))
		return
	start_errand(best, CREW_TOOL_RESET_ALARM, known)

/// Resets the fire alarm the body is standing by, if it is still one that someone pulled. May sleep.
/datum/ai_controller/crew_npc/proc/reset_fire_alarm(obj/machinery/firealarm/alarm)
	var/mob/living/carbon/human/body = pawn
	var/area/room = alarm.my_area
	if(isnull(room) || !(room.fire || LAZYLEN(room.active_firelocks)))
		return list(TRUE, "The fire alarm in [errand_item] has been reset already.")
	if(!crew_npc_alarm_was_pulled(room))
		return list(FALSE, "Something is wrong with the air in [errand_item] after all. You leave the alarm alone.")
	alarm.reset(body)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) reset the fire alarm in [errand_item].")
	// The way is open again, so nothing it gave up on because of the fire doors stands.
	ways_reopened()
	ways_out_failed = 0
	return list(TRUE, "You reset the fire alarm in [errand_item]. The fire doors there are opening.")

/// Takes the body back to its spot at its post after it has opened a door, unless it has gone on to something else.
/datum/ai_controller/crew_npc/proc/step_away_from_door()
	if(QDELETED(src) || QDELETED(pawn) || isnull(post_turf) || get_turf(pawn) == post_turf)
		return
	if(blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET))
		return
	start_walk(post_turf, CREW_TOOL_RETURN, post_place, CREW_NPC_WALK_TIMEOUT)

/// Lets a door the body was holding open shut again.
/datum/ai_controller/crew_npc/proc/let_door_close(datum/weakref/door_ref)
	var/obj/machinery/door/airlock/door = door_ref?.resolve()
	if(QDELETED(door))
		return
	door.autoclose = TRUE
	if(!door.density)
		INVOKE_ASYNC(door, TYPE_PROC_REF(/obj/machinery/door, close))

/// Someone has opened a door for this body and is holding it. It learns the way through and that it had better go now.
/datum/ai_controller/crew_npc/proc/door_opened_for(mob/living/carbon/human/opener, place, turf/spot, obj/machinery/door/airlock/door)
	var/inside = get_area(pawn) == get_area(spot)
	ways_reopened()
	ways_out_failed = 0
	shut_in = FALSE
	door_held_until = world.time + CREW_NPC_DOOR_HELD
	// Where the door leads, for a body being let out: that is where it goes, not back the way it
	// came in, which may have been through some other door into some other room.
	var/out_to
	if(inside)
		// It asked to be let out, so out is where it goes, whatever it was in the middle of.
		let_out_until = door_held_until
		var/list/sides = crew_npc_doors_of(get_area(spot), spot.z)[door]
		if(sides)
			out_to = get_area_name(sides[2], TRUE)
	else
		// Once in, it is whoever let it in that it asks to be let out again.
		let_into_place = place
		let_in_by = opener.name
		let_in_door = WEAKREF(door)
		if(isnull(visited_places[place]))
			visited_places[place] = list(spot.x, spot.y, spot.z)
	emit_sense(CREW_SENSE_KNOWLEDGE, "[opener.name] opens the door [inside ? "out of" : "into"] [place] and holds it for you. It will not stay open long.", list(
		"places" = list(list("place" = place, "things" = list())),
		"door_held" = TRUE,
		"out_to" = out_to,
	))

/**
 * Returns someone standing where they block the way, or null: in a doorway close by, right beside
 * the body, or right beside what it was hauling. Bodies step past people. A crate does not.
 */
/datum/ai_controller/crew_npc/proc/who_is_in_the_way(atom/movable/load)
	var/mob/living/carbon/human/nearest
	var/nearest_distance = INFINITY
	for(var/mob/living/carbon/human/person in view(CREW_NPC_IN_THE_WAY_RANGE, pawn))
		if(person == pawn || person.stat == DEAD)
			continue
		var/in_doorway = FALSE
		for(var/obj/machinery/door/door in get_turf(person))
			if(!istype(door, /obj/machinery/door/firedoor))
				in_doorway = TRUE
		var/beside_load = !QDELETED(load) && get_dist(person, load) <= 1
		var/distance = get_dist(person, pawn)
		if(!in_doorway && !beside_load && distance > 1)
			continue
		// It is the load that caught, not the body, which steps past people. Whoever is nearest
		// the load is the one it caught on: nearer the body is only whoever happened to be beside it.
		if(!QDELETED(load))
			distance = get_dist(person, load)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = person
	return nearest

/**
 * Tool: get out of the way of someone who has asked the body to move. It steps to the nearest
 * spot in the room that is clear of doors, as far as it can easily get from whoever asked and
 * from what they are hauling. Walking off across the station would be no answer to "excuse me".
 */
/datum/ai_controller/crew_npc/proc/tool_step_aside(handle)
	var/mob/living/carbon/human/body = pawn
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/asker = person_ref?.resolve()
	var/atom/movable/load = asker?.pulling
	var/turf/here = get_turf(body)
	var/turf/best
	var/best_score = -INFINITY
	for(var/turf/candidate as anything in RANGE_TURFS(CREW_NPC_ASIDE_REACH, here))
		if(candidate == here || get_area(candidate) != get_area(here))
			continue
		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf() || (locate(/obj/machinery/conveyor) in candidate))
			continue
		// Out of the doorway it may be standing in, and not into another.
		if(!crew_npc_clear_of_doors(candidate))
			continue
		// The further from them and their load the better, up to a point, and the nearer to hand the better.
		var/score = -get_dist(candidate, here) * 0.5
		if(!QDELETED(asker))
			score += min(get_dist(candidate, asker), CREW_NPC_ASIDE_REACH)
		if(!QDELETED(load))
			score += min(get_dist(candidate, load), CREW_NPC_ASIDE_REACH)
		if(score > best_score)
			best_score = score
			best = candidate
	if(isnull(best))
		action_result(CREW_TOOL_STEP_ASIDE, FALSE, "There is nowhere here to step aside to.")
		return
	start_walk(best, CREW_TOOL_STEP_ASIDE, "out of the way", CREW_NPC_WALK_TIMEOUT)

/// TRUE if the body is standing on the same tile as someone else. Two bodies can end up on one tile, and nobody waits like that: it counts as standing in the way, as a doorway does.
/datum/ai_controller/crew_npc/proc/on_top_of_someone()
	var/mob/living/carbon/human/body = pawn
	for(var/mob/living/carbon/human/other in get_turf(body))
		if(other != body)
			return TRUE
	return FALSE

/// Says who, if anyone, was in the way of what the body was hauling: words for the brain, and who it was.
/datum/ai_controller/crew_npc/proc/in_the_way_report(atom/movable/load, list/details)
	var/mob/living/carbon/human/person = who_is_in_the_way(load)
	if(isnull(person))
		return ""
	details["in_the_way"] = handle_for(person)
	return " [person.name] is standing in the way."
