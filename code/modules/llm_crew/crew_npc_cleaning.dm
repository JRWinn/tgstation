/**
 * Cleaning: the first job skill.
 *
 * The body cleans the way a player does, by using a cleaning tool in its hand on a mess. It needs
 * the tool first. A crew NPC with nothing to clean with can only say where the mess is.
 */

/// Returns something in the body's hands that can clean right now, or null. A rag is only what it cleans with when the other hand holds nothing better.
/datum/ai_controller/crew_npc/proc/cleaning_tool()
	var/mob/living/carbon/human/body = pawn
	var/obj/item/rag
	for(var/obj/item/held in body.held_items)
		if(!can_clean_with(held))
			continue
		if(istype(held, /obj/item/rag))
			rag ||= held
			continue
		return held
	return rag

/// Returns something in the body's hands that cleans properly right now, or null. A rag is not that.
/datum/ai_controller/crew_npc/proc/proper_tool()
	var/obj/item/tool = cleaning_tool()
	return istype(tool, /obj/item/rag) ? null : tool

/// TRUE if all the body has to clean with here is a rag: a poor tool, which shifts little. It is short of something better.
/datum/ai_controller/crew_npc/proc/has_poor_tool()
	return istype(working_tool(), /obj/item/rag)

/// TRUE if this item would clean a mess if used on one now. A mop with no water on it would not.
/datum/ai_controller/crew_npc/proc/can_clean_with(obj/item/tool)
	if(istype(tool, /obj/item/mop))
		return tool.reagents?.total_volume >= 0.1
	if(istype(tool, /obj/item/reagent_containers/spray/cleaner))
		return tool.reagents?.total_volume > 0
	return !isnull(tool.GetComponent(/datum/component/cleaner))

/// Returns a mop in the body's hands that has no water on it, or null.
/datum/ai_controller/crew_npc/proc/dry_mop()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/mop/held in body.held_items)
		if(!can_clean_with(held))
			return held
	return null

/// Returns what the body can clean with here: a proper tool that works now, or a dry mop if there is a sink in view to wet it at, or failing both a rag.
/datum/ai_controller/crew_npc/proc/working_tool()
	return proper_tool() || (sink_in_view ? dry_mop() : null) || cleaning_tool()

/// Says what the body has to clean with here, in words for the brain, or null if it has nothing that will work.
/datum/ai_controller/crew_npc/proc/describe_cleaning_tool()
	var/obj/item/tool = working_tool()
	return isnull(tool) ? null : format_text(tool.name)

/**
 * Wets the mop the body is holding at a sink it is standing by. Sleeps while it does.
 *
 * Returns a list: whether it worked, the words for the brain if it did not, and a marker that this was wetting, not cleaning.
 */
/datum/ai_controller/crew_npc/proc/wet_mop(obj/structure/sink/sink)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/mop/mop = dry_mop()
	if(isnull(mop))
		return list(!isnull(cleaning_tool()), "You have no mop to wet.", TRUE)
	var/mop_hand = body.get_held_index_of_item(mop)
	if(mop_hand && mop_hand != body.active_hand_index)
		body.swap_hand(mop_hand)
	body.ClickOn(sink)
	sleep(1 SECONDS)
	if(QDELETED(body) || QDELETED(mop))
		return list(FALSE, "You could not get to it.", TRUE)
	if(!can_clean_with(mop))
		return list(FALSE, "You could not wet your mop at the sink.", TRUE)
	// One dip holds enough for a handful of messes, and then it is a walk back to the sink. Anyone
	// would hold it under the tap until it was full.
	var/room_left = mop.reagents.maximum_volume - mop.reagents.total_volume
	if(room_left > 0)
		mop.reagents.add_reagent(/datum/reagent/water, room_left)
	return list(TRUE, null, TRUE)

