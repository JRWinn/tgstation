/**
 * What a crew NPC has on it, for its owner's brain window.
 *
 * None of this goes to the LLM. It is there so that whoever is watching can see at a glance what a
 * body is carrying, and which of it is the gear of its trade.
 */

/// In one of the body's hands.
#define CREW_CARRIED_IN_HAND "hand"
/// Put away: on the belt, on the back, in a pocket, or inside something that is.
#define CREW_CARRIED_STOWED "stowed"
/// Worn as clothing.
#define CREW_CARRIED_WORN "worn"

/**
 * Returns everything the body has on it, as a list of entries for the window: what it is called,
 * how many of it there are, where it is, and whether it is a tool of the body's trade. Things in
 * hand come first, then what is put away, then what is worn.
 */
/datum/ai_controller/crew_npc/proc/inventory_list()
	var/mob/living/carbon/human/body = pawn
	var/list/trade_tools = trade_tool_types()
	var/list/by_place = list(
		CREW_CARRIED_IN_HAND = list(),
		CREW_CARRIED_STOWED = list(),
		CREW_CARRIED_WORN = list(),
	)
	for(var/obj/item/thing in body.get_all_gear(NONE))
		var/where = CREW_CARRIED_WORN
		if(body.is_holding(thing))
			where = CREW_CARRIED_IN_HAND
		// Inside a bag, a belt or a box, or in one of the slots that are for carrying things.
		else if(thing.loc != body || (body.get_slot_by_item(thing) & (ITEM_SLOT_STORAGE | ITEM_SLOT_ID)))
			where = CREW_CARRIED_STOWED
		var/thing_name = format_text(thing.name)
		// Several of the same thing in the same place are one entry with a count.
		var/list/entry = by_place[where][thing_name]
		if(isnull(entry))
			entry = list("name" = thing_name, "count" = 0, "where" = where, "trade" = FALSE)
			by_place[where][thing_name] = entry
		entry["count"]++
		if(is_trade_tool(thing, trade_tools))
			entry["trade"] = TRUE

	var/list/entries = list()
	for(var/where in by_place)
		for(var/thing_name in by_place[where])
			entries += list(by_place[where][thing_name])
	return entries

/**
 * Returns the typecaches of the tools of the body's trade, going by the job on its ID. A head of
 * staff who also works in a department has both sets.
 */
/datum/ai_controller/crew_npc/proc/trade_tool_types()
	var/static/regex/janitor_jobs = regex("janitor|custodian", "i")
	var/static/list/janitor_tools = typecacheof(list(
		/obj/item/access_key,
		/obj/item/clothing/shoes/galoshes,
		/obj/item/clothing/suit/caution,
		/obj/item/grenade/chem_grenade/cleaner,
		/obj/item/holosign_creator/janibarrier,
		/obj/item/key/janitor,
		/obj/item/lightreplacer,
		/obj/item/mop,
		/obj/item/paint/paint_remover,
		/obj/item/plunger,
		/obj/item/pushbroom,
		/obj/item/rag,
		/obj/item/reagent_containers/cup/bucket,
		/obj/item/reagent_containers/spray/cleaner,
		/obj/item/soap,
		/obj/item/storage/bag/trash,
		/obj/item/storage/belt/janitor,
		/obj/item/storage/box/lights,
		/obj/item/storage/box/mousetraps,
	))
	var/static/list/cargo_tools = typecacheof(list(
		/obj/item/boxcutter,
		/obj/item/clipboard,
		/obj/item/delivery,
		/obj/item/dest_tagger,
		/obj/item/hand_labeler,
		/obj/item/mail,
		/obj/item/sales_tagger,
		/obj/item/stack/package_wrap,
		/obj/item/stack/wrapping_paper,
		/obj/item/stamp,
		/obj/item/storage/bag/mail,
		/obj/item/universal_scanner,
	))
	var/static/list/engineering_tools = typecacheof(list(
		/obj/item/analyzer,
		/obj/item/construction/rcd,
		/obj/item/crowbar,
		/obj/item/extinguisher,
		/obj/item/multitool,
		/obj/item/screwdriver,
		/obj/item/stack/cable_coil,
		/obj/item/storage/belt/utility,
		/obj/item/t_scanner,
		/obj/item/weldingtool,
		/obj/item/wirecutters,
		/obj/item/wrench,
	))
	var/static/list/security_tools = typecacheof(list(
		/obj/item/assembly/flash,
		/obj/item/gun/energy,
		/obj/item/melee/baton,
		/obj/item/restraints/handcuffs,
		/obj/item/storage/belt/security,
	))
	var/static/list/command_tools = typecacheof(list(
		/obj/item/assembly/flash,
		/obj/item/clipboard,
		/obj/item/melee/baton/telescopic,
		/obj/item/stamp,
		/obj/item/storage/box/ids,
		/obj/item/storage/box/silver_ids,
	))

	// The plain holosign projector is the janitor's wet floor sign. Its subtypes belong to other
	// departments, so only that one type is in here.
	var/static/list/janitor_only = list(/obj/item/holosign_creator = TRUE)

	var/list/trade_tools = list()
	if(janitor_jobs.Find(job_title()))
		trade_tools += list(janitor_tools, janitor_only)
	if(works_in_cargo())
		trade_tools += list(cargo_tools)
	if(works_in_engineering())
		trade_tools += list(engineering_tools)
	if(works_in_security())
		trade_tools += list(security_tools)
	if(crew_npc_is_command(pawn))
		trade_tools += list(command_tools)
	return trade_tools

/// TRUE if this thing is a tool of the body's trade. trade_tools is what trade_tool_types() returned.
/datum/ai_controller/crew_npc/proc/is_trade_tool(obj/item/thing, list/trade_tools)
	for(var/list/typecache as anything in trade_tools)
		if(is_type_in_typecache(thing, typecache))
			return TRUE
	return FALSE

#undef CREW_CARRIED_IN_HAND
#undef CREW_CARRIED_STOWED
#undef CREW_CARRIED_WORN
