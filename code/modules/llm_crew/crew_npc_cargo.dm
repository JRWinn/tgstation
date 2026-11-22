/**
 * Jobs beyond cleaning: what a crew NPC knows of its post, and the cargo technician's work.
 *
 * A cargo technician stays at its post. Heads of department come and ask it, face to face, for
 * supplies. It orders the crate at the supply console, and when the shuttle docks it sends whoever
 * ordered a PDA message with the number on the crate's manifest. The crate is held in the bay until
 * someone comes to the counter with that number: see crew_npc_held.dm.
 */

/// The job written on the body's ID.
/datum/ai_controller/crew_npc/proc/job_title(mob/living/carbon/human/body = pawn)
	// Asked while it is still being given its body, it has none of its own to read: whoever asks hands the body in.
	if(isnull(body))
		return ""
	// Its own job is what its own ID says, whatever it looks like to anyone else. get_assignment()
	// answers as a stranger would see it: with its face hidden, by a potted plant held up in front of
	// it, say, that is no job at all, and a head with no job walks off from its own staff meeting.
	// The card it wears comes first: one it only holds (picked up to tidy, or handed to it) is not its job.
	var/obj/item/card/id/card = crew_npc_own_card(body)
	return card?.assignment || body.get_assignment(if_no_id = "", if_no_job = "", hand_first = FALSE)

/// TRUE if the body's job is in cargo, which is what lets it order supplies.
/datum/ai_controller/crew_npc/proc/works_in_cargo()
	var/static/regex/cargo_jobs = regex("cargo|quartermaster", "i")
	return !!cargo_jobs.Find(job_title())

/// The crates a cargo technician may order, by the name crew know them by.
/datum/ai_controller/crew_npc/proc/orderable_crates()
	var/static/list/crates
	if(isnull(crates))
		crates = list()
		for(var/pack_type in list(/datum/supply_pack/service/janitor, /datum/supply_pack/service/lightbulbs, /datum/supply_pack/misc/paper))
			var/datum/supply_pack/pack = SSshuttle.supply_packs[pack_type]
			if(pack)
				crates[pack.name] = pack_type
	return crates

/**
 * Gives a new crew NPC what any crew member arrives knowing: the way to its own post, and the way
 * to the Cargo Lobby, where crew go to ask for supplies. Everything else it learns by walking about.
 */
/datum/ai_controller/crew_npc/proc/learn_starting_places()
	var/list/known = list()
	var/list/sentences = list()
	// The Quartermaster is cargo staff with no post at the counter: it has an office, and its staff to find.
	if(is_quartermaster())
		sentences += learn_quartermaster_places(known)
	else if(works_in_cargo())
		// A technician knocks at the Quartermaster's office door when it has word for it.
		learn_head_office()
		// The post is the room with the counter window to the lobby, whatever console stands there
		// (MAP-06). Stations name that room differently.
		var/area/post_area = crew_npc_cargo_post_room()
		var/obj/machinery/computer/cargo/console = crew_npc_cargo_post_console()
		var/turf/spot = post_area ? find_post_turf(post_area, console) : null
		if(spot)
			post_place = format_text(post_area.name)
			post_turf = spot
			visited_places[post_place] = list(spot.x, spot.y, spot.z)
			known += post_place
			work_area += post_place
			learn_department(post_area)
			var/console_words = "The supply console you order at is in the same room."
			if(isnull(console))
				var/obj/machinery/computer/cargo/nearest = supply_console()
				console_words = nearest ? "There is no supply console in it: you order at the one in the [get_area_name(nearest, TRUE)]." : "There is no supply console in it."
			sentences += "You are the station's [job_title()]. Your post is the [post_place], at the counter, and you know the way there. [console_words]"
	// Engineering staff know Engineering and the engine room, and the Chief Engineer its office.
	else if(works_in_engineering())
		sentences += learn_engineering_places(known)
	// Security staff know the Security Office and the brig, and the Head of Security its office.
	else if(works_in_security())
		sentences += learn_security_places(known)
	// A head has an office, and goes back to it between errands.
	if(findtext(job_title(), "Head of Personnel"))
		office_place = learn_place(/area/station/command/heads_quarters/hop)
		if(office_place)
			known += office_place
			sentences += "Your office is the [office_place], and you know the way there."
		// Where it calls its staff together. The room called the Bar is, on most stations, the bartender's
		// side of the counter, which the staff cannot get into: the seats in front of it are what is wanted.
		var/turf/here = get_turf(pawn)
		for(var/room_type in list(/area/station/commons/lounge, /area/station/service/bar/atrium, /area/station/service/cafeteria, /area/station/service/bar))
			var/area/station/room = GLOB.areas_by_type[room_type]
			if(isnull(room) || !length(room.get_turfs_by_zlevel(here.z)) || crew_npc_room_is_closed(room, here.z))
				continue
			// It stands in the middle of the room, and its staff come and stand round it. Just inside
			// the door, which is the nearest spot, they would all be in the doorway.
			meeting_place = learn_place(room_type, well_inside = TRUE)
			if(meeting_place)
				known += meeting_place
				break
	var/lobby = learn_place(/area/station/cargo/lobby)
	if(lobby)
		known += lobby
		if(post_place && works_in_cargo())
			// The lobby is where it serves the crew, so it is as much its to keep fit to be in as its post.
			work_area += lobby
			look_in_rooms -= lobby
			// Crew walk into the lobby to be served. Whatever doors it has, it is not shut to them.
			closed_rooms -= lobby
			sentences += "Crew come to the [lobby], on the other side of the counter, to ask you for supplies."
		else
			sentences += "You know the way to the [lobby], where crew go to ask the cargo technician for supplies."
	if(!length(known))
		return
	var/list/places = list()
	for(var/place in known)
		places += list(list("place" = place, "things" = list()))
	emit_sense(CREW_SENSE_KNOWLEDGE, sentences.Join(" "), list("places" = places))

/**
 * Works out which other rooms of its department the body looks in on, and which of its rooms are
 * locked to the crew at large. The department is every room whose area is of the same kind as its
 * post: for a post in /area/station/cargo/storage, everything under /area/station/cargo.
 *
 * Only rooms its own ID opens count. Nobody else on the crew may be able to get into them, so
 * whoever works there is the only one who will ever notice what state they are in.
 */
