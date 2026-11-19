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
	if(!length(body.get_empty_held_indexes()) && !free_a_hand())
		action_result(CREW_TOOL_PICK_UP, FALSE, "Your hands are full of things you need. Put something down first.")
		return

	// Something it has put away about it comes before anything it would have to walk to: the rag
	// it put in its bag to have a hand for the bucket is taken out again when a cobweb wants it.
	for(var/obj/item/stowed in body.get_all_contents_type(/obj/item))
		// In a bag or a pocket, that is: not what it wears, and not what is in its hands already.
		if(stowed.loc == body && stowed != body.l_store && stowed != body.r_store)
			continue
		if((stowed.item_flags & ABSTRACT) || !name_matches(stowed.name, wanted))
			continue
		// Not the spent bottle it put away a moment ago to have this hand free. A janitor after a
		// full space cleaner took its own empty one out of its bag, was told that had gone well,
		// and did it again every three seconds for the rest of the round.
		if(is_spent(stowed))
			continue
		var/stowed_name = format_text(stowed.name)
		if(body.put_in_hands(stowed))
			action_result(CREW_TOOL_PICK_UP, TRUE, "You take the [stowed_name] out from where you had put it away.")
			return

	// Something lying in plain view comes first.
	var/obj/item/nearest_item
	var/nearest_distance = INFINITY
	for(var/obj/item/candidate in oview(CREW_NPC_VISION_RANGE, body))
		if(!isturf(candidate.loc) || candidate.anchored || (candidate.item_flags & ABSTRACT))
			continue
		if(!name_matches(candidate.name, wanted) || is_spent(candidate))
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

/**
 * Frees one of the body's hands when both are full, the way anyone would before picking something
 * up: whatever it holds that is no tool of its trade goes into its bag, or failing that onto the
 * floor. A spray with nothing left in it goes the same way. A janitor with a bottle in one hand and
 * a spent spray in the other could otherwise never pick up a mop.
 *
 * Returns TRUE if a hand is now free. FALSE if both hands hold things it needs.
 */
/datum/ai_controller/crew_npc/proc/free_a_hand()
	var/mob/living/carbon/human/body = pawn
	var/list/trade_tools = trade_tool_types()
	var/obj/item/spare
	for(var/obj/item/held in body.held_items)
		if(held.item_flags & ABSTRACT)
			continue
		if(!is_trade_tool(held, trade_tools))
			spare = held
			break
		if(is_spent(held))
			spare ||= held
		// A rag is spare to someone who holds a mop: the hand is better used for a bucket of water.
		if(istype(held, /obj/item/rag) && (locate(/obj/item/mop) in body.held_items))
			spare ||= held
	if(isnull(spare))
		return FALSE
	var/spare_name = format_text(spare.name)
	if(!body.equip_to_storage(spare, ITEM_SLOT_BACK, indirect_action = TRUE) && !body.dropItemToGround(spare))
		return FALSE
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) put away its [spare_name] to free a hand.")
	return !!length(body.get_empty_held_indexes())

/// TRUE if a thing is used up and no good to anyone as it is: a spray bottle with nothing left in it.
/datum/ai_controller/crew_npc/proc/is_spent(obj/item/thing)
	return istype(thing, /obj/item/reagent_containers/spray) && !thing.reagents?.total_volume

/// TRUE if a thing's name is the name being asked for, or contains it.
/datum/ai_controller/crew_npc/proc/name_matches(thing_name, wanted)
	return findtext(LOWER_TEXT(format_text(thing_name)), wanted)

