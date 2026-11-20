/**
 * Crates cargo is holding for collection.
 *
 * Cargo staff cannot get into the rooms the crew work in, so nothing is delivered. A crate that
 * comes in on an order is hauled into the bay and held there, and whoever ordered it is sent the
 * number on its shipping manifest. Whoever they send comes to the counter and gives that number,
 * and the crate is brought out to the lobby for them. They haul it to where it is wanted, unpack
 * it, and bring the empty crate back.
 *
 * A crate nobody comes for is not forgotten. Every few minutes one of the staff at the post says
 * it is going to see what is still there, looks, and reminds whoever ordered it. Saying so is
 * taking the job: everyone else at the post starts counting again from that moment.
 */

/// One crate that came in on an order and is waiting for whoever it is for to send someone for it.
/datum/crew_npc_held_crate
	/// The crate, as a weak reference.
	var/datum/weakref/crate_ref
	/// The number on its shipping manifest. Whoever comes for it gives this number.
	var/number
	/// Name of whoever ordered it.
	var/for_name
	/// What it is, by the name it was ordered under.
	var/what
	/// The cargo post that ordered it, by the name of the room.
	var/post
	/// world.time it came off the supply shuttle, or 0 while it is still aboard.
	var/held_since = 0
	/// How many times whoever ordered it has been reminded that it is waiting.
	var/reminders = 0
	/// TRUE once it has been brought out to the lobby for whoever came for it.
	var/out = FALSE
	/// Name of whoever is hauling it away, or null.
	var/collected_by
	/// world.time the crate was first seen with nobody pulling it while collected_by was set, or 0.
	/// A claim left that way for CREW_NPC_CRATE_CLAIM lapses: its collector died, was gibbed, or let go
	/// with no finisher run, and nobody else could ever take the crate (SUP-06).
	var/loose_since = 0
	/// How many times someone has gone to it and found they could not get there.
	var/unreachable = 0
	/// Why it can no longer be handed over, in words, once it cannot: it is lost.
	var/lost
	/// Name of whoever at the post has written it off and is sending word, or null if nobody has yet.
	var/written_off_by

/// The crates being held for collection, as /datum/crew_npc_held_crate. Read it through crew_npc_held_crates().
GLOBAL_LIST_EMPTY(crew_npc_held_crates)
/// Crates that were being held and are lost, as /datum/crew_npc_held_crate, until whoever ordered them has been told.
GLOBAL_LIST_EMPTY(crew_npc_lost_crates)

/**
 * Says why a crate that was being held can no longer be handed to whoever comes for it, or null
 * if it still can. Destroyed, off the station or emptied, it is lost for certain. One that cargo
 * has gone to more than once and could not get to is taken to be. A crate that has only waited a
 * long time, or lies somewhere awkward, is not lost.
 */
/proc/crew_npc_crate_lost(datum/crew_npc_held_crate/entry)
	var/obj/structure/closet/crate/crate = entry.crate_ref?.resolve()
	if(QDELETED(crate))
		return "it has been destroyed"
	// Still aboard the supply shuttle on its way in, it has not been lost. It has not arrived.
	if(!entry.held_since)
		return null
	var/turf/where = get_turf(crate)
	if(isnull(where) || !is_station_level(where.z) || isspaceturf(where))
		return "it is no longer aboard the station"
	if(isnull(entry.collected_by) && crew_npc_crate_spent(crate))
		return "it has been emptied"
	if(entry.unreachable >= CREW_NPC_LOST_AFTER)
		return "nobody can get to it"
	return null
/// world.time someone at each cargo post last said it was going to look over the crates waiting there, by the post's name.
GLOBAL_LIST_EMPTY(crew_npc_held_claims)