/datum/ai_controller/crew_npc/proc/learn_department(area/station/post_area)
	var/mob/living/carbon/human/body = pawn
	var/list/post_path = splittext("[post_area.type]", "/")
	// "", "area", "station", then the department.
	if(length(post_path) < 4)
		return
	var/department = post_path[4]
	if(crew_npc_room_is_closed(post_area, body.z))
		closed_rooms |= post_place
	var/list/places = crew_npc_station_places()
	for(var/place_name in places)
		var/area/station/place = places[place_name]
		if(place == post_area || place_name == post_place)
			continue
		var/list/place_path = splittext("[place.type]", "/")
		if(length(place_path) < 4 || place_path[4] != department)
			continue
		if(istype(place, /area/station/hallway) || istype(place, /area/station/maintenance))
			continue
		if(!length(place.get_turfs_by_zlevel(body.z)) || locked_out_of(place))
			continue
		look_in_rooms |= place_name
		if(crew_npc_room_is_closed(place, body.z))
			closed_rooms |= place_name
	// Which of them lie inside another: every door of the room opens from a room of the department
	// that is locked to the crew as well. Someone sent for to a room like that has to be let through
	// the outer one first, and out through it afterwards. The post is the outer one if it is among them.
	for(var/place_name in closed_rooms)
		var/area/station/place = place_name == post_place ? post_area : places[place_name]
		var/list/doors = crew_npc_doors_of(place, body.z)
		var/list/beyond = list()
		for(var/obj/machinery/door/airlock/door as anything in doors)
			var/list/sides = doors[door]
			var/area/far_side = get_area(sides[2])
			var/far_name = get_area_name(sides[2], TRUE)
			// A door its own ID does not open, onto another department's locked room, is not one it
			// lets anybody in by: the Delivery Office's door to the security post. A door onto a
			// hallway or maintenance always counts, as anyone may come to it.
			if(!door.allowed(body) && !(far_name in closed_rooms) && !istype(far_side, /area/station/hallway) && !istype(far_side, /area/station/maintenance))
				continue
			beyond |= far_name
		if(!length(beyond) || length(beyond - closed_rooms))
			continue
		reached_through[place_name] = (post_place in beyond) ? post_place : beyond[1]

/**
 * TRUE if nothing on this tile shuts a way: no airlock or windoor (which may only stand open for a
 * moment, as someone walks through), and no plastic flaps that nobody on their feet gets through.
 * Shutters that are up are left out: they are the open side of a counter.
 */
/proc/crew_npc_doorless(turf/spot)
	for(var/obj/thing in spot)
		if(istype(thing, /obj/machinery/door/airlock) || istype(thing, /obj/machinery/door/window))
			return FALSE
		if(istype(thing, /obj/structure/plasticflaps))
			var/obj/structure/plasticflaps/flaps = thing
			if(flaps.require_resting)
				return FALSE
	return TRUE

/// TRUE if a room has doors and every one of them asks for access, so the crew at large cannot walk in.
/proc/crew_npc_room_is_closed(area/room, z_level)
	var/list/doors = crew_npc_doors_of(room, z_level)
	if(!length(doors))
		return FALSE
	// An open way in from the next room, with no door on it, is open to anyone.
	for(var/turf/room_turf as anything in room.get_turfs_by_zlevel(z_level))
		if(!isopenturf(room_turf) || room_turf.is_blocked_turf(exclude_mobs = TRUE) || !crew_npc_doorless(room_turf))
			continue
		for(var/direction in GLOB.cardinals)
			var/turf/next = get_step(room_turf, direction)
			if(isnull(next) || get_area(next) == room || !isopenturf(next) || !istype(get_area(next), /area/station))
				continue
			if(!next.is_blocked_turf(exclude_mobs = TRUE) && crew_npc_doorless(next))
				return FALSE
	for(var/obj/machinery/door/airlock/door as anything in doors)
		if(!length(door.req_access) && !length(door.req_one_access))
			return FALSE
	return TRUE

/// The room the cargo post is in, chosen once for the station: see crew_npc_cargo_post_room().
GLOBAL_DATUM(crew_npc_cargo_post_room, /area/station/cargo)

/**
 * Returns the room the station's cargo staff work from, the same one for every technician and for
 * the Quartermaster, so that they all have the one post wherever each was made (MAP-06).
 *
 * It is the cargo room with the counter window to the Cargo Lobby, whatever console stands there:
 * the room with the most windows (windoors) onto the lobby. A tie goes to a room with a supply
 * console in it, then to the Cargo Bay, then to the bigger room. A station with no lobby, or no
 * window onto it, falls back to a supply console's room: the Cargo Bay's if there is one, else the
 * cargo room with the most floor. Chosen once from the map. Null if there is none.
 */
/proc/crew_npc_cargo_post_room()
	if(GLOB.crew_npc_cargo_post_room)
		return GLOB.crew_npc_cargo_post_room
	// The rooms with a supply console in them.
	var/list/console_rooms = list()
	for(var/obj/machinery/computer/cargo/console as anything in SSmachines.get_machines_by_type(/obj/machinery/computer/cargo))
		if(console.requestonly || console.is_express || !is_station_level(console.z))
			continue
		var/area/room = get_area(console)
		if(istype(room, /area/station/cargo) && !istype(room, /area/station/cargo/lobby))
			console_rooms[room] = TRUE
	// The windows onto the lobby, counted for the room on the other side of each.
	var/list/windows_of = list()
	for(var/area/station/cargo/lobby/lobby in GLOB.areas)
		for(var/z_level in SSmapping.levels_by_trait(ZTRAIT_STATION))
			for(var/turf/lobby_turf as anything in lobby.get_turfs_by_zlevel(z_level))
				for(var/direction in GLOB.cardinals)
					var/turf/beyond = get_step(lobby_turf, direction)
					var/area/room = beyond ? get_area(beyond) : null
					if(!istype(room, /area/station/cargo) || istype(room, /area/station/cargo/lobby))
						continue
					// The window may stand on either side of the line between the two rooms.
					for(var/obj/machinery/door/window/window in lobby_turf.contents + beyond.contents)
						var/list/windows = windows_of[room]
						if(isnull(windows))
							windows = list()
							windows_of[room] = windows
						windows |= window
	var/area/station/cargo/best_room
	var/best_score = -1
	var/list/candidates = length(windows_of) ? windows_of : console_rooms
	for(var/area/station/cargo/room as anything in candidates)
		var/score = length(room.get_turfs_from_all_zlevels())
		if(istype(room, /area/station/cargo/storage))
			score += 10000
		if(console_rooms[room])
			score += 100000
		if(length(windows_of))
			var/list/windows = windows_of[room]
			score += length(windows) * 1000000
		if(score > best_score)
			best_score = score
			best_room = room
	GLOB.crew_npc_cargo_post_room = best_room
	return best_room

/// Returns a supply console in the cargo post's room, or null if none stands there.
/proc/crew_npc_cargo_post_console()
	var/area/room = crew_npc_cargo_post_room()
	if(isnull(room))
		return null
	for(var/obj/machinery/computer/cargo/console as anything in SSmachines.get_machines_by_type(/obj/machinery/computer/cargo))
		if(!console.requestonly && !console.is_express && get_area(console) == room)
			return console
	return null

/**
 * Returns the supply console cargo staff order at: the nearest one in the cargo department.
 * One in a head's office is behind a door the body cannot open, so it is only a last resort.
 */
/datum/ai_controller/crew_npc/proc/supply_console()
	var/mob/living/carbon/human/body = pawn
	var/obj/machinery/computer/cargo/best_console
	var/best_score = INFINITY
	for(var/obj/machinery/computer/cargo/console as anything in SSmachines.get_machines_by_type(/obj/machinery/computer/cargo))
		if(console.requestonly || console.is_express || console.z != body.z)
			continue
		var/score = get_dist(body, console)
		if(!istype(get_area(console), /area/station/cargo))
			score += 1000
		if(score < best_score)
			best_score = score
			best_console = console
	return best_console

