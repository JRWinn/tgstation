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
	// A mop that has run dry is short of water, not of a mop. With a dry mop in one hand and a rag
	// in the other, away from any sink, a janitor told its head at the staff meeting that it needed
	// something better than a rag, and a second crate of supplies was ordered for it.
	return istype(working_tool(), /obj/item/rag) && isnull(dry_mop())

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
/datum/ai_controller/crew_npc/proc/wet_mop(atom/source)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/mop/mop = dry_mop()
	if(isnull(mop))
		return list(!isnull(cleaning_tool()), "You have no mop to wet.", TRUE)
	if(QDELETED(source))
		return list(FALSE, "There is nothing here to wet your mop at.", TRUE)
	var/source_name = format_text(source.name)
	var/mop_hand = body.get_held_index_of_item(mop)
	if(mop_hand && mop_hand != body.active_hand_index)
		body.swap_hand(mop_hand)
	// Every drop comes out of the thing it is wetted at, by the clicks a player would make. A sink
	// or a bucket gives a little at a click, so the mop is held to it until it is full or no more
	// comes. A mop bucket or a janitorial cart soaks it in one go, with the other button. Nothing
	// is topped up by code: a sink that has run dry is a sink that has run dry.
	var/one_go = istype(source, /obj/structure/mop_bucket)
	for(var/dip in 1 to (one_go ? 1 : CREW_NPC_MOP_DIPS))
		var/before = mop.reagents.total_volume
		if(before >= mop.reagents.maximum_volume)
			break
		if(!click_as_body(source, one_go ? "right=1" : null))
			break
		if(QDELETED(src) || QDELETED(body) || QDELETED(mop) || QDELETED(source))
			return list(FALSE, "You could not get to it.", TRUE)
		if(mop.reagents.total_volume <= before)
			break
	if(!can_clean_with(mop))
		return list(FALSE, "You could not wet your mop at the [source_name]: it has run dry.", TRUE)
	return list(TRUE, null, TRUE)

/// Returns a bucket the body is holding, or null.
/datum/ai_controller/crew_npc/proc/held_bucket()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/reagent_containers/cup/bucket/held in body.held_items)
		return held
	return null

/// TRUE if the body holds a bucket that is under half full: worth filling while there is water in sight.
/datum/ai_controller/crew_npc/proc/bucket_wants_filling()
	var/obj/item/reagent_containers/cup/bucket/bucket = held_bucket()
	return bucket && bucket.reagents.total_volume < bucket.reagents.maximum_volume / 2

/**
 * Returns the nearest thing to hand that a mop can be wetted at, or null: the bucket in the body's
 * other hand if there is water in it, then a mop bucket or janitorial cart in sight with water in
 * it, then a sink in sight. Water it has carried with it comes before a walk to a sink.
 */
/datum/ai_controller/crew_npc/proc/water_to_hand(list/in_sight)
	var/obj/item/reagent_containers/cup/bucket/bucket = held_bucket()
	if(bucket && bucket.reagents.total_volume >= 1)
		return bucket
	var/atom/nearest
	var/nearest_distance = INFINITY
	for(var/obj/structure/mop_bucket/tub in in_sight)
		if(tub.reagents?.total_volume >= 1 && get_dist(pawn, tub) < nearest_distance)
			nearest_distance = get_dist(pawn, tub)
			nearest = tub
	if(nearest)
		return nearest
	for(var/obj/structure/sink/sink in in_sight)
		if(get_dist(pawn, sink) < nearest_distance)
			nearest_distance = get_dist(pawn, sink)
			nearest = sink
	return nearest