/// TRUE if this tool can shift this mess. A spray only washes; cobwebs, rubble and the like need scrubbing.
/datum/ai_controller/crew_npc/proc/can_clean_mess(obj/item/tool, obj/effect/decal/cleanable/mess)
	if(istype(tool, /obj/item/reagent_containers/spray))
		return !!(mess.clean_type & CLEAN_WASH)
	return TRUE

/**
 * Keeps track of each mess the body has seen and has not yet seen to be gone.
 *
 * A room is known to want cleaning for as long as the body remembers a mess in it. Not seeing a mess
 * from where it stands proves nothing: a hallway is longer than the body can see. A mess is only
 * forgotten once the body is looking at the spot where it was and it is not there.
 */
/datum/ai_controller/crew_npc/proc/remember_messes(list/in_sight)
	var/turf/here = get_turf(pawn)
	for(var/obj/effect/decal/cleanable/mess in in_sight)
		var/key = REF(mess)
		if(remembered_messes[key] || length(remembered_messes) >= CREW_NPC_MESSES_REMEMBERED)
			continue
		var/turf/spot = get_turf(mess)
		remembered_messes[key] = list(WEAKREF(mess), get_area_name(spot, TRUE), spot)

	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		var/datum/weakref/mess_ref = memory[1]
		var/turf/spot = memory[3]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(!QDELETED(mess) && get_turf(mess) == spot)
			continue
		if(spot == here || (spot in in_sight))
			remembered_messes -= key

/// Returns what the body could clean with: a proper tool that works now, or a mop that would once it is wet, or failing both a rag.
/datum/ai_controller/crew_npc/proc/tool_in_hand()
	return proper_tool() || dry_mop() || cleaning_tool()

/**
 * Returns the nearest mess the body remembers in the room of this name that what it holds could shift,
 * or null. With nothing in hand, any mess it remembers there counts.
 */
/datum/ai_controller/crew_npc/proc/remembered_mess_in(place)
	var/obj/item/tool = tool_in_hand()
	var/obj/effect/decal/cleanable/nearest
	var/nearest_distance = INFINITY
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		if(memory[2] != place || stubborn_messes[key])
			continue
		var/datum/weakref/mess_ref = memory[1]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(QDELETED(mess) || (tool && !can_clean_mess(tool, mess)))
			continue
		var/distance = get_dist(pawn, mess)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = mess
	return nearest

/// TRUE if the body lately failed to find a way into the room of this name.
/datum/ai_controller/crew_npc/proc/is_blocked_place(place)
	var/blocked_at = blocked_places[place]
	if(isnull(blocked_at))
		return FALSE
	if(world.time - blocked_at > CREW_NPC_BLOCKED_PLACE_TIME)
		blocked_places -= place
		return FALSE
	return TRUE

/// Returns the names of the rooms the body lately failed to find a way into.
/datum/ai_controller/crew_npc/proc/blocked_place_names()
	var/list/names = list()
	for(var/place in blocked_places)
		if(is_blocked_place(place))
			names += place
	return names

/// Returns the names of the rooms where the body remembers a mess that what it holds could shift.
/datum/ai_controller/crew_npc/proc/workable_mess_places()
	var/obj/item/tool = tool_in_hand()
	var/list/places = list()
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		if((memory[2] in places) || stubborn_messes[key] || is_blocked_place(memory[2]))
			continue
		var/datum/weakref/mess_ref = memory[1]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(QDELETED(mess) || (tool && !can_clean_mess(tool, mess)))
			continue
		places += memory[2]
	return places

/// Returns the names of the rooms the body remembers a mess in.
/datum/ai_controller/crew_npc/proc/mess_places()
	var/list/places = list()
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		places |= memory[2]
	return places