/// Returns the crates being held for collection, having dropped any that are gone and noted any that have come off the shuttle.
/proc/crew_npc_held_crates()
	for(var/datum/crew_npc_held_crate/entry as anything in GLOB.crew_npc_held_crates)
		var/obj/structure/closet/crate/crate = entry.crate_ref?.resolve()
		// Whoever hauled it off the shuttle, it has been waiting since it left it.
		if(!QDELETED(crate) && !entry.held_since && !istype(get_area(crate), /area/shuttle))
			entry.held_since = world.time
		// A claim on it with nobody pulling it lapses in a while, so it is there for the taking again.
		if(entry.collected_by)
			if(!QDELETED(crate) && crate.pulledby)
				entry.loose_since = 0
			else if(!entry.loose_since)
				entry.loose_since = world.time
			else if(world.time - entry.loose_since > CREW_NPC_CRATE_CLAIM)
				log_game("Crew NPC held crate #[entry.number]: [entry.collected_by]'s claim on it lapsed, nobody has pulled it for [DisplayTimeText(world.time - entry.loose_since)].")
				entry.collected_by = null
				entry.loose_since = 0
		else
			entry.loose_since = 0
		// One that can no longer be handed over is not held any more. It is kept apart until
		// someone at the post has written it off and whoever ordered it has been told.
		var/why = crew_npc_crate_lost(entry)
		if(why)
			entry.lost = why
			GLOB.crew_npc_held_crates -= entry
			GLOB.crew_npc_lost_crates += entry
	return GLOB.crew_npc_held_crates

/**
 * Writes off any crate of the body's post that has been lost and that nobody has written off yet:
 * says so aloud, in plain words, so that everyone at the post knows, and notes that whoever
 * ordered it is owed word by PDA. One of those at the post does this for any one crate.
 */
/datum/ai_controller/crew_npc/proc/write_off_lost_crates()
	if(!works_in_cargo() || isnull(post_turf) || !can_sense())
		return
	var/mob/living/carbon/human/body = pawn
	for(var/datum/crew_npc_held_crate/entry as anything in GLOB.crew_npc_lost_crates)
		if(entry.post != post_place || entry.written_off_by)
			continue
		entry.written_off_by = body.real_name
		GLOB.crew_npc_lost_crates -= entry
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) wrote off held crate #[entry.number] for [entry.for_name || "nobody"]: [entry.lost].")
		speak_plainly("Crate [entry.number][entry.for_name ? " for [entry.for_name]" : ""] is lost: [entry.lost]. I will send word.")
		if(entry.for_name)
			notices_owed += list(list("to" = entry.for_name, "kind" = CREW_NOTICE_LOST, "numbers" = list(entry.number), "what" = entry.what, "why" = entry.lost))

/// Returns the held crate with this manifest number, or null. The number may come as text.
/proc/crew_npc_held_by_number(number)
	if(istext(number))
		number = text2num(number)
	if(!isnum(number))
		return null
	for(var/datum/crew_npc_held_crate/entry as anything in crew_npc_held_crates())
		if(entry.number == number)
			return entry
	return null

/// Returns what is known of this crate as one being held, or null if it is not one.
/proc/crew_npc_held_entry(obj/structure/closet/crate/crate)
	if(QDELETED(crate))
		return null
	for(var/datum/crew_npc_held_crate/entry as anything in GLOB.crew_npc_held_crates)
		if(entry.crate_ref?.resolve() == crate)
			return entry
	return null

/// Returns the number on the shipping manifest still stuck to a crate, or null if it has none.
/proc/crew_npc_manifest_number(obj/structure/closet/crate/crate)
	var/obj/item/paper/fluff/jobs/cargo/manifest/manifest = crate.manifest?.resolve()
	return QDELETED(manifest) ? null : manifest.order_id

/// Says a list of manifest numbers the way it is written: "crate #12", "crates #12 and #13".
/proc/crew_npc_numbers_written(list/numbers)
	var/list/written = list()
	for(var/number in numbers)
		written += "#[number]"
	return "crate[length(numbers) == 1 ? "" : "s"] [english_list(written)]"

/// Says a list of manifest numbers the way it is spoken: "crate 12", "crates 12 and 13".
/proc/crew_npc_numbers_spoken(list/numbers)
	var/list/spoken = list()
	for(var/number in numbers)
		spoken += "[number]"
	return "crate[length(numbers) == 1 ? "" : "s"] [english_list(spoken)]"

/**
 * What the brain is told of the crates being held: each one's number, who it is for, where it is
 * and how long it has waited. Cargo staff are told of all of them. Everyone else is told only of
 * those put out in the lobby, and only while it is in the crate's room or can see it, or is the
 * one hauling it.
 */