/// Returns the nearest thing in sight that a bucket can be filled at, or null: a water tank with water in it, or failing that a sink.
/datum/ai_controller/crew_npc/proc/water_for_bucket(list/in_sight)
	var/atom/nearest
	var/nearest_distance = INFINITY
	for(var/obj/structure/reagent_dispensers/watertank/tank in in_sight)
		if(tank.reagents?.total_volume >= 1 && get_dist(pawn, tank) < nearest_distance)
			nearest_distance = get_dist(pawn, tank)
			nearest = tank
	if(nearest)
		return nearest
	for(var/obj/structure/sink/sink in in_sight)
		if(get_dist(pawn, sink) < nearest_distance)
			nearest_distance = get_dist(pawn, sink)
			nearest = sink
	return nearest

/**
 * Fills the bucket the body is holding at a water tank or a sink it is standing by, a click at a
 * time, until it is full or no more comes. A dry mop is then wetted from it. Sleeps while it does.
 *
 * Returns a list, as wet_mop does: whether it worked, the words for the brain if not, and a marker that this was about water, not cleaning.
 */
/datum/ai_controller/crew_npc/proc/fill_bucket(atom/source)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/reagent_containers/cup/bucket/bucket = held_bucket()
	if(isnull(bucket) || QDELETED(source))
		return list(!isnull(cleaning_tool()), "You have no bucket to fill.", TRUE)
	var/source_name = format_text(source.name)
	var/bucket_hand = body.get_held_index_of_item(bucket)
	if(bucket_hand && bucket_hand != body.active_hand_index)
		body.swap_hand(bucket_hand)
	var/held_before = bucket.reagents.total_volume
	for(var/go in 1 to CREW_NPC_BUCKET_FILLS)
		var/before = bucket.reagents.total_volume
		if(before >= bucket.reagents.maximum_volume)
			break
		if(!click_as_body(source))
			break
		if(QDELETED(src) || QDELETED(body) || QDELETED(bucket) || QDELETED(source))
			return list(FALSE, "You could not get to it.", TRUE)
		if(bucket.reagents.total_volume <= before)
			break
	if(bucket.reagents.total_volume < 1)
		return list(!isnull(cleaning_tool()), "You could not fill your bucket at the [source_name]: it has run dry.", TRUE)
	// Only if any went in: sent to a tank with a bucket that was full already, it wrote the same line twice.
	if(bucket.reagents.total_volume > held_before)
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) filled its bucket at the [source_name] at [AREACOORD(source)]: it holds [round(bucket.reagents.total_volume)] units.")
	if(dry_mop() && isnull(proper_tool()))
		return wet_mop(bucket)
	return list(TRUE, null, TRUE)

/**
 * TRUE if this tool can shift this mess, going by what each is.
 *
 * A spray washes the thing it is sprayed at, and a mop washes the floor. Neither scrubs. Cobwebs,
 * rubble and the like want scrubbing, and stay where they are when the floor round them is washed:
 * a janitor with a wet mop scrubbed at a cobweb, gave it up, and said it wanted a wet mop. Soap or
 * a rag, used on the thing itself, shifts everything.
 */
/datum/ai_controller/crew_npc/proc/can_clean_mess(obj/item/tool, obj/effect/decal/cleanable/mess)
	var/washes_off = !!(mess.clean_type & CLEAN_WASH)
	if(istype(tool, /obj/item/reagent_containers/spray))
		return washes_off
	if(istype(tool, /obj/item/mop))
		return washes_off && mess.is_mopped
	return TRUE

/// Returns the thing in the body's hands to use on this mess, or null if nothing it holds will shift it. A proper tool before a rag; a rag where only scrubbing will do.
/datum/ai_controller/crew_npc/proc/tool_for_mess(obj/effect/decal/cleanable/mess)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/rag
	for(var/obj/item/held in body.held_items)
		if(!can_clean_with(held) || !can_clean_mess(held, mess))
			continue
		if(istype(held, /obj/item/rag))
			rag ||= held
			continue
		return held
	return rag

/// TRUE if something the body holds could shift this mess: now, or in the case of a mop, once it is wet.
/datum/ai_controller/crew_npc/proc/could_shift(obj/effect/decal/cleanable/mess)
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/held in body.held_items)
		if((can_clean_with(held) || istype(held, /obj/item/mop)) && can_clean_mess(held, mess))
			return TRUE
	return FALSE

