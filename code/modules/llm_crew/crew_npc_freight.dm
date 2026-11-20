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

/**
 * What it is aboard the supply shuttle that stops it leaving, as words to follow "will not leave: ",
 * or null if nothing aboard does. Anyone at the dock could find it: someone or some creature on
 * the deck, or a thing the shuttle may not carry, lying loose or shut in a crate.
 */
/datum/ai_controller/crew_npc/proc/what_bars_shuttle(obj/docking_port/mobile/supply/shuttle)
	for(var/area/shuttle_area as anything in shuttle.shuttle_areas)
		for(var/list/zlevel_turfs as anything in shuttle_area.get_zlevel_turf_lists())
			for(var/turf/deck as anything in zlevel_turfs)
				for(var/atom/movable/passenger in deck.get_all_contents())
					if(istype(passenger, /obj/docking_port))
						continue
					if(!is_type_in_typecache(passenger, GLOB.blacklisted_cargo_types) && !HAS_TRAIT(passenger, TRAIT_BANNED_FROM_CARGO_SHUTTLE))
						continue
					var/what = format_text(passenger.name)
					if(isliving(passenger))
						return passenger == pawn ? "you are standing aboard it" : "[what] is aboard it"
					var/obj/structure/closet/crate/within = get(passenger, /obj/structure/closet/crate)
					var/where = within ? "in the [format_text(within.name)] aboard it" : "lying on its deck"
					if(istype(passenger, /obj/item/mail))
						return "it will not carry mail, and there is a letter [where]"
					return "it will not carry the [what] that is [where]"
	return null

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

/// TRUE once a crew NPC has seen this crate aboard the supply shuttle with something in it. Only such a crate is sent back when it is empty: the station's own crates are not cargo's to sell.
/obj/structure/closet/crate/var/crew_npc_came_by_shuttle = FALSE
/// The tile cargo's crew last left this crate standing on. A crate still there is where they meant it to be, on a marked square or not: it is not moved again until someone moves it.
/obj/structure/closet/crate/var/turf/crew_npc_left_on
/// TRUE while this crate stands open where someone who collected it unpacked it, its things on its tile for the taking. Nobody tidying shuts it on them.
/obj/structure/closet/crate/var/crew_npc_unpacked = FALSE

/**
 * Returns the marked squares on the floor of a room: the tiles painted with a box, which is where
 * crates are stood to wait. They are found by the paint on each tile, as anyone would see them,
 * once, and kept. A room with none is looked at again every few minutes.
 */
/proc/crew_npc_marked_squares(area/room, z_level)
	var/static/list/found = list()
	var/static/list/found_at = list()
	var/key = "[REF(room)]|[z_level]"
	var/list/squares = found[key]
	// Looked at again every few minutes, so paint scraped off or a floor taken up is noticed.
	if(!isnull(squares) && world.time - found_at[key] < 5 MINUTES)
		return squares
	squares = list()
	for(var/turf/open/tile in room.get_turfs_by_zlevel(z_level))
		for(var/mutable_appearance/paint as anything in tile.overlays)
			if(paint.icon_state == "bot_white" || paint.icon_state == "bot")
				// Paint on a loading conveyor, or beside a door, marks a way through, not somewhere to leave a crate.
				if(!(locate(/obj/machinery/conveyor) in tile) && crew_npc_clear_of_doors(tile))
					squares += tile
				break
	found[key] = squares
	found_at[key] = world.time
	return squares

/// Returns the nearest marked square in the bay with nothing standing on it, or null if the bay has none or they are all taken.
/datum/ai_controller/crew_npc/proc/free_square(turf/here)
	if(isnull(post_turf))
		return null
	here ||= get_turf(pawn)
	var/turf/nearest
	var/nearest_distance = INFINITY
	for(var/turf/square as anything in crew_npc_marked_squares(get_area(post_turf), post_turf.z))
		// Not the body's own spot at the counter, nor beside it.
		if(!crew_npc_safe_turf(square) || square.is_blocked_turf(exclude_mobs = TRUE) || get_dist(square, post_turf) <= 1)
			continue
		// Nor one where a crate would wall another in, so nobody could stand beside it (SUP-15).
		if(crew_npc_square_shuts_in(square))
			continue
		var/distance = get_dist(square, here)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = square
	return nearest

