/**
 * Keeping a room that is locked to the crew.
 *
 * Any body with a post behind a locked door keeps it: this is not one job's work. The body can tell
 * who has a right to be in there, which is anyone the door opens for, and who outranks it. Whether
 * a stranger has a good reason to be there is talked out by the brain. All the body does about it
 * is the last resort: it takes someone with no business in the room by the arm and walks them out.
 * It never lays a hand on the Captain or a head of staff.
 */

/// Whoever has this body by the arm to walk it out, as a weak reference, while in_hand_until runs (SUP-06).
/datum/ai_controller/crew_npc/var/datum/weakref/in_hand_by
/// How many looks in a row have found that hand no longer on it.
/datum/ai_controller/crew_npc/var/in_hand_misses = 0

/// Returns the doors into the body's post as weak references. They are found once and kept.
/datum/ai_controller/crew_npc/proc/post_doors()
	if(isnull(post_door_refs))
		post_door_refs = list()
		if(post_turf)
			for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(get_area(post_turf), post_turf.z))
				post_door_refs += WEAKREF(door)
	return post_door_refs

/**
 * TRUE if this person has a right to be in the body's post: the job their card shows is let in by
 * a door into it. That covers everyone who works there, and those whose rank lets them in anywhere.
 * It goes by the job on the card, as a player reading it would, not by the card's own access list,
 * which nobody can see: someone given extra access at the desk is asked their business all the same.
 */
/datum/ai_controller/crew_npc/proc/belongs_in_post(mob/living/carbon/human/person)
	// Someone shut in a brig cell on a running timer was put there. Security do not question their own prisoners.
	if(!isnull(crew_npc_cell_holding(person)))
		return TRUE
	var/list/job_access = crew_npc_job_access(crew_npc_job_of(person))
	var/any_door = FALSE
	for(var/datum/weakref/door_ref as anything in post_doors())
		var/obj/machinery/door/airlock/door = door_ref.resolve()
		if(QDELETED(door))
			continue
		any_door = TRUE
		if(door.check_access_list(job_access))
			return TRUE
	// A room with no door to it is not locked to anyone.
	return !any_door

/// Returns the access a job's card is printed with, or an empty list for no job.
/proc/crew_npc_job_access(datum/job/job)
	if(isnull(job))
		return list()
	var/datum/outfit/job/outfit = job.outfit
	if(!ispath(outfit))
		return list()
	var/datum/id_trim/trim = SSid_access.trim_singletons_by_path[initial(outfit.id_trim)]
	if(isnull(trim))
		return list()
	return trim.access | trim.wildcard_access

/// TRUE if this person is the Captain or a head of staff, going by the job on the ID they wear.
/proc/crew_npc_is_command(mob/living/carbon/human/person)
	var/datum/job/job = crew_npc_job_of(person)
	return !isnull(job) && (istype(job, /datum/job/captain) || (job.job_flags & JOB_HEAD_OF_STAFF))

/**
 * The names the body's own PDA lists as the Captain or a head of staff, each with that job's title:
 * what its messenger shows anyone who looks. Empty with no PDA on it. The job must be a head's title
 * exactly, not merely contain one (HOLE-01).
 */
/datum/ai_controller/crew_npc/proc/command_on_pda()
	var/list/heads = list()
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(isnull(own_messenger))
		return heads
	for(var/messenger_ref in GLOB.pda_messengers)
		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
		var/obj/item/modular_computer/computer = candidate?.computer
		if(isnull(computer) || !computer.saved_identification || !computer.saved_job)
			continue
		var/turf/where = get_turf(computer)
		if(isnull(where) || !is_station_level(where.z))
			continue
		var/datum/job/job = SSjob.get_job(computer.saved_job)
		if(isnull(job) || !(istype(job, /datum/job/captain) || (job.job_flags & JOB_HEAD_OF_STAFF)))
			continue
		heads[computer.saved_identification] = computer.saved_job
	return heads