/**
 * Picks where in its post room a cargo technician stands: at the counter, as near the Cargo Lobby
 * as it can get, so crew who come to the lobby can see it and be heard.
 */
/datum/ai_controller/crew_npc/proc/find_post_turf(area/post_area, obj/machinery/computer/cargo/console)
	var/turf/here = get_turf(pawn)
	var/list/lobby_turfs = list()
	for(var/area/station/cargo/lobby/lobby in GLOB.areas)
		lobby_turfs += lobby.get_turfs_by_zlevel(here.z)
	if(!length(lobby_turfs))
		return safe_spot_in(post_area, get_turf(console || pawn))

	var/turf/best_turf
	var/best_score = INFINITY
	for(var/turf/candidate as anything in post_area.get_turfs_by_zlevel(here.z))
		if(!far_spot_safe(candidate) || candidate.is_blocked_turf())
			continue
		var/nearest = INFINITY
		var/total = 0
		for(var/turf/lobby_turf as anything in lobby_turfs)
			var/distance = get_dist(candidate, lobby_turf)
			nearest = min(nearest, distance)
			total += distance
		var/score = nearest * 100 + total / length(lobby_turfs)
		// The service window is where crew come to ask.
		for(var/turf/beside as anything in get_adjacent_open_turfs(candidate) + candidate)
			if(locate(/obj/machinery/door/window) in beside)
				score -= 50
				break
		if(score < best_score)
			best_score = score
			best_turf = candidate
	return best_turf

/**
 * Sends a body with nothing to do back to its spot, if it is in its post room but has strayed from
 * the spot: after placing an order at the console, say. Returns TRUE if it set off.
 *
 * Getting back to the room from elsewhere on the station is the brain's decision, not this.
 */
/datum/ai_controller/crew_npc/proc/return_to_post()
	if(isnull(post_turf) || !COOLDOWN_FINISHED(src, post_return_cooldown))
		return FALSE
	// Under arrest, or in a brig cell, it goes nowhere of its own accord.
	if(in_custody())
		return FALSE
	if(get_dist(pawn, post_turf) <= CREW_NPC_POST_LEASH || get_area(pawn) != get_area(post_turf))
		return FALSE
	COOLDOWN_START(src, post_return_cooldown, CREW_NPC_POST_RETURN_COOLDOWN)
	// Started a moment later, so the wandering this is called from has finished before it is replaced.
	addtimer(CALLBACK(src, PROC_REF(start_walk), post_turf, CREW_TOOL_RETURN, post_place, CREW_NPC_WALK_TIMEOUT), 0.1 SECONDS)
	return TRUE

/// Returns a free tile as near the middle of the room of this type as there is, or null if there is none.
/datum/ai_controller/crew_npc/proc/middle_of(area_type)
	var/turf/here = get_turf(pawn)
	var/list/room_turfs = list()
	for(var/area/station/place in GLOB.areas)
		if(place.type == area_type)
			room_turfs += place.get_turfs_by_zlevel(here.z)
	if(!length(room_turfs))
		return null
	var/total_x = 0
	var/total_y = 0
	for(var/turf/room_turf as anything in room_turfs)
		total_x += room_turf.x
		total_y += room_turf.y
	var/turf/middle = locate(round(total_x / length(room_turfs)), round(total_y / length(room_turfs)), here.z)
	var/turf/best_turf
	var/best_distance = INFINITY
	for(var/turf/candidate as anything in room_turfs)
		if(!far_spot_safe(candidate) || candidate.is_blocked_turf() || !crew_npc_clear_of_doors(candidate, 2))
			continue
		var/distance = get_dist(candidate, middle)
		if(distance < best_distance)
			best_distance = distance
			best_turf = candidate
	return best_turf

/// TRUE if there is no door or service window within this many tiles of the thing: it is not in anyone's way in or out.
/proc/crew_npc_clear_of_doors(atom/thing, tiles = 1)
	for(var/obj/machinery/door/door in range(tiles, get_turf(thing)))
		// Fire doors hang open across the middle of rooms and halls. They are not ways in.
		if(!istype(door, /obj/machinery/door/firedoor))
			return FALSE
	return TRUE

/// Sticks a label on a held crate with its number and who it is for, the way a technician would with a hand labeler.
/datum/ai_controller/crew_npc/proc/label_crate(obj/structure/closet/crate/crate, datum/crew_npc_held_crate/entry)
	var/words = "#[entry.number][entry.for_name ? " for [entry.for_name]" : ""]"
	if(length(crate.name) + length(words) + 3 > MAX_LABEL_LEN)
		return
	var/obj/item/label/note = new(null, words)
	note.stick_to_atom(crate)

/**
 * Records a spot in the room of this type as somewhere the body knows the way to. Returns the room's name, or null.
 *
 * The spot is the nearest safe one, unless `well_inside` is set: then it is as near the middle of
 * the room as there is, well clear of the doors. That is for a room others are called to.
 */
/datum/ai_controller/crew_npc/proc/learn_place(area_type, well_inside = FALSE)
	for(var/area/station/place in GLOB.areas)
		if(place.type != area_type)
			continue
		var/turf/spot = (well_inside ? middle_of(area_type) : null) || safe_spot_in(place, get_turf(pawn))
		if(isnull(spot))
			continue
		var/place_name = format_text(place.name)
		if(isnull(visited_places[place_name]))
			visited_places[place_name] = list(spot.x, spot.y, spot.z)
		return place_name
	return null

/// What the orders already in the supply cart will take out of the cargo budget when the shuttle loads: those no one pays for out of pocket, and that are not a department's own.
/proc/crew_npc_cart_owed_by_cargo()
	var/owed = 0
	for(var/datum/supply_order/waiting as anything in SSshuttle.shopping_list)
		if(waiting.paying_account || waiting.department_destination || !waiting.charge_on_purchase)
			continue
		owed += waiting.get_final_cost()
	return owed

/// world.time the supply shuttle last loaded at the far dock, as heard by this body's order run. An order still in the cart after that was not bought.
/datum/ai_controller/crew_npc/var/supply_bought_at = 0

/// Notes that the supply shuttle is loading. Whether the order on the go was bought is decided when the shuttle is home.
/datum/ai_controller/crew_npc/proc/supply_shuttle_bought(datum/source)
	SIGNAL_HANDLER
	if(!supply_run_active)
		UnregisterSignal(SSshuttle, COMSIG_SUPPLY_SHUTTLE_BUY)
		return
	supply_bought_at = world.time

/// TRUE if the shuttle has loaded since the order on the go was placed, and left it in the cart: there was not the money for it.
/datum/ai_controller/crew_npc/proc/order_unbought()
	var/datum/supply_order/order = pending_order?.resolve()
	return !isnull(order) && (order in SSshuttle.shopping_list) && supply_bought_at > supply_run_started_at

/**
 * world.time the supply shuttle docked at the station with the order on the go, or 0 until it has.
 * From then the order has come, wherever the body was: the shuttle is not moved for it again and
 * the run does not time out. It waits for the body to be back in the bay to see it. A workmate
 * that unloaded the crates and sent the shuttle away was having it called straight back, and the
 * order given up as held up with its crates in the bay (MULTI-02).
 */