/**
 * TRUE if a crate stood on this square would leave a crate, the new one or one within a tile of it,
 * with no free open tile among its eight neighbours: nobody could stand beside it to take it. Where
 * squares are painted in a solid block (CatwalkStation's three rows), the middle row's crates would
 * otherwise be walled in by the rows round them (SUP-15).
 */
/proc/crew_npc_square_shuts_in(turf/square)
	for(var/turf/spot in range(1, square))
		if(spot != square && !(locate(/obj/structure/closet/crate) in spot))
			continue
		var/has_room = FALSE
		for(var/turf/beside in range(1, spot))
			if(beside == spot || beside == square)
				continue
			if(isopenturf(beside) && !beside.is_blocked_turf(exclude_mobs = TRUE))
				has_room = TRUE
				break
		if(!has_room)
			return TRUE
	return FALSE

/// Returns the name of whoever a piece of mail is for, or null if it is a dead letter.
/proc/crew_npc_mail_for(obj/item/mail/letter)
	var/datum/mind/recipient = letter.recipient_ref?.resolve()
	if(isnull(recipient))
		return null
	return recipient.current?.real_name || recipient.name

/**
 * Returns the things a crate holds: what is inside it if it is shut, what lies spilled around it if
 * it is open. Everything, not only what can be picked up: a crate with a wheeled filing cabinet or a
 * janitorial cart in it was called empty, and sent back to be sold with the thing still inside (SUP-09).
 */
/proc/crew_npc_crate_holds(obj/structure/closet/crate/crate)
	var/list/held = list()
	if(!crate.opened)
		for(var/atom/movable/thing as anything in crate)
			// The manifest is paperwork about the crate, not something that came in it.
			if(!istype(thing, /obj/item/paper/fluff/jobs/cargo/manifest) && !iseffect(thing))
				held += thing
		return held
	// Open: what lies on its square that shutting it would take back in. Not the crate itself, nor
	// whoever is standing there, nor what is fixed to the floor.
	for(var/obj/thing in crate.drop_location())
		if(thing == crate || iseffect(thing) || istype(thing, /obj/item/paper/fluff/jobs/cargo/manifest))
			continue
		if(isitem(thing) || crate.insertion_allowed(thing))
			held += thing
	return held

/**
 * TRUE if a crate has nothing left in it. Mail addressed to nobody used not to count, and a mail
 * crate with a dead letter in it was put aboard as an empty. The supply shuttle will not fly with
 * a letter of any kind aboard: it stood in the dock for the rest of the round, and no order could
 * be fetched.
 */
/proc/crew_npc_crate_spent(obj/structure/closet/crate/crate)
	return !length(crew_npc_crate_holds(crate))

