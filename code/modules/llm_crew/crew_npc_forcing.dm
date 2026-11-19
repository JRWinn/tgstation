/**
 * Forcing a door: how an engineer's body opens an airlock that will not open to its ID.
 *
 * It does what a player engineer does, with the tools on its belt. It walks to the door, opens
 * the door's maintenance panel with a screwdriver, takes the door's power away by pulsing a main
 * and a backup power wire with a multitool, pries the dead door open with a crowbar, and screws
 * the panel shut again. The door is left standing open.
 *
 * Every one of those is a click on the door with the tool in its hand, through the same code a
 * player's click reaches, but for the pulses. Those are made in the wires window, and the game
 * will not open a window for a body with no player behind it. So what the window would send is
 * sent to the wires' own handler, after the checks the window makes: see work_wires().
 *
 * Which wire is which it knows only as a player does: the wires window names them to someone
 * with an engineer's skill chip, and to nobody else. A body without that does not guess.
 *
 * A door that is bolted or welded is not opened this way. Bolts hold whether the door has power
 * or not, and a crowbar on a welded door with no power takes its electronics out.
 */

/// How long the body leaves between one thing it does in a wires window, or to a pocket, and the next. A hand is no quicker.
#define CREW_NPC_WIRE_GAP (1 SECONDS)
/// How long the body gives a door it has pried to finish sliding open. An airlock takes a little over half a second.
#define CREW_NPC_PRY_WAIT (3 SECONDS)
/// How often it looks, in that time, to see whether the door is open yet.
#define CREW_NPC_PRY_LOOK (0.2 SECONDS)

/// TRUE while the body is testing routes to the doors of a room it has been told to force its way into.
/datum/ai_controller/crew_npc/var/finding_door_to_force = FALSE
/// The name of the room whose door the body is on its way to force, or is forcing.
/datum/ai_controller/crew_npc/var/forcing_place
/// What that door is called among the room's doors.
/datum/ai_controller/crew_npc/var/forcing_label
/// That door, as a weak reference: kept so that a walk to it that comes to nothing can be logged by which door it was.
/datum/ai_controller/crew_npc/var/datum/weakref/forcing_door

/// Returns a tool of this kind (TOOL_SCREWDRIVER and the like) that the body has on it: in a hand first, then on its belt, in a pocket or in its bag. Null if it has none.
/datum/ai_controller/crew_npc/proc/tool_carried(tool_kind)
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/held in body.held_items)
		if(held.tool_behaviour == tool_kind)
			return held
	for(var/obj/item/thing in body.get_all_contents())
		if(thing.tool_behaviour == tool_kind)
			return thing
	return null

/// Returns how a door is named in the round's game log: the name on it and where it stands, if it is known which door it is, and what it is called among the doors of its room.
/datum/ai_controller/crew_npc/proc/forcing_door_words(obj/machinery/door/airlock/door, room_name, label)
	var/of_room = label ? "the [label] door of [room_name]" : "a door of [room_name || "nowhere it knows"]"
	if(QDELETED(door))
		return of_room
	return "[door.name] at ([door.x],[door.y]), [of_room]"

/**
 * Notes that forcing a door came to nothing: writes which door, which step and why to the round's
 * game log, and with tell_now tells the brain there and then.
 *
 * `reason` is the word the brain goes by. `words` are what the body is told. `noted` is anything
 * more that is worth having in the log and is no use to the body.
 *
 * Returns the outcome as an errand gives it: FALSE, the words, and the details for the brain.
 */
/datum/ai_controller/crew_npc/proc/forcing_failure(reason, words, obj/machinery/door/airlock/door, room_name, label, noted, list/more_details, tell_now = FALSE)
	var/list/details = list("reason" = reason, "place" = room_name, "door" = label)
	if(more_details)
		details += more_details
	if(!QDELETED(pawn))
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) could not force [forcing_door_words(door, room_name, label)] ([reason]): [words][noted ? " [noted]." : ""] It stands at [AREACOORD(pawn)].")
	if(tell_now)
		action_result(CREW_TOOL_FORCE_DOOR, FALSE, words, details)
	return list(FALSE, words, details)

