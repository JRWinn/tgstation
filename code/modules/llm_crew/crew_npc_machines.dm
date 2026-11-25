/**
 * Working a machine: how a crew NPC's body turns a pump on, wrenches a canister onto its
 * connector, switches an emitter, and sets a battery or an air alarm.
 *
 * The body goes to the machine and stands next to it, and what it does there is what a player
 * does: a click, a click with a key held, a click with a tool in its hand. Those go through the
 * same code a player's click reaches, with the body as the one clicking, so the game's own
 * checks apply: it has to be able to reach the machine, and the machine has to have power.
 *
 * Two machines have settings that are only in a window: a battery's levels, and an air alarm's
 * scrubbers and vents. The game will not open a window for a body with no player behind it. For
 * those, what the window would send is sent to the machine's own handler, after the checks the
 * window makes. That is the one place here short of a click: see work_window().
 *
 * The machines engineering staff know of are the engine room's and the station's batteries:
 * see crew_npc_engine_machines(). Each way of working one looks first, and does nothing to a
 * machine that is already as it was asked to be.
 */

/// Kinds of machine engineering staff work, as the brain is told of them.
#define CREW_MACHINE_PUMP "pump"
#define CREW_MACHINE_FILTER "filter"
#define CREW_MACHINE_CANISTER "canister"
#define CREW_MACHINE_ALARM "alarm"
#define CREW_MACHINE_EMITTER "emitter"
#define CREW_MACHINE_BATTERY "battery"

/// Ways a machine is worked, as the brain asks for them.
#define CREW_WORK_ON "on"
#define CREW_WORK_OFF "off"
#define CREW_WORK_FULL "full"
#define CREW_WORK_CONNECT "connect"
#define CREW_WORK_SWITCH_ON "switch_on"
#define CREW_WORK_SWITCH_OFF "switch_off"
#define CREW_WORK_CHARGE "charge"
#define CREW_WORK_DRAW_ALL "draw_all"

/// How long the body leaves between one click and the next. A hand is no quicker, and the game counts clicks that come faster as one.
#define CREW_NPC_CLICK_GAP (1 SECONDS)
/// What a battery is set to put out when it is set to charge. Its input goes to as much as it will take.
#define CREW_NPC_BATTERY_OUTPUT (190 KILO WATTS)

/// The machines engineering staff work, each a list: id, name, kind, nth, place, and a weak reference to the machine. Worked out once.
GLOBAL_LIST_EMPTY(crew_npc_engine_machines)
/// TRUE once that list has been worked out, whether or not it found anything.
GLOBAL_VAR_INIT(crew_npc_engine_machines_built, FALSE)

/**
 * Returns the machines engineering staff work: the pumps, filters, connected canisters, emitters
 * and chamber air alarm of the engine room, and the station's engineering batteries.
 *
 * Each is known by the name it has aboard. Machines with the same name are told apart by which
 * one they are, counted from 1 in order of where they stand, so that the count is the same
 * every round.
 */
/proc/crew_npc_engine_machines()
	if(GLOB.crew_npc_engine_machines_built)
		return GLOB.crew_npc_engine_machines
	GLOB.crew_npc_engine_machines_built = TRUE
	// Each entry found: name, kind, the machine.
	var/list/found = list()
	for(var/area/station/engineering/supermatter/room in GLOB.areas)
		for(var/list/zlevel_turfs as anything in room.get_zlevel_turf_lists())
			for(var/turf/spot as anything in zlevel_turfs)
				if(!is_station_level(spot.z))
					continue
				for(var/obj/machinery/machine in spot)
					var/list/what = crew_npc_engine_machine_kind(machine)
					if(what)
						found += list(list(what[1], what[2], machine))
	for(var/obj/machinery/power/smes/engineering/battery as anything in SSmachines.get_machines_by_type_and_subtypes(/obj/machinery/power/smes/engineering))
		if(is_station_level(battery.z) && istype(get_area(battery), /area/station/engineering))
			found += list(list("battery", CREW_MACHINE_BATTERY, battery))
	// In a fixed order: by name, then west to east, then south to north.
	sortTim(found, GLOBAL_PROC_REF(cmp_crew_npc_engine_machines))
	var/list/counts = list()
	for(var/list/entry as anything in found)
		var/obj/machinery/machine = entry[3]
		var/key = "[entry[2]]/[LOWER_TEXT(entry[1])]"
		counts[key]++
		GLOB.crew_npc_engine_machines += list(list(
			"id" = "m[length(GLOB.crew_npc_engine_machines) + 1]",
			"name" = entry[1],
			"kind" = entry[2],
			"nth" = counts[key],
			"place" = get_area_name(machine, TRUE),
			"ref" = WEAKREF(machine),
		))
	return GLOB.crew_npc_engine_machines

