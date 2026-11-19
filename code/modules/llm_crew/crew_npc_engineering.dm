/**
 * The engineering staff: the Chief Engineer and its station engineers.
 *
 * What the server knows for them: who they are, the rooms they arrive knowing, what they are
 * told of the machines they work, and what the engine monitor on a PDA reads. The work itself,
 * going to a machine and working it, is in crew_npc_machines.dm. What they do with it, and what
 * they say to each other, is the brain window's: jobs/engineer.ts and jobs/chiefengineer.ts.
 */

/// TRUE if the body is the Chief Engineer, who heads the engineering staff.
/datum/ai_controller/crew_npc/proc/is_chief_engineer()
	return !!findtext(job_title(), "Chief Engineer")

/// TRUE if the body is engineering staff who work the engine: the Chief Engineer, or a station engineer.
/datum/ai_controller/crew_npc/proc/works_in_engineering()
	return !!findtext(job_title(), "Engineer")

/**
 * Gives engineering staff what they arrive knowing: for the Chief Engineer its office and the
 * room its engineers work from, for an engineer its post, and for both the way to the engine
 * room. The names of those rooms are added to `known`. Returns the sentences that tell the brain so.
 */
/datum/ai_controller/crew_npc/proc/learn_engineering_places(list/known)
	var/mob/living/carbon/human/body = pawn
	var/list/sentences = list()
	if(is_chief_engineer())
		office_place = learn_place(/area/station/command/heads_quarters/ce)
		if(office_place)
			known += office_place
			sentences += "You are the station's Chief Engineer, the head of the engineering staff. Your office is the [office_place], and you know the way there."
		staff_post_place = learn_place(/area/station/engineering/main, well_inside = TRUE)
		if(staff_post_place)
			known += staff_post_place
			sentences += "Your engineers work from the [staff_post_place], and you know the way there. The station's batteries are there too."
	else
		// An engineer's post is the middle of Engineering: where its head calls the staff together.
		var/area/station/post_area = GLOB.areas_by_type[/area/station/engineering/main]
		var/turf/spot = post_area ? (middle_of(/area/station/engineering/main) || safe_spot_in(post_area, get_turf(body))) : null
		if(spot)
			post_place = format_text(post_area.name)
			post_turf = spot
			visited_places[post_place] = list(spot.x, spot.y, spot.z)
			known += post_place
			learn_department(post_area)
			sentences += "You are a [job_title()]. Your post is the [post_place], and you know the way there."
		// Where it would knock for the head it answers to.
		for(var/area/station/command/heads_quarters/ce/office in GLOB.areas)
			if(length(office.get_turfs_by_zlevel(body.z)))
				head_office_place = format_text(office.name)
				break
	// The engine room is worked in, not looked in on: once the engine is lit it is no place to stand about.
	for(var/area/station/engineering/supermatter/engine_room in GLOB.areas)
		var/room_name = format_text(engine_room.name)
		look_in_rooms -= room_name
	var/engine_room_name = learn_place(/area/station/engineering/supermatter/room)
	if(engine_room_name)
		known += engine_room_name
		sentences += "The station's engine is in the [engine_room_name], and you know the way there."
	return sentences

/**
 * Returns what engineering staff know of the machines they work, for the brain window, or null
 * for anyone else.
 *
 * They arrive knowing each machine by name, as the crew know every room by name. How a machine
 * is set they know only by looking: `seen` is filled in for the ones in the body's view now, and
 * is null for the rest. The engine itself is known only from the PDA: see engine_reading().
 */
/datum/ai_controller/crew_npc/proc/engineering_state()
	if(!works_in_engineering())
		return null
	var/mob/living/carbon/human/body = pawn
	var/list/machines = list()
	var/can_look = can_sense() && isturf(body.loc)
	// Worked out only if some machine is near enough to be worth looking for.
	var/list/in_sight
	for(var/list/entry as anything in crew_npc_engine_machines())
		var/datum/weakref/machine_ref = entry["ref"]
		var/obj/machinery/machine = machine_ref?.resolve()
		if(isnull(machine))
			continue
		var/list/seen
		if(can_look && machine.z == body.z && get_dist(body, machine) <= CREW_NPC_VISION_RANGE)
			in_sight ||= view(CREW_NPC_VISION_RANGE, body)
			if(machine in in_sight)
				seen = crew_npc_machine_state(machine, entry["kind"])
		machines += list(list(
			"id" = entry["id"],
			"name" = entry["name"],
			"kind" = entry["kind"],
			"nth" = entry["nth"],
			"place" = entry["place"],
			"seen" = seen,
		))
	return list("machines" = machines, "reading" = engine_reading())

/**
 * What the engine monitor on the body's PDA reads of the station's engine: how whole the
 * crystal is, and the energy in it. Null if it has no reading.
 *
 * It knows the engine the way a player away from the engine room does: from the monitor
 * program, and that program needs the station's network. With no PDA, no such program on it, or
 * the network down, as it is when the power has gone, it knows nothing.
 */
/datum/ai_controller/crew_npc/proc/engine_reading()
	var/mob/living/carbon/human/body = pawn
	var/obj/machinery/power/supermatter_crystal/crystal = GLOB.main_supermatter_engine
	if(QDELETED(crystal))
		return null
	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
		if(!(locate(/datum/computer_file/program/supermatter_monitor) in computer.stored_files))
			continue
		// The monitor is read on the screen, as a player does: the PDA whole, switched on and read.
		if(!pda_screen_usable(computer))
			continue
		if(!computer.get_ntnet_status())
			continue
		return list("integrity" = round(crystal.get_integrity_percent(), 0.1), "energy" = round(crystal.internal_energy))
	return null

/**
 * TRUE if the body could read a PDA's screen just now without pressing anything: the PDA not
 * broken past booting, and the body able to read. No side effect, so it is safe on every update of
 * the window. A PDA that is off but whole counts: whether it has the charge to turn on is found when
 * it is used (see pda_screen_usable()).
 */
/datum/ai_controller/crew_npc/proc/pda_readable(obj/item/modular_computer/computer)
	var/mob/living/carbon/human/body = pawn
	if(isnull(computer) || crew_npc_pda_broken(computer))
		return FALSE
	return body.can_read(computer, READING_CHECK_LITERACY, silent = TRUE)

/**
 * TRUE if the body can use a PDA's screen now, as a player could: the PDA whole, switched on
 * (pressing the power button if it is off, as pda_unusable() does for sending, which draws on its
 * cell from then on) and its screen read.
 */
/datum/ai_controller/crew_npc/proc/pda_screen_usable(obj/item/modular_computer/computer)
	if(!pda_readable(computer))
		return FALSE
	if(!computer.enabled && !computer.turn_on(pawn, open_ui = FALSE))
		return FALSE
	return TRUE