/**
 * TRUE if this is a hallway with doors of its own, none of which open for the body. The service
 * hallway is one: only service staff walk it, and locked_out_of() takes every hallway for open.
 */
/datum/ai_controller/crew_npc/proc/hallway_locked_to(area/room)
	if(!istype(room, /area/station/hallway))
		return FALSE
	var/mob/living/carbon/human/body = pawn
	var/turf/here = get_turf(body)
	if(isnull(here) || !isturf(body.loc))
		return FALSE
	var/list/doors = crew_npc_doors_of(room, here.z)
	if(!length(doors))
		return FALSE
	for(var/obj/machinery/door/airlock/door as anything in doors)
		if(door.allowed(body))
			return FALSE
	return TRUE

/**
 * Tool: open a door of a room that is locked to the body, by taking the door's power away and
 * prying it. Engineering staff only.
 *
 * `place` is the room. It need not be one the body has stood in: an engineer is sent to rooms it
 * has never had cause to enter. `door_label` is which of the room's doors, as crew_npc_door_label()
 * calls it, for a room with more than one. Without it, or if the room has no door of that name,
 * the nearest door that the body can walk up to is the one.
 *
 * This only chooses the door and sets the body walking to it. The work is force_door_open(). A
 * door that stands open, or opens to the body's own ID, is not forced: the brain is told so at once.
 */
