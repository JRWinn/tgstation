/**
 * What the brain window shows that no one NPC is told: the colour of each body's ID card, and
 * which of the station's locked rooms the owner's crew have a right to be in.
 *
 * None of this goes to an LLM. It is for whoever is watching the window.
 */

/// How long a link's list of locked rooms stands before who is allowed into each is looked at again.
#define CREW_BRAIN_ROOMS_KEPT (30 SECONDS)

/**
 * The station's rooms that are locked to the crew at large, each as
 * list("name" = its name, "department" = its department's key or null, "doors" = weakrefs to its airlocks).
 * Null until it has been worked out, which is done once a round.
 */
GLOBAL_LIST(crew_npc_closed_rooms)
/// TRUE once working that list out has begun, so that it is not begun twice.
GLOBAL_VAR_INIT(crew_npc_closed_rooms_begun, FALSE)

/// Returns the body's own ID card: the one it wears, or failing that one it has in its hand. Null if it has none.
/proc/crew_npc_own_card(mob/living/carbon/human/body)
	return body.get_idcard(hand_first = FALSE) || body.get_idcard(hand_first = TRUE)

/**
 * Returns the colour of the department stripe on the body's own ID card, as "#RRGGBB", or null if
 * it has no card or the card has no trim. It is the colour as the card shows it, so a card that has
 * been painted over, or made to look like another, gives the colour it was given.
 */
/proc/crew_npc_card_color(mob/living/carbon/human/body)
	var/obj/item/card/id/card = crew_npc_own_card(body)
	if(isnull(card))
		return null
	var/obj/item/card/id/advanced/painted = card
	if(istype(painted) && painted.department_color_override)
		return painted.department_color_override
	var/datum/id_trim/trim = card.trim
	if(isnull(trim))
		return null
	// A head's card is command's colour, with its own department's as the stripe under it. In the
	// window a head goes by its department, as its staff do: the owner asked for the groups to be
	// told apart, "like security red", and a Head of Security in command blue is not that.
	if(trim.department_color == COLOR_COMMAND_BLUE && trim.subdepartment_color && trim.subdepartment_color != COLOR_COMMAND_BLUE)
		return trim.subdepartment_color
	return trim.department_color

/**
 * Returns which department a room belongs to, going by the kind of area it is, as a key the brain
 * window has a colour for. Null for a room that is no one department's.
 */
/proc/crew_npc_room_department(area/room)
	if(istype(room, /area/station/security))
		return "security"
	if(istype(room, /area/station/cargo))
		return "cargo"
	if(istype(room, /area/station/engineering))
		return "engineering"
	if(istype(room, /area/station/service))
		return "service"
	if(istype(room, /area/station/medical))
		return "medical"
	if(istype(room, /area/station/science))
		return "science"
	// The AI's rooms are command's to go into, and nobody else's.
	if(istype(room, /area/station/command) || istype(room, /area/station/ai))
		return "command"
	return null

/**
 * Returns the station's rooms that are locked to the crew at large, or null while they are still
 * being worked out. Finding a room's doors walks every tile of it, so the whole station is done
 * once, a room at a time, without holding the server up, and the answer is kept for the round.
 */
/proc/crew_npc_closed_rooms()
	if(!GLOB.crew_npc_closed_rooms_begun)
		GLOB.crew_npc_closed_rooms_begun = TRUE
		INVOKE_ASYNC(GLOBAL_PROC, GLOBAL_PROC_REF(crew_npc_find_closed_rooms))
	return GLOB.crew_npc_closed_rooms

/// Works out which of the station's rooms are locked to the crew at large. Sleeps between rooms when the server is busy.
/proc/crew_npc_find_closed_rooms()
	var/list/found = list()
	var/list/station_levels = SSmapping.levels_by_trait(ZTRAIT_STATION)
	var/list/places = crew_npc_station_places()
	for(var/place_name in places)
		var/area/station/room = places[place_name]
		// Hallways and maintenance tunnels are nobody's to keep anyone out of, whatever doors they have.
		if(istype(room, /area/station/hallway) || istype(room, /area/station/maintenance))
			continue
		var/list/door_refs = list()
		var/open = FALSE
		for(var/level in station_levels)
			var/list/doors = crew_npc_doors_of(room, level)
			// A floor of the room with no door of its own is got to from another floor of it.
			if(!length(doors))
				continue
			if(!crew_npc_room_is_closed(room, level))
				open = TRUE
				break
			for(var/obj/machinery/door/airlock/door as anything in doors)
				door_refs += WEAKREF(door)
		if(!open && length(door_refs))
			found += list(list(
				"name" = place_name,
				"department" = crew_npc_room_department(room),
				"doors" = door_refs,
			))
		CHECK_TICK
	GLOB.crew_npc_closed_rooms = found

/datum/crew_brain_link
	/// The locked rooms its crew are allowed into, as last worked out for the window. Null until it has been.
	var/list/room_list
	/// world.time that list was worked out.
	var/room_list_at = 0
	/// The ids of the NPCs it was worked out for. A crew that has changed since is worked out afresh.
	var/room_list_crew

/**
 * Returns the rooms that are locked to the crew at large and that at least one of this owner's
 * NPCs is allowed into, each as list("name", "department", "allowed" = the names of those NPCs).
 * Null while the station's locked rooms are still being worked out.
 *
 * Allowed means its own ID card opens a door of the room. The window asks many times a second, so
 * the answer is kept, and looked at again when the crew changes or it is half a minute old: an ID
 * may be given more access, or taken away.
 */
/datum/crew_brain_link/proc/locked_rooms()
	var/list/mob/living/carbon/human/bodies = list()
	var/list/ids = list()
	for(var/datum/ai_controller/crew_npc/npc as anything in npcs)
		var/mob/living/carbon/human/body = npc.pawn
		if(QDELETED(body))
			continue
		bodies += body
		ids += npc.npc_id
	var/crew = ids.Join(",")
	if(!isnull(room_list) && crew == room_list_crew && world.time - room_list_at < CREW_BRAIN_ROOMS_KEPT)
		return room_list
	var/list/closed = crew_npc_closed_rooms()
	if(isnull(closed))
		return null
	// Each body's card, in the same order as the bodies. A body with no card is allowed in nowhere.
	var/list/cards = new /list(length(bodies))
	for(var/index in 1 to length(bodies))
		cards[index] = crew_npc_own_card(bodies[index])
	var/list/rooms = list()
	for(var/list/room as anything in closed)
		var/list/allowed = list()
		for(var/index in 1 to length(bodies))
			var/obj/item/card/id/card = cards[index]
			if(isnull(card))
				continue
			for(var/datum/weakref/door_ref as anything in room["doors"])
				var/obj/machinery/door/airlock/door = door_ref.resolve()
				if(!QDELETED(door) && door.check_access(card))
					var/mob/living/carbon/human/body = bodies[index]
					allowed += body.real_name
					break
		if(length(allowed))
			rooms += list(list(
				"name" = room["name"],
				"department" = room["department"],
				"allowed" = allowed,
			))
	room_list = rooms
	room_list_at = world.time
	room_list_crew = crew
	return rooms

#undef CREW_BRAIN_ROOMS_KEPT
