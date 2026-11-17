/**
 * Senses for crew NPCs: everything here describes only what the NPC's own body could perceive.
 *
 * Each sense event is a short record that is kept on the controller and passed to the owner's brain window.
 */

/// Starts watching and listening through the pawn. Called when the controller takes over a body.
/datum/ai_controller/crew_npc/proc/start_senses(mob/living/carbon/human/body)
	RegisterSignal(body, COMSIG_MOVABLE_PRE_HEAR, PROC_REF(on_pre_hear))
	start_pda_senses(body)
	look_timer = addtimer(CALLBACK(src, PROC_REF(look_around)), CREW_NPC_LOOK_INTERVAL, TIMER_LOOP | TIMER_STOPPABLE)

/// Stops watching and listening. Called when the controller lets go of its body.
/datum/ai_controller/crew_npc/proc/stop_senses(mob/living/carbon/human/body)
	UnregisterSignal(body, COMSIG_MOVABLE_PRE_HEAR)
	stop_pda_senses()
	deltimer(look_timer)
	look_timer = null

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
		for(var/obj/machinery/door/door in in_sight)
			if(!door.density && (istype(door, /obj/machinery/door/airlock) || istype(door, /obj/machinery/door/window)))
				open_door_in_view = TRUE
				break
	cleanable_messes = list()
	for(var/obj/effect/decal/cleanable/mess as anything in messes_to_clean(in_sight))
		cleanable_messes |= format_text(mess.name)
	people_in_view = list()
	for(var/mob/living/carbon/human/person in in_sight)
		// For crew with a post, whether each person is inside it: that is who can be let out, and who would have to be let in.
		people_in_view += list(list("handle" = handle_for(person), "name" = person.name, "job" = person.get_assignment(if_no_id = "", if_no_job = ""), "in_post" = !isnull(post_turf) && get_area(person) == get_area(post_turf)))
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
		current_place = place
		looks_in_place = 0
		// It has got somewhere else, so it was not shut in, or is not any more.
		ways_out_failed = 0
		shut_in = FALSE
		let_out_until = 0
		if(let_into_place && place != let_into_place)
			let_into_place = null
			let_in_by = null
		if(isnull(visited_places[place]))
			visited_places[place] = list(here.x, here.y, here.z)
		return
	looks_in_place++
	// A few seconds in, the body is properly inside the room, not standing in its doorway.
	// The spot kept for the body's post is the one it works at, so that one stays as it is.
	if(looks_in_place == 4 && place != post_place)
		visited_places[place] = list(here.x, here.y, here.z)

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
	// Only tie the voice to a person the body has just been looking at.
	if(ishuman(speaker) && recently_saw(speaker))
		details["handle"] = handle_for(speaker)

	emit_sense(CREW_SENSE_SPEECH_HEARD, "[speaker_name] [whispered ? "whispers" : "says"]: \"[message]\"", details)