/datum/ai_controller/crew_npc/var/supply_run_landed_at = 0
/// Longest an order that has come waits for the body that placed it to be back in the bay to see it.
#define CREW_NPC_SUPPLY_LANDED_WAIT (30 MINUTES)

/// Reads how many crates were asked for from what the brain sent, which may be a number or text. At least one, and no more than cargo orders at once.
/datum/ai_controller/crew_npc/proc/crates_wanted(count)
	return clamp(round(isnum(count) ? count : text2num("[count]")), 1, CREW_NPC_ORDER_MAX)

/// Says an order in words, as it is spoken of: "the Janitorial Supplies Crate", "2 of the Janitorial Supplies Crate and the Replacement Lights".
/datum/ai_controller/crew_npc/proc/order_in_words(list/wanted)
	var/list/parts = list()
	for(var/kind in wanted)
		parts += "[wanted[kind] > 1 ? "[wanted[kind]] of " : ""]the [kind]"
	return english_list(parts)

/**
 * Tool: order supplies at the supply console. Cargo staff only.
 *
 * One order may be for several kinds of crate at once, and for several crates of each, when a head
 * asks for everything its staff need in one go. `items` is that list, each entry a kind and a count.
 * With no list, the order is for `count` crates of `crate_name`.
 */
/datum/ai_controller/crew_npc/proc/tool_order(crate_name, for_handle, count, list/items, for_name, via, ref)
	if(!works_in_cargo())
		action_result(CREW_TOOL_ORDER, FALSE, "Ordering supplies is cargo's job. Ask the cargo technician.")
		return
	// The Quartermaster delegates. An order is placed by one of its technicians, on its word.
	if(is_quartermaster())
		action_result(CREW_TOOL_ORDER, FALSE, "You do not place orders at the console yourself. Give it to one of your technicians.")
		return
	var/list/known = orderable_crates()
	var/list/wanted = list()
	if(islist(items))
		for(var/list/item in items)
			var/kind = item["crate"]
			if(!istext(kind) || isnull(known[kind]) || (isnull(wanted[kind]) && length(wanted) >= CREW_NPC_ORDER_KINDS))
				continue
			wanted[kind] = min(wanted[kind] + crates_wanted(item["count"]), CREW_NPC_ORDER_MAX)
	if(!length(wanted) && istext(crate_name) && !isnull(known[crate_name]))
		wanted[crate_name] = crates_wanted(count)
	if(!length(wanted))
		action_result(CREW_TOOL_ORDER, FALSE, "That is not something you can order.")
		return
	if(supply_run_active)
		action_result(CREW_TOOL_ORDER, FALSE, "You already have an order on the go. See that one through first.")
		return
	// An order the budget cannot cover is never loaded, and the shuttle would come back without it.
	// What is already in the cart is paid for first, out of the same budget, in the order it was
	// placed. Two orders that each fit but not together both passed, and the second flew to and fro
	// unbought until it was called held up (SUP-11). The console shows the cart beside the budget.
	var/cost = crew_npc_cart_owed_by_cargo()
	for(var/kind in wanted)
		var/datum/supply_pack/pack = SSshuttle.supply_packs[known[kind]]
		cost += pack.get_cost() * wanted[kind]
	var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
	if(budget && !budget.has_money(cost))
		action_result(CREW_TOOL_ORDER, FALSE, "There is not enough money left in the cargo budget to order [order_in_words(wanted)].")
		return

	var/obj/machinery/computer/cargo/nearest_console = supply_console()
	if(isnull(nearest_console))
		action_result(CREW_TOOL_ORDER, FALSE, "You cannot think where there is a supply console to order from.")
		return
	// The brain says who asked. Failing that, it is whoever the body last heard.
	var/datum/weakref/asker_ref = istext(for_handle) ? handle_people[for_handle] : null
	var/mob/living/carbon/human/asker = asker_ref?.resolve()
	order_for = QDELETED(asker) ? last_heard_speaker : asker.name
	// An order the Quartermaster gave is for whoever the Quartermaster said, and word that it has
	// come goes back through the Quartermaster. Names only: nothing here is trusted beyond that.
	var/static/regex/not_a_name = regex(@"[<>\[\]\r\n\t]+", "g")
	order_via = null
	order_ref = null
	if(istext(via) && istext(for_name) && length(trim(for_name)))
		order_for = trim(copytext_char(not_a_name.Replace(for_name, " "), 1, MAX_NAME_LEN + 1))
		order_via = trim(copytext_char(not_a_name.Replace(via, " "), 1, MAX_NAME_LEN + 1))
		order_ref = isnum(ref) ? clamp(round(ref), 1, 9999) : null
	order_items = wanted
	supply_held_up_since = 0
	start_errand(nearest_console, CREW_TOOL_ORDER, order_in_words(wanted))

/// Places the order at the console the body is standing by, all of it in the one visit, and sets the shuttle run going.
/datum/ai_controller/crew_npc/proc/place_order(obj/machinery/computer/cargo/console)
	var/mob/living/carbon/human/body = pawn
	var/list/known = orderable_crates()
	if(!length(order_items))
		return list(FALSE, "You forget what you came to order.")
	// A console with no power, or broken, shows no screen to order on (can_interact, as the game's
	// window asks).
	if(!console.can_interact(body))
		return list(FALSE, "The supply console is dead: it has no power, or it is broken, and will take no order.")
	// Each crate comes with a manifest that carries its order's number. Those numbers are how the
	// crates are known from here on: when they dock, and when someone comes to collect them.
	ordered_numbers = list()
	ordered_kinds = list()
	var/list/placed_items = list()
	var/datum/supply_order/last_placed
	var/ordered_as = body.get_authentification_name()
	var/went_dead = FALSE
	for(var/kind in order_items)
		var/pack_type = known[kind]
		if(isnull(pack_type))
			continue
		var/orders_before = length(SSshuttle.shopping_list)
		// Each crate by the console's own "add", as its screen sends it, a click apart.
		for(var/crate_number in 1 to order_items[kind])
			if(!work_window(console, "add", list("id" = "[pack_type]")))
				went_dead = TRUE
				break
		// Its own orders only: someone else at another console may order in the same moments.
		for(var/index in orders_before + 1 to length(SSshuttle.shopping_list))
			var/datum/supply_order/placed = SSshuttle.shopping_list[index]
			if(placed.pack != SSshuttle.supply_packs[pack_type] || placed.orderer != ordered_as)
				continue
			ordered_numbers += placed.id
			ordered_kinds["[placed.id]"] = kind
			placed_items[kind] = (placed_items[kind] || 0) + 1
			last_placed = placed
		if(went_dead)
			break
	if(!length(ordered_numbers))
		if(went_dead)
			return list(FALSE, "The supply console is dead: it has no power, or it is broken, and will take no order.")
		return list(FALSE, "The supply console will not take the order.")
	order_items = placed_items
	order_count = length(ordered_numbers)
	ordered_words = order_in_words(placed_items)
	// The last of them to be loaded is the one to watch for: when it is aboard, they all are.
	pending_order = WEAKREF(last_placed)
	ordered_crate_name = placed_items[1]
	supply_run_started_at = world.time
	supply_run_landed_at = 0
	supply_run_active = TRUE
	// To know, when the shuttle is home with the order still in the cart, that it went and loaded without it.
	RegisterSignal(SSshuttle, COMSIG_SUPPLY_SHUTTLE_BUY, PROC_REF(supply_shuttle_bought), override = TRUE)
	addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
	return list(TRUE, "You order [ordered_words][order_for ? " for [order_for]" : ""] at the supply console and call the shuttle. It will be a few minutes. You will know when it docks.")