/// Returns the messes in sight that are in the body's room and that the tool it holds can shift, nearest first.
/datum/ai_controller/crew_npc/proc/messes_to_clean(list/in_sight)
	var/mob/living/carbon/human/body = pawn
	var/area/here = get_area(body)
	var/obj/item/tool = working_tool()
	var/list/found = list()
	if(isnull(tool))
		return found
	for(var/obj/effect/decal/cleanable/mess in in_sight)
		if(get_area(mess) == here && can_clean_mess(tool, mess) && !stubborn_messes[REF(mess)])
			found += mess

	var/list/nearest_first = list()
	while(length(found) && length(nearest_first) < CREW_NPC_MESSES_PER_CLEAN)
		var/obj/effect/decal/cleanable/nearest
		var/nearest_distance = INFINITY
		for(var/obj/effect/decal/cleanable/mess as anything in found)
			var/distance = get_dist(body, mess)
			if(distance < nearest_distance)
				nearest_distance = distance
				nearest = mess
		found -= nearest
		nearest_first += nearest
	return nearest_first

/// Tool: clean up the messes the body can see in the room it is in.
/datum/ai_controller/crew_npc/proc/tool_clean()
	var/mob/living/carbon/human/body = pawn
	// Already at it. Being told to clean again must not send the body back to the first mess.
	if(errand_tool == CREW_TOOL_CLEAN && blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET))
		return
	var/obj/item/tool = cleaning_tool()
	if(isnull(proper_tool()) && dry_mop())
		// A dry mop cleans nothing. Wet it first, at the nearest sink in sight.
		var/obj/structure/sink/nearest_sink
		var/nearest_distance = INFINITY
		for(var/obj/structure/sink/sink in view(CREW_NPC_VISION_RANGE, body))
			if(get_dist(body, sink) < nearest_distance)
				nearest_distance = get_dist(body, sink)
				nearest_sink = sink
		if(nearest_sink)
			clean_queue = list()
			cleaned_count = 0
			start_errand(nearest_sink, CREW_TOOL_CLEAN, null)
			return
		// With no sink in sight, a rag in the other hand will still do what a rag does.
		if(isnull(tool))
			action_result(CREW_TOOL_CLEAN, FALSE, "Your mop is dry, and there is no sink in sight to wet it at.")
			return
	if(isnull(tool))
		action_result(CREW_TOOL_CLEAN, FALSE, "You have nothing to clean with. Soap, a wet mop or space cleaner would do.")
		return
	// The body's own tile counts: a mess underfoot is still a mess.
	var/list/messes = messes_to_clean(view(CREW_NPC_VISION_RANGE, body))
	// None in sight is not none in the room. One it remembers further off in the room will do to start on.
	if(!length(messes))
		var/obj/effect/decal/cleanable/remembered = remembered_mess_in(get_area_name(body, TRUE))
		if(remembered)
			messes = list(remembered)
	if(!length(messes))
		action_result(CREW_TOOL_CLEAN, FALSE, "There is no mess here that your [format_text(tool.name)] will shift. Some messes need scrubbing with soap or a wet mop.")
		return
	clean_queue = messes
	cleaned_count = 0
	next_mess()

/// Sends the body to the next mess still to be cleaned. Returns FALSE if there are none left.
/datum/ai_controller/crew_npc/proc/next_mess()
	while(length(clean_queue))
		var/obj/effect/decal/cleanable/mess = clean_queue[1]
		clean_queue.Cut(1, 2)
		if(QDELETED(mess))
			continue
		start_errand(mess, CREW_TOOL_CLEAN, null)
		return TRUE
	return FALSE

/**
 * Cleans one mess the body is standing by. Sleeps while it scrubs.
 *
 * Returns a list: whether it worked, then the words the brain is told.
 */
