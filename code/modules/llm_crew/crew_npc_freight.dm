/**
 * Freight: what cargo staff do about the supply shuttle beyond seeing one order through.
 *
 * A shuttle that has docked is not left sitting there. Whatever came on it is hauled off into the
 * bay, crates that came on an order among them: those are held there until they are collected (see
 * crew_npc_held.dm). Mail is taken out of its crate and kept until whoever it is for comes to the counter. Crates
 * with nothing left in them go back aboard, and the shuttle is sent away with them, which is how
 * the station gets paid for them.
 *
 * The brain's window decides the order of the work from what freight_state() tells it. Every tool
 * here checks for itself that there is something to do, whoever asks.
 */

/// Returns the supply shuttle if it is sitting docked at the station, or null.
/datum/ai_controller/crew_npc/proc/docked_supply_shuttle()
	var/obj/docking_port/mobile/supply/shuttle = SSshuttle.supply
	if(isnull(shuttle) || shuttle.mode != SHUTTLE_IDLE || shuttle.getDockedId() != "cargo_home")
		return null
	return shuttle

/// Returns the crates aboard the supply shuttle, if it is docked at the station.
/datum/ai_controller/crew_npc/proc/crates_aboard()
	var/list/crates = list()
	var/obj/docking_port/mobile/supply/shuttle = docked_supply_shuttle()
	if(isnull(shuttle))
		return crates
	for(var/area/shuttle_area as anything in shuttle.shuttle_areas)
		for(var/obj/structure/closet/crate/crate in shuttle_area)
			crates += crate
	return crates

/// Returns the rooms that are cargo's to keep in order: the post, and the lobby where it serves the crew.
/datum/ai_controller/crew_npc/proc/freight_rooms()
	var/list/rooms = list()
	if(post_turf)
		rooms += get_area(post_turf)
	for(var/area/station/cargo/lobby/lobby in GLOB.areas)
		rooms |= lobby
	return rooms

/// Returns the name of whoever a piece of mail is for, or null if it is a dead letter.
/proc/crew_npc_mail_for(obj/item/mail/letter)
	var/datum/mind/recipient = letter.recipient_ref?.resolve()
	if(isnull(recipient))
		return null
	return recipient.current?.real_name || recipient.name

/// Returns the things a crate holds: what is inside it if it is shut, what lies spilled around it if it is open.
/proc/crew_npc_crate_holds(obj/structure/closet/crate/crate)
	var/list/held = list()
	for(var/obj/item/thing in (crate.opened ? crate.drop_location() : crate))
		// The manifest is paperwork about the crate, not something that came in it.
		if(!istype(thing, /obj/item/paper/fluff/jobs/cargo/manifest))
			held += thing
	return held

/// TRUE if a crate has nothing left in it worth keeping: it is empty, or holds only mail addressed to nobody.
/proc/crew_npc_crate_spent(obj/structure/closet/crate/crate)
	for(var/obj/item/thing as anything in crew_npc_crate_holds(crate))
		if(!istype(thing, /obj/item/mail) || crew_npc_mail_for(thing))
			return FALSE
	return TRUE

/// TRUE if a crate holds mail that is addressed to someone.
/proc/crew_npc_crate_has_mail(obj/structure/closet/crate/crate)
	for(var/obj/item/mail/letter in crew_npc_crate_holds(crate))
		if(crew_npc_mail_for(letter))
			return TRUE
	return FALSE

/// The crates crew NPCs have set off for, by REF: who (a weak reference to the controller), and when.
GLOBAL_LIST_EMPTY(crew_npc_crate_claims)

/// Marks a crate as the one this body is going for. Its workmates leave it alone meanwhile: two who take hold of one crate pull it out of each other's hands.
/datum/ai_controller/crew_npc/proc/claim_crate(obj/structure/closet/crate/crate)
	GLOB.crew_npc_crate_claims[REF(crate)] = list(WEAKREF(src), world.time)

/// TRUE if someone else has this crate in hand: they are hauling it, or a workmate set off for it a moment ago.
/datum/ai_controller/crew_npc/proc/crate_taken(obj/structure/closet/crate/crate)
	if(crate.pulledby && crate.pulledby != pawn)
		return TRUE
	var/list/claim = GLOB.crew_npc_crate_claims[REF(crate)]
	if(isnull(claim))
		return FALSE
	var/datum/weakref/claimant_ref = claim[1]
	var/datum/ai_controller/crew_npc/claimant = claimant_ref.resolve()
	if(QDELETED(claimant) || claimant == src || world.time - claim[2] > CREW_NPC_CRATE_CLAIM)
		GLOB.crew_npc_crate_claims -= REF(crate)
		return FALSE
	return TRUE