/// Returns the names of the kinds of mess the body remembers in the room it is in that nothing it holds can shift, whatever it does: those that want scrubbing. For what it says of the room.
/datum/ai_controller/crew_npc/proc/beyond_kinds_here()
	var/list/kinds = list()
	if(isnull(tool_in_hand()))
		return kinds
	var/place = get_area_name(pawn, TRUE)
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		if(memory[2] != place)
			continue
		var/datum/weakref/mess_ref = memory[1]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(QDELETED(mess) || could_shift(mess))
			continue
		kinds |= format_text(mess.name)
	return kinds

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
 * What would not come off with one thing may with another. Once the body holds a different kind of
 * thing to clean with, each mess it gave up on is worth one more try: a janitor who has been brought
 * soap goes back to the oil its rag would not shift.
 */
/datum/ai_controller/crew_npc/proc/mind_what_it_holds()
	var/obj/item/tool = tool_in_hand()
	if(isnull(tool) || tool.type == stubborn_with)
		return
	if(stubborn_with)
		stubborn_messes = list()
		stubborn_kinds = list()
	stubborn_with = tool.type

/**
 * Returns the nearest mess the body remembers in the room of this name that what it holds could shift,
 * or null. With nothing in hand, any mess it remembers there counts.
 */
/datum/ai_controller/crew_npc/proc/remembered_mess_in(place)
	mind_what_it_holds()
	var/obj/item/tool = tool_in_hand()
	var/obj/effect/decal/cleanable/nearest
	var/nearest_distance = INFINITY
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		if(memory[2] != place || stubborn_messes[key])
			continue
		var/datum/weakref/mess_ref = memory[1]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(QDELETED(mess) || (tool && !could_shift(mess)))
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
	// Twice with no way in, it is left a good while. A mess seen through the window of a room that
	// is locked to the body, or in a walled-off corner of a tunnel, was set off for every five
	// minutes by each janitor in turn, and a crate was shifted for it each time.
	if(world.time - blocked_at > (blocked_tries[place] >= 2 ? CREW_NPC_BLOCKED_PLACE_LONG : CREW_NPC_BLOCKED_PLACE_TIME))
		blocked_places -= place
		return FALSE
	return TRUE

/// A door has been opened for the body, or fire doors have lifted: rooms it failed to reach once may be worth another try. Those it has failed twice are not.
/datum/ai_controller/crew_npc/proc/ways_reopened()
	for(var/place in blocked_places.Copy())
		if(blocked_tries[place] < 2)
			blocked_places -= place

/// Returns the names of the rooms the body lately failed to find a way into.
/datum/ai_controller/crew_npc/proc/blocked_place_names()
	var/list/names = list()
	for(var/place in blocked_places)
		if(is_blocked_place(place))
			names += place
	return names

/// Returns the names of the rooms where the body remembers a mess that what it holds could shift.
/datum/ai_controller/crew_npc/proc/workable_mess_places()
	mind_what_it_holds()
	var/obj/item/tool = tool_in_hand()
	var/list/places = list()
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		if((memory[2] in places) || stubborn_messes[key] || is_blocked_place(memory[2]))
			continue
		var/datum/weakref/mess_ref = memory[1]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(QDELETED(mess) || (tool && !could_shift(mess)))
			continue
		places += memory[2]
	return places

/**
 * TRUE if the room of this name is locked to the body: none of its doors open for it. Kept for a
 * minute, since working it out means looking at every door of the room.
 */
/datum/ai_controller/crew_npc/proc/place_locked_to_body(place)
	var/list/known = locked_place_cache[place]
	if(known && world.time - known[2] < CREW_NPC_LOCKED_PLACE_KEPT)
		return known[1]
	// Inside a pipe or a locker there is no working it out. It goes by what it last knew, and that is not kept as new.
	if(!isturf(pawn.loc))
		return known ? known[1] : FALSE
	var/area/room = crew_npc_station_places()[place]
	var/locked = !isnull(room) && locked_out_of(room)
	locked_place_cache[place] = list(locked, world.time)
	return locked