/// Orders two machines found for the list above: by name, then by where they stand.
/proc/cmp_crew_npc_engine_machines(list/first, list/second)
	var/by_name = sorttext(LOWER_TEXT(second[1]), LOWER_TEXT(first[1]))
	if(by_name)
		return by_name
	var/obj/machinery/first_machine = first[3]
	var/obj/machinery/second_machine = second[3]
	if(first_machine.x != second_machine.x)
		return first_machine.x - second_machine.x
	return first_machine.y - second_machine.y

/// Returns the name and kind an engine room machine is known by, as a list, or null if it is not one engineering staff work.
/proc/crew_npc_engine_machine_kind(obj/machinery/machine)
	if(istype(machine, /obj/machinery/atmospherics/components/binary/pump))
		return list(format_text(machine.name), CREW_MACHINE_PUMP)
	if(istype(machine, /obj/machinery/atmospherics/components/trinary/filter))
		return list("filter", CREW_MACHINE_FILTER)
	if(istype(machine, /obj/machinery/power/emitter))
		var/obj/machinery/power/emitter/emitter = machine
		// One that is not fixed down is spare, not part of the engine.
		return emitter.welded ? list("emitter", CREW_MACHINE_EMITTER) : null
	if(istype(machine, /obj/machinery/airalarm))
		var/obj/machinery/airalarm/alarm = machine
		// The one that is tied to the chamber. The room's own is not the engine's.
		return alarm.connected_sensor ? list("engine air alarm", CREW_MACHINE_ALARM) : null
	if(istype(machine, /obj/machinery/portable_atmospherics/canister))
		var/obj/machinery/portable_atmospherics/canister/canister = machine
		// Only one standing on a connector is there to be connected.
		if(isnull(locate(/obj/machinery/atmospherics/components/unary/portables_connector) in canister.loc))
			return null
		return list(canister.gas_type == /datum/gas/nitrogen ? "nitrogen canister" : "canister", CREW_MACHINE_CANISTER)
	return null

/// Returns the entry for one of those machines, by the id the brain knows it by, or null.
/proc/crew_npc_engine_machine_entry(machine_id)
	for(var/list/entry as anything in crew_npc_engine_machines())
		if(entry["id"] == machine_id)
			return entry
	return null

/// Returns the ways a machine of this kind can be worked.
/proc/crew_npc_machine_ways(kind)
	switch(kind)
		if(CREW_MACHINE_PUMP)
			return list(CREW_WORK_ON, CREW_WORK_OFF, CREW_WORK_FULL)
		if(CREW_MACHINE_FILTER)
			return list(CREW_WORK_ON, CREW_WORK_OFF)
		if(CREW_MACHINE_CANISTER)
			return list(CREW_WORK_CONNECT)
		if(CREW_MACHINE_EMITTER)
			return list(CREW_WORK_SWITCH_ON, CREW_WORK_SWITCH_OFF)
		if(CREW_MACHINE_BATTERY)
			return list(CREW_WORK_CHARGE)
		if(CREW_MACHINE_ALARM)
			return list(CREW_WORK_DRAW_ALL)
	return list()

/**
 * Returns how a machine is set, as the brain is told of it: `on`, and for a pump `full`.
 *
 * `on` is whatever the machine has for on: a pump or filter running, a canister connected, an
 * emitter firing, the air alarm drawing everything out of the chamber, a battery set to charge.
 */