/**
 * The job the body knows this person by as the Captain or a head of staff, or null: by the ID they
 * wear, or, with no such ID on them, by their face, which shows their own name, being a name its
 * PDA lists as the Captain or a head (SENSE-08). A head who has left their card in a console is
 * still known. A hidden face is nobody's. Pass command_on_pda() when asking of many at once.
 */
/datum/ai_controller/crew_npc/proc/known_command_job(mob/living/carbon/human/person, list/heads)
	var/datum/job/worn = crew_npc_job_of(person)
	if(!isnull(worn) && (istype(worn, /datum/job/captain) || (worn.job_flags & JOB_HEAD_OF_STAFF)))
		return worn.title
	if(person.get_face_name() != person.real_name)
		return null
	if(isnull(heads))
		heads = command_on_pda()
	return heads[person.real_name]

/**
 * Returns the job that goes with the ID this person wears, or null if it shows none. It goes by the
 * title on the card, which is what examining them shows, not by the trim it was printed with. Only
 * a title that is no job at all falls back to the trim, as before, until the owner says what such a
 * card should count as.
 */
/proc/crew_npc_job_of(mob/living/carbon/human/person)
	var/obj/item/card/id/card = person.get_idcard(FALSE)
	if(isnull(card))
		return null
	var/datum/job/shown = SSjob.get_job(card.assignment)
	if(!isnull(shown))
		return shown
	var/datum/id_trim/job/trim = card.trim
	if(istype(trim) && istype(trim.job))
		return trim.job
	return null

/**
 * TRUE if the body answers to this person: the Captain is over everyone aboard, and a head of
 * staff is over those in their own department. It goes by the ID the person carries, never by
 * anything they say.
 */
/datum/ai_controller/crew_npc/proc/answers_to(mob/living/carbon/human/person)
	var/datum/job/their_job = crew_npc_job_of(person)
	var/datum/job/own_job = crew_npc_job_of(pawn)
	if(isnull(their_job) || their_job == own_job)
		return FALSE
	if(istype(their_job, /datum/job/captain))
		return TRUE
	// Heads of staff answer to the Captain, not to one another.
	if(!(their_job.job_flags & JOB_HEAD_OF_STAFF) || isnull(own_job) || (own_job.job_flags & JOB_HEAD_OF_STAFF))
		return FALSE
	for(var/datum/job_department/department as anything in own_job.departments_list)
		if(initial(department.department_head) == their_job.type)
			return TRUE
	return FALSE

/**
 * Returns a spot outside the body's post to leave someone at: through the nearest door it can open
 * onto a hallway or a lobby, and far enough past it that they are not left standing in the doorway.
 */
/datum/ai_controller/crew_npc/proc/spot_outside_post()
	var/mob/living/carbon/human/body = pawn
	var/list/doors = crew_npc_doors_of(get_area(post_turf), post_turf.z)
	var/turf/best
	var/best_score = INFINITY
	for(var/obj/machinery/door/airlock/door as anything in doors)
		// A shut door with no power will not open, and no route goes through it. One left standing open is still a way out.
		if(door.locked || door.welded || !door.allowed(body) || (door.density && !door.hasPower()))
			continue
		var/list/sides = doors[door]
		var/turf/outside = sides[2]
		var/area/beyond = get_area(outside)
		var/score = get_dist(body, door)
		// Nobody is put out into a maintenance tunnel, or into another room, if there is a better door.
		if(istype(beyond, /area/station/maintenance))
			score += 50
		else if(!istype(beyond, /area/station/hallway) && !findtext(beyond.name, "lobby"))
			score += 25
		if(score >= best_score)
			continue
		var/turf/spot
		var/spot_off = INFINITY
		for(var/turf/candidate as anything in RANGE_TURFS(CREW_NPC_EVICT_REACH, outside))
			if(get_area(candidate) != beyond || !far_spot_safe(candidate) || candidate.is_blocked_turf(exclude_mobs = TRUE))
				continue
			if(!crew_npc_clear_of_doors(candidate))
				continue
			// Whoever is walked out trails a step behind, so the spot is a few tiles past the door.
			var/off = abs(get_dist(candidate, door) - CREW_NPC_EVICT_PAST_DOOR)
			if(off < spot_off)
				spot_off = off
				spot = candidate
		if(spot)
			best = spot
			best_score = score
	return best

