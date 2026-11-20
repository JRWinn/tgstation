/**
 * Crates that will not come.
 *
 * A crate trails a step behind whoever hauls it, and catches on whatever the hauler stepped past:
 * a workmate in an airlock, a door, another crate. The pull breaks and the crate is left where it
 * stopped, which is as often as not a doorway. A body that walked on from there left the way shut
 * behind it. So it goes back and takes hold again, a few times. A crate that still will not come
 * is put where it is in nobody's way before anything else is done. And a body whose own way is
 * shut by a crate someone left in a doorway moves it, as anyone would.
 *
 * All of it is done the way a player would do it: by walking, taking hold and pulling, or by
 * walking into the crate to push it. Nothing is moved by code.
 */

/// How long a body that has just cleared its way of a crate leaves it before it will clear its way again.
#define CREW_NPC_WAY_CLEAR_AGAIN (1 MINUTES)
/// Longest a body that has taken a crate up again waits for whoever it caught on to step aside. It sets off sooner if they do.
#define CREW_NPC_WAY_WAIT (8 SECONDS)

/// Writes what the body did about a crate to the round's game log.
/datum/ai_controller/crew_npc/proc/log_haul(text)
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) [text]")

/// Says, for the log, what stands next to a crate that could have caught it: people, doors, other crates.
/datum/ai_controller/crew_npc/proc/beside_crate(obj/structure/closet/crate/crate)
	var/list/names = list()
	for(var/atom/movable/thing in range(1, crate))
		if(thing == crate || thing == pawn)
			continue
		if(thing.density || istype(thing, /obj/machinery/door) || istype(thing, /obj/structure/plasticflaps))
			names |= "[thing.name] at ([thing.x],[thing.y])"
	return length(names) ? english_list(names) : "nothing"

/// Forgets everything about the last haul: a new one is starting.
/datum/ai_controller/crew_npc/proc/begin_haul()
	haul_tries = 0
	gave_up_tool = null
	gave_up_reason = null
	reporting_gave_up = FALSE
	clear_by_pushing = FALSE
	after_clearing = null
	left_clear_in = null
	left_clear_pushed = FALSE

/**
 * Called when a walk with a crate has come to nothing, before anything is said about it. Returns
 * TRUE if the body is seeing to the crate, and the haul is not over yet.
 *
 * A crate that got away is taken up again, a few times. One that got away once too often, or that
 * there is no way through with, is put clear of the doors, and only then is the haul reported as failed.
 */
/datum/ai_controller/crew_npc/proc/crate_got_away(tool, reason)
	if(!CREW_NPC_HAULS_CRATE(tool))
		return FALSE
	var/mob/living/carbon/human/body = pawn
	var/obj/structure/closet/crate/crate = hauled_ref?.resolve()
	if(QDELETED(body) || QDELETED(crate) || !isturf(crate.loc) || crate.anchored)
		return FALSE
	// Someone else has it in hand. It is theirs to see to now.
	if(crate.pulledby && crate.pulledby != body)
		return FALSE
	var/lost = reason == CREW_NPC_GRIP_LOST
	if(lost)
		log_haul("lost its grip on the [crate.name] ([tool]). The crate was left at [AREACOORD(crate)]; the body was at [AREACOORD(body)]. Next to the crate: [beside_crate(crate)].")
	// Putting it clear is a haul too. If pulling it came to nothing, pushing it is what is left, once.
	if(tool == CREW_TOOL_PUT_CLEAR)
		if(clear_by_pushing || (!lost && reason != CREW_NPC_NO_WAY))
			return FALSE
		clear_by_pushing = TRUE
		go_back_for(crate, CREW_TOOL_PUT_CLEAR)
		return TRUE
	if(lost && haul_tries < CREW_NPC_HAUL_TRIES)
		haul_tries++
		var/list/details = list("regrip" = haul_tries)
		var/mob/living/carbon/human/person = who_is_in_the_way(crate)
		if(person)
			details["in_the_way"] = handle_for(person)
		log_haul("is going back to take up the [crate.name] again: try [haul_tries] of [CREW_NPC_HAUL_TRIES].")
		// Set off first, then say so: the brain hears of it with the body already busy.
		go_back_for(crate, tool)
		emit_sense(CREW_SENSE_KNOWLEDGE, "You lost your grip on the [hauled_name][person ? ": [person.name] is standing in the way" : ""]. You are going back to take hold of it again.", details)
		return TRUE
	if(!lost && reason != CREW_NPC_NO_WAY)
		return FALSE
	if(put_clear(crate, tool, reason))
		return TRUE
	// It lies clear of the doors as it is. The haul is given up all the same, and reported as one that was.
	body.stop_pulling()
	freight_changed()
	left_clear_in = get_area_name(crate, TRUE)
	log_haul("has given up hauling the [crate.name] ([tool]: [reason]). It lies clear of the doors at [AREACOORD(crate)].")
	reporting_gave_up = TRUE
	finish_haul(tool, FALSE, reason)
	reporting_gave_up = FALSE
	left_clear_in = null
	return TRUE

