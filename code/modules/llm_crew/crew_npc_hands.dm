/**
 * Using the body's hands: picking things up, putting them down and handing them over.
 *
 * Picking up and handing over are errands: the body walks to where it needs to be, then acts.
 * The walk and the act are carried out by the behavior tree; the outcome goes back to the brain.
 */

/// Tool: pick up an item the body can see, or take one out of a container it has looked inside.
/datum/ai_controller/crew_npc/proc/tool_pick_up(item_name)
	var/mob/living/carbon/human/body = pawn
	var/wanted = istext(item_name) ? LOWER_TEXT(trim(item_name)) : null
	if(!length(wanted))
		action_result(CREW_TOOL_PICK_UP, FALSE, "You did not decide what to pick up.")
		return
	if(!length(body.get_empty_held_indexes()))
		action_result(CREW_TOOL_PICK_UP, FALSE, "Your hands are full. Put something down first.")
		return

	// Something lying in plain view comes first.
	var/obj/item/nearest_item
	var/nearest_distance = INFINITY
	for(var/obj/item/candidate in oview(CREW_NPC_VISION_RANGE, body))
		if(!isturf(candidate.loc) || candidate.anchored || (candidate.item_flags & ABSTRACT))
			continue
		if(!name_matches(candidate.name, wanted))
			continue
		var/distance = get_dist(body, candidate)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest_item = candidate
	if(nearest_item)
		start_errand(nearest_item, CREW_TOOL_PICK_UP, wanted)
		return

	// Otherwise, the nearest container the body remembers seeing one in.
	var/obj/structure/closet/nearest_container
	nearest_distance = INFINITY
	for(var/container_ref in storage_memory)
		var/list/memory = storage_memory[container_ref]
		var/datum/weakref/container_weakref = memory["container"]
		var/obj/structure/closet/container = container_weakref?.resolve()
		if(QDELETED(container) || container.z != body.z)
			continue
		var/holds_one = FALSE
		for(var/held_name in memory["items"])
			if(name_matches(held_name, wanted))
				holds_one = TRUE
				break
		if(!holds_one)
			continue
		var/distance = get_dist(body, container)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest_container = container
	if(nearest_container)
		start_errand(nearest_container, CREW_TOOL_PICK_UP, wanted)
		return

	action_result(CREW_TOOL_PICK_UP, FALSE, "You cannot see one, and you do not remember where one is kept.")

/// TRUE if a thing's name is the name being asked for, or contains it.
/datum/ai_controller/crew_npc/proc/name_matches(thing_name, wanted)
	return findtext(LOWER_TEXT(format_text(thing_name)), wanted)

/// Tool: put down what the body is holding.
/datum/ai_controller/crew_npc/proc/tool_put_down()
	var/mob/living/carbon/human/body = pawn
	var/obj/item/held = first_held_item()
	if(isnull(held))
		action_result(CREW_TOOL_PUT_DOWN, FALSE, "You are not holding anything.")
		return
	var/held_name = format_text(held.name)
	if(!body.dropItemToGround(held))
		action_result(CREW_TOOL_PUT_DOWN, FALSE, "You cannot let go of the [held_name].")
		return
	action_result(CREW_TOOL_PUT_DOWN, TRUE, "You put the [held_name] down.")

/// Tool: hand what the body is holding to a person it can see.
/datum/ai_controller/crew_npc/proc/tool_give(handle)
	if(isnull(first_held_item()))
		action_result(CREW_TOOL_GIVE, FALSE, "You are not holding anything to give.")
		return
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person) || !recently_saw(person))
		action_result(CREW_TOOL_GIVE, FALSE, "You cannot see that person.")
		return
	start_errand(person, CREW_TOOL_GIVE, null)

/// Returns an item the body is holding, or null if its hands are empty.
/datum/ai_controller/crew_npc/proc/first_held_item()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/held in body.held_items)
		if(!(held.item_flags & ABSTRACT))
			return held
	return null

/// Sets the body walking to something in order to act on it. The errand leaves report back through finish_errand().
/datum/ai_controller/crew_npc/proc/start_errand(atom/target, tool, wanted)
	cancel_search()
	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
	resting = FALSE
	errand_tool = tool
	errand_item = wanted
	errand_serial++
	set_blackboard_key(BB_CREW_NPC_ERRAND_TARGET, target)