/**
 * Returns the names of the rooms the body remembers a mess in and could go and clean.
 *
 * A mess seen through the window of a room that is locked to it is not its to go to: it could not
 * get in, and would walk at the door again and again. It goes to one of those when someone who
 * works there sends for it, and is let in. The room it is standing in always counts.
 */
/datum/ai_controller/crew_npc/proc/mess_places()
	var/list/places = list()
	var/list/passed_over = list()
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		var/place = memory[2]
		if((place in places) || (place in passed_over))
			continue
		if(place != current_place && place_locked_to_body(place))
			passed_over += place
			continue
		places += place
	return places

/// Returns the messes in sight that are in the body's room and that the tool it holds can shift, nearest first.
/datum/ai_controller/crew_npc/proc/messes_to_clean(list/in_sight)
	var/mob/living/carbon/human/body = pawn
	var/area/here = get_area(body)
	mind_what_it_holds()
	var/obj/item/tool = working_tool()
	var/list/found = list()
	if(isnull(tool))
		return found
	for(var/obj/effect/decal/cleanable/mess in in_sight)
		// Whatever it holds that will shift this one: the spray for what washes off, the rag for
		// what wants scrubbing. A mop that is dry counts while there is water to hand to wet it.
		var/obj/item/mop/dry = sink_in_view ? dry_mop() : null
		if(get_area(mess) == here && (tool_for_mess(mess) || (dry && can_clean_mess(dry, mess))) && !stubborn_messes[REF(mess)])
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
	var/list/around = view(CREW_NPC_VISION_RANGE, body)
	// Water first. A bucket that is running low is filled while there is a tank or a sink in sight:
	// that is the water it carries to where there is none.
	if(bucket_wants_filling())
		var/atom/filling_at = water_for_bucket(around)
		if(filling_at)
			clean_queue = list()
			cleaned_count = 0
			clean_failed_count = 0
			start_errand(filling_at, CREW_TOOL_CLEAN, null)
			return
	if(isnull(proper_tool()) && dry_mop())
		// A dry mop cleans nothing. Wet it first: from the bucket it carries, at a mop bucket or a
		// cart with water in it, or at the nearest sink in sight.
		var/atom/water = water_to_hand(around)
		if(water)
			clean_queue = list()
			cleaned_count = 0
			clean_failed_count = 0
			// The bucket in its other hand is not somewhere to walk to. The errand is to where it stands.
			start_errand(water.loc == body ? get_turf(body) : water, CREW_TOOL_CLEAN, null)
			return
		// With no sink in sight, a rag in the other hand will still do what a rag does.
		if(isnull(tool))
			action_result(CREW_TOOL_CLEAN, FALSE, "Your mop is dry, and there is no sink in sight to wet it at.")
			return
	if(isnull(tool))
		action_result(CREW_TOOL_CLEAN, FALSE, "You have nothing to clean with. Soap, a wet mop or space cleaner would do.")
		return
	// The body's own tile counts: a mess underfoot is still a mess.
	var/list/messes = messes_to_clean(around)
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
	clean_failed_count = 0
	next_mess()

/**
 * With the messes it set out for seen to, looks for more in the room: those in sight first, then the
 * nearest one it remembers. Sets off for the next and returns TRUE, or returns FALSE if the job is over.
 *
 * A room is settled in one visit. Each mess the body cannot shift, or cannot get to, is found out
 * and passed over there and then, and it leaves knowing what is beyond it. Finding that out one
 * mess to a visit had three janitors walking between the same two rooms for a quarter of an hour.
 * What it does clean still comes in goes of a few, so that it is free to hear of other work.
 */