/// TRUE if a crate holds mail, addressed to someone or to nobody: all of it has to come out before the crate can go back.
/proc/crew_npc_crate_has_mail(obj/structure/closet/crate/crate)
	return !!(locate(/obj/item/mail) in crew_npc_crate_holds(crate))

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
	// Its own claim is no bar to it, and stands. It used to be thrown away here the first time
	// the claimant looked over the freight, a second or two after it was made: a workmate then
	// set off for the same crate, and two technicians lost their grip on one crate thirteen times
	// in the first minute of a round, each in the other's way.
	if(claimant == src)
		return FALSE
	if(QDELETED(claimant) || world.time - claim[2] > CREW_NPC_CRATE_CLAIM)
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
	// Where the bay has squares marked on its floor, that is where a crate stands. One left loose
	// in the middle of the bay is put on one: a mail crate the Captain had moved was walked round
	// for the rest of the round. And an empty that whoever took it away has brought back to the
	// lobby is taken in: two of those sat in the lobby until the round ended. A crate put out in
	// the lobby for someone to collect is theirs to take, and stays where it is.
	if(post_turf && free_square())
		var/area/bay = get_area(post_turf)
		var/list/squares = crew_npc_marked_squares(bay, post_turf.z)
		for(var/obj/structure/closet/crate/crate as anything in crates_in_hand())
			if(crate in crates)
				continue
			var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(crate)
			if(get_area(crate) == bay)
				// Not one standing open, with what was in it spread on the floor round it: someone is unpacking that.
				// Nor one that stands where cargo last left it: with every square taken, or no room
				// to draw it onto one, that is the best that could be done, and it is not gone at again.
				if(!(get_turf(crate) in squares) && !entry?.collected_by && !crate.opened && crate.crew_npc_left_on != get_turf(crate))
					crates += crate
			else if(crew_npc_crate_spent(crate) && !(entry?.out && !entry.collected_by))
				crates += crate
	// The shuttle deck too, while it is docked. An empty lying by one of its doors counts as sent
	// back, so nobody would ever move it again, and it is in the way of every crate that comes off.
	// One with something in it is not counted here: it is hauled off with the rest.
	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
		if(crate.anchored || !isturf(crate.loc) || crate_taken(crate) || !crew_npc_crate_spent(crate))
			continue
		if(!crew_npc_clear_of_doors(crate))
			crates += crate
	return crates

/// Returns the nearest mail crate in cargo's rooms that still has mail in it, or null.
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

/// Returns the crates in cargo's rooms with nothing left in them that came in on the supply shuttle: those are the ones that go back. The station's own crates, a trash cart or a freezer among them, were being sent back and sold with the rest.
/datum/ai_controller/crew_npc/proc/spent_crates()
	var/list/crates = list()
	for(var/obj/structure/closet/crate/crate as anything in crates_in_hand())
		if(crate.crew_npc_came_by_shuttle && crew_npc_crate_spent(crate))
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
			continue
		// It came in with something in it: when it is empty, it is one that goes back.
		crate.crew_npc_came_by_shuttle = TRUE
		// One a workmate is already hauling off is not this body's to unload.
		if(!crate_taken(crate))
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
	// A marked square, where the bay has them and one is free: that is what they are painted for.
	if(bay == get_area(post_turf))
		var/turf/square = free_square(here)
		if(square)
			return square
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
	begin_haul()
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
	begin_haul()
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
	begin_haul()
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
			// An empty left by a door aboard the shuttle goes to the middle of the deck, where empties go.
			// Anything else goes to the nearest clear spot to where it lies, in the room it is in.
			// A crate loose in the bay, or an empty brought back to the lobby, goes onto a marked
			// square in the bay if there is one free.
			var/in_bay = post_turf && get_area(crate) == get_area(post_turf)
			if(crate in crates_aboard())
				destination = shuttle_spot()
			else if(in_bay || crew_npc_crate_spent(crate))
				destination = free_square(get_turf(crate)) || storage_spot(get_area(crate), get_turf(crate))
			else
				destination = storage_spot(get_area(crate), get_turf(crate))
		else
			destination = shuttle_spot()
	if(isnull(destination))
		return list(FALSE, tool == CREW_TOOL_RECYCLE ? "There is no room aboard the supply shuttle for the [crate_name]." : "There is no room to put the [crate_name].")
	// A crate goes back shut, with whatever worthless thing spilled out of it back inside. Not
	// shut on someone lying in it: that would send them off aboard the shuttle.
	if(tool == CREW_TOOL_RECYCLE && crate.opened)
		if(crew_npc_someone_on(get_turf(crate)))
			return list(FALSE, "Someone is in the way of the [crate_name]: you cannot shut it to send it back.")
		crate.close(body)
	body.start_pulling(crate)
	if(body.pulling != crate)
		return list(FALSE, "You cannot get a grip on the [crate_name].")
	hauled_name = crate_name
	hauled_ref = WEAKREF(crate)
	// From here it is a walk. Starting it ends this errand, and the walk reports when it is over.
	start_walk(destination, tool, get_area_name(destination, TRUE), CREW_NPC_TRAVEL_TIMEOUT)
	wait_for_way(crate)
	return list(TRUE, null)

