/// Every player's brain link, keyed by ckey.
GLOBAL_LIST_EMPTY(crew_brain_links)

/// Returns the brain link for this ckey, making one if they do not have one yet.
/proc/get_crew_brain_link(owner_ckey)
	var/datum/crew_brain_link/link = GLOB.crew_brain_links[owner_ckey]
	if(isnull(link))
		link = new(owner_ckey)
	return link

/**
 * The server's end of one player's brain window.
 *
 * It holds the crew NPCs that player owns and relays their sense events to the window on the
 * player's client, where the player's own LLM does the thinking. Only the owner can open it.
 */
/datum/crew_brain_link
	/// ckey of the player who owns these NPCs.
	var/owner_ckey
	/// Controllers of the NPCs this player owns.
	var/list/datum/ai_controller/crew_npc/npcs = list()
	/// Number used for the next NPC's id.
	var/next_npc_number = 1
	/// world.time the current brain log counting window started.
	var/log_window_started = 0
	/// Brain log records received in the current counting window.
	var/log_records_in_window = 0
	/// The mob whose close-all-windows key (Home) is caught so that it leaves this window open.
	var/mob/watched_mob

/datum/crew_brain_link/New(owner_ckey)
	src.owner_ckey = owner_ckey
	GLOB.crew_brain_links[owner_ckey] = src

/datum/crew_brain_link/Destroy(force)
	watch_close_all_key(null)
	for(var/datum/ai_controller/crew_npc/npc as anything in npcs)
		npc.brain_link = null
	npcs.Cut()
	GLOB.crew_brain_links -= owner_ckey
	return ..()

/// Puts an NPC under this player's ownership.
/datum/crew_brain_link/proc/add_npc(datum/ai_controller/crew_npc/npc)
	npc.brain_link?.remove_npc(npc)
	npc.brain_link = src
	npc.npc_id = "npc[next_npc_number++]"
	npcs += npc
	SStgui.update_uis(src)

/// Releases an NPC from this player's ownership.
/datum/crew_brain_link/proc/remove_npc(datum/ai_controller/crew_npc/npc)
	npcs -= npc
	npc.brain_link = null
	SStgui.update_uis(src)

/// Called by an owned NPC when it has a new sense event, so the window hears about it straight away.
/datum/crew_brain_link/proc/on_sense_event(datum/ai_controller/crew_npc/npc)
	SStgui.update_uis(src)

/datum/crew_brain_link/ui_interact(mob/user, datum/tgui/ui)
	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "CrewBrain", "Crew Brain")
		ui.open()
	if(user.ckey == owner_ckey)
		watch_close_all_key(user)

/**
 * Opens the window for its owner. In the lobby it waits until they have a body or a ghost: a window
 * opened on the lobby mob is closed the moment they join or observe, and every brain with it.
 */
/datum/crew_brain_link/proc/open_for(client/owner)
	if(isnull(owner) || isnull(owner.mob))
		return
	if(!isnewplayer(owner.mob))
		ui_interact(owner.mob)
		return
	RegisterSignal(owner, COMSIG_CLIENT_MOB_LOGIN, PROC_REF(on_owner_mob_login), override = TRUE)
	to_chat(owner, span_notice("The Crew Brain window opens when you join or observe."))

/// The owner took a new mob: once it is no lobby mob, the window is opened on it.
/datum/crew_brain_link/proc/on_owner_mob_login(client/source, mob/new_mob)
	SIGNAL_HANDLER
	if(isnewplayer(new_mob))
		return
	UnregisterSignal(source, COMSIG_CLIENT_MOB_LOGIN)
	INVOKE_ASYNC(src, PROC_REF(ui_interact), new_mob)

/datum/crew_brain_link/ui_state(mob/user)
	return GLOB.always_state

/datum/crew_brain_link/ui_status(mob/user, datum/ui_state/state)
	if(user.ckey != owner_ckey)
		return UI_CLOSE
	// The window moves with its owner when they ghost or change body, so the key is caught on whichever mob has it now.
	if(user != watched_mob)
		watch_close_all_key(user)
	return UI_INTERACTIVE

/datum/crew_brain_link/ui_close(mob/user)
	. = ..()
	watch_close_all_key(null)
	log_game("Crew Brain window of [owner_ckey] closed: every crew brain's memory is wiped and the crew do nothing until it is opened again.")

