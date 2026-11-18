/**
 * Senses for crew NPCs: everything here describes only what the NPC's own body could perceive.
 *
 * Each sense event is a short record that is kept on the controller and passed to the owner's brain window.
 */

/// Starts watching and listening through the pawn. Called when the controller takes over a body.
/datum/ai_controller/crew_npc/proc/start_senses(mob/living/carbon/human/body)
	RegisterSignal(body, COMSIG_MOVABLE_PRE_HEAR, PROC_REF(on_pre_hear))
	RegisterSignal(body, COMSIG_MOVABLE_MOVED, PROC_REF(mind_its_step))
	start_pda_senses(body)
	look_timer = addtimer(CALLBACK(src, PROC_REF(look_around)), CREW_NPC_LOOK_INTERVAL, TIMER_LOOP | TIMER_STOPPABLE)

/// Stops watching and listening. Called when the controller lets go of its body.
/datum/ai_controller/crew_npc/proc/stop_senses(mob/living/carbon/human/body)
	UnregisterSignal(body, list(COMSIG_MOVABLE_PRE_HEAR, COMSIG_MOVABLE_MOVED))
	stop_pda_senses()
	deltimer(look_timer)
	look_timer = null

/// TRUE if a runner stepping onto this tile would slip: the floor is wet, or something lying on it is slippery.
/proc/crew_npc_slippery_turf(turf/open/spot)
	if(!isopenturf(spot))
		return FALSE
	if(spot.GetComponent(/datum/component/wet_floor))
		return TRUE
	for(var/atom/movable/thing as anything in spot)
		if(thing.GetComponent(/datum/component/slippery))
			return TRUE
	return FALSE

/**
 * Walks, not runs, wherever its next step may be onto a tile that would slip a runner, and runs
 * again once it is clear. This is a player holding the walk key past a wet floor, and nothing more:
 * what cannot be walked over safely still slips it. A body that runs over oil by a mail chute is
 * thrown down the chute and comes out behind doors it cannot open.
 */
/datum/ai_controller/crew_npc/proc/mind_its_step(mob/living/carbon/human/body)
	SIGNAL_HANDLER
	if(!isturf(body.loc))
		return
	var/careful = FALSE
	// Shoes that grip need no care taken.
	if(!HAS_TRAIT(body, TRAIT_NO_SLIP_WATER) && !HAS_TRAIT(body, TRAIT_NO_SLIP_ALL))
		for(var/turf/open/spot in range(1, body))
			if(crew_npc_slippery_turf(spot))
				careful = TRUE
				break
	body.set_move_intent(careful ? MOVE_INTENT_WALK : MOVE_INTENT_RUN)

/// Records a sense event and tells the owner's brain window about it.
/datum/ai_controller/crew_npc/proc/emit_sense(kind, text, list/details)
	var/list/event = list(
		"seq" = next_event_seq++,
		"time" = time2text(world.timeofday, "hh:mm:ss"),
		"at" = world.time,
		"kind" = kind,
		"text" = text,
		"details" = details,
	)
	sense_events += list(event)
	if(length(sense_events) > CREW_NPC_EVENT_HISTORY)
		sense_events.Cut(1, 2)
	brain_link?.on_sense_event(src)

/// TRUE if the body is in a state to perceive anything at all.
/datum/ai_controller/crew_npc/proc/can_sense()
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body) || ai_status == AI_STATUS_OFF)
		return FALSE
	return body.stat != DEAD && !IS_UNCONSCIOUS(body)

/// The key a person is remembered under. A new face on the same body counts as someone new.
/datum/ai_controller/crew_npc/proc/person_key(mob/living/carbon/human/person)
	return "[REF(person)]|[person.name]"

/// TRUE if this person was in view within the last few seconds.
/datum/ai_controller/crew_npc/proc/recently_saw(mob/living/carbon/human/person)
	var/last_seen = last_seen_at[person_key(person)]
	return !isnull(last_seen) && world.time - last_seen <= CREW_NPC_SIGHT_MEMORY

/// Returns the handle the brain uses to point at this person, making one if they are new to us.
/datum/ai_controller/crew_npc/proc/handle_for(mob/living/carbon/human/person)
	var/key = person_key(person)
	var/handle = person_handles[key]
	if(isnull(handle))
		handle = "p[length(person_handles) + 1]"
		person_handles[key] = handle
		handle_people[handle] = WEAKREF(person)
	return handle