/**
 * TRUE if none of the doors into this room open for the body, so that it has no right of its own
 * to be in it. Hallways and maintenance tunnels are nobody's to keep anyone out of.
 */
/datum/ai_controller/crew_npc/proc/locked_out_of(area/room)
	if(!istype(room, /area/station) || istype(room, /area/station/hallway) || istype(room, /area/station/maintenance))
		return FALSE
	var/mob/living/carbon/human/body = pawn
	// The level is the floor's under the body, not the body's own: that is nothing at all while it
	// is inside a pipe or a locker, and there is no telling from in there anyway.
	var/turf/here = get_turf(body)
	if(isnull(here) || !isturf(body.loc))
		return FALSE
	if(!crew_npc_doors_bar(room, here.z, body))
		return FALSE
	// A way in with no door on it (shutters up, a gap in the wall) is open to anyone, if it is from
	// somewhere the body may be: a hallway, a tunnel, or a room one of whose doors opens to it. Two
	// rooms open only to each other (Cytology and Xenobiology) do not let each other in (DOOR-02).
	for(var/area/beyond as anything in crew_npc_open_ways_into(room, here.z))
		if(istype(beyond, /area/station/hallway) || istype(beyond, /area/station/maintenance))
			return FALSE
		if(length(crew_npc_doors_of(beyond, here.z)) && !crew_npc_doors_bar(beyond, here.z, body))
			return FALSE
	return TRUE

/// TRUE if this room has airlocks and none of them opens for this body.
/proc/crew_npc_doors_bar(area/room, z_level, mob/living/body)
	var/list/doors = crew_npc_doors_of(room, z_level)
	if(!length(doors))
		return FALSE
	for(var/obj/machinery/door/airlock/door as anything in doors)
		if(door.allowed(body))
			return FALSE
	return TRUE

/// How long the open ways into a room are kept before they are looked for again: shutters go up and down.
#define CREW_NPC_OPEN_WAYS_KEPT (1 MINUTES)

/// For each room and level, the station areas open onto it with no door between, and when that was found: "[REF(room)]-[z]" = list(list of areas, world.time).
GLOBAL_LIST_EMPTY(crew_npc_open_ways)

/**
 * Returns the station areas that lie open onto this room by a way with no door on it: an open floor
 * tile of the room beside an open floor tile of the other area, with nothing solid on either. A tile
 * with an airlock or a windoor on it is a doorway, open or shut, and plastic flaps let nobody walk
 * through standing up (DOOR-09). Kept a minute, since it walks every tile of the room.
 */
/proc/crew_npc_open_ways_into(area/room, z_level)
	if(!isnum(z_level) || z_level < 1)
		return list()
	var/key = "[REF(room)]-[z_level]"
	var/list/kept = GLOB.crew_npc_open_ways[key]
	if(kept && world.time - kept[2] < CREW_NPC_OPEN_WAYS_KEPT)
		return kept[1]
	var/list/beyond = list()
	for(var/turf/room_turf as anything in room.get_turfs_by_zlevel(z_level))
		if(!crew_npc_open_gap(room_turf))
			continue
		for(var/direction in GLOB.cardinals)
			var/turf/next = get_step(room_turf, direction)
			if(isnull(next))
				continue
			var/area/next_area = get_area(next)
			if(next_area == room || beyond[next_area] || !istype(next_area, /area/station))
				continue
			if(crew_npc_open_gap(next))
				beyond[next_area] = TRUE
	GLOB.crew_npc_open_ways[key] = list(beyond, world.time)
	return beyond

