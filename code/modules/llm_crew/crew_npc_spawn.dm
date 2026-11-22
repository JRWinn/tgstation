/**
 * Creates a crew NPC body on the given turf: a randomized human in a job outfit, driven by /datum/ai_controller/crew_npc.
 *
 * Arguments:
 * * spawn_turf - Where the body appears.
 * * outfit_type - Job outfit to dress it in.
 * * owner_ckey - The player whose brain window this NPC reports to, if any.
 */
/proc/create_crew_npc(turf/spawn_turf, datum/outfit/outfit_type = /datum/outfit/job/janitor, owner_ckey)
	var/mob/living/carbon/human/npc = new(spawn_turf)
	randomize_human_normie(npc)
	npc.equipOutfit(outfit_type)
	// A janitor starts in the shoes of its outfit, as a player does: no galoshes are made for it
	// (KNB-06). It keeps its feet on the floors it has just mopped by remembering them (note_mopped).
	// Whatever the outfit put in its hands goes in its bag, so its hands start free for what it is asked to do.
	for(var/obj/item/held in npc.held_items)
		npc.equip_to_storage(held, ITEM_SLOT_BACK, indirect_action = TRUE)
	var/datum/ai_controller/crew_npc/controller = new(npc)
	if(owner_ckey)
		get_crew_brain_link(owner_ckey).add_npc(controller)
	controller.learn_starting_places()
	return npc

ADMIN_VERB(spawn_crew_npc, R_SPAWN, "Spawn Crew NPC", "Spawns an AI-controlled janitor on your tile, owned by you.", ADMIN_CATEGORY_FUN)
	var/turf/spawn_turf = get_turf(user.mob)
	if(isnull(spawn_turf))
		to_chat(user, span_warning("You need to be somewhere on the map to spawn a crew NPC."))
		return

	var/static/list/job_outfits = list(
		"Janitor" = /datum/outfit/job/janitor,
		"Cargo Technician" = /datum/outfit/job/cargo_tech,
		"Head of Personnel" = /datum/outfit/job/hop,
		"Quartermaster" = /datum/outfit/job/quartermaster,
		"Chief Engineer" = /datum/outfit/job/ce,
		"Station Engineer" = /datum/outfit/job/engineer,
		"Head of Security" = /datum/outfit/job/hos,
		"Security Officer" = /datum/outfit/job/security,
	)
	var/job = tgui_input_list(user, "Which job should the crew NPC have?", "Spawn Crew NPC", job_outfits)
	if(isnull(job))
		return

	var/mob/living/carbon/human/npc = create_crew_npc(spawn_turf, job_outfits[job], user.ckey)
	log_admin("[key_name(user)] spawned crew NPC [key_name(npc)] at [AREACOORD(spawn_turf)].")
	message_admins("[key_name_admin(user)] spawned crew NPC [ADMIN_LOOKUPFLW(npc)] at [ADMIN_VERBOSEJMP(spawn_turf)].")
	BLACKBOX_LOG_ADMIN_VERB("Spawn Crew NPC")
	get_crew_brain_link(user.ckey).open_for(user)

/// TRUE if the standing test crew is spawned, and the brain window opened, when a round starts.
GLOBAL_VAR_INIT(crew_npc_autostart, TRUE)

/// Sees that the standing test crew is spawned when a round starts. It does nothing else.
SUBSYSTEM_DEF(crew_npc)
	name = "Crew NPCs"
	ss_flags = SS_NO_FIRE

/datum/controller/subsystem/crew_npc/Initialize()
	SSticker.OnRoundstart(CALLBACK(src, PROC_REF(round_started)))
	return SS_INIT_SUCCESS

/// Called when the round starts. The crew is spawned ten seconds in, whether or not whoever owns them has a body by then: if they are still in the lobby, the brain window waits until they join or observe.
/datum/controller/subsystem/crew_npc/proc/round_started()
	if(GLOB.crew_npc_autostart)
		addtimer(CALLBACK(GLOBAL_PROC, GLOBAL_PROC_REF(spawn_test_crew)), CREW_NPC_AUTOSTART_DELAY)

/**
 * Returns somewhere to stand in the first room of one of these kinds that has anywhere, or null.
 * Each kind of room is looked for on every one of these levels before the next kind is tried, so an
 * office upstairs wins over a hallway downstairs.
 */
/proc/crew_npc_spawn_turf(list/area_types, list/z_levels)
	for(var/area_type in area_types)
		for(var/z_level in z_levels)
			for(var/area/station/place in GLOB.areas)
				if(!istype(place, area_type))
					continue
				for(var/turf/candidate as anything in place.get_turfs_by_zlevel(z_level))
					if(crew_npc_safe_turf(candidate) && !candidate.is_blocked_turf())
						return candidate
	return null