/// Checks who is in view and emits an event for each person who was not in view a moment ago.
/datum/ai_controller/crew_npc/proc/look_around()
	var/mob/living/carbon/human/body = pawn
	if(!can_sense() || body.is_blind())
		people_in_view = list()
		things_in_view = list()
		storage_here = 0
		cleanable_messes = list()
		grenade_messes = 0
		return
	// Not standing on a floor: in a disposal pipe, a locker, a crate. It sees nothing from in there,
	// and makes nothing of where it is until it is out again.
	if(!isturf(body.loc))
		people_in_view = list()
		things_in_view = list()
		storage_here = 0
		cleanable_messes = list()
		grenade_messes = 0
		off_floor_in ||= istype(body.loc, /obj/structure/disposalholder) ? "pipes" : format_text(body.loc.name)
		return
	if(off_floor_in)
		// Out again, and it knows how it got here: not by any door, so there is none to go back to.
		var/came_out_in = get_area_name(body, TRUE)
		emit_sense(CREW_SENSE_KNOWLEDGE, off_floor_in == "pipes" ? "You were carried through the disposal pipes and came out in [came_out_in]." : "You are out of the [off_floor_in] you were shut inside, and are in [came_out_in].", list("place" = came_out_in))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) came out of [off_floor_in == "pipes" ? "the disposal pipes" : "the [off_floor_in]"] at [AREACOORD(body)].")
		off_floor_in = null
		current_place = null
		forget_trail()

	drop_disguise()
	note_place(body)
	var/list/in_sight = oview(CREW_NPC_VISION_RANGE, body)
	things_in_view = notable_things(in_sight)
	sink_in_view = !!(locate(/obj/structure/sink) in in_sight)
	var/list/grenade_spot = held_grenade() ? best_grenade_spot(in_sight) : null
	grenade_messes = grenade_spot ? grenade_spot[2] : 0
	storage_here = length(storage_to_search(in_sight))
	remember_messes(in_sight)
	// Shut in, the thing to watch for is a door standing open: that is the moment to go.
	open_door_in_view = FALSE
	if(is_shut_in())
		var/area/room = get_area(body)
		for(var/obj/machinery/door/door in in_sight)
			if(door.density || !(istype(door, /obj/machinery/door/airlock) || istype(door, /obj/machinery/door/window)))
				continue
			// Only a door on the edge of the room is a way out of it. One inside it leads nowhere.
			if(crew_npc_leads_out(door, room))
				open_door_in_view = TRUE
				break
	cleanable_messes = list()
	for(var/obj/effect/decal/cleanable/mess as anything in messes_to_clean(in_sight))
		cleanable_messes |= format_text(mess.name)
	people_in_view = list()
	for(var/mob/living/carbon/human/person in in_sight)
		// For crew with a post, whether each person is inside it: that is who can be let out, and who would have to be let in.
		// And whether they have a right to be in it, and whether they outrank the body: that is who may be asked their business, and who may be walked out.
		people_in_view += list(list("handle" = handle_for(person), "name" = person.name, "job" = person.get_assignment(if_no_id = "", if_no_job = ""), "place" = get_area_name(person, TRUE), "distance" = get_dist(body, person), "in_post" = !isnull(post_turf) && get_area(person) == get_area(post_turf), "belongs" = !isnull(post_turf) && belongs_in_post(person), "command" = crew_npc_is_command(person), "superior" = answers_to(person)))
		var/already_in_view = recently_saw(person)
		last_seen_at[person_key(person)] = world.time
		if(already_in_view)
			continue

		var/job = person.get_assignment(if_no_id = "", if_no_job = "")
		var/distance = get_dist(body, person)
		var/lying = person.body_position == LYING_DOWN
		var/text = "[person.name][job ? ", [job]," : ""] comes into view [distance] tile\s away[lying ? ", lying on the floor" : ""]."
		emit_sense(CREW_SENSE_PERSON_IN_VIEW, text, list(
			"handle" = handle_for(person),
			"name" = person.name,
			"job" = job,
			"distance" = distance,
			"lying" = lying,
		))

	for(var/key in last_seen_at)
		if(world.time - last_seen_at[key] > CREW_NPC_SIGHT_MEMORY)
			last_seen_at -= key

/**
 * TRUE if the body has tried to leave the room it is in, failed, and then found no way to anywhere it knows.
 * It may be behind a door it has no access to open. It cannot tell why, only that it cannot get out.
 */