/// Abandons the errand in progress without reporting on it. Used when the body is sent somewhere else.
/datum/ai_controller/crew_npc/proc/cancel_errand()
	clean_queue = list()
	errand_serial++
	errand_tool = null
	errand_item = null
	clear_blackboard_key(BB_CREW_NPC_ERRAND_TARGET)

/**
 * Carries out the errand now that the body has reached its target. May sleep.
 *
 * Returns a list: whether it worked, then the words the brain is told.
 */
/datum/ai_controller/crew_npc/proc/do_errand(atom/target)
	var/mob/living/carbon/human/body = pawn
	// A grenade is thrown from a few tiles off; everything else is done from beside the thing.
	if(errand_tool == CREW_TOOL_GRENADE)
		return QDELETED(target) ? list(FALSE, "The mess you meant to throw it at is gone.") : throw_grenade(target)
	if(QDELETED(target) || QDELETED(body) || !can_reach_target_now(target))
		return list(FALSE, "You could not get to it.")
	body.face_atom(target)
	switch(errand_tool)
		if(CREW_TOOL_PICK_UP)
			if(istype(target, /obj/structure/closet))
				return take_from_container(target)
			return take_item(target)
		if(CREW_TOOL_GIVE)
			return hand_over(target)
		if(CREW_TOOL_ORDER)
			return place_order(target)
		if(CREW_TOOL_BRING)
			return haul_crate(target)
		if(CREW_TOOL_UNLOAD, CREW_TOOL_RECYCLE)
			return haul_freight(target)
		if(CREW_TOOL_MAIL)
			return take_mail(target)
		if(CREW_TOOL_HAND_MAIL)
			return hand_mail_over(target)
		if(CREW_TOOL_SEND)
			return send_shuttle_back(target)
		if(CREW_TOOL_DOOR)
			return hold_door_for(target)
		if(CREW_TOOL_TIDY)
			return tidy_step(target)
		if(CREW_TOOL_CLEAN)
			if(istype(target, /obj/structure/sink))
				return wet_mop(target)
			return clean_mess(target)
	return list(FALSE, "You forget what you came to do.")

/// Picks an item up off the floor or a table.
/datum/ai_controller/crew_npc/proc/take_item(obj/item/item)
	var/mob/living/carbon/human/body = pawn
	var/item_name = format_text(item.name)
	if(!isturf(item.loc))
		return list(FALSE, "The [item_name] is not where you saw it.")
	if(!body.put_in_hands(item))
		return list(FALSE, "You cannot pick up the [item_name].")
	return list(TRUE, "You pick up the [item_name].")

/// Opens a container, takes the wanted item out, and shuts it again. Sleeps while the body does so.
/datum/ai_controller/crew_npc/proc/take_from_container(obj/structure/closet/container)
	var/mob/living/carbon/human/body = pawn
	var/container_name = format_text(container.name)
	var/atom/spill = container.drop_location()
	var/list/already_there = list()
	for(var/obj/item/thing in spill)
		already_there[thing] = TRUE
	var/was_open = container.opened
	if(!was_open && !container.open(body))
		storage_checked_at[REF(container)] = world.time
		report_storage(container, "locked", null)
		return list(FALSE, "The [container_name] is locked.")

	// Take the first thing that came out of it with the right name, and note what else was inside.
	var/obj/item/found
	var/list/inside = list()
	for(var/obj/item/thing in spill)
		if(was_open || already_there[thing])
			continue
		if(isnull(found) && name_matches(thing.name, errand_item))
			found = thing
			continue
		inside[format_text(thing.name)]++
	sleep(CREW_NPC_LOOK_TIME)
	if(QDELETED(body) || QDELETED(container))
		return list(FALSE, "You could not get to it.")

	var/taken = !QDELETED(found) && body.put_in_hands(found)
	if(!taken && found)
		inside[format_text(found.name)]++
	if(!was_open && container.opened)
		container.close(body)
	// What the body just saw replaces what it remembered of this container.
	storage_checked_at[REF(container)] = world.time
	report_storage(container, was_open ? "open" : "looked", inside)
	if(taken)
		return list(TRUE, "You take the [format_text(found.name)] out of the [container_name].")
	return list(FALSE, "There is no [errand_item] in the [container_name] any more.")