/// Catches the close-all-windows key on this mob (and lets go of the last one), so that Home closes every other window but this.
/datum/crew_brain_link/proc/watch_close_all_key(mob/new_mob)
	if(watched_mob)
		UnregisterSignal(watched_mob, list(COMSIG_KB_CLIENT_CLOSEUI_DOWN, COMSIG_QDELETING))
	watched_mob = new_mob
	if(new_mob)
		RegisterSignal(new_mob, COMSIG_KB_CLIENT_CLOSEUI_DOWN, PROC_REF(on_close_all_key))
		RegisterSignal(new_mob, COMSIG_QDELETING, PROC_REF(on_watched_mob_deleted))

/datum/crew_brain_link/proc/on_watched_mob_deleted(mob/source)
	SIGNAL_HANDLER
	watch_close_all_key(null)

/// The owner pressed the close-all-windows key: close every window they have open but the Crew Brain, and stop the key's own handler.
/datum/crew_brain_link/proc/on_close_all_key(mob/source)
	SIGNAL_HANDLER
	INVOKE_ASYNC(src, PROC_REF(close_other_windows), source)
	return COMSIG_KB_ACTIVATED

/datum/crew_brain_link/proc/close_other_windows(mob/source)
	for(var/datum/tgui/ui in source.tgui_open_uis.Copy())
		if(ui.src_object != src)
			ui.close()

/datum/crew_brain_link/ui_static_data(mob/user)
	var/list/data = list()
	// Every room aboard, by name. Crew know their way around the station they work on.
	data["places"] = assoc_to_keys(crew_npc_station_places())
	return data