/**
 * Sees the supply shuttle through its run: out to collect the order if it is sitting at the station,
 * then back. Checks again every few seconds until the order has landed or too long has passed.
 */
/datum/ai_controller/crew_npc/proc/supply_run_step()
	if(!supply_run_active || QDELETED(pawn))
		supply_run_active = FALSE
		return
	var/in_bay = isnull(post_turf) || get_area(pawn) == get_area(post_turf)
	// It has come. All that is left is for the body to be back in the bay to see it (MULTI-02).
	if(supply_run_landed_at)
		var/mob/living/body = pawn
		if(in_bay && body.stat != DEAD)
			order_arrived()
			return
		// Not for ever: a body that is dead, or has not been back in half an hour, is not coming back for it.
		if(body.stat == DEAD || world.time - supply_run_landed_at > CREW_NPC_SUPPLY_LANDED_WAIT)
			supply_run_active = FALSE
			pending_order = null
			UnregisterSignal(SSshuttle, COMSIG_SUPPLY_SHUTTLE_BUY)
			if(body.stat != DEAD)
				action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle came in with what you ordered ([ordered_words]) a long while ago, while you were away from the bay, and you have not been back to see it since.")
			return
		addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
		return
	if(world.time - supply_run_started_at > CREW_NPC_SUPPLY_TIMEOUT)
		var/no_money = order_unbought()
		supply_run_active = FALSE
		pending_order = null
		UnregisterSignal(SSshuttle, COMSIG_SUPPLY_SHUTTLE_BUY)
		if(no_money)
			action_result(CREW_TOOL_ORDER, FALSE, "What you ordered ([ordered_words]) has still not come: the supply shuttle came back without it, as there was not enough money in the cargo budget to pay for it. It is still in the supply cart.", list("no_money" = TRUE))
			return
		action_result(CREW_TOOL_ORDER, FALSE, "What you ordered ([ordered_words]) has still not come. Something is holding the supply shuttle up.")
		return

	var/obj/docking_port/mobile/supply/shuttle = SSshuttle.supply
	// The shuttle takes the order off the list and deletes its record as it loads the crate. So an
	// order that is gone is an order aboard, and once the shuttle is at the station it has been delivered.
	var/datum/supply_order/order = pending_order?.resolve()
	var/aboard = isnull(order) || !(order in SSshuttle.shopping_list)
	// Loaded without it: the cargo budget could not pay. The shuttle coming home is the end of the
	// run all the same, and it is not held up by anything (SUP-11).
	var/came_home = aboard || order_unbought()
	if(shuttle.mode == SHUTTLE_IDLE && !SSshuttle.supply_blocked)
		var/docked_at = shuttle.getDockedId()
		if(docked_at == "cargo_home")
			// The body learns of it the way a person would: it is in the bay and sees the shuttle dock.
			// Anywhere else, it finds out when it next gets back.
			if(came_home && in_bay)
				order_arrived()
				return
			if(came_home)
				// Whatever happens to the shuttle now, the order has come.
				supply_run_landed_at = world.time
				addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
				return
			// Something that came on it has yet to be hauled off. Sent now, it would go back with it.
			if(full_crates_aboard())
				addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)
				return
			if(shuttle.canMove())
				SSshuttle.moveShuttle("cargo", "cargo_away", TRUE)
				supply_held_up_since = 0
			else if(!supply_held_up_since)
				supply_held_up_since = world.time
			else if(world.time - supply_held_up_since > CREW_NPC_SUPPLY_HELD_UP)
				// The shuttle will not fly with anyone aboard, or with cargo it is not allowed to carry.
				supply_run_active = FALSE
				pending_order = null
				action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle will not leave to fetch [ordered_words]: [what_bars_shuttle(shuttle) || "someone is standing aboard it, or something aboard is not allowed to travel"]. The order is off until it is clear.")
				return
		else if(docked_at == "cargo_away")
			SSshuttle.moveShuttle("cargo", "cargo_home", TRUE)
	addtimer(CALLBACK(src, PROC_REF(supply_run_step)), CREW_NPC_SUPPLY_CHECK)

/// Called when the shuttle has docked with the order. Finds the crate and tells the brain.
/datum/ai_controller/crew_npc/proc/order_arrived()
	supply_run_active = FALSE
	pending_order = null
	UnregisterSignal(SSshuttle, COMSIG_SUPPLY_SHUTTLE_BUY)
	var/list/known = orderable_crates()
	// Those of its orders the shuttle loaded without, still in the cart: the budget could not pay for them (SUP-11).
	var/list/unpaid = list()
	for(var/datum/supply_order/waiting as anything in SSshuttle.shopping_list)
		if(waiting.id in ordered_numbers)
			unpaid += waiting.id
	// The crates of the order are known by the numbers on their manifests. A workmate may have
	// hauled one off the shuttle already, so the bay and the lobby are looked in as well.
	var/list/aboard = crates_aboard()
	var/list/about = aboard.Copy()
	for(var/area/room as anything in freight_rooms())
		for(var/obj/structure/closet/crate/crate in room)
			about |= crate
	// Each crate found, with its number.
	var/list/found = list()
	var/list/unmatched = ordered_numbers.Copy()
	for(var/obj/structure/closet/crate/crate as anything in about)
		var/number = crew_npc_manifest_number(crate)
		if(isnull(number) || !(number in unmatched) || crew_npc_held_entry(crate))
			continue
		found[crate] = number
		unmatched -= number
	// A crate whose manifest has come off is known first by the number the shuttle writes on its name
	// ("... - #12"), and with none there by what it is: its name starts with the name of the pack one
	// of the numbers still unaccounted for was ordered as. A crate with its manifest on is someone
	// else's order, as the first pass has said.
	var/static/regex/name_number = regex(@"- #(\d+)")
	for(var/obj/structure/closet/crate/crate as anything in aboard)
		if(!length(unmatched))
			break
		if(found[crate] || crew_npc_held_entry(crate) || !isnull(crew_npc_manifest_number(crate)))
			continue
		if(name_number.Find(crate.name))
			var/named = text2num(name_number.group[1])
			if(named in unmatched)
				found[crate] = named
				unmatched -= named
			continue
		for(var/number in unmatched)
			var/datum/supply_pack/pack = SSshuttle.supply_packs[known[ordered_kinds["[number]"] || ordered_crate_name]]
			if(pack && findtext(crate.name, pack.crate_name) == 1)
				found[crate] = number
				unmatched -= number
				break
	ordered_numbers = list()
	var/list/not_come = unmatched - unpaid
	var/missing = length(not_come) ? " [capitalize(crew_npc_numbers_written(not_come))] did not come with it." : ""
	if(length(unpaid))
		var/list/unpaid_written = list()
		for(var/number in unpaid)
			unpaid_written += "#[number]"
		missing += " Order[length(unpaid) > 1 ? "s" : ""] [english_list(unpaid_written)] [length(unpaid) > 1 ? "are" : "is"] still in the supply cart: there was not enough money in the cargo budget to pay for [length(unpaid) > 1 ? "them" : "it"]."
	if(!length(found))
		if(length(unpaid) && !length(not_come))
			action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle came back without [ordered_words]: there was not enough money in the cargo budget to pay for it.", list("no_money" = TRUE))
			return
		action_result(CREW_TOOL_ORDER, FALSE, "The supply shuttle has docked, but you cannot see what you ordered ([ordered_words]) aboard.[missing]")
		return
	// From here they are held for collection, whoever hauls them off the shuttle.
	var/list/numbers = list()
	// What kind each of them is, in the same order as the numbers. Whoever ordered several kinds has to know which is which.
	var/list/kinds = list()
	for(var/obj/structure/closet/crate/crate as anything in found)
		var/datum/crew_npc_held_crate/entry = new
		entry.crate_ref = WEAKREF(crate)
		entry.number = found[crate]
		entry.for_name = order_for
		entry.what = ordered_kinds["[entry.number]"] || ordered_crate_name
		entry.post = post_place
		GLOB.crew_npc_held_crates += entry
		numbers += entry.number
		kinds += entry.what
	ordered_kinds = list()
	if(order_for)
		notices_owed += list(list("to" = order_for, "kind" = CREW_NOTICE_ARRIVED, "numbers" = numbers, "what" = length(unique_list(kinds)) == 1 ? kinds[1] : null, "kinds" = kinds, "via" = order_via, "ref" = order_ref))
	freight_changed()
	var/several = length(numbers) > 1
	// Whoever gave the order is who hears that it has come: the Quartermaster, face to face, or whoever it is for, by PDA.
	var/word = ""
	if(order_for)
		word = order_via ? " Tell [order_via], face to face, that it has come in." : " Send [order_for] a PDA message with the number[several ? "s" : ""]."
	action_result(CREW_TOOL_ORDER, TRUE, "The supply shuttle has docked with what you ordered[order_for ? " for [order_for]" : ""] ([ordered_words]): [crew_npc_numbers_written(numbers)]. [several ? "They are" : "It is"] held in the bay until someone comes to the counter with the number.[missing][word]", list("numbers" = numbers))