/datum/ai_controller/crew_npc/proc/tool_force_door(place, door_label)
	var/mob/living/carbon/human/body = pawn
	var/asked_for = istext(place) ? trim(place) : null
	if(!works_in_engineering())
		forcing_failure("not_engineer", "Taking a door's power away and prying it open is engineering's work. You do not know how.", null, asked_for, null, tell_now = TRUE)
		return
	// find_known_place() looks among the rooms the body has stood in first, and then among every room of the station.
	var/room_name = length(asked_for) ? find_known_place(asked_for) : null
	var/area/room = room_name ? room_by_name(room_name) : null
	if(isnull(room))
		forcing_failure("no_door", "You do not know of anywhere aboard by that name.", null, asked_for, null, tell_now = TRUE)
		return
	// Routes take a while to test. Anything it was given to do meanwhile wins (LIFE-03, CORE-07).
	var/serial = errand_serial
	var/calls = tool_serial
	// Already looking for a way to a door: the routes are still being tested, and that call will answer.
	// This call is turned away, and handle_tool_call() did not count it as a newer one.
	if(finding_door_to_force)
		action_result(CREW_TOOL_FORCE_DOOR, FALSE, "You are still working out the way.")
		return
	var/turf/here = get_turf(body)
	if(isnull(here) || !isturf(body.loc))
		forcing_failure("no_way", "You are in no place to walk to a door from.", null, room_name, null, tell_now = TRUE)
		return
	var/list/doors = crew_npc_doors_of(room, here.z)
	if(!length(doors))
		forcing_failure("no_door", "[room_name] has no door that you can find.", null, room_name, null, tell_now = TRUE)
		return

	// The side of each door the body would work from: outside the room, unless it is shut inside it.
	var/inside = get_area(here) == room
	var/wanted_label = istext(door_label) ? LOWER_TEXT(trim(door_label)) : null
	var/list/labels = list()
	var/list/spots = list()
	// How good a choice each door is: the lower the better. That is how near it is, but for a door that was named.
	var/list/scores = list()
	var/obj/machinery/door/airlock/named
	for(var/obj/machinery/door/airlock/door as anything in doors)
		var/list/sides = doors[door]
		labels[door] = crew_npc_door_label(door, room, sides[2])
		spots[door] = inside ? sides[1] : sides[2]
		scores[door] = get_dist(body, door)
		if(!length(wanted_label))
			continue
		// By what it is called among the room's doors, or by the name on it.
		if(LOWER_TEXT(labels[door]) != wanted_label && LOWER_TEXT(format_text(door.name)) != wanted_label)
			continue
		if(isnull(named) || scores[door] < scores[named])
			named = door
	if(named)
		scores[named] = -1

	// A door that is open, or that opens to its own ID, is no door to force. If one was named, that
	// is the door meant, and whether some other door of the room opens is beside the point.
	for(var/obj/machinery/door/airlock/door as anything in (named ? list(named) : doors))
		var/standing_open = !door.density
		if(!standing_open && !(door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
			continue
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told to force [forcing_door_words(door, room_name, labels[door])], and did not: it [standing_open ? "is standing open" : "opens to its ID"].")
		action_result(CREW_TOOL_FORCE_DOOR, TRUE, standing_open ? "The [labels[door]] door of [room_name] is standing open already." : "The [labels[door]] door of [room_name] opens to your ID. There is no need to force it.", list("place" = room_name, "door" = labels[door], "already_open" = TRUE))
		return

	// The door it would make for first, for what it is told if it cannot set out at all.
	var/obj/machinery/door/airlock/first
	for(var/obj/machinery/door/airlock/door as anything in scores)
		if(isnull(first) || scores[door] < scores[first])
			first = door
	var/first_label = labels[first]

	// A tool's kind is also its name: "screwdriver", "multitool", "crowbar". The crowbar opens every
	// door, and is asked for now. The panel and the wires are only for a door with power, which is
	// not known until the door is chosen: see below.
	if(isnull(tool_carried(TOOL_CROWBAR)))
		forcing_failure("no_tools", "You have no crowbar on you. Every locked door is pried open in the end, and a door with no power only wants prying.", first, room_name, first_label, more_details = list("missing" = list(TOOL_CROWBAR)), tell_now = TRUE)
		return

	// The nearest of them that it can walk up to. A door may open from somewhere it has no way to,
	// so each is tried for a way to it, the best first, as tool_go_to_door() does.
	var/obj/machinery/door/airlock/best
	var/tries_left = CREW_NPC_DOORS_TRIED
	var/list/no_way_to = list()
	// A door it has no way to that opens from a room locked to it as well: the name of that room.
	var/through
	// A door whose far side it can walk to already, by some other way: that one, and where it leads.
	var/obj/machinery/door/airlock/leads_nowhere
	finding_door_to_force = TRUE
	while(length(scores) && tries_left > 0)
		var/obj/machinery/door/airlock/nearest
		for(var/obj/machinery/door/airlock/door as anything in scores)
			if(isnull(nearest) || scores[door] < scores[nearest])
				nearest = door
		scores -= nearest
		var/turf/spot = spots[nearest]
		var/list/nearest_sides = doors[nearest]
		// Nobody stands working at a door where the air is bad.
		if(!crew_npc_safe_turf(spot))
			no_way_to += "[nearest.name] at ([nearest.x],[nearest.y]), where the air on its near side is bad"
			continue
		tries_left--
		// A door that leads only to floor it can walk to already is no door to force. The bar has one:
		// its kitchen door opens onto a square of the bar's own floor that stands open to the lounge.
		// Forced, it would have let nobody into the bar. A door that was named is forced all the same.
		var/turf/far_side = inside ? nearest_sides[2] : nearest_sides[1]
		if(nearest != named)
			var/list/round_it = get_path_to(body, far_side, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
			if(QDELETED(src) || QDELETED(body))
				return
			if((length(round_it) && !route_by_open_door(round_it)) || get_turf(body) == far_side)
				leads_nowhere ||= nearest
				continue
		if(can_reach_target_now(nearest))
			best = nearest
			break
		var/list/route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
		if(QDELETED(src) || QDELETED(body))
			return
		if(length(route))
			best = nearest
			break
		no_way_to += "[nearest.name] at ([nearest.x],[nearest.y])"
		// Why there is no way to it, if that is a room in between that is locked to it as well.
		var/area/outer = get_area(spot)
		if(isnull(through) && outer != get_area(body) && (locked_out_of(outer) || hallway_locked_to(outer)))
			through = format_text(outer.name)
	finding_door_to_force = FALSE
	if(errand_serial != serial || tool_serial != calls || !can_sense())
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) worked out which door of [room_name] to force, and had been given something else to do meanwhile.")
		return
	if(QDELETED(best))
		// Every door it looked at leads to floor it can walk to: there is a way in already.
		if(!QDELETED(leads_nowhere) && !length(no_way_to))
			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was told to force a door of [room_name], and did not: it can walk in already.")
			action_result(CREW_TOOL_FORCE_DOOR, TRUE, "There is a way into [room_name] already. There is no need to force a door.", list("place" = room_name, "door" = labels[leads_nowhere], "already_open" = TRUE))
			return
		forcing_failure("no_way", through ? "You cannot get to a door of [room_name]: the way to it is through [through], which is locked to you as well." : "You cannot find a way to a door of [room_name].", first, room_name, first_label, "It found no way to: [english_list(no_way_to)]", more_details = through ? list("through" = through) : null, tell_now = TRUE)
		return
	// A door with power has its panel opened and its power cut first (force_door_open()), which takes
	// a screwdriver, a multitool and knowing the wires. A dead door is only pried.
	if(best.hasPower())
		var/list/missing = list()
		for(var/tool_kind in list(TOOL_SCREWDRIVER, TOOL_MULTITOOL))
			if(isnull(tool_carried(tool_kind)))
				missing += tool_kind
		if(length(missing))
			forcing_failure("no_tools", "You have no [english_list(missing, and_text = " or ")] on you. It takes a screwdriver, a multitool and a crowbar to open a locked door that has power.", best, room_name, labels[best], more_details = list("missing" = missing), tell_now = TRUE)
			return
		if(!HAS_TRAIT(body, TRAIT_KNOW_ENGI_WIRES))
			forcing_failure("no_knowledge", "You do not know one wire in an airlock from another, and you are not going to guess at them.", best, room_name, labels[best], tell_now = TRUE)
			return
	forcing_place = room_name
	forcing_label = labels[best]
	forcing_door = WEAKREF(best)
	start_errand(best, CREW_TOOL_FORCE_DOOR, labels[best])

/// TRUE if the body is still at the work of forcing this door: neither is gone, and it has not been given something else to do since it began.
/datum/ai_controller/crew_npc/proc/still_forcing(obj/machinery/door/airlock/door, serial)
	return !QDELETED(src) && !QDELETED(pawn) && !QDELETED(door) && errand_serial == serial

/**
 * Notes in the round's game log that the body left off forcing a door part way through, because
 * it was given something else to do or one of the two is gone, and what it was doing at the time.
 * A panel it had open stays open: someone who walks off from a door leaves it as it is.
 *
 * Returns an outcome as an errand gives it. Nobody is told it: the errand is no longer this one.
 */
/datum/ai_controller/crew_npc/proc/forcing_left_off(obj/machinery/door/airlock/door, room_name, label, doing)
	if(!QDELETED(src) && !QDELETED(pawn))
		var/left_as = QDELETED(door) ? "" : " Its panel is [door.panel_open ? "open" : "shut"], it is [door.density ? "shut" : "open"], and it has [door.hasPower() ? "power" : "no power"]."
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) left off forcing [forcing_door_words(door, room_name, label)] while [doing]: it was given something else to do, or the door is gone.[left_as]")
	return list(FALSE, "You leave the door as it is.", list("reason" = "interrupted", "place" = room_name, "door" = label))

/**
 * Puts a tool back where the body keeps it, with a click: on the belt or the bag it came out of,
 * or on the pocket. If it will not go back there it goes into the bag on its back, and failing
 * that it stays in its hand. A tool that was in its hand to begin with stays there.
 *
 * `kept_in` is what the tool was inside before it was taken out, and `kept_slot` the slot it was
 * in if that was the body itself. Sleeps while the body does it.
 */
/datum/ai_controller/crew_npc/proc/put_tool_back(obj/item/tool, atom/kept_in, kept_slot)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(src) || QDELETED(body) || QDELETED(tool) || isnull(kept_in) || !body.is_holding(tool) || !hand_to(tool))
		return
	if(kept_in == body)
		// It was in a pocket, or hung on the body itself: a click on that slot with it in hand puts it back.
		if(kept_slot)
			sleep(CREW_NPC_WIRE_GAP)
			if(QDELETED(src) || QDELETED(body) || QDELETED(tool) || !body.is_holding(tool))
				return
			body.attack_ui(kept_slot)
	else if(!QDELETED(kept_in))
		click_as_body(kept_in)
	if(QDELETED(src) || QDELETED(body) || QDELETED(tool) || !body.is_holding(tool))
		return
	stow_in_bag(tool)