/datum/ai_controller/crew_npc/proc/held_state()
	var/list/held = list()
	var/cargo = works_in_cargo()
	// Looking over what is held is when one that has been lost is found to be.
	crew_npc_held_crates()
	write_off_lost_crates()
	var/mob/living/carbon/human/body = pawn
	var/area/here = get_area(body)
	var/list/seen
	for(var/datum/crew_npc_held_crate/entry as anything in crew_npc_held_crates())
		if(!cargo && !entry.out)
			continue
		var/obj/structure/closet/crate/crate = entry.crate_ref.resolve()
		// Anyone else knows of a crate put out only by being where it is: in its room, or in sight of
		// it. A collector anywhere aboard used to set off for it the moment it was put out (JOBS-05).
		// The one hauling it keeps it in mind wherever it has got to with it.
		if(!cargo && entry.collected_by != body.real_name && get_area(crate) != here)
			seen ||= view(CREW_NPC_VISION_RANGE, pawn)
			if(!(crate in seen))
				continue
		held += list(list(
			"number" = entry.number,
			// What the order book at the counter says. Nobody else reads it.
			"for" = cargo ? entry.for_name : null,
			"what" = cargo ? entry.what : null,
			"place" = get_area_name(crate, TRUE),
			"out" = entry.out,
			"taken_by" = entry.collected_by,
			"waited" = entry.held_since ? world.time - entry.held_since : 0,
		))
	return held

/// Returns the crates of the body's post that are waiting and may still be chased: in the bay or the lobby, nobody hauling them, not yet reminded of too often.
/datum/ai_controller/crew_npc/proc/held_waiting()
	var/list/waiting = list()
	for(var/datum/crew_npc_held_crate/entry as anything in crew_npc_held_crates())
		if(entry.post == post_place && entry.held_since && isnull(entry.collected_by) && entry.reminders < CREW_NPC_HELD_REMINDERS)
			waiting += entry
	return waiting

/// Returns those of them that have waited long enough for whoever ordered them to be reminded.
/datum/ai_controller/crew_npc/proc/held_overdue()
	var/list/overdue = list()
	for(var/datum/crew_npc_held_crate/entry as anything in held_waiting())
		if(world.time - entry.held_since >= CREW_NPC_HELD_OVERDUE)
			overdue += entry
	return overdue

/// How long this body leaves it before it next goes to look: a little more or less each time, and not the same as its workmates.
/datum/ai_controller/crew_npc/proc/held_check_wait()
	return CREW_NPC_HELD_CHECK_EVERY + rand(-CREW_NPC_HELD_CHECK_SPREAD, CREW_NPC_HELD_CHECK_SPREAD)

/**
 * TRUE if it is this body's moment to go and look over the crates waiting to be collected.
 *
 * Each of the staff at a post counts down by itself, and nobody counts while nothing is waiting.
 * Whoever's time is up first goes. A crate that has only just come in is not chased: the count
 * runs on until the oldest one has waited long enough.
 */
/datum/ai_controller/crew_npc/proc/held_check_due()
	if(!works_in_cargo() || isnull(post_turf))
		return FALSE
	var/list/waiting = held_waiting()
	if(!length(waiting))
		held_check_at = 0
		return FALSE
	// A workmate has said it is going to look. Everyone at the post starts counting again from then.
	var/claimed_at = GLOB.crew_npc_held_claims[post_place]
	if(claimed_at && claimed_at != held_claim_seen)
		held_claim_seen = claimed_at
		held_check_at = claimed_at + held_check_wait()
	if(!held_check_at)
		held_check_at = world.time + held_check_wait()
	if(world.time < held_check_at)
		return FALSE
	var/oldest = INFINITY
	for(var/datum/crew_npc_held_crate/entry as anything in waiting)
		oldest = min(oldest, entry.held_since)
	if(world.time - oldest < CREW_NPC_HELD_OVERDUE)
		held_check_at = oldest + CREW_NPC_HELD_OVERDUE + rand(0, CREW_NPC_HELD_CHECK_SPREAD)
		return FALSE
	return TRUE

/**
 * Tool: say that the body is going to see what crates are still waiting, and go and look. Cargo staff only.
 *
 * The words are said as they stand, by the body, so that whoever hears them knows the job is
 * taken. Saying them is what starts everyone at the post counting again.
 */