/proc/crew_npc_machine_state(obj/machinery/machine, kind)
	switch(kind)
		if(CREW_MACHINE_PUMP)
			var/obj/machinery/atmospherics/components/binary/pump/pump = machine
			return list("on" = !!pump.on, "full" = pump.target_pressure >= MAX_OUTPUT_PRESSURE)
		if(CREW_MACHINE_FILTER)
			var/obj/machinery/atmospherics/components/trinary/filter/filter = machine
			return list("on" = !!filter.on)
		if(CREW_MACHINE_CANISTER)
			var/obj/machinery/portable_atmospherics/canister/canister = machine
			return list("on" = !isnull(canister.connected_port))
		if(CREW_MACHINE_EMITTER)
			var/obj/machinery/power/emitter/emitter = machine
			return list("on" = !!emitter.active)
		if(CREW_MACHINE_BATTERY)
			return list("on" = crew_npc_battery_charging(machine))
		if(CREW_MACHINE_ALARM)
			return list("on" = crew_npc_alarm_drawing(machine))
	return list("on" = FALSE)

/// TRUE if a battery is set to charge: taking in as much as it will, and putting out what it is meant to.
/proc/crew_npc_battery_charging(obj/machinery/power/smes/battery)
	return battery.input_attempt && battery.output_attempt && battery.input_level >= battery.input_level_max && battery.output_level == min(CREW_NPC_BATTERY_OUTPUT, battery.output_level_max)

/// Returns the room an air alarm's vents and scrubbers are in: the chamber its sensor is in, or else its own.
/proc/crew_npc_alarm_area(obj/machinery/airalarm/alarm)
	return alarm.connected_sensor ? get_area(alarm.connected_sensor) : get_area(alarm)

/// TRUE if every scrubber an air alarm controls is drawing everything out, wide, and no vent stops at a pressure.
/proc/crew_npc_alarm_drawing(obj/machinery/airalarm/alarm)
	var/area/room = crew_npc_alarm_area(alarm)
	if(!length(room.air_scrubbers))
		return FALSE
	for(var/obj/machinery/atmospherics/components/unary/vent_scrubber/scrubber as anything in room.air_scrubbers)
		if(scrubber.scrubbing != ATMOS_DIRECTION_SIPHONING || !scrubber.widenet)
			return FALSE
	for(var/obj/machinery/atmospherics/components/unary/vent_pump/vent as anything in room.air_vents)
		if(vent.pressure_checks & ATMOS_EXTERNAL_BOUND)
			return FALSE
	return TRUE

/// Tool: go to one of the machines engineering staff work, and work it one way. Engineering staff only.
/datum/ai_controller/crew_npc/proc/tool_work_machine(machine_id, how)
	if(!works_in_engineering())
		action_result(CREW_TOOL_MACHINE, FALSE, "Working the engine's machines is engineering's job.", list("reason" = "unknown"))
		return
	var/list/entry = istext(machine_id) ? crew_npc_engine_machine_entry(machine_id) : null
	var/datum/weakref/machine_ref = entry?["ref"]
	var/obj/machinery/machine = machine_ref?.resolve()
	if(isnull(machine))
		action_result(CREW_TOOL_MACHINE, FALSE, "You know of no such machine.", list("reason" = "unknown"))
		return
	if(!istext(how) || !(how in crew_npc_machine_ways(entry["kind"])))
		action_result(CREW_TOOL_MACHINE, FALSE, "That is not something you can do with the [entry["name"]].", list("reason" = "unknown"))
		return
	start_errand(machine, CREW_TOOL_MACHINE, how)

/**
 * Works the machine the body is standing by, the way it came to: errand_item says how. Sleeps
 * while the body does it.
 *
 * Returns a list: whether the machine is now as it was asked to be, then the words the brain is told, then on failure why (TRC-04): "unreached", "hands", "machine", "locked" or "unknown".
 */