/**
 * Spawns the standing test crew and opens the brain window for whoever owns them: a Head of
 * Personnel, a Quartermaster, a Chief Engineer, a Head of Security, two cargo technicians, a
 * station engineer, a security officer and three janitors, each in the room their job starts the
 * shift in. Every department that has
 * staff aboard has its head aboard with them.
 *
 * With nobody named, the owner is the first admin connected who may spawn things.
 */
/proc/spawn_test_crew(client/owner)
	if(isnull(owner))
		for(var/client/admin as anything in GLOB.admins)
			if(check_rights_for(admin, R_SPAWN))
				owner = admin
				break
	if(isnull(owner) || isnull(owner.mob))
		return 0
	var/list/station_levels = SSmapping.levels_by_trait(ZTRAIT_STATION)
	if(!length(station_levels))
		station_levels = list(owner.mob.z)
	// The owner's own tile is the last resort, and only if it is on the station: not the lobby's start room.
	var/turf/owner_turf = get_turf(owner.mob)
	if(!isnull(owner_turf) && !is_station_level(owner_turf.z))
		owner_turf = null
	// The outfit, the rooms to look for somewhere to stand in, and how many.
	var/static/list/crew = list(
		list(/datum/outfit/job/hop, list(/area/station/command/heads_quarters/hop, /area/station/hallway), 1),
		list(/datum/outfit/job/quartermaster, list(/area/station/command/heads_quarters/qm, /area/station/cargo/storage, /area/station/cargo/office, /area/station/cargo/lobby), 1),
		list(/datum/outfit/job/cargo_tech, list(/area/station/cargo/storage, /area/station/cargo/office, /area/station/cargo/lobby), 2),
		list(/datum/outfit/job/janitor, list(/area/station/service/janitor, /area/station/hallway), 3),
		list(/datum/outfit/job/ce, list(/area/station/command/heads_quarters/ce, /area/station/engineering/main), 1),
		list(/datum/outfit/job/engineer, list(/area/station/engineering/main, /area/station/engineering/break_room), 1),
		list(/datum/outfit/job/hos, list(/area/station/command/heads_quarters/hos, /area/station/security/office), 1),
		list(/datum/outfit/job/security, list(/area/station/security/office, /area/station/security/brig), 1),
	)
	var/spawned = 0
	for(var/list/entry as anything in crew)
		var/turf/spot = crew_npc_spawn_turf(entry[2], station_levels) || owner_turf
		if(isnull(spot))
			log_game("Crew NPC test crew: nowhere on the station to stand for [entry[1]], so none was spawned.")
			continue
		for(var/number in 1 to entry[3])
			create_crew_npc(spot, entry[1], owner.ckey)
			spawned++
	log_admin("The standing crew NPC test crew ([spawned] bodies) was spawned for [key_name(owner)].")
	message_admins("The standing crew NPC test crew ([spawned] bodies) was spawned for [key_name_admin(owner)].")
	get_crew_brain_link(owner.ckey).open_for(owner)
	return spawned

ADMIN_VERB(spawn_test_crew, R_SPAWN, "Spawn Test Crew", "Spawns the standing crew NPC test crew, owned by you: a Head of Personnel, a Quartermaster, a Chief Engineer, a Head of Security, two cargo technicians, a station engineer, a security officer and three janitors.", ADMIN_CATEGORY_FUN)
	var/spawned = spawn_test_crew(user)
	if(!spawned)
		to_chat(user, span_warning("The test crew could not be spawned."))
	BLACKBOX_LOG_ADMIN_VERB("Spawn Test Crew")

ADMIN_VERB(jump_to_cargo_lobby, R_SPAWN, "Jump To Cargo Lobby", "Takes you to the Cargo Lobby, where crew ask the cargo technician for supplies.", ADMIN_CATEGORY_FUN)
	var/turf/drop_location
	top_level:
		for(var/area/station/cargo/lobby/lobby in GLOB.areas)
			for(var/list/zlevel_turfs as anything in lobby.get_zlevel_turf_lists())
				for(var/turf/lobby_turf as anything in zlevel_turfs)
					if(!crew_npc_safe_turf(lobby_turf) || lobby_turf.is_blocked_turf())
						continue
					drop_location = lobby_turf
					break top_level
	if(isnull(drop_location))
		to_chat(user, span_warning("There is no Cargo Lobby on this map to jump to."))
		return

	user.mob.admin_jump(drop_location)
	log_admin("[key_name(user)] jumped to the Cargo Lobby at [AREACOORD(drop_location)].")
	BLACKBOX_LOG_ADMIN_VERB("Jump To Cargo Lobby")

ADMIN_VERB(crew_brain, R_SPAWN, "Crew Brain", "Opens the brain window for the crew NPCs you own.", ADMIN_CATEGORY_FUN)
	get_crew_brain_link(user.ckey).open_for(user)