/// Returns the nearest crate aboard the docked shuttle that still has something in it. One that came on an order is hauled off like any other, and held in the bay.
/datum/ai_controller/crew_npc/proc/crate_to_unload()
	var/obj/structure/closet/crate/nearest
	var/nearest_distance = INFINITY
	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
		if(crate.anchored || crew_npc_crate_spent(crate) || crate_taken(crate))
			continue
		var/distance = get_dist(pawn, crate)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = crate
	return nearest

/// Returns the crates in cargo's rooms, off the shuttle, that are not fixed in place and that nobody else has in hand.
/datum/ai_controller/crew_npc/proc/crates_in_hand()
	var/list/crates = list()
	for(var/area/room as anything in freight_rooms())
		for(var/obj/structure/closet/crate/crate in room)
			if(!crate.anchored && isturf(crate.loc) && !crate_taken(crate))
				crates += crate
	return crates

/**
 * Returns the crates in cargo's rooms that have been left where they are in the way: within a tile
 * of a door. A crate is never left there. One that was dropped on the way somewhere, or put down
 * there by anyone, is hauled clear. One that someone is taking away is theirs to see to.
 */
/datum/ai_controller/crew_npc/proc/misplaced_crates()
	var/list/crates = list()
	for(var/obj/structure/closet/crate/crate as anything in crates_in_hand())
		if(crew_npc_clear_of_doors(crate))
			continue
		var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(crate)
		if(entry?.collected_by)
			continue
		crates += crate
	return crates

/// Returns the nearest mail crate in cargo's rooms that still has addressed mail in it, or null.
/datum/ai_controller/crew_npc/proc/mail_crate()
	var/obj/structure/closet/crate/nearest
	var/nearest_distance = INFINITY
	for(var/obj/structure/closet/crate/crate as anything in crates_in_hand())
		if(!crew_npc_crate_has_mail(crate))
			continue
		var/distance = get_dist(pawn, crate)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = crate
	return nearest

/// Returns the crates in cargo's rooms with nothing left in them.
/datum/ai_controller/crew_npc/proc/spent_crates()
	var/list/crates = list()
	for(var/obj/structure/closet/crate/crate as anything in crates_in_hand())
		if(crew_npc_crate_spent(crate))
			crates += crate
	return crates

/// Returns the mail the body is carrying.
/datum/ai_controller/crew_npc/proc/mail_carried()
	return pawn.get_all_contents_type(/obj/item/mail)

/**
 * What the brain is told about the freight: how much is waiting to come off the shuttle, whether
 * there is mail to take out of its crate, who the mail it carries is for, and how many empty crates
 * are waiting to go back. Worked out afresh at most every couple of seconds.
 */
/datum/ai_controller/crew_npc/proc/freight_state()
	if(!works_in_cargo() || isnull(post_turf))
		return null
	if(freight_cache && world.time - freight_cached_at < CREW_NPC_FREIGHT_CHECK)
		return freight_cache
	var/to_unload = 0
	var/empties_aboard = 0
	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
		if(crate.anchored)
			continue
		if(crew_npc_crate_spent(crate))
			empties_aboard++
		// One a workmate is already hauling off is not this body's to unload.
		else if(!crate_taken(crate))
			to_unload++
	var/list/mail_for = list()
	for(var/obj/item/mail/letter as anything in mail_carried())
		var/whose = crew_npc_mail_for(letter)
		if(whose)
			mail_for |= whose
	freight_cache = list(
		"shuttle_docked" = !isnull(docked_supply_shuttle()),
		"to_unload" = to_unload,
		"empties_aboard" = empties_aboard,
		"mail_crate" = !isnull(mail_crate()),
		"mail_for" = mail_for,
		"empty_crates" = length(spent_crates()),
		// Crates left within a tile of a door, where they are in the way.
		"misplaced" = length(misplaced_crates()),
	)
	freight_cached_at = world.time
	return freight_cache

/// Forgets the last look at the freight, because the body has just changed it.
/datum/ai_controller/crew_npc/proc/freight_changed()
	freight_cache = null

/**
 * Returns a spot in the bay to leave a crate: open floor with open floor all round it, well clear
 * of doors, conveyors and the body's own post. A crate left there is in nobody's way, and two left
 * that way never end up side by side.
 */