/// Tool: put down what the body is holding.
/datum/ai_controller/crew_npc/proc/tool_put_down(item_name)
	var/mob/living/carbon/human/body = pawn
	// The thing it named, if it named one and holds it. A janitor putting its bucket back in the
	// closet to take up a rag means the bucket, not whatever is in its other hand.
	var/obj/item/held
	var/wanted = istext(item_name) ? LOWER_TEXT(trim(item_name)) : null
	if(length(wanted))
		for(var/obj/item/candidate in body.held_items)
			if(!(candidate.item_flags & ABSTRACT) && name_matches(candidate.name, wanted))
				held = candidate
				break
	held ||= first_held_item()
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
	// Wetting the mop from the bucket in its other hand: the errand was to where it stands, and
	// there is nothing to reach for.
	if(errand_tool == CREW_TOOL_CLEAN && isturf(target))
		return wet_mop(held_bucket())
	// An arrest is of someone who may not stand and wait for it. It closes with them itself.
	if(errand_tool == CREW_TOOL_ARREST && !QDELETED(target) && !QDELETED(body))
		return make_arrest(target)
	if(QDELETED(target) || QDELETED(body) || !can_reach_target_now(target))
		return list(FALSE, "You could not get to it.")
	body.face_atom(target)
	switch(errand_tool)
		if(CREW_TOOL_GET_KIT)
			return take_kit(target)
		if(CREW_TOOL_JAIL)
			return put_in_cell(target)
		if(CREW_TOOL_FREE)
			return set_free(target)
		if(CREW_TOOL_PICK_UP)
			if(istype(target, /obj/structure/closet))
				return take_from_container(target)
			return take_item(target)
		if(CREW_TOOL_GIVE)
			return hand_over(target)
		if(CREW_TOOL_ORDER)
			return place_order(target)
		if(CREW_TOOL_PAPER)
			return take_paper(target)
		if(CREW_TOOL_OPEN_CRATE)
			return open_own_crate(target)
		if(CREW_TOOL_MACHINE)
			return work_machine(target)
		if(CREW_TOOL_FORCE_DOOR)
			return force_door_open(target)
		if(CREW_TOOL_RELEASE)
			return haul_released(target)
		if(CREW_TOOL_COLLECT)
			return haul_collected(target)
		if(CREW_TOOL_CHECK_HELD)
			return look_over_held(target)
		if(CREW_TOOL_TAKE_BACK)
			return haul_crate_back(target)
		if(CREW_TOOL_UNLOAD, CREW_TOOL_RECYCLE, CREW_TOOL_STOW)
			return haul_freight(target)
		if(CREW_TOOL_PUT_CLEAR)
			return haul_clear(target)
		if(CREW_TOOL_MAIL)
			return take_mail(target)
		if(CREW_TOOL_HAND_MAIL)
			return hand_mail_over(target)
		if(CREW_TOOL_SEND)
			return send_shuttle_back(target)
		if(CREW_TOOL_DOOR)
			return hold_door_for(target)
		if(CREW_TOOL_RESET_ALARM)
			return reset_fire_alarm(target)
		if(CREW_TOOL_EVICT)
			return take_hold_of(target)
		if(CREW_TOOL_TIDY)
			return tidy_step(target)
		if(CREW_TOOL_CLEAN)
			// A water tank is only ever gone to with a bucket to fill. A sink is gone to for that,
			// or to wet the mop at; a mop bucket or a cart, to wet the mop.
			if(istype(target, /obj/structure/reagent_dispensers) || (istype(target, /obj/structure/sink) && bucket_wants_filling()))
				return fill_bucket(target)
			if(istype(target, /obj/structure/sink) || istype(target, /obj/structure/mop_bucket))
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
	// One of the crew taking it knows it was handed over, and keeps it.
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		their_controller.being_handed_something()
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
	// Getting a crate clear of a door is not something the brain asked for. What it did ask for is
	// reported, or taken up again, now that the crate has been pushed clear or could not be got to.
	if(tool == CREW_TOOL_PUT_CLEAR)
		put_clear_finished()
		return
	// A thing it could not find a place for is put back down, not carried about for the rest of the shift.
	if(tool == CREW_TOOL_TIDY && !outcome[1])
		drop_tidy_item()
	// Forcing a door says which door it was, and which step came to nothing: see crew_npc_forcing.dm.
	if(tool == CREW_TOOL_FORCE_DOOR)
		outcome = force_door_outcome(outcome)
		action_result(tool, outcome[1], outcome[2], outcome[3])
		return
	if(tool != CREW_TOOL_CLEAN)
		// Security's errands say why they came to nothing, and what came of them: see crew_npc_security.dm.
		action_result(tool, outcome[1], outcome[2], CREW_NPC_SECURITY_TOOL(tool) ? security_details(tool, outcome) : null)
		// A mop is no use dry. Having just picked one up with a sink in sight, the body wets it there
		// and then, as anyone would. Left for later, it walks off and finds out it cannot clean.
		if(tool == CREW_TOOL_PICK_UP && outcome[1] && dry_mop() && isnull(proper_tool()) && sink_in_view)
			addtimer(CALLBACK(src, PROC_REF(tool_clean)), 0.3 SECONDS)
		return

	// Back from wetting the mop: now there is something to clean with, see what there is to clean.
	if(length(outcome) >= 3)
		messes_left = outcome[1] ? messes_to_clean(view(CREW_NPC_VISION_RANGE, pawn)) : list()
	else if(outcome[1])
		cleaned_count++
		work_cleaned++
	else
		clean_failed_count++
	clean_queue = messes_left
	// Stop if the tool has given out; otherwise carry on to the next mess, and then to any other in the room.
	if(cleaning_tool() && (next_mess() || more_to_clean()))
		return
	clean_queue = list()
	var/place = get_area_name(pawn, TRUE)
	// Whether anything is left in this room that what it holds could shift. The brain is told, so that
	// what it says of the room is one thing and true: all clean, or done what it can.
	var/more_here = !isnull(remembered_mess_in(place))
	var/beyond_it = clean_failed_count > 0 && !more_here
	if(cleaned_count)
		action_result(tool, TRUE, "You clean up [cleaned_count] mess[cleaned_count == 1 ? "" : "es"] in [place].[beyond_it ? " What is left there will not come off with what you have." : ""]", list("place" = place, "beyond" = beyond_it))
	else
		action_result(tool, FALSE, outcome[2] || "Your mop is wet, but there is no mess here for it to clean.", list("place" = place, "beyond" = beyond_it))

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
	// A fire alarm it could not get to is on the far side of the fire doors. The next nearest is tried instead.
	if(crew_controller.errand_tool == CREW_TOOL_RESET_ALARM && !QDELETED(target))
		crew_controller.fire_alarms_failed[REF(target)] = world.time
	if(crew_controller.errand_tool == CREW_TOOL_TIDY && !QDELETED(target))
		crew_controller.tidy_skipped[REF(target)] = world.time
		crew_controller.tidy_changed()
	// A crate being held for collection that nobody can get to is, after a try or two, not one cargo can hand over.
	if(istype(target, /obj/structure/closet/crate) && (crew_controller.errand_tool == CREW_TOOL_CHECK_HELD || crew_controller.errand_tool == CREW_TOOL_RELEASE || crew_controller.errand_tool == CREW_TOOL_STOW))
		var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(target)
		if(entry)
			entry.unreachable++
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
			if(CREW_TOOL_RELEASE)
				return "hauling a crate out to [walk_goal] for whoever came for it"
			if(CREW_TOOL_COLLECT)
				return "hauling a crate you collected to [walk_goal]"
			if(CREW_TOOL_TAKE_BACK)
				return "hauling an empty crate back to [walk_goal]"
			if(CREW_TOOL_UNLOAD)
				return "hauling a crate off the supply shuttle"
			if(CREW_TOOL_RECYCLE)
				return "hauling an empty crate aboard the supply shuttle"
			if(CREW_TOOL_STOW, CREW_TOOL_PUT_CLEAR)
				return "hauling a crate clear of a door"
			if(CREW_TOOL_STEP_ASIDE)
				return "stepping out of someone's way"
			if(CREW_TOOL_TO_DOOR)
				return "walking to [walk_goal]"
			if(CREW_TOOL_EVICT)
				return "walking someone out of [post_place]"
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
			if(CREW_TOOL_PAPER)
				return "going to find paper for your order book"
			if(CREW_TOOL_OPEN_CRATE)
				return "going to open a crate that came for you"
			if(CREW_TOOL_MACHINE)
				return "going to work a machine"
			if(CREW_TOOL_FORCE_DOOR)
				return "opening a locked door"
			if(CREW_TOOL_GET_KIT)
				return "going to get your baton and cuffs"
			if(CREW_TOOL_ARREST)
				return errand_item == CREW_ARREST_STOP ? "stopping someone who attacked you" : "arresting someone"
			if(CREW_TOOL_JAIL)
				return "taking someone you have arrested to a cell"
			if(CREW_TOOL_FREE)
				return "letting someone go"
			if(CREW_TOOL_RELEASE)
				return "going to fetch a crate that someone has come to collect"
			if(CREW_TOOL_COLLECT)
				return "going to take hold of the crate you came to collect"
			if(CREW_TOOL_CHECK_HELD)
				return "going to see what crates are still waiting to be collected"
			if(CREW_TOOL_TAKE_BACK)
				return "going to fetch back the crate you unpacked"
			if(CREW_TOOL_UNLOAD)
				return "going to unload a crate from the supply shuttle"
			if(CREW_TOOL_RECYCLE)
				return "going to fetch an empty crate to send back"
			if(CREW_TOOL_STOW)
				return "going to move a crate that was left by a door"
			if(CREW_TOOL_PUT_CLEAR)
				return "getting a crate clear of a door"
			if(CREW_TOOL_MAIL)
				return "going to take the mail out of its crate"
			if(CREW_TOOL_HAND_MAIL)
				return "taking someone their mail"
			if(CREW_TOOL_SEND)
				return "going to the supply console to send the shuttle back"
			if(CREW_TOOL_DOOR)
				return "going to open the door for someone"
			if(CREW_TOOL_RESET_ALARM)
				return "going to reset a fire alarm someone has pulled"
			if(CREW_TOOL_EVICT)
				return "going to take hold of someone who has no business in [post_place]"
			if(CREW_TOOL_TIDY)
				return "putting away something that was lying about"
	if(blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET))
		return "looking through the storage here"
	if(seeing_to_crate)
		return "going back for a crate"
	if(resting)
		return "resting"
	return null

