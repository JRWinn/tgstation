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
	// A body that was let into a room knows the door shut behind it. It needs no second try to be sure.
	if(let_into_place && let_into_place == current_place)
		shut_in = TRUE
		return
	if(ways_out_failed >= CREW_NPC_SHUT_IN_AFTER && !shut_in)
		INVOKE_ASYNC(src, PROC_REF(check_shut_in))

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
	checking_shut_in = FALSE
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
 * Returns the door of the body's post that is nearest this person and that the body can open, or
 * null. A door between the post and the lobby is chosen ahead of one that leads anywhere else.
 */
/datum/ai_controller/crew_npc/proc/post_door_for(mob/living/carbon/human/person)
	var/area/bay = get_area(post_turf)
	var/obj/machinery/door/airlock/best
	var/best_score = INFINITY
	for(var/obj/machinery/door/airlock/door in range(CREW_NPC_DOOR_SEARCH, post_turf))
		if(istype(door, /obj/machinery/door/airlock/external) || !door.allowed(pawn))
			continue
		var/inside = FALSE
		var/outside = FALSE
		var/to_lobby = FALSE
		for(var/turf/beside as anything in get_adjacent_open_turfs(get_turf(door)))
			var/area/beside_area = get_area(beside)
			if(beside_area == bay)
				inside = TRUE
			else if(istype(beside_area, /area/station))
				outside = TRUE
				if(istype(beside_area, /area/station/cargo/lobby))
					to_lobby = TRUE
		if(!inside || !outside)
			continue
		var/score = get_dist(door, person) + (to_lobby ? 0 : CREW_NPC_DOOR_SEARCH)
		if(score < best_score)
			best_score = score
			best = door
	return best

/**
 * Tool: open the door of the body's post for someone. Cargo staff only.
 *
 * Anyone inside is let out. Only a janitor is let in, and only when there is a mess in there for
 * them to clean: the door is locked to the rest of the crew for a reason.
 */
/datum/ai_controller/crew_npc/proc/tool_open_door(handle)
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_DOOR, FALSE, "You have no door of your own to open for anyone.")
		return
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person) || !recently_saw(person))
		action_result(CREW_TOOL_DOOR, FALSE, "You cannot see that person.")
		return
	var/inside = get_area(person) == get_area(post_turf)
	if(!inside && !(findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor") && remembers_mess_in(post_place)))
		action_result(CREW_TOOL_DOOR, FALSE, "You have no call to let [person.name] into [post_place].")
		return
	var/obj/machinery/door/airlock/door = post_door_for(person)
	if(isnull(door))
		action_result(CREW_TOOL_DOOR, FALSE, "You cannot see which door [person.name] needs opening.")
		return
	start_errand(door, CREW_TOOL_DOOR, handle)

/// Opens the door the body is standing by, holds it open a while, and lets whoever it is for know. Sleeps while it opens.
/datum/ai_controller/crew_npc/proc/hold_door_for(obj/machinery/door/airlock/door)
	var/mob/living/carbon/human/body = pawn
	var/datum/weakref/person_ref = handle_people[errand_item]
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person))
		return list(FALSE, "Whoever wanted the door has gone.")
	if(door.locked || door.welded || !door.hasPower() || !door.allowed(body))
		return list(FALSE, "The door will not open for you.")
	var/inside = get_area(person) == get_area(post_turf)
	door.autoclose = FALSE
	if(door.density && !door.open())
		door.autoclose = TRUE
		return list(FALSE, "The door will not open for you.")
	addtimer(CALLBACK(src, PROC_REF(let_door_close), WEAKREF(door)), CREW_NPC_DOOR_HELD)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) opened [door] to let [key_name(person)] [inside ? "out of" : "into"] [post_place].")
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		their_controller.door_opened_for(body, post_place, post_turf)
	return list(TRUE, "You open the door for [person.name] and hold it, to let them [inside ? "out of" : "into"] [post_place].")

/// Lets a door the body was holding open shut again.
/datum/ai_controller/crew_npc/proc/let_door_close(datum/weakref/door_ref)
	var/obj/machinery/door/airlock/door = door_ref?.resolve()
	if(QDELETED(door))
		return
	door.autoclose = TRUE
	if(!door.density)
		INVOKE_ASYNC(door, TYPE_PROC_REF(/obj/machinery/door, close))

/// Someone has opened a door for this body and is holding it. It learns the way through and that it had better go now.
/datum/ai_controller/crew_npc/proc/door_opened_for(mob/living/carbon/human/opener, place, turf/spot)
	var/inside = get_area(pawn) == get_area(spot)
	blocked_places = list()
	ways_out_failed = 0
	shut_in = FALSE
	door_held_until = world.time + CREW_NPC_DOOR_HELD
	if(inside)
		// It asked to be let out, so out is where it goes, whatever it was in the middle of.
		let_out_until = door_held_until
	else
		// Once in, it is whoever let it in that it asks to be let out again.
		let_into_place = place
		let_in_by = opener.name
		if(isnull(visited_places[place]))
			visited_places[place] = list(spot.x, spot.y, spot.z)
	emit_sense(CREW_SENSE_KNOWLEDGE, "[opener.name] opens the door [inside ? "out of" : "into"] [place] and holds it for you. It will not stay open long.", list(
		"places" = list(list("place" = place, "things" = list())),
		"door_held" = TRUE,
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
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = person
	return nearest

/// Says who, if anyone, was in the way of what the body was hauling: words for the brain, and who it was.
/datum/ai_controller/crew_npc/proc/in_the_way_report(atom/movable/load, list/details)
	var/mob/living/carbon/human/person = who_is_in_the_way(load)
	if(isnull(person))
		return ""
	details["in_the_way"] = handle_for(person)
	return " [person.name] is standing in the way."