/// Lets go, keeps its workmates off the crate, and sets off for it again in a moment.
/datum/ai_controller/crew_npc/proc/go_back_for(obj/structure/closet/crate/crate, tool)
	var/mob/living/carbon/human/body = pawn
	body.stop_pulling()
	claim_crate(crate)
	// Not from inside the walk that has just ended: the tree is still closing it off. The body is
	// not idle meanwhile, and the brain is told so, or it would take the haul for lost and start on something else.
	seeing_to_crate = TRUE
	addtimer(CALLBACK(src, PROC_REF(take_up), WEAKREF(crate), tool, errand_serial), 0.2 SECONDS)

/// Sets off for a crate to take hold of it again, unless the body has been sent to do something else meanwhile.
/datum/ai_controller/crew_npc/proc/take_up(datum/weakref/crate_ref, tool, serial)
	seeing_to_crate = FALSE
	if(QDELETED(src) || QDELETED(pawn))
		return
	var/obj/structure/closet/crate/crate = crate_ref.resolve()
	if(QDELETED(crate) || errand_serial != serial || blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET))
		begin_haul()
		return
	start_errand(crate, tool, hauled_name)

/// Having taken a crate up again, gives whoever it caught on a moment to get out of the way before setting off with it.
/datum/ai_controller/crew_npc/proc/wait_for_way(obj/structure/closet/crate/crate)
	if(!haul_tries || isnull(who_is_in_the_way(crate)))
		return
	// Long enough to be asked and to move. It sets off as soon as they have.
	var/held_until = world.time + CREW_NPC_WAY_WAIT
	stand_still(CREW_NPC_WAY_WAIT)
	if(talk_hold_until == held_until)
		addtimer(CALLBACK(src, PROC_REF(watch_way), WEAKREF(crate), errand_serial, held_until), 0.5 SECONDS)

/// Ends the wait for the way the moment nobody is in it. Only the wait it set: a hold for talk, set since, is left alone.
/datum/ai_controller/crew_npc/proc/watch_way(datum/weakref/crate_ref, serial, held_until)
	if(QDELETED(src) || QDELETED(pawn) || errand_serial != serial || talk_hold_until != held_until || world.time >= held_until)
		return
	var/obj/structure/closet/crate/crate = crate_ref.resolve()
	if(QDELETED(crate) || isnull(who_is_in_the_way(crate)))
		talk_hold_until = world.time
		return
	addtimer(CALLBACK(src, PROC_REF(watch_way), crate_ref, serial, held_until), 0.5 SECONDS)

/**
 * Gives a haul up and sets about putting the crate where it is in nobody's way. Returns TRUE if
 * there is anything to do: a crate that already lies clear of the doors is left where it is.
 */
/datum/ai_controller/crew_npc/proc/put_clear(obj/structure/closet/crate/crate, tool, reason)
	if(crew_npc_clear_of_doors(crate))
		return FALSE
	gave_up_tool = tool
	gave_up_reason = reason
	clear_by_pushing = FALSE
	after_clearing = null
	left_clear_in = null
	left_clear_pushed = FALSE
	log_haul("has given up hauling the [crate.name] ([tool]: [reason]) and is putting it clear of the doors. It lies at [AREACOORD(crate)].")
	go_back_for(crate, CREW_TOOL_PUT_CLEAR)
	return TRUE

/**
 * Returns a spot to haul a crate to that is clear of doors: the nearest the body can see, on its
 * own side of the crate, and far enough off that the crate, a step behind, comes away from where it lies.
 */