/datum/ai_controller/crew_npc/proc/more_to_clean()
	if(cleaned_count >= CREW_NPC_MESSES_PER_CLEAN || clean_failed_count >= CREW_NPC_MESSES_FAILED_PER_CLEAN)
		return FALSE
	var/list/messes = messes_to_clean(view(CREW_NPC_VISION_RANGE, pawn))
	if(!length(messes))
		var/obj/effect/decal/cleanable/remembered = remembered_mess_in(get_area_name(pawn, TRUE))
		if(remembered)
			messes = list(remembered)
	if(!length(messes))
		return FALSE
	clean_queue = messes
	return next_mess()

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
	// The thing it holds that suits this mess, if it holds two: a rag for a cobweb, with a spray
	// in the other hand for what washes off.
	var/obj/item/tool = tool_for_mess(mess) || cleaning_tool()
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
	// Still scrubbing when the time is up, it is let finish, within reason. A mess given up a moment
	// before it came off was reported as beyond the body, and then, seconds later, as cleaned up.
	var/last_chance = deadline + CREW_NPC_CLEAN_TIME
	while(!QDELETED(mess) && (world.time < deadline || (length(body.do_afters) && world.time < last_chance)))
		sleep(0.5 SECONDS)
		if(QDELETED(body))
			return list(FALSE, "You could not get to it.")
	if(QDELETED(mess))
		return list(TRUE, "You clean up the [mess_name].")
	// Some messes do not yield to scrubbing at all. Remember this one so the body stops trying it.
	stubborn_messes[REF(mess)] = TRUE
	// Twice beaten by the same kind of mess, it knows what it holds will not shift that kind, and
	// does not scrub at every other one in the room to find out. Once could be a slip of the hand.
	// Counted for the room it is in, not for the whole station. Counted once for everywhere, two
	// slips of the hand in the first ten minutes meant that from then on a single miss in any room
	// wrote off all the dirt in it, and a janitor with a full bottle walked the station with every
	// room it knew marked as beyond it.
	var/place = get_area_name(mess, TRUE)
	var/kind_here = "[place]|[mess.type]"
	stubborn_kinds[kind_here]++
	if(stubborn_kinds[kind_here] >= 2)
		for(var/key in remembered_messes)
			var/list/memory = remembered_messes[key]
			var/datum/weakref/other_ref = memory[1]
			var/obj/effect/decal/cleanable/other = other_ref.resolve()
			if(!QDELETED(other) && memory[2] == place && other.type == mess.type)
				stubborn_messes[key] = TRUE
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
	// A used casing stays after it goes off, and says so when looked at: it is not a grenade any more.
	for(var/obj/item/grenade/chem_grenade/cleaner/grenade in body.held_items)
		if(!(grenade.dud_flags & GRENADE_USED) && grenade.stage == GRENADE_READY)
			return grenade
	return null

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
	if(!hand_to(grenade))
		return list(FALSE, "You cannot get the cleaner grenade into your hand.")
	body.face_atom(target)
	// Primed as a player primes it: used in hand, with every check that brings (stuck to the hand, already live, a clumsy fumble).
	if(!grenade.active)
		sleep(1 SECONDS)
		if(QDELETED(body) || QDELETED(grenade) || QDELETED(src) || body.get_active_held_item() != grenade)
			return list(FALSE, "You no longer have the cleaner grenade in your hand.")
		body.execute_mode()
		if(QDELETED(grenade) || !grenade.active)
			return list(FALSE, "The grenade will not prime.")
		if(QDELETED(body) || body.get_active_held_item() != grenade)
			return list(TRUE, "You prime the cleaner grenade, but it is no longer in your hand. Keep clear: the foam is slippery.")
		body.face_atom(target)
	if(!body.throw_item(target))
		// Primed and still in hand: get rid of it where it will do least harm.
		body.dropItemToGround(grenade)
	return list(TRUE, "You prime the cleaner grenade and throw it into the thick of the mess. It will foam in a few seconds. Keep clear: the foam is slippery.")