/// Returns a spot well inside a room, clear of its doors, to leave something at.
/datum/ai_controller/crew_npc/proc/room_middle(area/station/place)
	var/turf/here = get_turf(pawn)
	var/list/room_turfs = place.get_turfs_by_zlevel(here.z)
	if(!length(room_turfs))
		return null
	var/total_x = 0
	var/total_y = 0
	for(var/turf/room_turf as anything in room_turfs)
		total_x += room_turf.x
		total_y += room_turf.y
	var/turf/middle = locate(round(total_x / length(room_turfs)), round(total_y / length(room_turfs)), here.z)
	var/turf/best_turf
	var/best_distance = INFINITY
	// A small room may have nowhere two tiles from a door. One tile will do, and failing that anywhere to stand.
	for(var/clearance in list(2, 1, 0))
		for(var/turf/candidate as anything in room_turfs)
			if(!far_spot_safe(candidate) || candidate.is_blocked_turf() || (clearance && !crew_npc_clear_of_doors(candidate, clearance)))
				continue
			var/distance = get_dist(candidate, middle)
			if(distance < best_distance)
				best_distance = distance
				best_turf = candidate
		if(best_turf)
			break
	return best_turf

/**
 * Opens a crate where it stands, as anyone opening it would: what it holds lies on its own tile,
 * where people can pick it up, and the crate goes back to cargo to be sent away. Returns the names
 * of what was in it, or null if it would not open (locked to the body, welded, or a wooden crate
 * that wants a crowbar). When it is taken back it is shut where it is left, not here: shutting a
 * crate takes back in whatever lies on its tile.
 */