/datum/ai_controller/crew_npc/proc/clear_spot_for(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/turf/here = get_turf(body)
	var/turf/lies = get_turf(crate)
	var/list/in_sight = view(CREW_NPC_CLEAR_REACH, body)
	// Someone else's crate, moved because it shut the body's way, stays in the room or tunnel it lay
	// in. Hauled to the nearest clear spot on the body's own side, a stray crate from the tunnel
	// went into the Custodial Closet the body had just stepped out of: three tiles square, with a
	// cart and a tank in it. With one more crate unpacked there, a janitor was shut in for a
	// quarter of an hour and the other two could not get to their supplies.
	var/area/stays_in = after_clearing ? get_area(lies) : null
	// Two tiles from any door if there is such a spot, so that the crate behind the body is a tile from one.
	for(var/clearance in list(2, 1))
		var/turf/best
		var/best_distance = INFINITY
		for(var/turf/candidate in in_sight)
			var/distance = get_dist(candidate, here)
			if(distance < 2 || distance >= best_distance || distance >= get_dist(candidate, lies))
				continue
			if(stays_in && get_area(candidate) != stays_in)
				continue
			if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf() || (locate(/obj/machinery/conveyor) in candidate))
				continue
			if(!crew_npc_clear_of_doors(candidate, clearance))
				continue
			best = candidate
			best_distance = distance
		if(best)
			return best
	// Nowhere in sight: a shut door may hide the room it came out of. Straight back the way it came,
	// away from the crate, is where that room is. Doors on the way open to the body or they do not;
	// if not, the walk finds no way and pushing is what is left.
	var/back = get_dir(lies, here)
	if(stays_in || !(back in GLOB.cardinals))
		return null
	for(var/clearance in list(2, 1))
		var/turf/spot = here
		for(var/steps in 1 to CREW_NPC_CLEAR_REACH)
			spot = get_step(spot, back)
			if(isnull(spot) || !isopenturf(spot) || isspaceturf(spot))
				break
			if(locate(/obj/machinery/door/airlock) in spot)
				continue
			if(spot.is_blocked_turf(exclude_mobs = TRUE))
				break
			if(steps >= 2 && crew_npc_safe_turf(spot) && !(locate(/obj/machinery/conveyor) in spot) && crew_npc_clear_of_doors(spot, clearance))
				return spot
	return null

/**
 * Takes hold of the crate the body has come to stand by and sets off to put it clear of the
 * doors. If there is nowhere to pull it to, or pulling has been tried, it is pushed. May sleep.
 */
