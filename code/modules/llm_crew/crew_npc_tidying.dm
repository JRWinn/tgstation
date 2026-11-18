/**
 * Tidying: keeping the floor of one's own work area clear.
 *
 * It is everyone's job to keep the place they work in fit to work in. Rubbish goes in the nearest
 * disposal bin. What has spilled out of an open crate or locker goes back in, by shutting it.
 * Anything else lying on the floor goes on a table or rack in the same room. What is outside the
 * body's own work area is somebody else's to see to, and is left alone.
 *
 * The brain's window only asks for the next thing to be put away. What that is, and where it goes,
 * is decided here.
 */

/// Returns the rooms that are the body's to keep in order, as areas.
/datum/ai_controller/crew_npc/proc/tidy_rooms()
	var/list/rooms = list()
	var/list/places = crew_npc_station_places()
	for(var/place in work_area)
		var/area/room = places[place]
		if(room)
			rooms += room
	return rooms

/// TRUE if a thing is rubbish: for the bin, not for keeping.
/proc/crew_npc_is_rubbish(obj/item/thing)
	if(istype(thing, /obj/item/trash) || istype(thing, /obj/item/cigbutt) || istype(thing, /obj/item/paper/crumpled))
		return TRUE
	// Mail addressed to nobody is junk.
	if(istype(thing, /obj/item/mail))
		return isnull(crew_npc_mail_for(thing))
	if(istype(thing, /obj/item/light))
		var/obj/item/light/bulb = thing
		return bulb.status != LIGHT_OK
	return FALSE

/// TRUE if this is a table or rack top with room left on it, away from any service window.
/proc/crew_npc_free_surface(turf/spot)
	if(!(locate(/obj/structure/table) in spot) && !(locate(/obj/structure/rack) in spot))
		return FALSE
	// The counter crew are served across is not a shelf.
	if(locate(/obj/machinery/door/window) in spot)
		return FALSE
	var/things = 0
	for(var/obj/item/thing in spot)
		things++
	return things < CREW_NPC_SURFACE_ROOM

/// TRUE if a thing lying on the floor is one the body would put away.
/datum/ai_controller/crew_npc/proc/wants_tidying(obj/item/thing)
	if(!isturf(thing.loc) || thing.anchored || thing.pulledby || (thing.item_flags & ABSTRACT) || thing.w_class >= WEIGHT_CLASS_BULKY)
		return FALSE
	var/skipped_at = tidy_skipped[REF(thing)]
	if(skipped_at && world.time - skipped_at < CREW_NPC_TIDY_GIVE_UP)
		return FALSE
	// Broken glass cuts bare hands, and mail with a name on it is being kept for someone.
	if(istype(thing, /obj/item/shard) || (istype(thing, /obj/item/mail) && crew_npc_mail_for(thing)))
		return FALSE
	var/turf/spot = thing.loc
	// Already put somewhere, or on its way somewhere.
	if((locate(/obj/structure/table) in spot) || (locate(/obj/structure/rack) in spot) || (locate(/obj/machinery/conveyor) in spot))
		return FALSE
	// What lies beside an open crate or locker spilled out of it, and goes back in when that is shut.
	for(var/obj/structure/closet/container in spot)
		if(container.opened)
			return FALSE
	return TRUE

/// TRUE if an open crate or locker has things lying spilled around it, and could be shut on them.
/datum/ai_controller/crew_npc/proc/wants_shutting(obj/structure/closet/container)
	if(!container.opened || !isturf(container.loc))
		return FALSE
	var/skipped_at = tidy_skipped[REF(container)]
	if(skipped_at && world.time - skipped_at < CREW_NPC_TIDY_GIVE_UP)
		return FALSE
	return !isnull(locate(/obj/item) in container.loc)

/// Returns the nearest disposal bin in the body's work area, or null.
/datum/ai_controller/crew_npc/proc/nearest_bin(atom/from)
	var/obj/machinery/disposal/bin/nearest
	var/nearest_distance = INFINITY
	for(var/area/room as anything in tidy_rooms())
		for(var/obj/machinery/disposal/bin/bin in room)
			var/distance = get_dist(from, bin)
			if(distance < nearest_distance)
				nearest_distance = distance
				nearest = bin
	return nearest

