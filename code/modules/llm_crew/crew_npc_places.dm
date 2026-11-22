/**
 * Knowing the station.
 *
 * Crew arrive knowing their way around: every room by name, and how to walk to it. What they do
 * not know is what is in a room, or whether its door will open for them, until they have been.
 * The rooms a body has actually stood in are kept apart (visited_places), because walking the
 * station to see what needs doing means going to the ones it has not.
 */

/// The station's rooms, as name -> area. Worked out once, the first time anyone asks.
GLOBAL_LIST_EMPTY(crew_npc_station_places)

/// Returns the station's rooms, as name -> area: every station area with floor on a station level.
/proc/crew_npc_station_places()
	if(length(GLOB.crew_npc_station_places))
		return GLOB.crew_npc_station_places
	var/list/station_levels = SSmapping.levels_by_trait(ZTRAIT_STATION)
	for(var/area/station/place in GLOB.areas)
		var/place_name = format_text(place.name)
		if(GLOB.crew_npc_station_places[place_name])
			continue
		for(var/level in station_levels)
			if(length(place.get_turfs_by_zlevel(level)))
				GLOB.crew_npc_station_places[place_name] = place
				break
	return GLOB.crew_npc_station_places

/**
 * Returns the spot the body would walk to for the room of this name, or null: the spot it knows
 * the room by if it has been there, and otherwise somewhere safe to stand inside it.
 */
/datum/ai_controller/crew_npc/proc/place_spot(place)
	var/list/spot = visited_places[place]
	if(spot)
		var/turf/known = locate(spot[1], spot[2], spot[3])
		// Its post is the one spot it stands at on purpose, counter window and all.
		if(place == post_place)
			return known
		// Anywhere else, a spot it noted while standing in a doorway is no place to go and stand.
		return spot_inside(known) || known
	var/area/station/room = crew_npc_station_places()[place]
	if(isnull(room))
		return null
	// A room in parts is walked to in the part the body can get into: a spot behind an inner door
	// locked to it, or in a corner sealed off, was set off for and never reached (KNA-19, KNA-28).
	// With no part open to it at all, the whole room as before: the walk finds the way shut, and the
	// brain goes by that.
	var/list/open = open_part_of(room)
	if(length(open))
		var/turf/open_spot = safe_spot_in(room, get_turf(pawn), open)
		if(open_spot)
			return open_spot
	return safe_spot_in(room, get_turf(pawn))

/**
 * Returns the nearest spot to this one, in the same room, that is safe to stand on and clear of
 * its doors. Null if this spot is clear of them already, or there is no such spot within a few steps.
 *
 * A body standing in a doorway is walked into by everyone who comes through, and people who walk
 * into each other change places. So it is out of the room with one of them and back in with the
 * next, and whatever it was waiting for in that room never finds it there.
 */
/datum/ai_controller/crew_npc/proc/spot_inside(turf/here)
	if(isnull(here) || crew_npc_clear_of_doors(here))
		return null
	var/area/room = get_area(here)
	var/turf/best
	var/best_distance = INFINITY
	for(var/turf/candidate as anything in RANGE_TURFS(CREW_NPC_ASIDE_REACH, here))
		if(candidate == here || get_area(candidate) != room)
			continue
		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf() || !crew_npc_clear_of_doors(candidate))
			continue
		var/distance = get_dist(candidate, here)
		if(distance < best_distance)
			best_distance = distance
			best = candidate
	return best

/**
 * Returns the clear square of a room furthest from the body that it can find a way to, or null: of
 * the part of the room it can get into (open_part_of()), safe as far as it can tell (CHEAT-11), not
 * blocked, and out of the way of doors. The furthest few are tried for a way, furthest first.
 * Sleeps while routes are tested.
 */
/datum/ai_controller/crew_npc/proc/far_spot_in(area/room)
	var/mob/living/carbon/human/body = pawn
	var/turf/here = get_turf(body)
	if(isnull(here) || isnull(room))
		return null
	var/list/by_distance = list()
	for(var/turf/candidate as anything in open_part_of(room))
		if(candidate.z != here.z || candidate.is_blocked_turf() || !crew_npc_clear_of_doors(candidate, 2) || !far_spot_safe(candidate))
			continue
		by_distance[candidate] = get_dist(here, candidate)
	var/tries_left = CREW_NPC_DOORS_TRIED
	while(length(by_distance) && tries_left > 0)
		tries_left--
		var/turf/furthest
		for(var/turf/candidate as anything in by_distance)
			if(isnull(furthest) || by_distance[candidate] > by_distance[furthest])
				furthest = candidate
		by_distance -= furthest
		var/list/route = get_path_to(body, furthest, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
		if(QDELETED(src) || QDELETED(body))
			return null
		if(length(route))
			return furthest
	return null