/datum/ai_controller/crew_npc/proc/haul_clear(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	if(crate.pulledby && crate.pulledby != body)
		return list(FALSE, "[crate.pulledby.name] has hold of it.")
	if(crew_npc_clear_of_doors(crate))
		return list(TRUE, null)
	if(!clear_by_pushing)
		var/turf/spot = clear_spot_for(crate)
		if(spot)
			body.start_pulling(crate)
			if(body.pulling == crate)
				// From here it is a walk. Starting it ends this errand, and the walk reports when it is over.
				start_walk(spot, CREW_TOOL_PUT_CLEAR, get_area_name(spot, TRUE), CREW_NPC_WALK_TIMEOUT)
				return list(TRUE, null)
		clear_by_pushing = TRUE
	return push_clear(crate)

/// TRUE if a crate could be pushed onto this tile: open floor with nothing solid on it, and not out into space.
/proc/crew_npc_crate_fits(turf/spot)
	return isopenturf(spot) && !isspaceturf(spot) && !spot.is_blocked_turf()

/**
 * Returns the way to push a crate to get it clear of a door, or 0 if there is none. The body has
 * to be able to stand square behind the crate with one step at most, and every tile the crate
 * would cross has to be open, as far as one that is clear of doors. The shortest push is taken.
 */
/datum/ai_controller/crew_npc/proc/push_direction(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/turf/here = get_turf(body)
	var/best_dir = 0
	var/fewest = INFINITY
	for(var/push_dir in GLOB.cardinals)
		var/turf/behind = get_step(crate, REVERSE_DIR(push_dir))
		if(isnull(behind) || get_dist(here, behind) > 1)
			continue
		if(behind != here && !crew_npc_crate_fits(behind))
			continue
		var/turf/ahead = get_turf(crate)
		for(var/pushes in 1 to CREW_NPC_PUSH_REACH)
			ahead = get_step(ahead, push_dir)
			if(isnull(ahead) || !crew_npc_crate_fits(ahead))
				break
			if(!crew_npc_clear_of_doors(ahead) || (locate(/obj/machinery/conveyor) in ahead))
				continue
			if(pushes < fewest)
				fewest = pushes
				best_dir = push_dir
			break
	return best_dir

/// Pushes a crate clear of a door by walking into it, a tile at a time. Sleeps between steps. Returns whether it ended up clear.
/datum/ai_controller/crew_npc/proc/push_clear(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/serial = errand_serial
	var/push_dir = push_direction(crate)
	if(!push_dir)
		return list(FALSE, "There is nowhere to push it to.")
	var/pace = max(movement_delay, 0.3 SECONDS)
	body.stop_pulling()
	var/turf/behind = get_step(crate, REVERSE_DIR(push_dir))
	if(get_turf(body) != behind)
		body.Move(behind, get_dir(body, behind))
		sleep(pace)
		if(QDELETED(src) || QDELETED(body) || QDELETED(crate) || errand_serial != serial)
			return list(FALSE, "You were called away.")
		if(get_turf(body) != behind)
			return list(FALSE, "You could not get behind it to push.")
	for(var/pushes in 1 to CREW_NPC_PUSH_REACH)
		if(crew_npc_clear_of_doors(crate))
			break
		var/turf/before = get_turf(crate)
		// Walking into a loose crate pushes it a tile on, and the body steps into where it was.
		body.Move(get_step(body, push_dir), push_dir)
		sleep(pace)
		if(QDELETED(src) || QDELETED(body) || QDELETED(crate) || errand_serial != serial)
			return list(FALSE, "You were called away.")
		if(get_turf(crate) == before)
			break
		left_clear_pushed = TRUE
	return list(crew_npc_clear_of_doors(crate), null)

/**
 * Called when the body has done what it can to put a crate clear of the doors: by the walk that
 * hauled it, or by the errand that pushed it or could not get to it. A haul that was given up is
 * now reported as failed, with where the crate was left. A body that was clearing its own way
 * goes back to what it was doing.
 */
/datum/ai_controller/crew_npc/proc/put_clear_finished()
	var/mob/living/carbon/human/body = pawn
	var/obj/structure/closet/crate/crate = hauled_ref?.resolve()
	body.stop_pulling()
	freight_changed()
	var/there = !QDELETED(crate) && isturf(crate.loc)
	var/clear = there && crew_npc_clear_of_doors(crate)
	left_clear_in = clear ? get_area_name(crate, TRUE) : null
	if(there)
		log_haul(clear ? "put the [crate.name] clear of the doors at [AREACOORD(crate)], by [left_clear_pushed ? "pushing" : "pulling"] it." : "could not get the [crate.name] clear of the doors. It lies at [AREACOORD(crate)]. Next to it: [beside_crate(crate)].")
	var/list/back_to = after_clearing
	var/tool = gave_up_tool
	var/reason = gave_up_reason
	after_clearing = null
	gave_up_tool = null
	gave_up_reason = null
	clear_by_pushing = FALSE
	if(back_to)
		var/crate_name = hauled_name
		var/moved_to = left_clear_in
		left_clear_in = null
		left_clear_pushed = FALSE
		// Set off first, then say so: the brain hears of it with the body already busy.
		go_back_to(back_to)
		emit_sense(CREW_SENSE_KNOWLEDGE, clear ? "A [crate_name] was lying in a doorway and shutting your way. You have moved it clear, into [moved_to]." : "A [crate_name] is lying in a doorway and shutting your way, and you could not shift it.", list("way_cleared" = clear))
		return
	if(isnull(tool))
		return
	reporting_gave_up = TRUE
	finish_haul(tool, FALSE, reason)
	reporting_gave_up = FALSE
	left_clear_in = null
	left_clear_pushed = FALSE

/// Says, for the brain, where a crate of a haul that was given up has been left. Nothing unless one was.
/datum/ai_controller/crew_npc/proc/gave_up_report(list/details)
	if(!reporting_gave_up)
		return ""
	details["gave_up"] = TRUE
	details["crate"] = hauled_name
	var/obj/structure/closet/crate/crate = hauled_ref?.resolve()
	var/datum/crew_npc_held_crate/entry = QDELETED(crate) ? null : crew_npc_held_entry(crate)
	if(entry)
		details["number"] = entry.number
	if(isnull(left_clear_in))
		// Where the crate lies, not where the body is, so the brain can tell whoever sent it (PLAY-12).
		// It was in hand a moment ago: its room is one the body has just seen it in.
		if(!QDELETED(crate) && isturf(crate.loc))
			var/lies_in = get_area_name(crate, TRUE)
			details["lies_in"] = lies_in
			return " You could not get it clear of the doors either. It lies in [lies_in]."
		return " You could not get it clear of the doors either."
	details["left_in"] = left_clear_in
	return " You have left it in [left_clear_in], clear of the doors."

/**
 * Tells the brain how a haul with a crate ended, through whichever part of the work the haul
 * belongs to. Returns FALSE if the tool is not one that hauls a crate.
 */
/datum/ai_controller/crew_npc/proc/finish_haul(tool, succeeded, reason)
	if(!CREW_NPC_HAULS_CRATE(tool) || tool == CREW_TOOL_PUT_CLEAR)
		return FALSE
	// No way through with a crate is no way through. It counts towards the body knowing it is shut in.
	if(!succeeded && reason == CREW_NPC_NO_WAY)
		note_way_out_failed()
	switch(tool)
		if(CREW_TOOL_RELEASE)
			crate_released(succeeded, reason)
		if(CREW_TOOL_COLLECT)
			crate_collected(succeeded, reason)
		if(CREW_TOOL_TAKE_BACK)
			crate_taken_back(succeeded, reason)
		else
			freight_hauled(tool, succeeded, reason)
	return TRUE

/// TRUE if a turf is one a crate or a body cannot go through: a wall, or floor with something solid or plastic flaps on it.
/proc/crew_npc_shut_turf(turf/spot)
	return isnull(spot) || !isopenturf(spot) || spot.is_blocked_turf(exclude_mobs = TRUE) || (locate(/obj/structure/plasticflaps) in spot)

/**
 * TRUE if a crate lies where it shuts the way through a door: on the door's own tile, or beside
 * a door in a passage one tile wide. A crate that merely stands near a door, with room to walk
 * round it, shuts nothing.
 */
/proc/crew_npc_crate_shuts_way(obj/structure/closet/crate/crate)
	var/turf/lies = get_turf(crate)
	for(var/obj/machinery/door/door in lies)
		if(!istype(door, /obj/machinery/door/firedoor))
			return TRUE
	if(crew_npc_clear_of_doors(crate))
		return FALSE
	// Square in front of a door: the one tile that door can be walked into from, on this side of
	// it. However much room there is to either side of the crate, nobody gets through that door.
	for(var/direction in GLOB.cardinals)
		if(locate(/obj/machinery/door/airlock) in get_step(lies, direction))
			return TRUE
	if(crew_npc_shut_turf(get_step(lies, NORTH)) && crew_npc_shut_turf(get_step(lies, SOUTH)))
		return TRUE
	return crew_npc_shut_turf(get_step(lies, EAST)) && crew_npc_shut_turf(get_step(lies, WEST))

/**
 * Returns the nearest loose crate that shuts a doorway near the body, or null. The body has to be
 * able to see the crate, or the door it lies by: it has just found there is no way through, and
 * a door it is looking at with a crate jammed behind it is where anyone would look next.
 */
/datum/ai_controller/crew_npc/proc/crate_in_the_way(atom/heading_for)
	var/mob/living/carbon/human/body = pawn
	// Where the body was making for, if that is on this level: a crate that lies no nearer to it
	// than the body does is not what stands between them.
	var/turf/making_for = heading_for ? get_turf(heading_for) : null
	if(making_for && making_for.z != body.z)
		making_for = null
	var/list/seen = view(CREW_NPC_VISION_RANGE, body)
	var/obj/structure/closet/crate/own = hauled_ref?.resolve()
	var/obj/structure/closet/crate/nearest
	var/nearest_distance = INFINITY
	for(var/obj/structure/closet/crate/crate in range(CREW_NPC_VISION_RANGE, body))
		if(crate == own || crate.anchored || !isturf(crate.loc) || crate_taken(crate))
			continue
		var/distance = get_dist(body, crate)
		if(distance >= nearest_distance || !crew_npc_crate_shuts_way(crate))
			continue
		if(making_for && get_dist(crate, making_for) >= get_dist(body, making_for))
			continue
		var/in_sight = (crate in seen)
		// The door it lies by has to be one the body's own ID opens. A door that is locked to it is
		// what stops it, crate or no crate, and shifting someone's crate about gets it nowhere: a
		// janitor shut in the Mining Office hauled a crate across the room for a door it could
		// never have gone through. Anyone knows what their own card opens.
		// An airlock, that is. Shutters and blast doors open for a button, not a card, and have no
		// access set, so every card "opens" them: a janitor shut in the Cargo Bay went off to shift a
		// crate that lay by the Warehouse shutters.
		var/own_door = FALSE
		for(var/obj/machinery/door/airlock/door in range(1, crate))
			if(door.allowed(body))
				own_door = TRUE
			if(door in seen)
				in_sight = TRUE
		if(!in_sight || !own_door)
			continue
		nearest = crate
		nearest_distance = distance
	return nearest

/**
 * Called when a walk has ended with no way through. If a loose crate is shutting a doorway near
 * the body, it goes and moves it clear, then takes up again what it was doing: once, so that a
 * crate it cannot shift is not gone at over and over. Returns TRUE if it has set about that.
 */
/datum/ai_controller/crew_npc/proc/clear_the_way(atom/target, tool, goal)
	if(way_cleared_at && world.time - way_cleared_at < CREW_NPC_WAY_CLEAR_AGAIN)
		return FALSE
	if(tool == CREW_TOOL_RETURN || tool == CREW_TOOL_STEP_ASIDE || tool == CREW_TOOL_EVICT || tool == CREW_TOOL_FLEE || tool == CREW_TOOL_PUT_CLEAR)
		return FALSE
	var/mob/living/carbon/human/body = pawn
	var/list/back_to
	if(CREW_NPC_HAULS_CRATE(tool))
		var/obj/structure/closet/crate/own = hauled_ref?.resolve()
		if(QDELETED(own) || !isturf(own.loc) || (own.pulledby && own.pulledby != body))
			return FALSE
		back_to = list("crate" = WEAKREF(own), "tool" = tool, "name" = hauled_name, "tries" = haul_tries)
	else
		if(QDELETED(target))
			return FALSE
		back_to = list("target" = isturf(target) ? target : WEAKREF(target), "tool" = tool, "goal" = goal, "timeout" = walk_timeout)
	var/obj/structure/closet/crate/crate = crate_in_the_way(target)
	if(isnull(crate))
		return FALSE
	way_cleared_at = world.time
	gave_up_tool = null
	gave_up_reason = null
	clear_by_pushing = FALSE
	left_clear_in = null
	left_clear_pushed = FALSE
	after_clearing = back_to
	hauled_ref = WEAKREF(crate)
	hauled_name = format_text(crate.name)
	log_haul("found no way to [goal] ([tool]) and is moving the [crate.name] clear: it lies at [AREACOORD(crate)], shutting a doorway.")
	go_back_for(crate, CREW_TOOL_PUT_CLEAR)
	return TRUE

/// Takes up again the walk or the haul that was broken off to clear the way. If the way is still shut, it fails this time and is reported.
/datum/ai_controller/crew_npc/proc/go_back_to(list/back_to)
	var/tool = back_to["tool"]
	var/datum/weakref/crate_ref = back_to["crate"]
	if(crate_ref)
		var/obj/structure/closet/crate/own = crate_ref.resolve()
		hauled_ref = crate_ref
		hauled_name = back_to["name"]
		haul_tries = back_to["tries"]
		if(QDELETED(own))
			finish_haul(tool, FALSE, CREW_NPC_NO_WAY)
			return
		go_back_for(own, tool)
		return
	var/atom/target = back_to["target"]
	if(istype(target, /datum/weakref))
		var/datum/weakref/target_ref = target
		target = target_ref.resolve()
	if(QDELETED(target))
		action_result(tool, FALSE, "You stop walking: the person you were heading for is gone.")
		return
	seeing_to_crate = TRUE
	addtimer(CALLBACK(src, PROC_REF(walk_again), target, tool, back_to["goal"], back_to["timeout"], errand_serial), 0.2 SECONDS)

/// Sets off again on a walk that was broken off, unless the body has been sent to do something else meanwhile.
/datum/ai_controller/crew_npc/proc/walk_again(atom/target, tool, goal, timeout, serial)
	seeing_to_crate = FALSE
	if(QDELETED(src) || QDELETED(pawn) || QDELETED(target))
		return
	if(errand_serial != serial || blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET))
		return
	start_walk(target, tool, goal, timeout)

#undef CREW_NPC_WAY_CLEAR_AGAIN
#undef CREW_NPC_WAY_WAIT