/datum/ai_controller/crew_npc/proc/tip_out(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	// What was in it, read before it is opened: once open, the tile is read, with whatever was lying there already.
	var/list/names = list()
	for(var/atom/movable/thing as anything in crew_npc_crate_holds(crate))
		names |= format_text(thing.name)
	if(crate.opened)
		return names
	// A large wooden crate is pried apart with a crowbar, not opened by hand (HAND-12).
	if(istype(crate, /obj/structure/closet/crate/large))
		return null
	// The open a click on it reaches, with its lock and weld checks.
	if(!crate.open(body))
		return null
	crate.crew_npc_unpacked = TRUE
	return names

/// Tool: fetch the crate the body unpacked and haul it back to cargo, to go back on the shuttle.
/datum/ai_controller/crew_npc/proc/tool_take_back()
	var/obj/structure/closet/crate/crate = crate_to_return?.resolve()
	if(QDELETED(crate))
		crate_to_return = null
		action_result(CREW_TOOL_TAKE_BACK, FALSE, "You have no empty crate to take back.")
		return
	begin_haul()
	start_errand(crate, CREW_TOOL_TAKE_BACK, format_text(crate.name))

/**
 * Takes hold of the emptied crate the body is standing by and sets off for cargo with it. Cargo
 * staff take it into the bay. Anyone else leaves it in the lobby, which is as far as they can
 * get: cargo puts it aboard the shuttle from there.
 */
/datum/ai_controller/crew_npc/proc/haul_crate_back(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/place_name
	var/turf/destination
	if(post_turf && works_in_cargo())
		place_name = post_place
		destination = room_middle(get_area(post_turf))
	else
		place_name = learn_place(/area/station/cargo/lobby)
		destination = middle_of(/area/station/cargo/lobby)
	if(isnull(place_name) || isnull(destination))
		return list(FALSE, "You do not know where to take the crate.")
	// Someone else has it in hand. Taking hold of it now would pull it out of their hands (MULTI-07).
	if(crate.pulledby && crate.pulledby != body)
		return list(FALSE, "[crate.pulledby.name] already has hold of the [format_text(crate.name)].")
	body.start_pulling(crate)
	if(body.pulling != crate)
		return list(FALSE, "You cannot get a grip on the [format_text(crate.name)].")
	hauled_name = "empty crate"
	hauled_ref = WEAKREF(crate)
	start_walk(destination, CREW_TOOL_TAKE_BACK, place_name, CREW_NPC_TRAVEL_TIMEOUT)
	wait_for_way(crate)
	return list(TRUE, null)

/// Called when the walk back with an emptied crate ends. Lets go of it and tells the brain.
/datum/ai_controller/crew_npc/proc/crate_taken_back(succeeded, reason)
	var/mob/living/carbon/human/body = pawn
	var/atom/movable/hauled = body.pulling
	body.stop_pulling()
	var/place = get_area_name(body, TRUE)
	// It goes back shut, as cargo takes no crate standing open. Shut here, where it is let go, and
	// not where it was unpacked: shutting a crate takes in whatever lies on its tile.
	if(succeeded && istype(hauled, /obj/structure/closet/crate))
		var/obj/structure/closet/crate/emptied = hauled
		emptied.crew_npc_unpacked = FALSE
		if(emptied.opened && !crew_npc_someone_on(get_turf(emptied)))
			emptied.close(body)
	if(succeeded && hauled)
		crate_to_return = null
		action_result(CREW_TOOL_TAKE_BACK, TRUE, "You bring the empty crate back to [place]. It can go back on the supply shuttle.", list("place" = place))
	else
		var/list/details = list("place" = place)
		var/blocker = in_the_way_report(crate_to_return?.resolve(), details)
		action_result(CREW_TOOL_TAKE_BACK, FALSE, "You could not get the empty crate back: [reason || "you lost your grip on it"].[blocker][gave_up_report(details)] You are in [place].", details)

/**
 * Returns the messes the body remembers in the rooms it works in, as room name -> what the messes are.
 * Keeping its own work area fit to work in is part of anyone's job, and for most that means telling a janitor.
 */
/datum/ai_controller/crew_npc/proc/work_area_messes()
	var/list/found = list()
	if(!length(work_area))
		return found
	for(var/key in remembered_messes)
		var/list/memory = remembered_messes[key]
		// The rest of its department counts as well: it may be the only one who ever sees in there.
		if(!(memory[2] in work_area) && !(memory[2] in look_in_rooms))
			continue
		var/datum/weakref/mess_ref = memory[1]
		var/obj/effect/decal/cleanable/mess = mess_ref.resolve()
		if(QDELETED(mess))
			continue
		if(isnull(found[memory[2]]))
			found[memory[2]] = list()
		if(length(found[memory[2]]) < CREW_NPC_MESSES_NAMED)
			found[memory[2]] |= format_text(mess.name)
	return found

/// Returns the names of the janitors listed on the body's PDA messenger, which shows everyone's job.
/datum/ai_controller/crew_npc/proc/janitors_on_pda()
	var/list/names = list()
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(isnull(own_messenger))
		return names
	for(var/messenger_ref in GLOB.pda_messengers)
		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
		if(candidate == own_messenger || isnull(candidate.computer) || !candidate.computer.saved_identification)
			continue
		// Only people aboard. PDAs lying in ruins and on other ships are on the list too, and nobody there is coming to a meeting.
		var/turf/where = get_turf(candidate.computer)
		if(isnull(where) || !is_station_level(where.z))
			continue
		if(findtext(candidate.computer.saved_job, "janitor"))
			names += candidate.computer.saved_identification
	return names

/// Returns everyone the body's PDA messenger lists, each as a name and the job the PDA shows for them.
/datum/ai_controller/crew_npc/proc/people_on_pda()
	var/list/people = list()
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(isnull(own_messenger))
		return people
	for(var/messenger_ref in GLOB.pda_messengers)
		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
		if(candidate == own_messenger || isnull(candidate.computer) || !candidate.computer.saved_identification)
			continue
		// Only people aboard. PDAs lying in ruins and on other ships are on the list too, and nobody there is coming to a meeting.
		var/turf/where = get_turf(candidate.computer)
		if(isnull(where) || !is_station_level(where.z))
			continue
		people += list(list("name" = candidate.computer.saved_identification, "job" = candidate.computer.saved_job))
	return people

/// Returns the messenger program on a PDA the body is carrying, or null.
/datum/ai_controller/crew_npc/proc/pda_messenger()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
		var/datum/computer_file/program/messenger/messenger = locate() in computer.stored_files
		if(messenger)
			return messenger
	return null

/// TRUE if a PDA is broken past working: it will not boot, as the power button finds.
/proc/crew_npc_pda_broken(obj/item/modular_computer/computer)
	return computer.atom_integrity <= computer.integrity_failure * computer.max_integrity

/**
 * Whether the body can send with its PDA just now, as a player could at its screen: the PDA whole,
 * switched on (pressing the power button if it is off, which draws on its cell from then on),
 * its screen read, and sending not turned off. Returns null if it can, else what is in the way,
 * in words. The first of the returned list is the words, the second TRUE if it is worth keeping
 * the message to send when the PDA works again (broken or flat, it may be mended or charged).
 */
/datum/ai_controller/crew_npc/proc/pda_unusable(datum/computer_file/program/messenger/own_messenger)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/modular_computer/computer = own_messenger?.computer
	if(isnull(computer))
		return list("You have no PDA to send a message with.", FALSE)
	if(crew_npc_pda_broken(computer))
		return list("Your PDA is broken: it will not boot up.", TRUE)
	if(!computer.enabled && !computer.turn_on(body, open_ui = FALSE))
		return list("Your PDA will not turn on: it has no charge.", TRUE)
	// The screen closes on anyone who cannot read it (computer_ui.dm).
	if(!body.can_read(computer, READING_CHECK_LITERACY, silent = TRUE))
		return list("You cannot make out the words on your PDA's screen.", FALSE)
	if(!own_messenger.sending_and_receiving)
		return list("Your PDA has sending turned off.", FALSE)
	return null

/**
 * Returns the room a message is a janitor call to, or null if it is not one. The window says so with
 * call_for, and only a room of the body's own post counts (MULTI-06): a mail notice or a lost-crate
 * notice to a janitor is no call, and used to hold the workmates back from calling one for ten minutes.
 */
/datum/ai_controller/crew_npc/proc/janitor_call_room(call_for)
	if(!istext(call_for) || !length(call_for) || isnull(post_place))
		return null
	// work_area holds the post and, for cargo staff, the Cargo Lobby, which leaves look_in_rooms for it.
	if(call_for == post_place || (call_for in work_area) || (call_for in look_in_rooms))
		return call_for
	return null

/**
 * Tool: send someone a PDA message.
 *
 * call_for, when the window sends one, is the room the message calls a janitor to (MULTI-06).
 */
/datum/ai_controller/crew_npc/proc/tool_message(person_name, text, call_for)
	var/mob/living/carbon/human/body = pawn
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(isnull(own_messenger))
		action_result(CREW_TOOL_MESSAGE, FALSE, "You have no PDA to send a message with.")
		return
	if(!istext(person_name) || !istext(text))
		action_result(CREW_TOOL_MESSAGE, FALSE, "You did not decide who to message or what to say.")
		return
	var/static/regex/line_breaks = regex(@"[\r\n\t]+", "g")
	text = trim(copytext_char(line_breaks.Replace(text, " "), 1, CREW_NPC_MESSAGE_MAX_LENGTH + 1))
	if(!length(text) || is_ic_filtered(text))
		action_result(CREW_TOOL_MESSAGE, FALSE, "You cannot think how to put the message.")
		return

	var/wanted = LOWER_TEXT(trim(person_name))
	var/datum/computer_file/program/messenger/target = messenger_named(wanted, own_messenger)
	// Having tried is enough. Someone with no PDA cannot be told this way, and trying again would not change that.
	for(var/list/notice as anything in notices_owed)
		if(LOWER_TEXT(notice["to"]) == wanted)
			notices_owed -= list(notice)
			break
	if(isnull(target))
		action_result(CREW_TOOL_MESSAGE, FALSE, "You cannot find that person on your PDA.")
		return
	var/to_name = target.computer.saved_identification
	var/unsent_key = "[LOWER_TEXT(to_name)]|[text]"
	// What a player at the screen would find first: a PDA that is broken, off and flat, that they
	// cannot read, or that has sending turned off. Only the first two are worth trying again.
	var/list/unusable = pda_unusable(own_messenger)
	if(unusable && !unusable[2])
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told by its brain to PDA [to_name], and could not: [unusable[1]] Not sent: [text]")
		action_result(CREW_TOOL_MESSAGE, FALSE, unusable[1])
		return
	// The screen's send, which refuses someone who has receiving turned off, and cleans the text.
	if(!unusable && !target.sending_and_receiving)
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told by its brain to PDA [to_name], who has receiving turned off. Not sent: [text]")
		action_result(CREW_TOOL_MESSAGE, FALSE, "[to_name] has their PDA set not to receive messages.")
		return
	if(unusable || !own_messenger.send_message(body, text, list(target)))
		// Kept, and tried again until it goes. In a communications blackout every message for five
		// minutes was lost for good, and the log said each had been sent: the Captain got no
		// reports, and nobody was called to a meeting.
		var/already_kept = !isnull(unsent_messages[unsent_key])
		if(!already_kept)
			unsent_messages[unsent_key] = list("to" = to_name, "text" = text, "at" = world.time, "call_for" = janitor_call_room(call_for))
			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told by its brain to PDA [to_name], and its PDA would not send it[unusable ? " ([unusable[1]])" : ""]. Kept to send again: [text]")
		if(!unsent_retry_due)
			unsent_retry_due = TRUE
			addtimer(CALLBACK(src, PROC_REF(resend_unsent)), CREW_NPC_UNSENT_RETRY)
		action_result(CREW_TOOL_MESSAGE, FALSE, "[unusable ? unusable[1] : "Your PDA would not send the message."] You will try it again when your PDA is working.")
		return
	// The same words, kept from a try that failed, have now gone.
	unsent_messages -= unsent_key
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told by its brain to PDA [to_name]: [text]")
	// A call to a janitor from a post, to one of its rooms, is that post's call for one there: the others
	// there need not send their own. Any other message to a janitor is not a call.
	var/call_room = janitor_call_room(call_for)
	if(call_room && findtext(target.computer.saved_job, "janitor"))
		note_janitor_called(call_room)
	action_result(CREW_TOOL_MESSAGE, TRUE, "You send [to_name] a PDA message.")

/// Returns the messenger of the PDA that goes by this name (lower case), other than the body's own, or null.
/datum/ai_controller/crew_npc/proc/messenger_named(wanted, datum/computer_file/program/messenger/own_messenger)
	for(var/messenger_ref in GLOB.pda_messengers)
		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
		if(candidate == own_messenger || isnull(candidate.computer))
			continue
		if(LOWER_TEXT(candidate.computer.saved_identification) == wanted)
			return candidate
	return null

/**
 * Tries again to send the PDA messages that would not go, oldest first, as anyone would press
 * send again. One that says "now" is dropped after a minute and a half, the rest after eight
 * minutes. While any are left it comes back to them.
 */
/datum/ai_controller/crew_npc/proc/resend_unsent()
	unsent_retry_due = FALSE
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body) || !length(unsent_messages))
		return
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(body.stat == DEAD || isnull(own_messenger))
		unsent_messages.Cut()
		return
	var/went = FALSE
	for(var/unsent_key in unsent_messages.Copy())
		var/list/kept = unsent_messages[unsent_key]
		var/text = kept["text"]
		var/to_name = kept["to"]
		var/datum/computer_file/program/messenger/target = messenger_named(LOWER_TEXT(to_name), own_messenger)
		if(isnull(target) || world.time - kept["at"] > (findtext(text, " now") ? CREW_NPC_UNSENT_NOW_KEPT : CREW_NPC_UNSENT_KEPT))
			unsent_messages -= unsent_key
			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) gave up on the PDA message to [to_name] that would not send: [text]")
			continue
		// Still not working: the rest will not go either. Nor while the PDA cannot be used, or the
		// one it is for has receiving turned off.
		if(pda_unusable(own_messenger) || !target.sending_and_receiving || !own_messenger.send_message(body, text, list(target)))
			break
		unsent_messages -= unsent_key
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) sent [to_name] the PDA message that would not go before: [text]")
		var/call_room = janitor_call_room(kept["call_for"])
		if(call_room && findtext(target.computer.saved_job, "janitor"))
			note_janitor_called(call_room)
		// One at a time: the PDA will not send two in the same moment. The next follows shortly.
		went = TRUE
		break
	if(length(unsent_messages))
		unsent_retry_due = TRUE
		addtimer(CALLBACK(src, PROC_REF(resend_unsent)), went ? 3 SECONDS : CREW_NPC_UNSENT_RETRY)