/datum/ai_controller/crew_npc/proc/work_machine(obj/machinery/machine)
	var/how = errand_item
	var/list/what = crew_npc_engine_machine_kind(machine)
	if(istype(machine, /obj/machinery/power/smes))
		what = list("battery", CREW_MACHINE_BATTERY)
	if(isnull(what))
		return list(FALSE, "That is not a machine you know how to work.", "unknown")
	var/machine_name = what[1]
	var/kind = what[2]
	var/list/outcome
	switch(how)
		if(CREW_WORK_ON, CREW_WORK_OFF)
			outcome = turn_machine(machine, machine_name, how == CREW_WORK_ON)
		if(CREW_WORK_FULL)
			outcome = set_pump_full(machine, machine_name)
		if(CREW_WORK_CONNECT)
			outcome = connect_canister(machine, machine_name)
		if(CREW_WORK_SWITCH_ON, CREW_WORK_SWITCH_OFF)
			outcome = switch_emitter(machine, how == CREW_WORK_SWITCH_ON)
		if(CREW_WORK_CHARGE)
			outcome = charge_battery(machine)
		if(CREW_WORK_DRAW_ALL)
			outcome = set_alarm_drawing(machine)
		else
			return list(FALSE, "You forget what you came to do.", "unknown")
	// outcome: whether it is as asked, the words, and whether the body had to do anything to make it so.
	if(outcome[1] && outcome[3] && !QDELETED(machine))
		work_machines_set++
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) worked the [machine_name] ([kind]) at [AREACOORD(machine)]: [how].")
	else if(!outcome[1])
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) could not work the [machine_name] ([kind]) at [AREACOORD(machine)]: [how]. [outcome[2]] ([outcome[4]])")
	return list(outcome[1], outcome[2], outcome[1] ? null : outcome[4])

/**
 * Clicks something as the body, the way its player would: plainly, or with a key held ("ctrl=1",
 * "alt=1", "right=1"). Waits a moment first, so that clicks come no faster than a hand makes them.
 * `gap` is that wait. It is short for a swing at someone who will not stand still: by the end of
 * a full second they have walked out of reach.
 *
 * Returns FALSE, without clicking, if the body is in no state to reach it. A click with a key
 * held that cannot reach its target falls through to code that needs a player.
 *
 * A plain click that comes before the last swing or use is ready again is waited out first
 * (wait_to_click()), up to two seconds more: the game would throw it away unseen, and the caller
 * would be told it was made.
 *
 * `still_wanted`, if given, is asked after every wait and just before the click. A click that toggles
 * a machine is looked at then, so one somebody else set meanwhile is not set back. If it says no,
 * nothing is clicked and CREW_NPC_CLICK_NOT_NEEDED is returned.
 */
/datum/ai_controller/crew_npc/proc/click_as_body(atom/target, modifiers, gap = CREW_NPC_CLICK_GAP, datum/callback/still_wanted)
	var/mob/living/carbon/human/body = pawn
	if(gap > 0)
		sleep(gap)
	if(QDELETED(body) || QDELETED(target) || QDELETED(src))
		return FALSE
	// The game holds back a plain or right click while the last swing or use is not ready again.
	// A click with a key held is let through before that test, and need not wait for it.
	var/list/held_keys = params2list(modifiers)
	var/plain = !LAZYACCESS(held_keys, SHIFT_CLICK) && !LAZYACCESS(held_keys, CTRL_CLICK) && !LAZYACCESS(held_keys, ALT_CLICK) && !LAZYACCESS(held_keys, MIDDLE_CLICK)
	if(!wait_to_click(plain) || QDELETED(target))
		return FALSE
	if(!body.can_perform_action(target, target.interaction_flags_click | SILENT_ADJACENCY))
		return FALSE
	// Nothing sleeps from here to the click, so what is seen now is what is clicked on.
	if(still_wanted && !still_wanted.Invoke())
		return CREW_NPC_CLICK_NOT_NEEDED
	body.face_atom(target)
	body.ClickOn(target, modifiers)
	return TRUE

/// TRUE while a pump or filter is not yet as wanted. Asked just before the click that toggles it.
/datum/ai_controller/crew_npc/proc/machine_not_yet(obj/machinery/atmospherics/components/machine, on)
	return !QDELETED(machine) && !!machine.on != on

/// TRUE while an emitter is not yet as wanted. Asked just before the click that toggles it.
/datum/ai_controller/crew_npc/proc/emitter_not_yet(obj/machinery/power/emitter/emitter, on)
	return !QDELETED(emitter) && !!emitter.active != on

/// TRUE while a canister is not on a connector. A wrench on a connected one takes it off.
/datum/ai_controller/crew_npc/proc/canister_not_yet(obj/machinery/portable_atmospherics/canister/canister)
	return !QDELETED(canister) && isnull(canister.connected_port)