/// Returns the nearest table or rack with room on it, in the same room as the thing, or null.
/datum/ai_controller/crew_npc/proc/nearest_surface(atom/from)
	var/area/room = get_area(from)
	var/atom/nearest
	var/nearest_distance = INFINITY
	for(var/obj/structure/surface in room)
		if(!istype(surface, /obj/structure/table) && !istype(surface, /obj/structure/rack))
			continue
		if(!crew_npc_free_surface(get_turf(surface)))
			continue
		var/distance = get_dist(from, surface)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = surface
	return nearest

/// Returns where a thing would be put away: a bin for rubbish, a table or rack for anything else. Null if there is nowhere.
/datum/ai_controller/crew_npc/proc/place_for(obj/item/thing)
	return crew_npc_is_rubbish(thing) ? nearest_bin(thing) : nearest_surface(thing)

/**
 * Returns the next thing to see to, nearest first, as list(thing, where it goes), or null. An open
 * crate or locker with its contents spilled is a thing to see to, and goes nowhere: it is shut.
 */
/datum/ai_controller/crew_npc/proc/next_to_tidy()
	var/atom/movable/nearest
	var/atom/nearest_place
	var/nearest_distance = INFINITY
	for(var/area/room as anything in tidy_rooms())
		for(var/obj/structure/closet/container in room)
			var/distance = get_dist(pawn, container)
			if(distance < nearest_distance && wants_shutting(container))
				nearest_distance = distance
				nearest = container
				nearest_place = null
		for(var/obj/item/thing in room)
			var/distance = get_dist(pawn, thing)
			if(distance >= nearest_distance || !wants_tidying(thing))
				continue
			var/atom/place = place_for(thing)
			if(isnull(place))
				continue
			nearest_distance = distance
			nearest = thing
			nearest_place = place
	return nearest ? list(nearest, nearest_place) : null

/**
 * What the brain is told about the state of the body's work area: how many things are lying about
 * that it could put away. Null for a body with no work area. Worked out afresh every few seconds.
 */
/datum/ai_controller/crew_npc/proc/tidy_state()
	if(!length(work_area))
		return null
	if(tidy_cache && world.time - tidy_cached_at < CREW_NPC_TIDY_CHECK)
		return tidy_cache
	var/todo = 0
	for(var/area/room as anything in tidy_rooms())
		for(var/obj/structure/closet/container in room)
			if(wants_shutting(container))
				todo++
		// Whether there is anywhere to put things is the same for everything in the room.
		var/has_bin = !isnull(nearest_bin(pawn))
		var/has_surface = FALSE
		for(var/obj/structure/surface in room)
			if((istype(surface, /obj/structure/table) || istype(surface, /obj/structure/rack)) && crew_npc_free_surface(get_turf(surface)))
				has_surface = TRUE
				break
		if(!has_bin && !has_surface)
			continue
		for(var/obj/item/thing in room)
			if(todo >= CREW_NPC_TIDY_COUNTED)
				break
			if(wants_tidying(thing) && (crew_npc_is_rubbish(thing) ? has_bin : has_surface))
				todo++
	// Something still in its hands from last time counts until it has been put down.
	var/obj/item/carried = tidy_item?.resolve()
	if(!QDELETED(carried) && carried.loc == pawn)
		todo++
	tidy_cache = list("todo" = todo)
	tidy_cached_at = world.time
	return tidy_cache

/// Forgets the last look at the work area, because the body has just changed it.
/datum/ai_controller/crew_npc/proc/tidy_changed()
	tidy_cache = null