/**
 * Uses one of the body's tools on a door, as a player does: takes the tool out of where it is
 * kept with a click, clicks the door with it in hand, and puts it back with a click. Sleeps
 * while the body does it.
 *
 * Returns null if the click on the door was made. What the click did is for whoever called this
 * to look at. Returns the reason, in words that follow "because", if it was not made.
 */
/datum/ai_controller/crew_npc/proc/use_tool_on_door(obj/machinery/door/airlock/door, tool_kind)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/tool = tool_carried(tool_kind)
	if(isnull(tool))
		return "you no longer have a [tool_kind] on you"
	var/atom/kept_in = body.is_holding(tool) ? null : tool.loc
	var/kept_slot = kept_in == body ? body.get_slot_by_item(tool) : null
	if(!draw_item(tool))
		return "you could not get your [tool_kind] into a free hand"
	var/clicked = click_as_body(door)
	put_tool_back(tool, kept_in, kept_slot)
	return clicked ? null : "you could not reach the door with your [tool_kind]"

/**
 * Returns what a wires window shows the body of which wire is which, as wire -> the window's
 * entry for it ("color", "cut"). A wire the window does not name to this body is not in it.
 *
 * This is the window's own data, made for the body as it would be for a player looking at the
 * window. It names an airlock's wires to someone with an engineer's skill chip, and to someone
 * holding the station's blueprints, and leaves them as bare colours to anyone else.
 */
