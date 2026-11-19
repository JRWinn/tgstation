/**
 * Keeping a room that is locked to the crew.
 *
 * Any body with a post behind a locked door keeps it: this is not one job's work. The body can tell
 * who has a right to be in there, which is anyone the door opens for, and who outranks it. Whether
 * a stranger has a good reason to be there is talked out by the brain. All the body does about it
 * is the last resort: it takes someone with no business in the room by the arm and walks them out.
 * It never lays a hand on the Captain or a head of staff.
 */

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
		if(door.locked || door.welded || !door.allowed(body))
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
			if(get_area(candidate) != beyond || !crew_npc_safe_turf(candidate) || candidate.is_blocked_turf(exclude_mobs = TRUE))
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
	var/list/doors = crew_npc_doors_of(room, here.z)
	if(!length(doors))
		return FALSE
	for(var/obj/machinery/door/airlock/door as anything in doors)
		if(door.allowed(body))
			return FALSE
	return TRUE

/// Says why the body may not put this person out of its post, or null if it may.
/datum/ai_controller/crew_npc/proc/why_not_put_out(mob/living/carbon/human/person)
	if(belongs_in_post(person))
		return "[person.name] has every right to be in [post_place]."
	if(crew_npc_is_command(person))
		return "[person.name] outranks you. You do not lay a hand on them."
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
		action_result(CREW_TOOL_EVICT, FALSE, "You could not get [person.name] out of [post_place]: [why].")

/// Someone has taken this body by the arm to walk it out of a room. It goes along with it.
/datum/ai_controller/crew_npc/proc/taken_hold_of(mob/living/carbon/human/by, place)
	// Whatever it was in the middle of, it is not doing it now. Pulling against the hold would break it.
	cancel_search()
	cancel_errand()
	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
	in_hand_until = world.time + CREW_NPC_EVICT_HOLD
	in_hand_of = by.name
	stand_still(CREW_NPC_EVICT_HOLD, by)
	emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] takes you by the arm and starts walking you out of [place].", list("in_hand" = TRUE))

/// Whoever had this body by the arm has let go of it.
/datum/ai_controller/crew_npc/proc/let_go_of(mob/living/carbon/human/by, place, out)
	in_hand_until = 0
	in_hand_of = null
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
	var/list/last_call = post_place ? GLOB.crew_npc_janitor_calls[post_place] : null
	if(isnull(last_call))
		return FALSE
	var/mob/living/carbon/human/body = pawn
	return last_call[1] != body.real_name && world.time - last_call[2] < CREW_NPC_CALL_STANDS

/// Notes that the body has sent a janitor a PDA message, for the others at its post.
/datum/ai_controller/crew_npc/proc/note_janitor_called()
	if(isnull(post_place))
		return
	var/mob/living/carbon/human/body = pawn
	GLOB.crew_npc_janitor_calls[post_place] = list(body.real_name, world.time)

/// The last PDA message sent to a janitor from each post, by the post's name: list(who sent it, world.time).
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