/// TRUE if a person could walk across this tile with no door to open: open floor, nothing solid, no doorway, no flaps.
/proc/crew_npc_open_gap(turf/spot)
	if(!isopenturf(spot) || spot.is_blocked_turf(exclude_mobs = TRUE))
		return FALSE
	if(locate(/obj/machinery/door/airlock) in spot)
		return FALSE
	if(locate(/obj/machinery/door/window) in spot)
		return FALSE
	for(var/obj/structure/plasticflaps/flaps in spot)
		if(flaps.require_resting)
			return FALSE
	return TRUE

#undef CREW_NPC_OPEN_WAYS_KEPT

/// Says why the body may not put this person out of its post, or null if it may.
/datum/ai_controller/crew_npc/proc/why_not_put_out(mob/living/carbon/human/person)
	if(belongs_in_post(person))
		return "[person.name] has every right to be in [post_place]."
	if(crew_npc_is_command(person))
		return "[person.name] outranks you. You do not lay a hand on them."
	// No head's card on them, but the face and the PDA list say who it is.
	var/known_as = known_command_job(person)
	if(known_as)
		return "[person.name] is the [known_as]. You do not lay a hand on them."
	// Someone who cannot answer has not refused to go, and someone in another's hands is not the body's to take.
	if(crew_npc_person_down(person))
		return "[person.name] is down and cannot walk. Someone should see to them."
	if(person.pulledby && person.pulledby != pawn)
		return "[person.pulledby.name] already has hold of [person.name]."
	if(person.handcuffed)
		return "[person.name] is in cuffs. That is security's business."
	return null

/// Tool: take someone who has no business in the body's post by the arm and walk them out of it.
/datum/ai_controller/crew_npc/proc/tool_throw_out(handle)
	if(isnull(post_turf))
		action_result(CREW_TOOL_EVICT, FALSE, "You have no room of your own to put anyone out of.")
		return
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person) || !recently_saw(person))
		action_result(CREW_TOOL_EVICT, FALSE, "You cannot see that person.")
		return
	if(get_area(person) != get_area(post_turf))
		action_result(CREW_TOOL_EVICT, TRUE, "[person.name] is not in [post_place] any more.")
		return
	var/why_not = why_not_put_out(person)
	if(why_not)
		action_result(CREW_TOOL_EVICT, FALSE, why_not)
		return
	start_errand(person, CREW_TOOL_EVICT, handle)

/// Takes hold of the person the body has walked up to and sets off for the door with them.
/datum/ai_controller/crew_npc/proc/take_hold_of(mob/living/carbon/human/person)
	var/mob/living/carbon/human/body = pawn
	if(get_area(person) != get_area(post_turf))
		return list(TRUE, "[person.name] is not in [post_place] any more.")
	var/why_not = why_not_put_out(person)
	if(why_not)
		return list(FALSE, why_not)
	var/turf/spot = spot_outside_post()
	if(isnull(spot))
		return list(FALSE, "You cannot see a door to walk [person.name] out by.")
	body.start_pulling(person)
	if(body.pulling != person)
		return list(FALSE, "You cannot get a hold of [person.name].")
	evicting = WEAKREF(person)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) took hold of [key_name(person)] to walk them out of [post_place].")
	body.visible_message(span_warning("[body] takes [person] by the arm to walk [person.p_them()] out of [post_place]."))
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		their_controller.taken_hold_of(body, post_place)
	// From here it is a walk. Starting it ends this errand, and the walk reports when it is over.
	start_walk(spot, CREW_TOOL_EVICT, get_area_name(spot, TRUE), CREW_NPC_EVICT_HOLD)
	return list(TRUE, null)