/datum/ai_controller/crew_npc/proc/wires_shown(datum/wires/wires)
	var/list/shown = list()
	var/list/window = wires.ui_data(pawn)
	for(var/list/entry as anything in window["wires"])
		var/wire = entry["wire"]
		if(wire)
			shown[wire] = entry
	return shown

/**
 * Does something in a wires window, as the body: pulses or cuts the wire of one colour.
 *
 * The game will not open a window for a body with no player behind it. So what the window would
 * send is sent to the wires' own handler, after the checks the window makes: the body is next to
 * what the wires are in and fit to use its hands, and the wires can be got at, which for a door
 * means its panel is open and nothing plates them over. The handler makes its own checks after
 * that: that the body holds a multitool to pulse with, or wirecutters to cut with. It asks who
 * is using it, so the call is made as the body. This is what work_window() is for a machine.
 *
 * Returns TRUE if the handler took it. FALSE, having changed nothing, if it did not.
 */
/datum/ai_controller/crew_npc/proc/work_wires(datum/wires/wires, action, list/params)
	var/mob/living/carbon/human/body = pawn
	sleep(CREW_NPC_WIRE_GAP)
	if(QDELETED(body) || QDELETED(wires) || QDELETED(src))
		return FALSE
	var/atom/holder = wires.holder
	if(QDELETED(holder) || !can_reach_target_now(holder) || !body.can_perform_action(holder, holder.interaction_flags_click | SILENT_ADJACENCY))
		return FALSE
	if(!wires.interactable(body))
		return FALSE
	body.face_atom(holder)
	// Never opened: it only stands for the window the body would be looking at.
	var/datum/tgui/window = new(body, wires, "CrewNpcHands")
	var/taken = world.push_usr(body, CALLBACK(wires, TYPE_PROC_REF(/datum, ui_act), action, params || list(), window, window.state))
	qdel(window)
	return !!taken