/datum/ai_controller/crew_npc/proc/storage_spot(area/bay, turf/here)
	// The bay, and near the body, unless told otherwise: a crate being moved out of a doorway goes
	// to the nearest such spot to where it lies, in whichever of cargo's rooms that is.
	bay ||= get_area(post_turf)
	here ||= get_turf(pawn)
	var/turf/best
	var/turf/fallback
	var/best_distance = INFINITY
	var/fallback_distance = INFINITY
	for(var/turf/candidate as anything in bay.get_turfs_by_zlevel(here.z))
		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf() || get_dist(candidate, post_turf) <= 1)
			continue
		if((locate(/obj/machinery/conveyor) in candidate) || !crew_npc_clear_of_doors(candidate, 2))
			continue
		var/distance = get_dist(candidate, here)
		if(distance < fallback_distance)
			fallback_distance = distance
			fallback = candidate
		if(distance >= best_distance)
			continue
		var/in_the_open = TRUE
		for(var/turf/beside as anything in RANGE_TURFS(1, candidate))
			if(beside == candidate)
				continue
			if(get_area(beside) != bay || !isopenturf(beside) || beside.is_blocked_turf(exclude_mobs = TRUE))
				in_the_open = FALSE
				break
		if(in_the_open)
			best_distance = distance
			best = candidate
	return best || fallback

/// Returns a spot aboard the docked supply shuttle to leave a crate: as near the middle as there is room.
/datum/ai_controller/crew_npc/proc/shuttle_spot()
	var/obj/docking_port/mobile/supply/shuttle = docked_supply_shuttle()
	if(isnull(shuttle))
		return null
	var/list/deck = list()
	for(var/area/shuttle_area as anything in shuttle.shuttle_areas)
		deck += shuttle_area.get_turfs_by_zlevel(shuttle.z)
	if(!length(deck))
		return null
	var/total_x = 0
	var/total_y = 0
	for(var/turf/deck_turf as anything in deck)
		total_x += deck_turf.x
		total_y += deck_turf.y
	var/turf/middle = locate(round(total_x / length(deck)), round(total_y / length(deck)), shuttle.z)
	var/turf/best
	var/best_distance = INFINITY
	for(var/turf/candidate as anything in deck)
		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf() || (locate(/obj/machinery/conveyor) in candidate))
			continue
		var/distance = get_dist(candidate, middle)
		if(distance < best_distance)
			best_distance = distance
			best = candidate
	return best

/// Tool: haul the next crate with something in it off the supply shuttle and into the bay. Cargo staff only.
/datum/ai_controller/crew_npc/proc/tool_unload()
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_UNLOAD, FALSE, "Unloading the supply shuttle is cargo's job.")
		return
	var/obj/structure/closet/crate/crate = crate_to_unload()
	if(isnull(crate))
		action_result(CREW_TOOL_UNLOAD, FALSE, "There is nothing left aboard the supply shuttle to unload.")
		return
	claim_crate(crate)
	start_errand(crate, CREW_TOOL_UNLOAD, format_text(crate.name))

/**
 * Tool: haul a crate that has been left within a tile of a door to the nearest spot where it is
 * in nobody's way. Cargo staff only. It does not matter how the crate came to be there: dropped
 * by this body on the way somewhere, or by a workmate, or put down by anyone at all.
 */
/datum/ai_controller/crew_npc/proc/tool_stow()
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_STOW, FALSE, "Keeping crates out of the doorways is cargo's job.")
		return
	var/obj/structure/closet/crate/crate
	var/nearest_distance = INFINITY
	for(var/obj/structure/closet/crate/candidate as anything in misplaced_crates())
		var/distance = get_dist(pawn, candidate)
		if(distance < nearest_distance)
			nearest_distance = distance
			crate = candidate
	if(isnull(crate))
		action_result(CREW_TOOL_STOW, FALSE, "There is no crate lying by a door.")
		return
	claim_crate(crate)
	start_errand(crate, CREW_TOOL_STOW, format_text(crate.name))

/// Tool: haul a crate with nothing left in it aboard the supply shuttle, to be sent back. Cargo staff only.
/datum/ai_controller/crew_npc/proc/tool_recycle()
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_RECYCLE, FALSE, "Sending crates back is cargo's job.")
		return
	if(isnull(docked_supply_shuttle()))
		action_result(CREW_TOOL_RECYCLE, FALSE, "The supply shuttle is not here to put a crate aboard.")
		return
	var/list/crates = spent_crates()
	if(!length(crates))
		action_result(CREW_TOOL_RECYCLE, FALSE, "There is no empty crate here to send back.")
		return
	var/obj/structure/closet/crate/crate
	var/nearest_distance = INFINITY
	for(var/obj/structure/closet/crate/candidate as anything in crates)
		var/distance = get_dist(pawn, candidate)
		if(distance < nearest_distance)
			nearest_distance = distance
			crate = candidate
	claim_crate(crate)
	start_errand(crate, CREW_TOOL_RECYCLE, format_text(crate.name))