/**
 * Waits, as a player's own client makes them, until the body may click again: until the game would
 * not throw the click away for coming too soon. A swing, a spray or a try with the cuffs sets a
 * wait of most of a second before the next plain click is let through, and a click made inside it
 * does nothing at all.
 *
 * `plain` is TRUE for a plain or right click, the ones the game holds back while the last use is
 * not ready. Every click waits for the one before it to be taken (`next_click`).
 *
 * Waits two seconds at most: a body in cuffs is held back again on every click. Returns FALSE if
 * the body or this controller is gone, or if a plain click would still be thrown away or thrown.
 */
/datum/ai_controller/crew_npc/proc/wait_to_click(plain = TRUE)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body) || QDELETED(src))
		return FALSE
	var/ready_at = body.next_click + 1
	if(plain)
		ready_at = max(ready_at, body.next_move)
	var/wait = min(ready_at - world.time, 2 SECONDS)
	if(wait > 0)
		sleep(wait)
	if(QDELETED(body) || QDELETED(src))
		return FALSE
	if(plain && (body.next_move > world.time || body.throw_mode))
		return FALSE
	return TRUE

/**
 * Sets something in a machine's own window, as the body.
 *
 * The game will not open a window for a body with no player behind it. So what the window would
 * send is sent to the machine's own handler, with the body as the window's user, after the
 * checks the window makes: the body is next to the machine and fit to use it, and the machine
 * has power. The machine's handler makes its own checks after that, such as whether it is locked.
 *
 * Returns FALSE, having sent nothing, if the body cannot use the machine.
 */
/datum/ai_controller/crew_npc/proc/work_window(obj/machinery/machine, action, list/params)
	var/mob/living/carbon/human/body = pawn
	sleep(CREW_NPC_CLICK_GAP)
	if(QDELETED(body) || QDELETED(machine) || QDELETED(src))
		return FALSE
	if(!can_reach_target_now(machine) || !machine.can_interact(body))
		return FALSE
	body.face_atom(machine)
	// Never opened: it only stands for the window the body would be looking at.
	var/datum/tgui/window = new(body, machine, "CrewNpcHands")
	machine.ui_act(action, params || list(), window, window.state)
	qdel(window)
	return TRUE

/**
 * Sees that the hand the body clicks with is empty, and works. Returns FALSE if it could not be
 * emptied. An empty hand that is gone or hurt past use clicks nothing: one that works is swapped to,
 * and only if there is none is something put away to free one (HOLE-18).
 */
/datum/ai_controller/crew_npc/proc/empty_clicking_hand()
	note_working_hands()
	if(ready_free_hand())
		return TRUE
	free_a_hand()
	return ready_free_hand()

/// Turns a pump or a filter on or off, by the click that does that.
/datum/ai_controller/crew_npc/proc/turn_machine(obj/machinery/atmospherics/components/machine, machine_name, on)
	var/wanted = on ? "on" : "off"
	if(!!machine.on == on)
		return list(TRUE, "The [machine_name] is [wanted] already.", FALSE)
	// A ctrl-click flips it whatever it was: looked at again just before the click.
	var/clicked = click_as_body(machine, "ctrl=1", still_wanted = CALLBACK(src, PROC_REF(machine_not_yet), machine, on))
	if(clicked == CREW_NPC_CLICK_NOT_NEEDED)
		return list(TRUE, "The [machine_name] is [wanted] already.", FALSE)
	if(!clicked || QDELETED(machine))
		return list(FALSE, "You cannot reach the [machine_name] to turn it [wanted].", FALSE, "unreached")
	if(!!machine.on != on)
		return list(FALSE, "The [machine_name] will not turn [wanted]. It may have no power.", FALSE, "machine")
	return list(TRUE, "You turn the [machine_name] [wanted].", TRUE)