/**
 * Takes a door's power away, as a player does with its panel open: a click on the door with a
 * multitool brings up the wires window, and in that a main power wire and a backup power wire
 * are each pulsed. The multitool goes back where it is kept after. Sleeps while the body does it.
 *
 * How long that lasts, from the game's own code (loseMainPower, loseBackupPower, hasPower in
 * airlock.dm). A pulse on either main wire puts the main supply out for 60 seconds, and the
 * backup with it for 10 if the backup had less than that left to go. A pulse on either backup
 * wire puts the backup out for 60 seconds. The door is without power only while both are out,
 * and has it again the moment either comes back. So with the two pulses a second apart the door
 * is dead for a minute from the first, which is some 59 seconds from the second. The main wire
 * alone would give 10 seconds. A wire that is cut does not pulse, and need not: its supply is
 * out for as long as it stays cut.
 *
 * Returns null if the door is now without power, or why it is not, in words that follow "because".
 */
/datum/ai_controller/crew_npc/proc/take_door_power(obj/machinery/door/airlock/door)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/multitool = tool_carried(TOOL_MULTITOOL)
	if(isnull(multitool))
		return "you no longer have a multitool on you"
	var/atom/kept_in = body.is_holding(multitool) ? null : multitool.loc
	var/kept_slot = kept_in == body ? body.get_slot_by_item(multitool) : null
	if(!draw_item(multitool))
		return "you could not get your multitool into a free hand"
	// The click that brings the wires window up for a player. For this body no window comes, but
	// the door does the rest of what it does to anyone who goes into its wires: one that is
	// electrified shocks them.
	var/why_not
	if(!click_as_body(door))
		why_not = "you could not reach its wires with your multitool"
	var/list/pulsed = list()
	for(var/list/supply as anything in list(list(WIRE_POWER1, WIRE_POWER2), list(WIRE_BACKUP1, WIRE_BACKUP2)))
		if(why_not || QDELETED(src) || QDELETED(body) || QDELETED(door) || QDELETED(door.wires))
			break
		// The first wire of this supply that is not cut, by the colour the window shows it in.
		var/list/shown = wires_shown(door.wires)
		var/named_any = FALSE
		var/colour
		for(var/wire in supply)
			var/list/entry = shown[wire]
			if(isnull(entry))
				continue
			named_any = TRUE
			if(!entry["cut"])
				colour = entry["color"]
				break
		if(!named_any)
			why_not = "the wires window does not show you which wire is which"
			break
		// Both wires of this supply are cut. It is out already, and stays out.
		if(isnull(colour))
			continue
		if(!work_wires(door.wires, "pulse", list("wire" = colour)))
			why_not = "you could not pulse its [colour] wire[length(pulsed) ? ", having pulsed the [english_list(pulsed)]" : ""]"
			break
		pulsed += colour
	put_tool_back(multitool, kept_in, kept_slot)
	if(QDELETED(src) || QDELETED(body) || QDELETED(door))
		return "the door is gone"
	if(why_not)
		return why_not
	// The test light in the wires window is what tells a player whether the door has power.
	if(door.hasPower())
		return "its test light is still on after a pulse on [length(pulsed) ? "the [english_list(pulsed)] wire[length(pulsed) == 1 ? "" : "s"]" : "no wire at all"]"
	return null