/// Takes hold of the crate the body is standing by and sets off with it: into the bay, or aboard the shuttle.
/datum/ai_controller/crew_npc/proc/haul_freight(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/tool = errand_tool
	var/crate_name = format_text(crate.name)
	// A workmate got to it first. Taking hold of it now would pull it out of their hands.
	if(crate.pulledby && crate.pulledby != body)
		return list(FALSE, "[crate.pulledby.name] already has hold of the [crate_name].")
	var/turf/destination
	switch(tool)
		if(CREW_TOOL_UNLOAD)
			destination = storage_spot()
		if(CREW_TOOL_STOW)
			// The nearest clear spot to where it lies, in the room it is in.
			destination = storage_spot(get_area(crate), get_turf(crate))
		else
			destination = shuttle_spot()
	if(isnull(destination))
		return list(FALSE, tool == CREW_TOOL_RECYCLE ? "There is no room aboard the supply shuttle for the [crate_name]." : "There is no room to put the [crate_name].")
	// A crate goes back shut, with whatever worthless thing spilled out of it back inside.
	if(tool == CREW_TOOL_RECYCLE && crate.opened)
		crate.close(body)
	body.start_pulling(crate)
	if(body.pulling != crate)
		return list(FALSE, "You cannot get a grip on the [crate_name].")
	hauled_name = crate_name
	hauled_ref = WEAKREF(crate)
	// From here it is a walk. Starting it ends this errand, and the walk reports when it is over.
	start_walk(destination, tool, get_area_name(destination, TRUE), CREW_NPC_TRAVEL_TIMEOUT)
	return list(TRUE, null)

/// Called when a walk with a crate, into the bay or aboard the shuttle, ends. Lets go of it and tells the brain.
/datum/ai_controller/crew_npc/proc/freight_hauled(tool, succeeded, reason)
	var/mob/living/carbon/human/body = pawn
	var/atom/movable/hauled = body.pulling
	body.stop_pulling()
	freight_changed()
	var/place = get_area_name(body, TRUE)
	if(!succeeded || isnull(hauled))
		var/list/details = list("place" = place)
		var/obj/structure/closet/crate/dropped = hauled_ref?.resolve()
		// Someone taking it out of the body's hands is not someone standing in its way.
		if(!QDELETED(dropped) && dropped.pulledby && dropped.pulledby != body)
			action_result(tool, FALSE, "[dropped.pulledby.name] has taken the [hauled_name] from you. You are in [place].", details)
			return
		var/blocker = in_the_way_report(dropped, details)
		action_result(tool, FALSE, "You could not get the [hauled_name] where it was going: [reason || "you lost your grip on it"].[blocker] You are in [place].", details)
		return
	if(tool == CREW_TOOL_UNLOAD)
		work_crates_in++
		action_result(tool, TRUE, "You haul the [hauled_name] off the supply shuttle and leave it in [place].", list("place" = place))
	else if(tool == CREW_TOOL_STOW)
		action_result(tool, TRUE, "You haul the [hauled_name] clear of the door and leave it in [place], where it is in nobody's way.", list("place" = place))
	else
		work_crates_out++
		action_result(tool, TRUE, "You put the empty [hauled_name] aboard the supply shuttle to go back.", list("place" = place))

/// Tool: take the mail out of a mail crate in the bay, to keep until it is collected. Cargo staff only.
/datum/ai_controller/crew_npc/proc/tool_collect_mail()
	if(!works_in_cargo() || isnull(post_turf))
		action_result(CREW_TOOL_MAIL, FALSE, "Sorting the mail is cargo's job.")
		return
	var/obj/structure/closet/crate/crate = mail_crate()
	if(isnull(crate))
		action_result(CREW_TOOL_MAIL, FALSE, "There is no mail waiting to be taken out of a crate.")
		return
	start_errand(crate, CREW_TOOL_MAIL, format_text(crate.name))

/// Opens the mail crate the body is standing by, puts the addressed mail in its bag, and shuts the crate. Sleeps meanwhile.
/datum/ai_controller/crew_npc/proc/take_mail(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/crate_name = format_text(crate.name)
	if(!crate.opened && !crate.open(body))
		return list(FALSE, "The [crate_name] will not open.")
	sleep(CREW_NPC_LOOK_TIME)
	if(QDELETED(body) || QDELETED(crate))
		return list(FALSE, "You could not get to it.")
	var/list/names = list()
	var/taken = 0
	var/left = 0
	for(var/obj/item/mail/letter in crew_npc_crate_holds(crate))
		var/whose = crew_npc_mail_for(letter)
		if(isnull(whose))
			continue
		if(body.equip_to_storage(letter, ITEM_SLOT_BACK, indirect_action = TRUE))
			taken++
			names |= whose
		else
			left++
	// Shutting it takes back in whatever is still lying there: dead letters, and any mail there was no room for.
	if(crate.opened)
		crate.close(body)
	freight_changed()
	if(!taken)
		return list(FALSE, left ? "You have no room in your bag for the mail in the [crate_name]." : "There is no mail for anyone in the [crate_name].")
	return list(TRUE, "You take [taken] piece[taken == 1 ? "" : "s"] of mail out of the [crate_name] and put [taken == 1 ? "it" : "them"] in your bag: for [english_list(names)].[left ? " There was no room for the rest." : ""] You will hold on to [taken == 1 ? "it" : "them"] until whoever [taken == 1 ? "it is" : "they are"] for comes to the counter.")

/// Tool: hand someone in view the mail the body is holding for them. Cargo staff only.
/datum/ai_controller/crew_npc/proc/tool_hand_mail(handle)
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person) || !recently_saw(person))
		action_result(CREW_TOOL_HAND_MAIL, FALSE, "You cannot see that person.")
		return
	if(!length(mail_carried_for(person)))
		action_result(CREW_TOOL_HAND_MAIL, FALSE, "You are not holding any mail for [person.name].")
		return
	start_errand(person, CREW_TOOL_HAND_MAIL, null)

