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
	// A janitor works on floors it has just made wet. In ordinary shoes it slips on them, falls, and
	// drops what it is holding. A real janitor puts on the galoshes from the wardrobe; this one starts in them.
	if(ispath(outfit_type, /datum/outfit/job/janitor))
		var/obj/item/ordinary_shoes = npc.get_item_by_slot(ITEM_SLOT_FEET)
		if(ordinary_shoes)
			qdel(ordinary_shoes)
		npc.equip_to_slot_or_del(new /obj/item/clothing/shoes/galoshes(npc), ITEM_SLOT_FEET)
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
	)
	var/job = tgui_input_list(user, "Which job should the crew NPC have?", "Spawn Crew NPC", job_outfits)
	if(isnull(job))
		return

	var/mob/living/carbon/human/npc = create_crew_npc(spawn_turf, job_outfits[job], user.ckey)
	log_admin("[key_name(user)] spawned crew NPC [key_name(npc)] at [AREACOORD(spawn_turf)].")
	message_admins("[key_name_admin(user)] spawned crew NPC [ADMIN_LOOKUPFLW(npc)] at [ADMIN_VERBOSEJMP(spawn_turf)].")
	BLACKBOX_LOG_ADMIN_VERB("Spawn Crew NPC")
	get_crew_brain_link(user.ckey).ui_interact(user.mob)

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
	get_crew_brain_link(user.ckey).ui_interact(user.mob)