/// Called when the walk out with someone ends. Lets go of them and tells the brain how it went.
/datum/ai_controller/crew_npc/proc/put_out(succeeded, reason)
	var/mob/living/carbon/human/body = pawn
	var/mob/living/carbon/human/person = evicting?.resolve()
	evicting = null
	body.stop_pulling()
	if(QDELETED(person))
		action_result(CREW_TOOL_EVICT, FALSE, "Whoever you were walking out has gone.")
		return
	var/out = get_area(person) != get_area(post_turf)
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		their_controller.let_go_of(body, post_place, out)
	if(out)
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) walked [key_name(person)] out of [post_place].")
		action_result(CREW_TOOL_EVICT, TRUE, "You walk [person.name] out of [post_place] and let go of them.")
		// Having seen them out, the body goes back to where it works.
		addtimer(CALLBACK(src, PROC_REF(step_away_from_door)), 0.5 SECONDS)
	else
		var/why = reason || "they got away from you"
		// A hold lost because this body itself went down is its own trouble, not theirs: they did not get away.
		if(why == "they got away from you" && (body.incapacitated || body.body_position == LYING_DOWN))
			why = "you were knocked down"
		// Only a hold they broke is their refusing to go (MULTI-08, the owner's answer B; API-01): the
		// walk timing out, no way to the door, the body going down, or them being down, in cuffs or
		// strapped to a seat is no refusal. The window needs that and the telling to leave before a warrant.
		var/broke_hold = reason == "they got away from you" && why == reason && !crew_npc_person_down(person) && !person.handcuffed && !person.buckled
		action_result(CREW_TOOL_EVICT, FALSE, "You could not get [person.name] out of [post_place]: [why].", list("would_not_go" = broke_hold, "person" = person.name))

/// Someone has taken this body by the arm to walk it out of a room. It goes along with it.
/datum/ai_controller/crew_npc/proc/taken_hold_of(mob/living/carbon/human/by, place)
	// Whatever it was in the middle of, it is not doing it now. Pulling against the hold would break it.
	cancel_search()
	cancel_errand()
	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
	in_hand_until = world.time + CREW_NPC_EVICT_HOLD
	in_hand_of = by.name
	in_hand_by = WEAKREF(by)
	in_hand_misses = 0
	stand_still(CREW_NPC_EVICT_HOLD, by)
	emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] takes you by the arm and starts walking you out of [place].", list("in_hand" = TRUE))
	addtimer(CALLBACK(src, PROC_REF(check_arm_hold)), 1 SECONDS)

/**
 * Looks, once a second while it is being walked out by the arm, at whether whoever took hold of it
 * still has it. If they died, were knocked out, broke off for something else without letting go
 * through put_out, or the pull broke, nothing else would free it until the 40 s ran out, and every
 * tool would be refused meanwhile (SUP-06, SENSE-07). Two looks in a row are needed, so a pull that
 * only slips for a moment does not count. Security's custody keeps its own hold and is left alone.
 */
/datum/ai_controller/crew_npc/proc/check_arm_hold()
	if(QDELETED(src) || QDELETED(pawn) || isnull(in_hand_by))
		return
	if(world.time >= in_hand_until || custody_phase)
		in_hand_by = null
		return
	var/mob/living/carbon/human/body = pawn
	var/mob/living/carbon/human/by = in_hand_by.resolve()
	if(!QDELETED(by) && body.pulledby == by && by.stat == STABLE)
		in_hand_misses = 0
		addtimer(CALLBACK(src, PROC_REF(check_arm_hold)), 1 SECONDS)
		return
	if(++in_hand_misses < 2)
		addtimer(CALLBACK(src, PROC_REF(check_arm_hold)), 1 SECONDS)
		return
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) is no longer held by the arm by [QDELETED(by) ? (in_hand_of || "someone") : key_name(by)]: the hold lapsed at [AREACOORD(body)].")
	if(!QDELETED(by))
		let_go_of(by, null, FALSE)
		return
	var/was_held_by = in_hand_of || "Whoever had you by the arm"
	in_hand_until = 0
	in_hand_of = null
	in_hand_by = null
	talk_hold_until = min(talk_hold_until, world.time)
	emit_sense(CREW_SENSE_KNOWLEDGE, "[was_held_by] lets go of you.", list("in_hand" = FALSE))