/// How long after something turns up in its hand a crew NPC takes to notice and put it down.
#define CREW_NPC_UNASKED_NOTICE (2 SECONDS)
/// How long it puts that off while its hands are busy, and how many times.
#define CREW_NPC_UNASKED_WAIT (6 SECONDS)
#define CREW_NPC_UNASKED_WAITS 10

/// Notes that one of the crew is handing this body something. What comes to its hand in the next moment is given, and kept.
/datum/ai_controller/crew_npc/proc/being_handed_something()
	handed_at = world.time

/**
 * Something has landed in the body's hand.
 *
 * Nearly always that is its own doing: it is fetching, searching or tidying, and the thing is what
 * it went for. Now and then it is not. The bartender's monkey puts what it is holding into the
 * hand of whoever is standing near, and a head and three janitors came away from two staff meetings
 * in the Bar Lounge holding a salt shaker, a pie, a pack of cards and a seating placer, which they
 * then carried for the rest of the shift. Anyone would look at their hand and put the thing down.
 *
 * A tool of its own trade it keeps, whoever put it there. So is anything one of the crew hands it.
 */
/datum/ai_controller/crew_npc/proc/on_item_in_hand(mob/living/carbon/human/body, obj/item/item, slot)
	SIGNAL_HANDLER
	if(!(slot & ITEM_SLOT_HANDS) || (item.item_flags & ABSTRACT))
		return
	// Its own doing, or handed over by one of the crew.
	if(errand_tool || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET))
		return
	if(handed_at && world.time - handed_at < 2 SECONDS)
		return
	if(is_trade_tool(item, trade_tool_types()))
		return
	unasked_item = WEAKREF(item)
	unasked_item_waits = 0
	addtimer(CALLBACK(src, PROC_REF(put_down_unasked_item), TRUE), CREW_NPC_UNASKED_NOTICE)