/datum/ai_controller/crew_npc/proc/is_shut_in()
	return shut_in

/// What sort of place the body is standing in, as anyone could tell by looking: a hallway, a maintenance tunnel or a room.
/datum/ai_controller/crew_npc/proc/place_kind()
	var/area/here = get_area(pawn)
	if(istype(here, /area/station/hallway))
		return "hallway"
	if(istype(here, /area/station/maintenance))
		return "maintenance"
	return "room"

/// Remembers the room the body is standing in, and a spot inside it to walk back to later.
/datum/ai_controller/crew_npc/proc/note_place(mob/living/carbon/human/body)
	var/turf/here = get_turf(body)
	var/place = get_area_name(here, TRUE)
	if(isnull(place))
		return
	if(place != current_place)
		var/came_from = current_place
		current_place = place
		looks_in_place = 0
		// Whether it has any right of its own to be in here: worked out once, on the way in.
		out_of_bounds = locked_out_of(get_area(here))
		// It has got somewhere else, so it was not shut in, or is not any more.
		ways_out_failed = 0
		shut_in = FALSE
		let_out_until = 0
		// How it came is kept, room by room, for when it wants out again.
		follow_trail(came_from, place)
		if(let_into_place && place != let_into_place)
			let_into_place = null
			let_in_by = null
			let_in_door = null
		// Through the door it was waiting at, it is waiting at it no longer.
		if(wanted_door && (place == wanted_door_place) != wanted_door_leaving)
			wanted_door = null
		// The first tile it stands on in a room is as often as not the doorway. The spot it keeps to
		// walk back to is the nearest one clear of the door, if there is one.
		if(isnull(visited_places[place]))
			var/turf/inside = spot_inside(here) || here
			visited_places[place] = list(inside.x, inside.y, inside.z)
		return
	looks_in_place++
	// A few seconds in, the body is likely to be properly inside the room, and where it stands is a
	// better spot to come back to. Not if it is still by a door, though.
	// The spot kept for the body's post is the one it works at, so that one stays as it is. So does
	// the one a head holds its meetings at, which was picked for being well inside the room.
	if(looks_in_place == 4 && place != post_place && place != meeting_place && crew_npc_clear_of_doors(here))
		visited_places[place] = list(here.x, here.y, here.z)

/**
 * Puts down anything in the body's hands that hides who it is: a potted plant, say, which a body
 * catches when the bar's monkey throws one at it. It never picks such a thing up for its work,
 * and while it holds one nobody knows it: its own staff stand waiting for a head who is there.
 */
/datum/ai_controller/crew_npc/proc/drop_disguise()
	var/mob/living/carbon/human/body = pawn
	if(!HAS_TRAIT(body, TRAIT_UNKNOWN_APPEARANCE))
		return
	for(var/obj/item/held in body.held_items)
		if(held.GetComponent(/datum/component/tactical))
			body.dropItemToGround(held)

/**
 * Picks out the things in sight that a person would notice, grouped by name.
 *
 * Returns a list of lists with name, count and kind, most notable first.
 * Fixtures found in every room (lights, wiring, doors, tables, chairs) are left out.
 */