/datum/crew_brain_link/ui_data(mob/user)
	var/list/data = list()
	var/list/npc_list = list()
	for(var/datum/ai_controller/crew_npc/npc as anything in npcs)
		var/mob/living/carbon/human/body = npc.pawn
		if(QDELETED(body))
			continue
		var/list/holding = list()
		for(var/obj/item/held in body.held_items)
			holding += format_text(held.name)
		npc_list += list(list(
			"id" = npc.npc_id,
			"name" = body.real_name,
			// Its own job as it reads it off its own card, the same one every job test on the server goes by.
			"job" = npc.job_title(body),
			// The colour of the department stripe on its own ID card, which the window shows its name and job in. Null with no card.
			"card_color" = crew_npc_card_color(body),
			"awake" = npc.can_sense(),
			// The room the body is standing in, which it knows the way anyone does: by looking.
			"location" = get_area_name(body, TRUE),
			"people_in_view" = npc.people_in_view,
			"things_in_view" = npc.things_in_view,
			"holding" = holding,
			// Everything it has on it, for the window to show. The LLM is not told of this.
			"inventory" = npc.inventory_list(),
			"cleaning_tool" = npc.describe_cleaning_tool(),
			// All it has to clean with is a rag, which shifts little.
			"poor_tool" = npc.has_poor_tool(),
			// How much of its work it has done so far this shift: messes cleaned up, and things put away.
			"work_done" = list("cleaned" = npc.work_cleaned, "put_away" = npc.work_put_away, "crates_in" = npc.work_crates_in, "crates_out" = npc.work_crates_out, "machines_set" = npc.work_machines_set, "arrests" = npc.work_arrests),
			"has_locator" = npc.has_custodial_locator(),
			"cleanable_messes" = npc.cleanable_messes,
			// The kinds of mess in this room that nothing it holds will shift: those that want scrubbing.
			"beyond_kinds" = npc.beyond_kinds_here(),
			"mess_places" = npc.mess_places(),
			// Those of them where what the body holds would do some good.
			"workable_mess_places" = npc.workable_mess_places(),
			// Holding a mop with no water on it and nothing else that cleans, whether or not there is a sink in sight.
			"mop_needs_water" = !isnull(npc.dry_mop()) && isnull(npc.proper_tool()),
			"sink_in_view" = npc.sink_in_view,
			// What that water is in, a bucket it holds that wants filling with water in sight to fill it at,
			// and whether it holds a mop and no bucket to carry water for it.
			"water_from" = npc.water_from,
			"bucket_to_fill" = npc.bucket_to_fill,
			// Only with a hand to carry it in, or one it would free for it (DESK-10).
			"wants_bucket" = !isnull(locate(/obj/item/mop) in body.held_items) && isnull(npc.held_bucket()) && (length(body.get_empty_held_indexes()) || !isnull(npc.spare_held_item())),
			// It has tried to leave this room more than once and found no way out.
			"shut_in" = npc.is_shut_in(),
			"door_open" = npc.open_door_in_view,
			// Someone is holding a door open for it, and who let it into the room it is in, if anyone did.
			"door_held" = world.time < npc.door_held_until,
			// It is being let out of the room it is in.
			"door_held_out" = world.time < npc.let_out_until,
			"let_in_by" = npc.who_let_in(),
			// It has found it cannot get out by itself, and means to until it is back where it was last out: that room, by name.
			"wants_out" = npc.wants_out,
			"way_out_to" = npc.way_out_to(),
			// Those on its PDA whose own ID opens the door it came in by, for when nobody comes to it.
			"door_keepers" = npc.door_keepers(),
			// The room whose door it is standing at, wanting through, or null.
			"at_door_of" = npc.at_door_of(),
			// What that door is called, to tell it from the room's other doors.
			"at_door_label" = npc.at_door_label(),
			// It is standing in a doorway or right beside a door, in the way of anyone coming through.
			"in_doorway" = !crew_npc_clear_of_doors(body) || npc.on_top_of_someone(),
			"grenade_messes" = npc.grenade_messes,
			"doing" = npc.describe_doing(),
			"post" = npc.post_place,
			"office" = npc.office_place,
			"meeting_room" = npc.meeting_place,
			"orderable" = npc.works_in_cargo() ? assoc_to_keys(npc.orderable_crates()) : list(),
			"order_pending" = npc.supply_run_active,
			// A PDA it could use at the screen: not broken, and readable. Asked on every update, so it is
			// not switched on here: a PDA that is off with no charge shows up as soon as it is tried.
			"has_pda" = npc.pda_readable(npc.pda_messenger()?.computer),
			// PDA messages it owes about crates: an order that has come in, or crates still waiting to be collected.
			"notices" = npc.notices_owed,
			// The crates being held for collection that it knows of, and whether it is its moment to go and look them over.
			"held_crates" = npc.held_state(),
			"held_check_due" = npc.held_check_due(),
			// Whether a crate it unpacked has yet to be taken back to cargo.
			"crate_to_return" = !QDELETED(npc.crate_to_return?.resolve()),
			// Everyone its PDA lists, with their jobs: who it can send word to, and who answers to whom.
			"pda_people" = npc.people_on_pda(),
			// What is waiting on the supply shuttle and in the bay, for cargo staff. Null for everyone else.
			"freight" = npc.freight_state(),
			// How much is lying about in its work area that it could put away. Null if it has no work area.
			"tidy" = npc.tidy_state(),
			// Messes in the rooms it works in, and the janitors its PDA lists, so it can call one over.
			"work_area_messes" = npc.work_area_messes(),
			// The other rooms of its department, to look in on when it is quiet, and which of its rooms are locked to the crew.
			"look_in_rooms" = npc.look_in_rooms,
			"closed_rooms" = npc.closed_rooms,
			// Those of its rooms that lie inside another of them: each with the room it is got into through.
			"rooms_through" = npc.reached_through,
			"pda_janitors" = npc.janitors_on_pda(),
			// Someone else at its post has lately sent for a janitor.
			"workmate_called" = npc.workmate_called_janitor(),
			// Someone has it by the arm and is walking it out of a room.
			"in_hand" = world.time < npc.in_hand_until,
			// With the gravity off and nothing within a tile to push off from, it floats and cannot walk (MAP-07).
			"floating" = crew_npc_floating(body),
			// The room it is in is locked to it.
			"out_of_bounds" = npc.out_of_bounds,
			// Rooms it lately found no way into.
			"blocked_places" = npc.blocked_place_names(),
			// For a Quartermaster: what is written in its order book, the money every order is paid from, and what each crate costs.
			"book" = npc.order_book_lines(),
			"budget" = npc.is_quartermaster() ? npc.cargo_budget() : null,
			"crate_costs" = npc.is_quartermaster() ? npc.crate_costs() : null,
			// Where a head's staff work from, and where a technician knocks for the head it answers to.
			"staff_post" = npc.staff_post_place,
			"head_office" = npc.head_office_place,
			// For engineering staff: the machines they work, how those in view are set, and what the PDA reads of the engine.
			"engineering" = npc.engineering_state(),
			// For security staff: their kit, who they have by the arm, how hurt they are, and the brig's cells. Null for everyone else.
			"security" = npc.security_state(),
			// The brig cell it is shut in, by name, if it is in one.
			"custody" = npc.custody_cell,
			// Holding a mop that will not clean until it is wetted, with no sink in sight to wet it at.
			"dry_mop" = !isnull(npc.dry_mop()) && isnull(npc.proper_tool()) && !npc.sink_in_view,
			"place_kind" = npc.place_kind(),
			// On the way somewhere, on an errand, or working through a room's storage.
			// Stepping back to its spot at its post does not count: that gives way to anything else there is to do.
			// Nor is a body idle in the moment between a crate getting away from it and its setting off after it.
			// Nor while it is still testing routes for a walk (LIFE-03).
			"walking" = (npc.blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) && npc.walk_tool != CREW_TOOL_RETURN) || npc.blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || npc.blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET) || npc.seeing_to_crate || npc.choosing_where_to_explore || npc.finding_door || npc.finding_door_to_force,
			"resting" = npc.resting,
			// Exploring still has a use while there is storage to look back in on.
			"explored_everything" = npc.nowhere_new_left && !length(npc.room_searched_at),
			"storage_here" = npc.storage_here,
			"acked_seq" = npc.acked_seq,
			"events" = npc.sense_events,
		))
	data["npcs"] = npc_list
	// The rooms locked to the crew at large that some of these NPCs are allowed into, and who. Null while that is being worked out.
	data["locked_rooms"] = locked_rooms()
	data["now"] = world.time
	return data