/**
 * Puts down the thing that turned up in its hand: on a table or rack it is standing by, the way
 * anyone sets something down, or failing that at its feet. With its hands busy it waits and tries
 * again. The brain is told what it found and what it did with it.
 */
/datum/ai_controller/crew_npc/proc/put_down_unasked_item(first_look = FALSE)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/item = unasked_item?.resolve()
	if(QDELETED(body) || QDELETED(item) || !(item in body.held_items))
		unasked_item = null
		return
	var/item_name = format_text(item.name)
	if(first_look)
		// Whoever is standing right by it, if there is only one of them, is most likely who put it there.
		var/list/beside = list()
		for(var/mob/living/other in oview(1, body))
			beside += other
		var/mob/living/giver = length(beside) == 1 ? beside[1] : null
		emit_sense(CREW_SENSE_KNOWLEDGE, "You find a [item_name] in your hand that you did not pick up.[giver ? " [giver.name], standing by you, must have put it there." : ""] It is not yours, and you will put it down.", list("item" = item_name))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) found a [item_name] in its hand that it did not pick up[giver ? ", with [giver.name] beside it" : ""].")
	// In the middle of something with its hands: it finishes that first.
	if(errand_tool || blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET) || length(body.do_afters))
		if(unasked_item_waits++ < CREW_NPC_UNASKED_WAITS)
			addtimer(CALLBACK(src, PROC_REF(put_down_unasked_item)), CREW_NPC_UNASKED_WAIT)
		else
			unasked_item = null
		return
	unasked_item = null
	// On a table or rack within reach, with the thing in the hand it is using: a click on the table top.
	var/obj/structure/surface
	for(var/turf/spot in range(1, body))
		if(!crew_npc_free_surface(spot))
			continue
		surface = (locate(/obj/structure/table) in spot) || (locate(/obj/structure/rack) in spot)
		if(surface && body.Adjacent(surface))
			break
		surface = null
	var/item_hand = body.get_held_index_of_item(item)
	if(surface && item_hand)
		if(item_hand != body.active_hand_index)
			body.swap_hand(item_hand)
		body.ClickOn(surface)
	// No table by it, or the table would not take it: it goes down at its feet.
	var/on_surface = !(item in body.held_items) && surface
	if((item in body.held_items) && !body.dropItemToGround(item))
		return
	emit_sense(CREW_SENSE_KNOWLEDGE, on_surface ? "You put the [item_name] down on the [format_text(surface.name)]." : "You put the [item_name] down.", list("item" = item_name))
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) put down the [item_name] it had not picked up[on_surface ? ", on the [surface.name]" : ""].")

#undef CREW_NPC_UNASKED_NOTICE
#undef CREW_NPC_UNASKED_WAIT
#undef CREW_NPC_UNASKED_WAITS