/// Sets a pump to its full pressure, by the click that does that.
/datum/ai_controller/crew_npc/proc/set_pump_full(obj/machinery/atmospherics/components/binary/pump/pump, machine_name)
	if(pump.target_pressure >= MAX_OUTPUT_PRESSURE)
		return list(TRUE, "The [machine_name] is set to full already.", FALSE)
	if(!click_as_body(pump, "alt=1") || QDELETED(pump))
		return list(FALSE, "You cannot reach the [machine_name] to set it to full.", FALSE, "unreached")
	if(pump.target_pressure < MAX_OUTPUT_PRESSURE)
		return list(FALSE, "The [machine_name] will not go to full.", FALSE, "machine")
	return list(TRUE, "You set the [machine_name] to full.", TRUE)

/// Switches an emitter on or off, by a click with an empty hand.
/datum/ai_controller/crew_npc/proc/switch_emitter(obj/machinery/power/emitter/emitter, on)
	var/wanted = on ? "on" : "off"
	if(!!emitter.active == on)
		return list(TRUE, "The emitter is [wanted] already.", FALSE)
	if(!empty_clicking_hand())
		return list(FALSE, "You have no free hand to switch the emitter [wanted] with.", FALSE, "hands")
	// A click flips it whatever it was: looked at again just before the click.
	var/clicked = click_as_body(emitter, still_wanted = CALLBACK(src, PROC_REF(emitter_not_yet), emitter, on))
	if(clicked == CREW_NPC_CLICK_NOT_NEEDED)
		return list(TRUE, "The emitter is [wanted] already.", FALSE)
	if(!clicked || QDELETED(emitter))
		return list(FALSE, "You cannot reach the emitter to switch it [wanted].", FALSE, "unreached")
	if(!!emitter.active != on)
		return list(FALSE, "The emitter will not switch [wanted]: [emitter.locked ? "its controls are locked" : (emitter.powernet ? "it does not answer" : "it is not on a wire")].", FALSE, "machine")
	return list(TRUE, "You switch the emitter [wanted].", TRUE)

/// Returns a wrench the body has on it: in a hand, on its belt, or in its bag. Null if it has none.
/datum/ai_controller/crew_npc/proc/wrench_carried()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/held in body.held_items)
		if(held.tool_behaviour == TOOL_WRENCH)
			return held
	for(var/obj/item/thing in body.get_all_contents())
		if(thing.tool_behaviour == TOOL_WRENCH)
			return thing
	return null

/**
 * Wrenches a canister onto the connector it is standing on. The wrench is taken out of where
 * the body keeps it by a click, used on the canister by a click, and put back by a click.
 */
/datum/ai_controller/crew_npc/proc/connect_canister(obj/machinery/portable_atmospherics/canister/canister, machine_name)
	var/mob/living/carbon/human/body = pawn
	if(canister.connected_port)
		return list(TRUE, "The [machine_name] is connected already.", FALSE)
	var/obj/item/wrench = wrench_carried()
	if(isnull(wrench))
		return list(FALSE, "You have no wrench to connect the [machine_name] with.", FALSE, "hands")
	// Where it is kept: its belt, or its bag. Null if it was in a hand to begin with.
	var/atom/kept_in = body.is_holding(wrench) ? null : wrench.loc
	if(kept_in)
		if(!empty_clicking_hand())
			return list(FALSE, "You have no free hand to take your wrench out with.", FALSE, "hands")
		if(!click_as_body(wrench) || QDELETED(wrench) || !body.is_holding(wrench))
			return list(FALSE, "You cannot get your wrench out.", FALSE, "hands")
	// It is the hand that holds the wrench that clicks.
	if(body.get_active_held_item() != wrench)
		body.swap_hand(body.get_inactive_hand_index())
	// A wrench on a connected canister takes it off: looked at again just before the click.
	var/reached = body.get_active_held_item() == wrench && click_as_body(canister, still_wanted = CALLBACK(src, PROC_REF(canister_not_yet), canister))
	var/connected = !QDELETED(canister) && !isnull(canister.connected_port)
	// The wrench goes back where it came from, whether or not that worked.
	if(kept_in && !QDELETED(kept_in) && !QDELETED(wrench) && body.get_active_held_item() == wrench)
		click_as_body(kept_in)
	if(!reached)
		return list(FALSE, "You cannot reach the [machine_name] with your wrench.", FALSE, "unreached")
	if(!connected)
		return list(FALSE, "The [machine_name] will not connect.", FALSE, "machine")
	if(reached == CREW_NPC_CLICK_NOT_NEEDED)
		return list(TRUE, "The [machine_name] is connected already.", FALSE)
	return list(TRUE, "You wrench the [machine_name] onto its connector.", TRUE)