/// Hands what the body is holding to a person next to it.
/datum/ai_controller/crew_npc/proc/hand_over(mob/living/carbon/human/person)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/held = first_held_item()
	if(isnull(held))
		return list(FALSE, "You are not holding anything to give.")
	var/held_name = format_text(held.name)
	if(!body.temporarilyRemoveItemFromInventory(held))
		return list(FALSE, "You cannot let go of the [held_name].")
	if(person.put_in_hands(held))
		return list(TRUE, "You hand the [held_name] to [person.name].")
	// Their hands were full, so it ends up at their feet.
	held.forceMove(person.drop_location())
	return list(TRUE, "[person.name] has no free hand, so you put the [held_name] down beside them.")

/// Called by the errand leaves when the errand is over, with the outcome from do_errand().
/datum/ai_controller/crew_npc/proc/finish_errand(list/outcome)
	var/tool = errand_tool
	// A cleaning job is a run of errands, one mess after another, with one report at the end.
	var/list/messes_left = clean_queue
	cancel_errand()
	if(isnull(tool))
		return
	// A thing it could not find a place for is put back down, not carried about for the rest of the shift.
	if(tool == CREW_TOOL_TIDY && !outcome[1])
		drop_tidy_item()
	if(tool != CREW_TOOL_CLEAN)
		action_result(tool, outcome[1], outcome[2])
		// A mop is no use dry. Having just picked one up with a sink in sight, the body wets it there
		// and then, as anyone would. Left for later, it walks off and finds out it cannot clean.
		if(tool == CREW_TOOL_PICK_UP && outcome[1] && dry_mop() && isnull(cleaning_tool()) && sink_in_view)
			addtimer(CALLBACK(src, PROC_REF(tool_clean)), 0.3 SECONDS)
		return

	// Back from wetting the mop: now there is something to clean with, see what there is to clean.
	if(length(outcome) >= 3)
		messes_left = outcome[1] ? messes_to_clean(view(CREW_NPC_VISION_RANGE, pawn)) : list()
	else if(outcome[1])
		cleaned_count++
	clean_queue = messes_left
	// Stop if the tool has given out; otherwise carry on to the next mess.
	if(cleaning_tool() && next_mess())
		return
	clean_queue = list()
	var/place = get_area_name(pawn, TRUE)
	if(cleaned_count)
		action_result(tool, TRUE, "You clean up [cleaned_count] mess[cleaned_count == 1 ? "" : "es"] in [place].", list("place" = place))
	else
		action_result(tool, FALSE, outcome[2] || "Your mop is wet, but there is no mess here for it to clean.")

/// Does what the body came to its errand target to do.
/datum/bt_node/ai_behavior/crew_npc_do_errand
	/// Blackboard key holding the thing the errand is about.
	var/target_key

/datum/bt_node/ai_behavior/crew_npc_do_errand/perform(seconds_per_tick, datum/ai_controller/controller)
	var/async_flags = handle_async()
	if(async_flags)
		return async_flags
	if(QDELETED(controller.blackboard[target_key]))
		return AI_BEHAVIOR_DELAY | AI_BEHAVIOR_FAILED
	return start_async()

/datum/bt_node/ai_behavior/crew_npc_do_errand/perform_async(datum/ai_controller/controller)
	var/datum/ai_controller/crew_npc/crew_controller = controller
	var/serial = crew_controller.errand_serial
	var/list/outcome = crew_controller.do_errand(controller.blackboard[target_key])
	if(async_still_valid())
		finish_async(AI_BEHAVIOR_SUCCEEDED)
	// The thing an errand is about can vanish as the errand is done: a cleaned mess is deleted, which
	// clears the blackboard key and resets this leaf. The errand must still be closed off and reported,
	// unless the body has been given something else to do in the meantime.
	if(!QDELETED(crew_controller) && crew_controller.errand_serial == serial)
		crew_controller.finish_errand(outcome)

/// Gives up on an errand whose target the body could not reach.
/datum/bt_node/ai_behavior/crew_npc_fail_errand