/// Returns the mail the body is carrying that is addressed to this person.
/datum/ai_controller/crew_npc/proc/mail_carried_for(mob/living/carbon/human/person)
	var/list/theirs = list()
	if(isnull(person.mind))
		return theirs
	for(var/obj/item/mail/letter as anything in mail_carried())
		if(letter.recipient_ref?.resolve() == person.mind)
			theirs += letter
	return theirs

/// Hands the person the body is standing by every piece of mail it carries for them.
/datum/ai_controller/crew_npc/proc/hand_mail_over(mob/living/carbon/human/person)
	var/list/theirs = mail_carried_for(person)
	if(!length(theirs))
		return list(FALSE, "You are not holding any mail for [person.name].")
	for(var/obj/item/mail/letter as anything in theirs)
		// What their hands cannot take ends up at their feet.
		if(!person.put_in_hands(letter))
			letter.forceMove(person.drop_location())
	freight_changed()
	return list(TRUE, "You hand [person.name] the mail that came for them.")

/// Tool: send the supply shuttle back, with whatever empty crates are aboard. Cargo staff only.
/datum/ai_controller/crew_npc/proc/tool_send_shuttle()
	if(!works_in_cargo())
		action_result(CREW_TOOL_SEND, FALSE, "Sending the supply shuttle off is cargo's job.")
		return
	if(isnull(docked_supply_shuttle()))
		action_result(CREW_TOOL_SEND, FALSE, "The supply shuttle is not here to send back.")
		return
	if(supply_run_active || crate_to_unload())
		action_result(CREW_TOOL_SEND, FALSE, "There is still something aboard the supply shuttle that has to come off first.")
		return
	var/obj/machinery/computer/cargo/console = supply_console()
	if(isnull(console))
		action_result(CREW_TOOL_SEND, FALSE, "You cannot think where there is a supply console to send it from.")
		return
	start_errand(console, CREW_TOOL_SEND, null)

/// Sends the shuttle away from the console the body is standing by.
/datum/ai_controller/crew_npc/proc/send_shuttle_back(obj/machinery/computer/cargo/console)
	var/obj/docking_port/mobile/supply/shuttle = docked_supply_shuttle()
	if(isnull(shuttle))
		return list(FALSE, "The supply shuttle has already gone.")
	if(SSshuttle.supply_blocked || !shuttle.canMove())
		// The shuttle will not fly with anyone aboard, or with cargo it is not allowed to carry.
		return list(FALSE, "The supply shuttle will not leave: someone is standing aboard it, or something aboard is not allowed to travel.")
	var/empties = 0
	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
		empties++
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) sent the supply shuttle away with [empties] crate\s aboard.")
	SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)
	freight_changed()
	return list(TRUE, "You send the supply shuttle back[empties ? " with [empties] empty crate[empties == 1 ? "" : "s"] aboard" : ""].")