/// Called when a walk with a crate, into the bay or aboard the shuttle, ends. Lets go of it and tells the brain.
/datum/ai_controller/crew_npc/proc/freight_hauled(tool, succeeded, reason)
	var/mob/living/carbon/human/body = pawn
	var/atom/movable/hauled = body.pulling
	// A crate trails a step behind whoever hauls it, so the body is standing on the square it was
	// making for and the crate is a tile short of it. One step on, the way it was going, draws the
	// crate onto the square.
	if(succeeded && hauled && tool != CREW_TOOL_RECYCLE && post_turf)
		var/list/squares = crew_npc_marked_squares(get_area(post_turf), post_turf.z)
		if((get_turf(body) in squares) && !(get_turf(hauled) in squares))
			var/onward_dir = get_dir(hauled, body)
			var/turf/onward = get_step(body, onward_dir)
			if(onward && isopenturf(onward) && !onward.is_blocked_turf() && crew_npc_safe_turf(onward))
				body.Move(onward, onward_dir)
	var/obj/structure/closet/crate/stood = hauled
	if(succeeded && istype(stood) && tool != CREW_TOOL_RECYCLE)
		stood.crew_npc_left_on = get_turf(stood)
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
		action_result(tool, FALSE, "You could not get the [hauled_name] where it was going: [reason || "you lost your grip on it"].[blocker][gave_up_report(details)] You are in [place].", details)
		return
	if(tool == CREW_TOOL_UNLOAD)
		work_crates_in++
		action_result(tool, TRUE, "You haul the [hauled_name] off the supply shuttle and leave it in [place].", list("place" = place))
	else if(tool == CREW_TOOL_STOW)
		action_result(tool, TRUE, "You haul the [hauled_name] out of the way and leave it in [place], where a crate belongs.", list("place" = place))
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
	var/binned = 0
	// Where a dead letter is dropped: at the body's feet, as long as that is neither the crate's
	// own tile, where shutting the crate would take it back in, nor the deck of the shuttle.
	var/turf/feet = get_turf(body)
	var/may_drop = feet != get_turf(crate) && !istype(get_area(feet), /area/shuttle)
	// Each letter by hand, as a player does it: a click on the letter with an empty hand, and a
	// click on the bag with it. About two seconds a letter, so the errand may be called off, or the
	// body taken away, part way through: then it stops, and what is not taken stays in the crate.
	var/serial = errand_serial
	var/stopped = FALSE
	for(var/obj/item/mail/letter in crew_npc_crate_holds(crate))
		if(!stopped && (QDELETED(src) || QDELETED(body) || QDELETED(crate) || errand_serial != serial || !crate.opened || !can_reach_target_now(crate)))
			stopped = TRUE
		if(stopped)
			left++
			continue
		if(QDELETED(letter) || get_turf(letter) != get_turf(crate))
			continue
		if(!empty_clicking_hand() || !click_as_body(letter) || QDELETED(letter) || !body.is_holding(letter))
			left++
			continue
		var/whose = crew_npc_mail_for(letter)
		if(isnull(whose) && may_drop)
			// Addressed to nobody: junk. It comes out all the same, or the crate can never go
			// back. Dropped at its feet, to be binned with the rest of the rubbish.
			body.dropItemToGround(letter)
			binned++
			continue
		// Into the bag: mail for someone, and junk where it may not be dropped (the crate's own
		// tile, where shutting the crate would take it back in, or the deck of the shuttle).
		if(stow_in_bag(letter))
			if(isnull(whose))
				binned++
			else
				taken++
				names |= whose
			continue
		// The bag is full, or there is none. The letter goes back in the open crate, by a click on
		// the crate with it, and the rest stay where they are.
		if(!QDELETED(crate) && crate.opened)
			click_as_body(crate)
		left++
		stopped = TRUE
	if(QDELETED(body) || QDELETED(crate))
		return list(FALSE, "You could not get to it.")
	// Shutting it takes back in whatever is still lying there: any mail there was no room for. Not
	// with someone on its tile, who would be shut in with it.
	if(crate.opened && !crew_npc_someone_on(get_turf(crate)))
		crate.close(body)
	freight_changed()
	var/junk_words = binned ? " You [taken ? "also " : ""]take out [binned == 1 ? "a letter" : "[binned] letters"] addressed to nobody: junk, for the bin." : ""
	if(!taken && !binned)
		return list(FALSE, left ? "You have no room in your bag for the mail in the [crate_name]." : "There is no mail in the [crate_name].")
	if(!taken)
		return list(TRUE, "There is no mail for anyone in the [crate_name].[junk_words][left ? " There was no room for the rest." : ""]")
	return list(TRUE, "You take [taken] piece[taken == 1 ? "" : "s"] of mail out of the [crate_name] and put [taken == 1 ? "it" : "them"] in your bag: for [english_list(names)].[junk_words][left ? " There was no room for the rest." : ""] You will hold on to [taken == 1 ? "it" : "them"] until whoever [taken == 1 ? "it is" : "they are"] for comes to the counter.")

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
	// One of the crew taking it knows it was handed over, and keeps it.
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		their_controller.being_handed_something()
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
	// With the shuttle away and empties waiting to go back, the same console calls it in: nothing
	// else ever did, and empties that had been brought back sat in the lobby until the round ended.
	if(isnull(docked_supply_shuttle()))
		var/obj/docking_port/mobile/supply/away = SSshuttle.supply
		if(supply_run_active || isnull(away) || away.mode != SHUTTLE_IDLE || away.getDockedId() != "cargo_away" || !length(spent_crates()))
			action_result(CREW_TOOL_SEND, FALSE, "The supply shuttle is not here to send back.")
			return
		var/obj/machinery/computer/cargo/calling_from = supply_console()
		if(isnull(calling_from))
			action_result(CREW_TOOL_SEND, FALSE, "You cannot think where there is a supply console to call it from.")
			return
		start_errand(calling_from, CREW_TOOL_SEND, null)
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
	// A console with no power, or broken, shows no screen to send the shuttle from (can_interact,
	// as the game's window asks). Found out standing at it.
	if(QDELETED(console) || !console.can_interact(pawn))
		return list(FALSE, "The supply console is dead: it has no power, or it is broken, so the shuttle cannot be sent from it.")
	var/obj/docking_port/mobile/supply/shuttle = docked_supply_shuttle()
	if(isnull(shuttle))
		// Away, with empties here to go back: it is called in for them.
		var/obj/docking_port/mobile/supply/away = SSshuttle.supply
		var/waiting = length(spent_crates())
		if(supply_run_active || isnull(away) || away.mode != SHUTTLE_IDLE || away.getDockedId() != "cargo_away" || !waiting)
			return list(FALSE, "The supply shuttle has already gone.")
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) called the supply shuttle in for [waiting] empty crate\s.")
		SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)
		freight_changed()
		return list(TRUE, "You call the supply shuttle in, to take [waiting] empty crate[waiting == 1 ? "" : "s"] back.")
	if(SSshuttle.supply_blocked || !shuttle.canMove())
		// The shuttle will not fly with anyone aboard, or with cargo it is not allowed to carry.
		// Which, it can see for itself: a body told only "someone or something" tried the console fifteen times.
		return list(FALSE, "The supply shuttle will not leave: [what_bars_shuttle(shuttle) || "someone is standing aboard it, or something aboard is not allowed to travel"].")
	var/empties = 0
	for(var/obj/structure/closet/crate/crate as anything in crates_aboard())
		empties++
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) sent the supply shuttle away with [empties] crate\s aboard.")
	SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)
	freight_changed()
	return list(TRUE, "You send the supply shuttle back[empties ? " with [empties] empty crate[empties == 1 ? "" : "s"] aboard" : ""].")