/// Sets a battery to charge: its input to as much as it will take, and its output to what the station runs on.
/datum/ai_controller/crew_npc/proc/charge_battery(obj/machinery/power/smes/battery)
	if(crew_npc_battery_charging(battery))
		return list(TRUE, "The battery is set to charge already.", FALSE)
	if(!work_window(battery, "input", list("target" = "max")))
		return list(FALSE, "You cannot get at the battery's controls. It may have no power.", FALSE, "machine")
	work_window(battery, "output", list("target" = min(CREW_NPC_BATTERY_OUTPUT, battery.output_level_max)))
	if(!QDELETED(battery) && !battery.input_attempt)
		work_window(battery, "tryinput")
	if(!QDELETED(battery) && !battery.output_attempt)
		work_window(battery, "tryoutput")
	if(QDELETED(battery) || !crew_npc_battery_charging(battery))
		return list(FALSE, "The battery will not take the settings.", FALSE, "machine")
	return list(TRUE, "You set the battery to charge: input to full, output to [display_power(battery.output_level, convert = FALSE)].", TRUE)

/**
 * Sets an air alarm so that the chamber it is tied to has its gas drawn out and sent round:
 * every scrubber drawing everything out, wide, and no vent stopping at a pressure.
 */
/datum/ai_controller/crew_npc/proc/set_alarm_drawing(obj/machinery/airalarm/alarm)
	if(crew_npc_alarm_drawing(alarm))
		return list(TRUE, "The engine air alarm is set already.", FALSE)
	// One that is locked is unlocked the way a player does it: a right click, with an ID that opens it.
	if(alarm.locked)
		if(!empty_clicking_hand() || !click_as_body(alarm, "right=1") || QDELETED(alarm) || alarm.locked)
			return list(FALSE, "The engine air alarm is locked, and will not unlock for you.", FALSE, "locked")
	var/area/room = crew_npc_alarm_area(alarm)
	for(var/obj/machinery/atmospherics/components/unary/vent_scrubber/scrubber as anything in room.air_scrubbers)
		if(scrubber.scrubbing != ATMOS_DIRECTION_SIPHONING && !work_window(alarm, "scrubbing", list("ref" = REF(scrubber), "val" = 0)))
			return list(FALSE, "You cannot get at the engine air alarm's controls. It may have no power.", FALSE, "machine")
		if(QDELETED(alarm) || QDELETED(scrubber))
			break
		if(!scrubber.widenet)
			work_window(alarm, "widenet", list("ref" = REF(scrubber), "val" = 1))
	for(var/obj/machinery/atmospherics/components/unary/vent_pump/vent as anything in room.air_vents)
		if(QDELETED(alarm) || QDELETED(vent))
			break
		if(vent.pressure_checks & ATMOS_EXTERNAL_BOUND)
			work_window(alarm, "excheck", list("ref" = REF(vent), "val" = vent.pressure_checks))
	if(QDELETED(alarm) || !crew_npc_alarm_drawing(alarm))
		return list(FALSE, "The engine air alarm will not take the settings.", FALSE, "machine")
	return list(TRUE, "You set the engine air alarm: the scrubbers draw everything out of the chamber, and the vents have no pressure limit.", TRUE)

#undef CREW_MACHINE_PUMP
#undef CREW_MACHINE_FILTER
#undef CREW_MACHINE_CANISTER
#undef CREW_MACHINE_ALARM
#undef CREW_MACHINE_EMITTER
#undef CREW_MACHINE_BATTERY
#undef CREW_WORK_ON
#undef CREW_WORK_OFF
#undef CREW_WORK_FULL
#undef CREW_WORK_CONNECT
#undef CREW_WORK_SWITCH_ON
#undef CREW_WORK_SWITCH_OFF
#undef CREW_WORK_CHARGE
#undef CREW_WORK_DRAW_ALL
#undef CREW_NPC_CLICK_GAP
#undef CREW_NPC_BATTERY_OUTPUT