/datum/ai_controller/crew_npc/proc/clean_mess(obj/effect/decal/cleanable/mess)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/tool = cleaning_tool()
	if(isnull(tool))
		return list(FALSE, "You have nothing to clean with.")
	var/mess_name = format_text(mess.name)

	// Use the tool the way a player would: with it in the active hand, on the mess.
	var/tool_hand = body.get_held_index_of_item(tool)
	if(tool_hand && tool_hand != body.active_hand_index)
		body.swap_hand(tool_hand)
	// A mop works on the floor under the mess; soap and spray work on the mess itself.
	var/atom/target = istype(tool, /obj/item/mop) ? get_turf(mess) : mess
	body.ClickOn(target)

	var/deadline = world.time + CREW_NPC_CLEAN_TIME
	while(!QDELETED(mess) && world.time < deadline)
		sleep(0.5 SECONDS)
		if(QDELETED(body))
			return list(FALSE, "You could not get to it.")
	if(QDELETED(mess))
		return list(TRUE, "You clean up the [mess_name].")
	// Some messes do not yield to scrubbing at all. Remember this one so the body stops trying it.
	stubborn_messes[REF(mess)] = TRUE
	return list(FALSE, "You scrub at the [mess_name] but it will not come off.")

/// TRUE if the body carries a PDA with the custodial locator, which shows where the station's cleaning gear is.
/datum/ai_controller/crew_npc/proc/has_custodial_locator()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
		if(locate(/datum/computer_file/program/radar/custodial_locator) in computer.stored_files)
			return TRUE
	return FALSE

/**
 * Tool: check the custodial locator on the body's PDA.
 *
 * This is how a janitor who has never seen the station learns where the custodial closet is. The
 * locator shows where each mop, cart and cleaning robot is, so the body then knows the way there.
 */
/datum/ai_controller/crew_npc/proc/tool_locate()
	var/mob/living/carbon/human/body = pawn
	if(!has_custodial_locator())
		action_result(CREW_TOOL_LOCATE, FALSE, "You have no PDA with a custodial locator on it.")
		return

	// The locator shows every mop and cart on the station, strays in the tunnels included. What a
	// janitor wants from it is where the gear is kept: the custodial closet if there is one, or
	// failing that wherever most of the gear is.
	var/list/gear_by_place = list()
	var/list/turf_by_place = list()
	var/closet_place
	for(var/atom/movable/device as anything in GLOB.janitor_devices)
		var/turf/device_turf = get_turf(device)
		// Gear someone is carrying about, in hand or in a bag, tells you nothing about where it is kept.
		if(isnull(device_turf) || device_turf.z != body.z || ismob(get_atom_on_turf(device)))
			continue
		var/area/device_area = get_area(device_turf)
		var/place = format_text(device_area.name)
		if(isnull(gear_by_place[place]))
			gear_by_place[place] = list()
			turf_by_place[place] = device_turf
		gear_by_place[place] += format_text(device.name)
		if(istype(device_area, /area/station/service/janitor))
			closet_place = place

	// The custodial closet is where a janitor's gear lives, whether or not any of it is there right now.
	if(isnull(closet_place))
		for(var/area/station/service/janitor/closet in GLOB.areas)
			var/turf/inside = safe_spot_in(closet, get_turf(body))
			if(isnull(inside))
				continue
			closet_place = format_text(closet.name)
			turf_by_place[closet_place] = inside
			if(isnull(gear_by_place[closet_place]))
				gear_by_place[closet_place] = list("the janitor's supplies")
			break

	var/supply_place = closet_place
	if(isnull(supply_place))
		var/most_gear = 0
		for(var/place in gear_by_place)
			if(length(gear_by_place[place]) > most_gear)
				most_gear = length(gear_by_place[place])
				supply_place = place
	if(isnull(supply_place))
		action_result(CREW_TOOL_LOCATE, FALSE, "Your PDA's custodial locator shows no cleaning gear anywhere on this level.")
		return

	// Having seen it on the locator, the body knows the way there.
	if(isnull(visited_places[supply_place]))
		var/turf/device_turf = turf_by_place[supply_place]
		var/turf/spot = crew_npc_safe_turf(device_turf) && !device_turf.is_blocked_turf() ? device_turf : null
		if(isnull(spot))
			for(var/turf/beside in orange(1, device_turf))
				if(crew_npc_safe_turf(beside) && !beside.is_blocked_turf())
					spot = beside
					break
		if(spot)
			visited_places[supply_place] = list(spot.x, spot.y, spot.z)

	var/list/gear = unique_list(gear_by_place[supply_place])
	action_result(CREW_TOOL_LOCATE, TRUE, "Your PDA's custodial locator shows the cleaning gear is kept in [supply_place]: [gear.Join(", ")]. You now know the way there.", list("places" = list(list("place" = supply_place, "things" = gear))))