/datum/ai_controller/crew_npc/proc/notable_things(list/in_sight)
	var/static/list/ignored_types = typecacheof(list(
		/obj/item/kirbyplants,
		/obj/item/radio/intercom,
		/obj/item/wallframe,
		/obj/machinery/airalarm,
		/obj/machinery/atmospherics,
		/obj/machinery/barsign,
		/obj/machinery/button,
		/obj/machinery/camera,
		/obj/machinery/conveyor,
		/obj/machinery/digital_clock,
		/obj/machinery/door,
		/obj/machinery/duct,
		/obj/machinery/firealarm,
		/obj/machinery/flasher,
		/obj/machinery/incident_display,
		/obj/machinery/light,
		/obj/machinery/light_switch,
		/obj/machinery/navbeacon,
		/obj/machinery/power/apc,
		/obj/machinery/power/terminal,
		/obj/machinery/sparker,
		/obj/machinery/status_display,
		/obj/structure/cable,
		/obj/structure/chair,
		/obj/structure/curtain,
		/obj/structure/disposaloutlet,
		/obj/structure/disposalpipe,
		/obj/structure/door_assembly,
		/obj/structure/extinguisher_cabinet,
		/obj/structure/falsewall,
		/obj/structure/firelock_frame,
		/obj/structure/fluff,
		/obj/structure/girder,
		/obj/structure/grille,
		/obj/structure/lattice,
		/obj/structure/light_construct,
		/obj/structure/mirror,
		/obj/structure/noticeboard,
		/obj/structure/plasticflaps,
		/obj/structure/railing,
		/obj/structure/sign,
		/obj/structure/table,
		/obj/structure/transit_tube,
		/obj/structure/window,
	))
	// Lower numbers are listed first, so they survive the cap.
	var/static/list/kind_order = list("mess" = 1, "item" = 2, "vehicle" = 3, "structure" = 4, "machine" = 5)

	var/list/counts = list()
	var/list/kinds = list()
	for(var/obj/thing in in_sight)
		var/kind
		if(iseffect(thing))
			if(!istype(thing, /obj/effect/decal/cleanable))
				continue
			kind = "mess"
		else if(ignored_types[thing.type])
			continue
		else if(isitem(thing))
			kind = "item"
		else if(isvehicle(thing))
			kind = "vehicle"
		else if(isstructure(thing))
			kind = "structure"
		else if(ismachinery(thing))
			kind = "machine"
		else
			continue
		var/thing_name = format_text(thing.name)
		counts[thing_name]++
		kinds[thing_name] = kind

	var/list/sorted_names = list()
	for(var/wanted_kind in kind_order)
		for(var/thing_name in counts)
			if(kinds[thing_name] == wanted_kind)
				sorted_names += thing_name

	var/list/things = list()
	for(var/thing_name in sorted_names)
		things += list(list("name" = thing_name, "count" = counts[thing_name], "kind" = kinds[thing_name]))
		if(length(things) >= CREW_NPC_THINGS_MAX)
			break
	return things

/**
 * Hears speech aimed at the body.
 *
 * Bodies without a client never reach COMSIG_MOVABLE_HEAR, so this listens one step earlier and
 * applies the same deafness, language and distance rules a player's body would get.
 */
/datum/ai_controller/crew_npc/proc/on_pre_hear(mob/living/carbon/human/body, list/hearing_args)
	SIGNAL_HANDLER

	var/atom/movable/speaker = hearing_args[HEARING_SPEAKER]
	if(speaker == body || !can_sense() || HAS_TRAIT(body, TRAIT_DEAF))
		return
	// Radio is a separate sense that comes later.
	if(hearing_args[HEARING_RADIO_FREQ])
		return
	var/list/message_mods = hearing_args[HEARING_MESSAGE_MODE] || list()
	// Custom emotes are not speech.
	if(message_mods[MODE_CUSTOM_SAY_ERASE_INPUT])
		return

	var/message = body.translate_language(speaker, hearing_args[HEARING_LANGUAGE], hearing_args[HEARING_RAW_MESSAGE], hearing_args[HEARING_SPANS], message_mods)
	var/message_range = hearing_args[HEARING_RANGE]
	if(message_range != INFINITY && !HAS_TRAIT(body, TRAIT_GOOD_HEARING))
		var/outside_dist = max(get_dist(speaker, body) - message_range, 0)
		if(outside_dist > body.eavesdrop_range)
			return
		if(outside_dist > 0)
			message = stars(message)
	message = html_decode(message)

	var/speaker_name = message_mods[MODE_SPEAKER_NAME_OVERRIDE] || speaker.get_voice()
	var/whispered = !!message_mods[WHISPER_MODE]
	if(isliving(speaker))
		last_heard_speaker = speaker_name
	var/list/details = list(
		"speaker" = speaker_name,
		"message" = message,
		"whispered" = whispered,
		// A body can tell a living voice from a machine's.
		"source" = isliving(speaker) ? "person" : "device",
		"distance" = get_dist(body, speaker),
	)
	// Whether the speaker is turned towards the body. People face who they are talking to, and with
	// several in the room and no name used, that is the best sign of who was meant.
	if(isliving(speaker))
		var/mob/living/talker = speaker
		details["facing"] = !!(get_dir(talker, body) & talker.dir)
	// Only tie the voice to a person the body has just been looking at.
	if(ishuman(speaker) && recently_saw(speaker))
		details["handle"] = handle_for(speaker)

	emit_sense(CREW_SENSE_SPEECH_HEARD, "[speaker_name] [whispered ? "whispers" : "says"]: \"[message]\"", details)