/datum/ai_controller/crew_npc/proc/tool_check_held()
	var/mob/living/carbon/human/body = pawn
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_CHECK_HELD, FALSE, "Keeping track of the crates waiting to be collected is cargo's job.")
		return
	if(!held_check_due())
		action_result(CREW_TOOL_CHECK_HELD, FALSE, "There is no call to look over the crates waiting to be collected just now.")
		return
	var/obj/structure/closet/crate/nearest
	var/nearest_distance = INFINITY
	for(var/datum/crew_npc_held_crate/entry as anything in held_overdue())
		var/obj/structure/closet/crate/crate = entry.crate_ref.resolve()
		var/distance = get_dist(body, crate)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = crate
	if(isnull(nearest))
		action_result(CREW_TOOL_CHECK_HELD, FALSE, "There is no call to look over the crates waiting to be collected just now.")
		return
	GLOB.crew_npc_held_claims[post_place] = world.time
	speak_plainly(CREW_NPC_HELD_CLAIM)
	start_errand(nearest, CREW_TOOL_CHECK_HELD, null)

/// Has the body say a line of its own, in the words given, if it can speak. Used for what its work has it say as it stands.
/datum/ai_controller/crew_npc/proc/speak_plainly(text)
	var/mob/living/carbon/human/body = pawn
	if(!body.can_speak())
		return
	COOLDOWN_START(src, say_cooldown, CREW_NPC_SAY_COOLDOWN)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) said as part of its work: [text]")
	INVOKE_ASYNC(body, TYPE_PROC_REF(/atom/movable, say), text)
	// Nobody says their piece over their shoulder on the way out. It stops for it, and a moment after.
	stand_still(CREW_NPC_TALK_PAUSE)

/**
 * Looks over the crates waiting to be collected, from beside one of them, says what is still there,
 * and notes who is to be reminded by PDA. Sleeps while it looks.
 */
/datum/ai_controller/crew_npc/proc/look_over_held(obj/structure/closet/crate/crate)
	sleep(CREW_NPC_LOOK_TIME)
	if(QDELETED(src) || QDELETED(pawn))
		return list(FALSE, "You could not get to it.")
	// Who ordered each of them, with the numbers of theirs that are still here.
	var/list/owed = list()
	for(var/datum/crew_npc_held_crate/entry as anything in held_overdue())
		entry.reminders++
		var/whose = entry.for_name || "nobody you know of"
		if(isnull(owed[whose]))
			owed[whose] = list()
		owed[whose] += entry.number
	if(!length(owed))
		return list(TRUE, "You look over the bay. Nothing has been waiting long enough to chase anyone about.")
	var/list/spoken = list()
	var/list/written = list()
	for(var/whose in owed)
		spoken += "[crew_npc_numbers_spoken(owed[whose])] for [whose]"
		written += "[crew_npc_numbers_written(owed[whose])] for [whose]"
		if(whose != "nobody you know of")
			notices_owed += list(list("to" = whose, "kind" = CREW_NOTICE_WAITING, "numbers" = owed[whose]))
	speak_plainly("Still waiting: [english_list(spoken)]. I will send word.")
	return list(TRUE, "You look over the crates waiting to be collected. Still here: [english_list(written)]. Whoever ordered them is to be reminded by PDA.")

/**
 * Tool: bring a crate that is being held out to the Cargo Lobby, for whoever has come for it. Cargo staff only.
 *
 * Whoever comes gives the number on the crate's manifest. Whether they gave the right one is
 * settled here, whoever asks.
 */
/datum/ai_controller/crew_npc/proc/tool_release(number, handle)
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_RELEASE, FALSE, "Handing out the crates that are being held is cargo's job.")
		return
	var/datum/crew_npc_held_crate/entry = crew_npc_held_by_number(number)
	if(isnull(entry))
		action_result(CREW_TOOL_RELEASE, FALSE, "You are not holding a crate by that number.", list("no_such_crate" = TRUE))
		return
	var/obj/structure/closet/crate/crate = entry.crate_ref.resolve()
	if(entry.out)
		var/where = get_area_name(crate, TRUE)
		action_result(CREW_TOOL_RELEASE, TRUE, "Crate #[entry.number] has been put out already. It is in [where].", list("place" = where, "number" = entry.number))
		return
	if(entry.collected_by)
		action_result(CREW_TOOL_RELEASE, FALSE, "[entry.collected_by] is already taking crate #[entry.number] away.")
		return
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	release_for = QDELETED(person) ? last_heard_speaker : person.name
	// Brought out for someone other than whoever ordered it: written down, so a round shows who
	// came for whose crate (TRUST-04).
	if(entry.for_name && release_for != entry.for_name)
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) is bringing out held crate #[entry.number] ordered by [entry.for_name] for [release_for || "someone unknown"][QDELETED(person) ? "" : " ([key_name(person)])"].")
	begin_haul()
	start_errand(crate, CREW_TOOL_RELEASE, "crate #[entry.number]")