/// Returns a cleaner grenade in the body's hands, or null.
/datum/ai_controller/crew_npc/proc/held_grenade()
	var/mob/living/carbon/human/body = pawn
	return locate(/obj/item/grenade/chem_grenade/cleaner) in body.held_items

/**
 * Finds the spot in sight where a cleaner grenade would do the most good, if any is good enough.
 *
 * A grenade is not to be wasted on a few stains. It is worth throwing only where a lot of mess lies
 * close together, and only where nobody else is standing, because its foam is slippery.
 * Returns a list of the mess at the heart of the patch and how many messes the foam would reach, or null.
 */
/datum/ai_controller/crew_npc/proc/best_grenade_spot(list/in_sight)
	var/mob/living/carbon/human/body = pawn
	var/area/here = get_area(body)
	var/list/messes = list()
	for(var/obj/effect/decal/cleanable/mess in in_sight)
		// The foam washes; it does not scrub.
		if(get_area(mess) == here && (mess.clean_type & CLEAN_WASH))
			messes += mess
	if(length(messes) < CREW_NPC_GRENADE_MIN_MESSES)
		return null

	var/obj/effect/decal/cleanable/heart
	var/most = 0
	for(var/obj/effect/decal/cleanable/mess as anything in messes)
		var/reached = 0
		for(var/obj/effect/decal/cleanable/other as anything in messes)
			if(get_dist(mess, other) <= CREW_NPC_GRENADE_RADIUS)
				reached++
		if(reached > most)
			most = reached
			heart = mess
	if(most < CREW_NPC_GRENADE_MIN_MESSES)
		return null
	for(var/mob/living/carbon/human/bystander in range(CREW_NPC_GRENADE_RADIUS + 1, heart))
		if(bystander != body)
			return null
	return list(heart, most)

/// Tool: throw the cleaner grenade the body holds into a thick patch of mess.
/datum/ai_controller/crew_npc/proc/tool_grenade()
	var/mob/living/carbon/human/body = pawn
	if(isnull(held_grenade()))
		action_result(CREW_TOOL_GRENADE, FALSE, "You are not holding a cleaner grenade.")
		return
	var/list/spot = best_grenade_spot(view(CREW_NPC_VISION_RANGE, body))
	if(isnull(spot))
		action_result(CREW_TOOL_GRENADE, FALSE, "There is not enough mess close together here to be worth a grenade, or someone is standing in it. Keep it for a worse mess.")
		return
	start_errand(spot[1], CREW_TOOL_GRENADE, null)

/// Primes the grenade and throws it at the mess. Returns a list: whether it worked, then the words the brain is told.
/datum/ai_controller/crew_npc/proc/throw_grenade(obj/effect/decal/cleanable/mess)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/grenade/chem_grenade/cleaner/grenade = held_grenade()
	if(isnull(grenade))
		return list(FALSE, "You are not holding a cleaner grenade.")
	var/turf/target = get_turf(mess)
	var/grenade_hand = body.get_held_index_of_item(grenade)
	if(grenade_hand && grenade_hand != body.active_hand_index)
		body.swap_hand(grenade_hand)
	body.face_atom(target)
	grenade.arm_grenade(body)
	if(!body.throw_item(target))
		// Primed and still in hand: get rid of it where it will do least harm.
		body.dropItemToGround(grenade)
	return list(TRUE, "You prime the cleaner grenade and throw it into the thick of the mess. It will foam in a few seconds. Keep clear: the foam is slippery.")