/// Tool: put away the next thing lying about in the body's work area.
/datum/ai_controller/crew_npc/proc/tool_tidy()
	var/mob/living/carbon/human/body = pawn
	if(!length(work_area))
		action_result(CREW_TOOL_TIDY, FALSE, "You have no place of your own to keep in order.")
		return
	// Something picked up last time and never put down is finished with first.
	var/obj/item/carried = tidy_item?.resolve()
	if(!QDELETED(carried) && carried.loc == body)
		var/atom/place = place_for(carried)
		if(place)
			start_errand(place, CREW_TOOL_TIDY, format_text(carried.name))
			return
		drop_tidy_item()
	var/list/job = next_to_tidy()
	if(isnull(job))
		action_result(CREW_TOOL_TIDY, FALSE, "There is nothing lying about that you have anywhere to put.")
		return
	if(isitem(job[1]) && !length(body.get_empty_held_indexes()))
		action_result(CREW_TOOL_TIDY, FALSE, "Your hands are full.")
		return
	var/atom/place = job[2]
	tidy_place = place ? WEAKREF(place) : null
	var/atom/movable/thing = job[1]
	start_errand(thing, CREW_TOOL_TIDY, format_text(thing.name))

/**
 * Carries out one step of putting something away, now that the body is standing by it: shuts a
 * crate or locker, picks a thing up and sets off with it, or puts down what it is carrying.
 */
/datum/ai_controller/crew_npc/proc/tidy_step(atom/target)
	var/mob/living/carbon/human/body = pawn
	var/place = get_area_name(body, TRUE)
	// Shutting an open crate or locker takes back in what spilled out of it.
	if(istype(target, /obj/structure/closet))
		var/obj/structure/closet/container = target
		var/container_name = format_text(container.name)
		if(container.opened && !container.close(body))
			tidy_skipped[REF(container)] = world.time
			tidy_changed()
			return list(FALSE, "The [container_name] will not shut.")
		tidy_changed()
		return list(TRUE, "You shut the [container_name] in [place], with what had spilled out of it back inside.")

	var/obj/item/carried = tidy_item?.resolve()
	// Standing by where it goes, with it in hand: put it there.
	if(!QDELETED(carried) && carried.loc == body && target != carried)
		var/carried_name = format_text(carried.name)
		tidy_item = null
		tidy_changed()
		if(istype(target, /obj/machinery/disposal))
			var/obj/machinery/disposal/bin = target
			if(!bin.place_item_in_disposal(carried, body))
				body.dropItemToGround(carried)
				tidy_skipped[REF(carried)] = world.time
				return list(FALSE, "You cannot get the [carried_name] into the bin.")
			work_put_away++
			return list(TRUE, "You put the [carried_name] in the disposal bin in [place].")
		if(!body.transferItemToLoc(carried, get_turf(target)))
			tidy_skipped[REF(carried)] = world.time
			return list(FALSE, "You cannot let go of the [carried_name].")
		work_put_away++
		return list(TRUE, "You put the [carried_name] on the [format_text(target.name)] in [place].")

	// Standing by the thing itself: pick it up and take it where it goes.
	var/obj/item/thing = target
	var/atom/where = tidy_place?.resolve()
	if(!istype(thing) || !isturf(thing.loc) || QDELETED(where))
		return list(FALSE, "It is not where you saw it.")
	if(!body.put_in_hands(thing))
		tidy_skipped[REF(thing)] = world.time
		tidy_changed()
		return list(FALSE, "You cannot pick up the [format_text(thing.name)].")
	tidy_item = WEAKREF(thing)
	// From here it is a second errand. Starting it ends this one, and that one reports when it is over.
	start_errand(where, CREW_TOOL_TIDY, format_text(thing.name))
	return list(TRUE, null)

/// Puts down whatever the body picked up to put away, where it stands, and leaves it be for a while.
/datum/ai_controller/crew_npc/proc/drop_tidy_item()
	var/mob/living/carbon/human/body = pawn
	var/obj/item/carried = tidy_item?.resolve()
	tidy_item = null
	tidy_changed()
	if(QDELETED(carried) || carried.loc != body)
		return
	tidy_skipped[REF(carried)] = world.time
	body.dropItemToGround(carried)