/datum/bt_node/ai_behavior/crew_npc_fail_errand/perform(seconds_per_tick, datum/ai_controller/controller)
	var/datum/ai_controller/crew_npc/crew_controller = controller
	// A mess it could not get to goes with the ones that would not come off: not tried again.
	var/atom/target = controller.blackboard[BB_CREW_NPC_ERRAND_TARGET]
	if(istype(target, /obj/effect/decal/cleanable))
		crew_controller.stubborn_messes[REF(target)] = TRUE
	// Likewise something it could not get to in order to put it away.
	if(crew_controller.errand_tool == CREW_TOOL_TIDY && !QDELETED(target))
		crew_controller.tidy_skipped[REF(target)] = world.time
		crew_controller.tidy_changed()
	crew_controller.finish_errand(list(FALSE, "You could not get to it."))
	return AI_BEHAVIOR_INSTANT | AI_BEHAVIOR_SUCCEEDED

/// TRUE if the body is close enough to touch this, with nothing solid in between. Standing beside it through a wall does not count.
/datum/ai_controller/crew_npc/proc/can_reach_target_now(atom/target)
	var/mob/living/carbon/human/body = pawn
	return get_turf(body) == get_turf(target) || body.Adjacent(target)

/**
 * How close the body must get to something before acting on it.
 *
 * A mess on open floor is cleaned from on top of it: a spray aimed at the next tile over can miss,
 * most of all on a diagonal. Everything else is worked on from beside it.
 */
/datum/ai_controller/crew_npc/proc/reach_distance(atom/target)
	if(errand_tool == CREW_TOOL_GRENADE)
		return CREW_NPC_GRENADE_THROW_DISTANCE
	if(istype(target, /obj/effect/decal/cleanable))
		var/turf/mess_turf = get_turf(target)
		if(mess_turf && !mess_turf.is_blocked_turf(exclude_mobs = TRUE))
			return 0
	return 1

/// Says what the body is in the middle of, in words for the brain, or null if it is free.
/datum/ai_controller/crew_npc/proc/describe_doing()
	if(blackboard_key_exists(BB_CREW_NPC_WALK_TARGET))
		switch(walk_tool)
			if(CREW_TOOL_EXPLORE)
				return "walking off to explore"
			if(CREW_TOOL_GO_TO)
				return "walking to [walk_goal]"
			if(CREW_TOOL_BRING)
				return "hauling a crate out to [walk_goal]"
			if(CREW_TOOL_UNLOAD)
				return "hauling a crate off the supply shuttle"
			if(CREW_TOOL_RECYCLE)
				return "hauling an empty crate aboard the supply shuttle"
			if(CREW_TOOL_FLEE)
				return "getting away to [walk_goal]"
			// Stepping back to its spot is not a job to be protected from interruption.
			if(CREW_TOOL_RETURN)
				return null
		return "walking up to [walk_goal]"
	if(blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET))
		switch(errand_tool)
			if(CREW_TOOL_CLEAN)
				return "cleaning up the mess here"
			if(CREW_TOOL_PICK_UP)
				return "going to get [errand_item]"
			if(CREW_TOOL_GIVE)
				return "taking what you hold to someone"
			if(CREW_TOOL_GRENADE)
				return "about to throw a cleaner grenade at a big mess"
			if(CREW_TOOL_ORDER)
				return "going to the supply console to place an order"
			if(CREW_TOOL_BRING)
				return "going to fetch a crate off the supply shuttle"
			if(CREW_TOOL_UNLOAD)
				return "going to unload a crate from the supply shuttle"
			if(CREW_TOOL_RECYCLE)
				return "going to fetch an empty crate to send back"
			if(CREW_TOOL_MAIL)
				return "going to take the mail out of its crate"
			if(CREW_TOOL_HAND_MAIL)
				return "taking someone their mail"
			if(CREW_TOOL_SEND)
				return "going to the supply console to send the shuttle back"
			if(CREW_TOOL_DOOR)
				return "going to open the door for someone"
			if(CREW_TOOL_TIDY)
				return "putting away something that was lying about"
	if(blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET))
		return "looking through the storage here"
	if(resting)
		return "resting"
	return null