/datum/crew_brain_link/ui_act(action, list/params, datum/tgui/ui, datum/ui_state/state)
	. = ..()
	if(.)
		return
	// Everything in params comes from the owner's client and is untrusted.
	var/datum/ai_controller/crew_npc/npc = find_npc(params["npc"])
	if(isnull(npc))
		return FALSE
	switch(action)
		if("tool_call")
			npc.handle_tool_call(params["tool"], params["args"])
			return TRUE
		if("ack")
			var/seq = params["seq"]
			if(!isnum(seq))
				return FALSE
			npc.acked_seq = clamp(round(seq), npc.acked_seq, npc.next_event_seq - 1)
			return TRUE
		if("brain_log")
			write_brain_log(npc, params)
			// Nothing the window shows has changed.
			return FALSE
	return FALSE

/// Returns the owned NPC with this id, or null.
/datum/crew_brain_link/proc/find_npc(npc_id)
	if(!istext(npc_id))
		return null
	for(var/datum/ai_controller/crew_npc/npc as anything in npcs)
		if(npc.npc_id == npc_id)
			return npc
	return null

/**
 * Writes one record from the owner's brain window to the round's crew brain log.
 *
 * The thinking happens on the player's machine, so without this the server has no record of what
 * an NPC's LLM was told or what it decided. Each line of the log is a timestamp and a JSON object.
 * Everything in params comes from the client: it is only trimmed and written down, never acted on.
 */
/datum/crew_brain_link/proc/write_brain_log(datum/ai_controller/crew_npc/npc, list/params)
	if(world.time - log_window_started > CREW_NPC_TOOL_WINDOW)
		log_window_started = world.time
		log_records_in_window = 0
	log_records_in_window++
	if(log_records_in_window > CREW_NPC_LOG_RECORD_LIMIT)
		return

	var/mob/living/carbon/human/body = npc.pawn
	var/list/record = list(
		"owner" = owner_ckey,
		"npc" = npc.npc_id,
		"name" = QDELETED(body) ? null : body.real_name,
		"kind" = params["kind"] == "card" ? "card" : "decision",
	)
	if(record["kind"] == "card")
		// The fixed part of the prompt: who the NPC is, its rules, and how it must reply.
		record["text"] = log_field(params["text"], CREW_NPC_LOG_CARD_LENGTH)
	else
		record["trigger"] = log_field(params["trigger"], CREW_NPC_LOG_FIELD_LENGTH)
		record["context"] = log_field(params["context"], CREW_NPC_LOG_FIELD_LENGTH)
		record["reply"] = log_field(params["reply"], CREW_NPC_LOG_FIELD_LENGTH)
		record["error"] = log_field(params["error"], CREW_NPC_LOG_FIELD_LENGTH)
		record["ms"] = isnum(params["ms"]) ? round(params["ms"]) : null
		record["tokens"] = isnum(params["tokens"]) ? round(params["tokens"]) : null
		// What the window's code did with the reply: a line held back as sounding like an order, an
		// order made out from what was heard, a step nothing called for. Only a record that carries it
		// has it, so the older records are written as they were.
		if(istext(params["calls"]))
			record["calls"] = log_field(params["calls"], CREW_NPC_LOG_FIELD_LENGTH)
	rustg_log_write("[GLOB.log_directory]/crew_brain.log", json_encode(record), "true")

/// Returns a text field from the client cut down to a safe length, or null if it was not text.
/datum/crew_brain_link/proc/log_field(value, max_length)
	return istext(value) ? copytext_char(value, 1, max_length + 1) : null