/// Takes hold of the held crate the body is standing by and sets off for the Cargo Lobby with it.
/datum/ai_controller/crew_npc/proc/haul_released(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(crate)
	if(isnull(entry))
		return list(FALSE, "That crate is not one you are holding for anyone.")
	var/lobby = learn_place(/area/station/cargo/lobby)
	// The middle of the lobby, so the crate ends up well inside it, where whoever came for it can get at it.
	var/turf/destination = middle_of(/area/station/cargo/lobby)
	if(isnull(lobby) || isnull(destination))
		return list(FALSE, "You do not know where to put the crate out.")
	// Someone else has it in hand. Taking hold of it now would pull it out of their hands (MULTI-07).
	if(crate.pulledby && crate.pulledby != body)
		return list(FALSE, "[crate.pulledby.name] already has hold of crate #[entry.number].")
	body.start_pulling(crate)
	if(body.pulling != crate)
		return list(FALSE, "You cannot get a grip on crate #[entry.number].")
	// It is marked with its number and who it is for before it leaves the bay, so anyone who finds it knows.
	// Once: a crate taken up again after it got away has its label already.
	if(!haul_tries)
		label_crate(crate, entry)
	hauled_name = "crate #[entry.number]"
	hauled_ref = WEAKREF(crate)
	// From here it is a walk. Starting it ends this errand, and the walk reports when it is over.
	start_walk(destination, CREW_TOOL_RELEASE, lobby, CREW_NPC_TRAVEL_TIMEOUT)
	wait_for_way(crate)
	return list(TRUE, null)

/// Called when the walk out to the lobby with a held crate ends. Lets go of it and tells the brain.
/datum/ai_controller/crew_npc/proc/crate_released(succeeded, reason)
	var/mob/living/carbon/human/body = pawn
	var/obj/structure/closet/crate/hauled = hauled_ref?.resolve()
	var/still_held = !isnull(body.pulling)
	body.stop_pulling()
	freight_changed()
	var/place = get_area_name(body, TRUE)
	var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(hauled)
	if(succeeded && still_held && entry)
		entry.out = TRUE
		work_crates_out++
		action_result(CREW_TOOL_RELEASE, TRUE, "You bring crate #[entry.number] out to [place] and leave it there[release_for ? " for [release_for]" : ""] to take away.", list("place" = place, "number" = entry.number))
		return
	var/list/details = list("place" = place)
	var/blocker = in_the_way_report(hauled, details)
	action_result(CREW_TOOL_RELEASE, FALSE, "You could not get the [hauled_name] out to the lobby: [reason || "you lost your grip on it"].[blocker][gave_up_report(details)] You are in [place].", details)

/**
 * Tool: haul a crate that cargo has put out for collection to a room, and unpack it there.
 *
 * Anyone sent for a crate can do this. Only a crate cargo has put out can be taken, and only to a
 * room the body's own ID gets it into.
 */
/datum/ai_controller/crew_npc/proc/tool_collect(number, place)
	var/mob/living/carbon/human/body = pawn
	var/datum/crew_npc_held_crate/entry = crew_npc_held_by_number(number)
	if(isnull(entry) || !entry.out)
		action_result(CREW_TOOL_COLLECT, FALSE, "Cargo has not put a crate by that number out for you.", list("no_such_crate" = isnull(entry)))
		return
	if(entry.collected_by && entry.collected_by != body.real_name)
		action_result(CREW_TOOL_COLLECT, FALSE, "[entry.collected_by] is already taking crate #[entry.number] away.", list("no_such_crate" = TRUE))
		return
	var/known = istext(place) ? find_known_place(place) : null
	var/area/station/room = known ? crew_npc_station_places()[known] : null
	if(isnull(room))
		action_result(CREW_TOOL_COLLECT, FALSE, "You do not know of anywhere aboard by that name.")
		return
	if(locked_out_of(room))
		action_result(CREW_TOOL_COLLECT, FALSE, "You cannot get into [known] yourself, so you cannot take a crate there.")
		return
	collect_to = known
	begin_haul()
	start_errand(entry.crate_ref.resolve(), CREW_TOOL_COLLECT, "crate #[entry.number]")

/// Takes hold of the crate the body has come for and sets off with it for the room it is wanted in.
/datum/ai_controller/crew_npc/proc/haul_collected(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(crate)
	if(isnull(entry))
		return list(FALSE, "That crate is not one cargo put out for anyone.")
	var/area/station/room = collect_to ? crew_npc_station_places()[collect_to] : null
	var/turf/destination = room ? room_middle(room) : null
	if(isnull(destination))
		return list(FALSE, "You do not know where to take the crate.")
	// Someone else has it in hand. Taking hold of it now would pull it out of their hands (MULTI-07).
	if(crate.pulledby && crate.pulledby != body)
		return list(FALSE, "[crate.pulledby.name] already has hold of crate #[entry.number].")
	body.start_pulling(crate)
	if(body.pulling != crate)
		return list(FALSE, "You cannot get a grip on crate #[entry.number].")
	entry.collected_by = body.real_name
	entry.loose_since = 0
	hauled_name = "crate #[entry.number]"
	hauled_ref = WEAKREF(crate)
	// From here it is a walk. Starting it ends this errand, and the walk reports when it is over.
	start_walk(destination, CREW_TOOL_COLLECT, collect_to, CREW_NPC_TRAVEL_TIMEOUT)
	wait_for_way(crate)
	return list(TRUE, null)

/// Called when the walk with a collected crate ends. Unpacks it where it was wanted, and tells the brain.
/datum/ai_controller/crew_npc/proc/crate_collected(succeeded, reason)
	var/mob/living/carbon/human/body = pawn
	var/obj/structure/closet/crate/hauled = hauled_ref?.resolve()
	var/still_held = !isnull(body.pulling)
	body.stop_pulling()
	var/place = get_area_name(body, TRUE)
	var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(hauled)
	if(succeeded && still_held && !QDELETED(hauled))
		// It is tipped out where people can pick the things up, and the crate is this body's to take back.
		var/list/names = tip_out(hauled)
		// It has been collected. Nobody is reminded of it again.
		if(entry)
			GLOB.crew_npc_held_crates -= entry
		if(isnull(names))
			// Hauled there, but shut still: nothing is out, and there is no empty crate to take back.
			var/why = "The crate will not open for you."
			if(istype(hauled, /obj/structure/closet/crate/large))
				why = "It is a wooden crate: it wants prying open with a crowbar."
			else if(hauled.welded)
				why = "The crate will not open for you: it is welded shut."
			else if(hauled.locked)
				why = "The crate will not open for you: it is locked."
			action_result(CREW_TOOL_COLLECT, FALSE, "You haul the [hauled_name] to [place], but you cannot unpack it. [why] It is left there, shut.", list("place" = place, "number" = entry?.number))
			return
		crate_to_return = WEAKREF(hauled)
		action_result(CREW_TOOL_COLLECT, TRUE, "You haul the [hauled_name] to [place] and unpack it there[length(names) ? ": [english_list(names)]" : ""]. The empty crate is yours to take back to cargo.", list("place" = place, "number" = entry?.number))
		return
	var/list/details = list("place" = place)
	// Left where it stopped, it is still there for the taking. Only this body's own claim is let go
	// of: one who took it out of the body's hands has set their own, and it stands (MULTI-07).
	if(entry && entry.collected_by == body.real_name)
		entry.collected_by = null
	var/mob/taker = (!QDELETED(hauled) && hauled.pulledby && hauled.pulledby != body) ? hauled.pulledby : null
	if(taker)
		details["held_by"] = taker.name
		action_result(CREW_TOOL_COLLECT, FALSE, "You could not get the [hauled_name] where it was going: [taker.name] has taken hold of it. You are in [place].", details)
		return
	var/blocker = in_the_way_report(hauled, details)
	action_result(CREW_TOOL_COLLECT, FALSE, "You could not get the [hauled_name] where it was going: [reason || "you lost your grip on it"].[blocker][gave_up_report(details)] You are in [place].", details)