/// Whoever had this body by the arm has let go of it.
/datum/ai_controller/crew_npc/proc/let_go_of(mob/living/carbon/human/by, place, out)
	in_hand_until = 0
	in_hand_of = null
	in_hand_by = null
	// It may move again. The loop that kept it still sees this at its next turn and lets it go.
	talk_hold_until = min(talk_hold_until, world.time)
	if(!out)
		emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] lets go of you.", list("in_hand" = FALSE))
		return
	// It was not wanted in there, so it does not go straight back and try the door.
	blocked_places[place] = world.time
	emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] has walked you out of [place] and let go of you. You had no business in there.", list("put_out_of" = place))

/**
 * TRUE if someone else who works at the body's post has lately sent a janitor a PDA message. One
 * call is enough: the rest leave it a while before they think of sending for one themselves.
 */
/datum/ai_controller/crew_npc/proc/workmate_called_janitor()
	return length(rooms_workmate_called_for()) > 0

/**
 * The rooms someone else at the body's post has lately sent a janitor to, by name. A call that named
 * no room is listed as "" (MULTI-06): until every caller says the room, the window can tell only
 * that one was made.
 */
/datum/ai_controller/crew_npc/proc/rooms_workmate_called_for()
	var/list/rooms = list()
	var/list/calls = post_place ? GLOB.crew_npc_janitor_calls[post_place] : null
	if(!length(calls))
		return rooms
	var/mob/living/carbon/human/body = pawn
	for(var/room in calls)
		var/list/last_call = calls[room]
		if(last_call[1] != body.real_name && world.time - last_call[2] < CREW_NPC_CALL_STANDS)
			rooms += room
	return rooms

/**
 * Notes that the body has sent a janitor to a mess, for the others at its post: to the room of this
 * name, or to no room in particular if none is given. Only a call to a mess should be noted, not
 * any message that happens to go to a janitor (a mail notice is no call).
 */
/datum/ai_controller/crew_npc/proc/note_janitor_called(room)
	if(isnull(post_place))
		return
	var/mob/living/carbon/human/body = pawn
	var/list/calls = GLOB.crew_npc_janitor_calls[post_place]
	if(isnull(calls))
		calls = list()
		GLOB.crew_npc_janitor_calls[post_place] = calls
	calls[istext(room) ? room : ""] = list(body.real_name, world.time)

/// The last janitor call from each post, by the post's name, then by the room it was for ("" for none named): list(who sent it, world.time).
GLOBAL_LIST_EMPTY(crew_npc_janitor_calls)

/// TRUE if this door stands on the edge of this room, so that going through it leaves the room.
/proc/crew_npc_leads_out(obj/machinery/door/door, area/room)
	var/turf/spot = get_turf(door)
	var/inside = get_area(spot) == room
	var/outside = !inside
	for(var/direction in GLOB.cardinals)
		var/turf/next = get_step(spot, direction)
		if(!isopenturf(next))
			continue
		if(get_area(next) == room)
			inside = TRUE
		else
			outside = TRUE
	return inside && outside

/// TRUE if a step this way onto this turf would walk the body into a door, which opens it for anyone it opens to.
/proc/crew_npc_steps_into_door(atom/movable/walker, turf/destination, direction)
	for(var/obj/machinery/door/door in destination)
		if(istype(door, /obj/machinery/door/firedoor))
			continue
		// A windoor bars only the side of the tile it stands on.
		if(istype(door, /obj/machinery/door/window) && door.dir != REVERSE_DIR(direction))
			continue
		return TRUE
	for(var/obj/machinery/door/window/windoor in get_turf(walker))
		if(windoor.dir == direction)
			return TRUE
	return FALSE