/**
 * Forces the door the body has walked up to: opens its panel, takes its power away, pries it
 * open and shuts the panel again. A door that has no power to begin with is only pried. Sleeps
 * while the body does it, which is some fifteen seconds.
 *
 * Prying a door that has no power takes no time: the click with the crowbar sets it sliding open
 * there and then (try_to_crowbar in airlock.dm), and nothing stops it but bolts, a weld or a
 * seal. The door stays open once it is. Its own timer tries to shut it eight seconds later, and
 * a door without power does not shut for its timer, and the timer is not set again.
 *
 * Returns a list: whether the door now stands open, the words the brain is told, and the details
 * for the brain. On failure the details say which step came to nothing, as "reason".
 */
/datum/ai_controller/crew_npc/proc/force_door_open(obj/machinery/door/airlock/door)
	var/mob/living/carbon/human/body = pawn
	var/room_name = forcing_place
	var/label = forcing_label
	// Which errand this is. Given something else to do while its hands are in the door, it leaves off.
	var/serial = errand_serial
	if(!istype(door))
		return forcing_failure("no_door", "That is not a door you know how to open.", null, room_name, label)
	var/door_words = "[label] door of [room_name]"

	// What it finds at the door, which may not be what it was when the body set out.
	if(!door.density || (door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) came to force [forcing_door_words(door, room_name, label)], and did not: it [door.density ? "opens to its ID" : "is standing open"].")
		return list(TRUE, door.density ? "The [door_words] opens to your ID. There is no need to force it." : "The [door_words] is standing open already.", list("place" = room_name, "door" = label, "already_open" = TRUE))
	if(door.welded)
		return forcing_failure("welded", "The [door_words] is welded shut. It will not pry until the weld is cut.", door, room_name, label)
	if(door.locked)
		return forcing_failure("bolted", "The [door_words] is bolted. Bolts hold a door whether it has power or not, so it cannot be pried.", door, room_name, label)
	if(door.seal)
		return forcing_failure("pry", "The [door_words] has a seal across it. It will not pry until the seal is taken off.", door, room_name, label)

	var/had_power = door.hasPower()
	var/opened_panel = FALSE
	if(had_power)
		// The panel: a click on the door with a screwdriver opens it.
		if(!door.panel_open)
			if(!door.has_access_panel)
				return forcing_failure("panel", "The [door_words] has no panel to open.", door, room_name, label)
			var/why_no_panel = use_tool_on_door(door, TOOL_SCREWDRIVER)
			if(!still_forcing(door, serial))
				return forcing_left_off(door, room_name, label, "opening its panel")
			if(!door.panel_open)
				return forcing_failure("panel", "You could not open the panel of the [door_words]: [why_no_panel || "your screwdriver did nothing to it"].", door, room_name, label)
			opened_panel = TRUE
		// The wires. On a door that has been plated over they cannot be got at, and that shows as soon as the panel is open.
		var/why_no_wires = door.is_secure() ? "its wires are behind a plate of armour" : take_door_power(door)
		if(!still_forcing(door, serial))
			return forcing_left_off(door, room_name, label, "at its wires")
		if(why_no_wires)
			if(opened_panel && door.panel_open)
				use_tool_on_door(door, TOOL_SCREWDRIVER)
				if(!still_forcing(door, serial))
					return forcing_left_off(door, room_name, label, "shutting its panel")
			return forcing_failure("wire", "You could not take the power away from the [door_words]: [why_no_wires].", door, room_name, label, "Its panel is [door.panel_open ? "open" : "shut"]")

	// The crowbar. Two things a crowbar does to a door in place of prying it are kept clear of: with
	// the panel open on armour plating it works at the plating, and on a door that has been
	// tampered with it takes the electronics out.
	var/why_no_pry
	if(door.panel_open && door.is_secure())
		why_no_pry = "its panel is open on armour plating, which is all a crowbar would shift"
	else if(door.should_try_removing_electronics())
		why_no_pry = "as it stands a crowbar would take its electronics out, not open it"
	else
		why_no_pry = use_tool_on_door(door, TOOL_CROWBAR)
		if(!still_forcing(door, serial))
			return forcing_left_off(door, room_name, label, "prying it")
	// It slides open under the crowbar at once, and is a little over half a second about it.
	var/waited = 0
	while(isnull(why_no_pry) && door.density && waited < CREW_NPC_PRY_WAIT)
		sleep(CREW_NPC_PRY_LOOK)
		waited += CREW_NPC_PRY_LOOK
		if(!still_forcing(door, serial))
			return forcing_left_off(door, room_name, label, "prying it")
	// How long it has before its power is back, for the log: whichever of its two supplies comes back first.
	var/dead_for = min(door.remaining_main_outage(), door.remaining_backup_outage())

	// The panel is shut again, whether or not the door came open.
	var/panel_left_open = FALSE
	if(opened_panel && door.panel_open)
		use_tool_on_door(door, TOOL_SCREWDRIVER)
		if(!still_forcing(door, serial))
			return forcing_left_off(door, room_name, label, "shutting its panel")
		panel_left_open = door.panel_open

	if(door.density)
		var/panel_note = "Its panel is [door.panel_open ? "open" : "shut"], and it has [door.hasPower() ? "power" : "no power"]"
		if(door.locked)
			return forcing_failure("bolted", "The [door_words] is bolted, and bolts hold a door whether it has power or not. It would not pry.", door, room_name, label, panel_note)
		if(door.welded)
			return forcing_failure("welded", "The [door_words] is welded shut. It would not pry.", door, room_name, label, panel_note)
		if(had_power && door.hasPower())
			return forcing_failure("wire", "The power came back to the [door_words] before you could pry it.", door, room_name, label, panel_note)
		return forcing_failure("pry", "The [door_words] would not pry open[why_no_pry ? ": [why_no_pry]" : (door.seal ? ": there is a seal across it" : "")].", door, room_name, label, panel_note)

	// A way is open that was not, so a room it gave up on getting into may be worth another try.
	ways_reopened()
	blocked_places -= room_name
	blocked_tries -= room_name
	var/power_note = !had_power ? "It had no power" : (dead_for > 0 ? "Its power comes back in [round(dead_for / (1 SECONDS))] seconds" : "Its power is back already")
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) forced open [forcing_door_words(door, room_name, label)], [had_power ? "by pulsing a main and a backup power wire and prying it" : "by prying it"]. [power_note]. Its panel is [door.panel_open ? "open" : "shut"]. It stands at [AREACOORD(body)].")
	var/list/details = list("place" = room_name, "door" = label)
	var/words
	if(!had_power)
		words = "The [door_words] has no power. You pry it open with your crowbar. It stands open."
	else if(opened_panel)
		words = "You open the panel of the [door_words], take its power away and pry it open. It stands open."
	else
		words = "The panel of the [door_words] is open already. You take its power away and pry it open. It stands open."
	if(panel_left_open)
		words += " You could not screw its panel shut again."
		details["panel_open"] = TRUE
	return list(TRUE, words, details)

/**
 * Returns the outcome of an errand to force a door as the brain is to be told it: a list of
 * whether it worked, the words, and the details.
 *
 * What force_door_open() gave is passed on as it is. An errand that never got that far, because
 * the body could not get to the door, comes here with no details: that is given its reason, and
 * written to the round's game log.
 */
/datum/ai_controller/crew_npc/proc/force_door_outcome(list/outcome)
	if(length(outcome) >= 3 && islist(outcome[3]))
		return outcome
	return forcing_failure("no_way", "You could not get to the [forcing_label] door of [forcing_place].", forcing_door?.resolve(), forcing_place, forcing_label, "The walk to the door came to nothing")

#undef CREW_NPC_WIRE_GAP
#undef CREW_NPC_PRY_WAIT
#undef CREW_NPC_PRY_LOOK