/// Listens for PDA messages arriving on the computers the body carries.
/datum/ai_controller/crew_npc/proc/start_pda_senses(mob/living/carbon/human/body)
	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
		RegisterSignal(computer, COMSIG_MODULAR_PDA_MESSAGE_RECEIVED, PROC_REF(on_pda_message))
		watched_pdas += WEAKREF(computer)

/// Stops listening for PDA messages.
/datum/ai_controller/crew_npc/proc/stop_pda_senses()
	for(var/datum/weakref/computer_ref as anything in watched_pdas)
		var/obj/item/modular_computer/computer = computer_ref.resolve()
		if(computer)
			UnregisterSignal(computer, COMSIG_MODULAR_PDA_MESSAGE_RECEIVED)
	watched_pdas = list()

/**
 * TRUE if the body has this on it: in a hand, a pocket or its bag, wherever the body itself is, a
 * locker or the pipes among them. Something loose beside it in the same locker is not on it.
 */
/datum/ai_controller/crew_npc/proc/crew_npc_carries(atom/movable/thing)
	return get_atom_on_turf(thing, /mob/living) == pawn

/// The body's PDA has received a message. It reads it if the PDA is still on it.
/datum/ai_controller/crew_npc/proc/on_pda_message(obj/item/modular_computer/computer, datum/signal/subspace/messaging/tablet_message/signal, sender_job, sender_name)
	SIGNAL_HANDLER
	if(!crew_npc_carries(computer))
		return
	// Someone who cannot read is not shown the message at all (receive_message in the messenger).
	var/mob/living/carbon/human/body = pawn
	if(!body.is_literate())
		return
	var/message = html_decode("[signal.data["message"]]")
	var/sender = "[sender_name || "Someone"]"
	// A stunned body still sees its PDA buzz. One out cold misses it, and the message sits on the PDA
	// until it comes to and reads it (CORE-02). A dead body, or one a player has, keeps nothing.
	if(!can_perceive())
		if(!QDELETED(body) && body.stat != DEAD && !body.client)
			keep_missed_pda(computer, sender, "[sender_job]", message)
		return
	emit_sense(CREW_SENSE_PDA_MESSAGE, "Your PDA buzzes with a message from [sender][sender_job ? ", [sender_job]" : ""]: \"[message]\"", list(
		"speaker" = sender,
		"job" = "[sender_job]",
		"message" = message,
	))

#undef CREW_NPC_SUPPLY_LANDED_WAIT
