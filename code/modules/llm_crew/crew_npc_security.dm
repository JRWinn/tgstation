/**
 * The security staff: the Head of Security and its officers.
 *
 * What the server knows and does for them: who they are, the rooms they arrive knowing, their kit,
 * an arrest, the walk to a brig cell, the cell's timer, and letting someone go. Every one of those
 * is done the way a player does it: a click with the baton, a click with the cuffs, a hold on an
 * arm, a walk, and the timer's own controls. Who is wanted, and what to do about it, is the brain
 * window's: jobs/headofsecurity.ts and jobs/officer.ts.
 *
 * It is also what a crew NPC does when it is the one arrested: it stands still, goes where it is
 * taken, and waits in the cell until the timer opens the door.
 */

/// How long the body waits before it works a cell timer's controls. The window is in front of it already.
#define CREW_NPC_TIMER_GAP (0.5 SECONDS)
/// How long the body waits after a baton hit that landed before the next: the baton's own wait, which anyone who carries one knows.
#define CREW_NPC_BATON_WAIT (2.5 SECONDS)
/// The most baton hits in one go at someone: two, and a third if they are still on their feet.
#define CREW_NPC_BATON_HITS 3
/// The most swings it makes in one go at someone, counting those that meet nothing because they stepped away.
#define CREW_NPC_BATON_SWINGS 8
/// The longest one go at someone with the baton lasts, from the first step after them.
#define CREW_NPC_BATON_CHASE (15 SECONDS)
/// The longest the body waits for a pair of cuffs to go on, once it has begun.
#define CREW_NPC_CUFF_WAIT (7 SECONDS)
/// How far (tiles) the body steps after someone who has moved off while it had its hands on them.
#define CREW_NPC_CLOSE_STEPS 4
/// How far (tiles) the body steps after someone it means to hit or cuff, who will not stand still for it.
#define CREW_NPC_CHASE_STEPS 12
/// The wait before a click that takes its own kit out, in the middle of an arrest: a baton comes off a belt in less than a second.
#define CREW_NPC_KIT_GAP (0.4 SECONDS)
/// The wait before a swing of the baton or the cuffs at someone it has just stepped up to. Any longer and they are gone again.
#define CREW_NPC_STRIKE_GAP (0.2 SECONDS)
/// The most floor a brig cell can have. Anything bigger found behind a timer is not a cell.
#define CREW_NPC_CELL_MAX_TURFS 20
/// How far (tiles) the body plans a walk in and out of a cell.
#define CREW_NPC_CELL_PATH 30
/// How long the body keeps trying one step of a walk into or out of a cell. A cell's door takes most of a second to open once it is walked into.
#define CREW_NPC_STEP_WAIT (3 SECONDS)
/// How long a cell the body could not get a prisoner into is passed over for another.
#define CREW_NPC_CELL_SKIP (2 MINUTES)
/// How long a crew NPC under arrest is held still for, each time it is looked at. It is looked at every second.
#define CREW_NPC_CUSTODY_HOLD (3 SECONDS)
/// How long a crew NPC told it is under arrest stands for it with nobody's hand on it and no cuffs on.
#define CREW_NPC_ARREST_GRACE (20 SECONDS)
/// How far (tiles) a line said in a normal voice carries: the game's own say range.
#define CREW_NPC_EARSHOT 7
/// How long a crew NPC in cuffs waits, with nobody holding it, before it takes it that nobody is coming.
#define CREW_NPC_CUFFED_ALONE (2 MINUTES)
/// How often, at most, security staff are told that the same person has laid a hand on them.
#define CREW_NPC_STRUCK_GAP (3 SECONDS)
/// How long something security staff went for and could not get, or found nothing in, is left alone.
#define CREW_NPC_KIT_SKIP (3 MINUTES)
/// Why the baton stopped, when the body was put down itself.
#define CREW_NPC_KNOCKED_DOWN "it was knocked down itself"
/// Where a crew NPC under arrest has got to: told to stand still, shut in a cell, or left to work its cuffs off.
#define CREW_CUSTODY_ARREST "arrest"
#define CREW_CUSTODY_CELL "cell"
#define CREW_CUSTODY_CUFFS "cuffs"
/// Real tries at working its cuffs off before a body left in them says it cannot do it alone (SEC-07). It keeps trying after.
#define CREW_NPC_CUFF_TRIES_ALONE 3

/datum/ai_controller/crew_npc
	/// How many arrests the body has made this shift. Its head hears of them at staff meetings.
	var/work_arrests = 0
	/// Whoever the body has arrested and not yet put in a cell, as a weak reference.
	var/datum/weakref/arrested
	/// TRUE if they stood for it: the cuffs alone went on, with no baton. Whoever did, player or crew,
	/// has the cuffs taken off in the cell (CHEAT-04, the owner's answer A). Judged by what they did, not
	/// by whether a crew controller drives them.
	var/arrested_stood = FALSE
	/// The cell the body is taking them to, and for how many minutes.
	var/datum/crew_npc_brig_cell/jail_cell
	var/jail_minutes = 0
	/// The cell its prisoner was walked into and let go in, when the body could not then get back out
	/// past them to the timer (PLAY-01). The next go at a cell only walks out and starts that timer.
	var/datum/crew_npc_brig_cell/jail_left_inside
	/// Whoever the body last set out to arrest, as a weak reference: for saying why it never got to them.
	var/datum/weakref/arrest_target
	/// Why its last go with the baton stopped short, in words for the log. Null if it landed what it meant to.
	var/baton_stopped
	/// Why it last failed to take something of its own into a hand, in words for the log. Null if it did.
	var/draw_stopped
	/// Who can open each room the body has asked about, by the room's name: list(world.time it was worked out, the names).
	var/list/keepers_cache = list()
	/// world.time the body last could not get a prisoner into each cell, by the cell's name.
	var/list/cell_refused = list()
	/// Those the body has put in a cell, by name, each with the cell.
	var/list/jailed = list()
	/// The stun baton the body last had on it, as a weak reference: the one it knows as its own.
	var/datum/weakref/own_baton
	/// What the body is on its way to for its kit, as a weak reference, and what it lately could not get or found nothing in, by REF.
	var/datum/weakref/kit_target
	var/list/kit_skipped = list()
	/// TRUE while the body is listening for anyone laying a hand on it.
	var/security_senses_on = FALSE
	/// world.time the brain was last told each person had laid a hand on the body, by REF.
	var/list/struck_told_at = list()
	/// For a body that is itself arrested: who by, as a weak reference, and their name.
	var/datum/weakref/arrested_by
	var/arrested_by_name
	/// Where it has got to: CREW_CUSTODY_ARREST, CREW_CUSTODY_CELL or CREW_CUSTODY_CUFFS. Null while it is free.
	var/custody_phase
	/// world.time whoever arrested it last had it by the arm, or began the arrest.
	var/held_at = 0
	/// The timer of the cell it is shut in, as a weak reference, and that cell's name.
	var/datum/weakref/custody_timer
	var/custody_cell
	/// How many times it has tried to work its cuffs off since it was left in them.
	var/cuff_tries = 0
	/// TRUE once it has been told it cannot get its cuffs off by itself (SEC-07), since it was left in them.
	var/cuffs_stuck_told = FALSE

/// TRUE if the body is the Head of Security, who heads the security staff.
/datum/ai_controller/crew_npc/proc/is_head_of_security(mob/living/carbon/human/body = pawn)
	return !!findtext(job_title(body), "Head of Security")

/// TRUE if the body is security staff who make arrests: the Head of Security, or a security officer.
/datum/ai_controller/crew_npc/proc/works_in_security(mob/living/carbon/human/body = pawn)
	return is_head_of_security(body) || !!findtext(job_title(body), "Security Officer")

/**
 * Gives security staff what they arrive knowing: for the Head of Security its office and the
 * room its officers work from, for an officer its post, and for both the way to the brig. The
 * names of those rooms are added to `known`. Returns the sentences that tell the brain so.
 */
/datum/ai_controller/crew_npc/proc/learn_security_places(list/known)
	var/mob/living/carbon/human/body = pawn
	var/list/sentences = list()
	if(is_head_of_security())
		office_place = learn_place(/area/station/command/heads_quarters/hos)
		if(office_place)
			known += office_place
			sentences += "You are the station's Head of Security, the head of the security staff. Your office is the [office_place], and you know the way there."
		staff_post_place = learn_place(/area/station/security/office, well_inside = TRUE)
		if(staff_post_place)
			known += staff_post_place
			sentences += "Your officers work from the [staff_post_place], and you know the way there."
	else
		// An officer's post is the middle of the Security Office: where its head calls the staff together.
		var/area/station/post_area = GLOB.areas_by_type[/area/station/security/office]
		var/turf/spot = post_area ? (middle_of(/area/station/security/office) || safe_spot_in(post_area, get_turf(body))) : null
		if(spot)
			post_place = format_text(post_area.name)
			post_turf = spot
			visited_places[post_place] = list(spot.x, spot.y, spot.z)
			known += post_place
			learn_department(post_area)
			sentences += "You are a [job_title()]. Your post is the [post_place], and you know the way there."
		// Where it would knock for the head it answers to.
		for(var/area/station/command/heads_quarters/hos/office in GLOB.areas)
			if(length(office.get_turfs_by_zlevel(body.z)))
				head_office_place = format_text(office.name)
				break
	var/brig_name = learn_place(/area/station/security/brig)
	if(brig_name)
		known += brig_name
		sentences += "The cells are in the [brig_name], and you know the way there."
	return sentences

/// TRUE if this person is down: out cold, stunned past moving, or knocked to the floor. Nobody hits someone who is.
/proc/crew_npc_person_down(mob/living/carbon/human/person)
	return person.stat != STABLE || HAS_TRAIT(person, TRAIT_INCAPACITATED) || HAS_TRAIT(person, TRAIT_FLOORED)

// The brig's cells

/// One brig cell: the timer on its wall, and the floor inside it.
/datum/crew_npc_brig_cell
	/// What the cell is called: the name on its timer.
	var/name
	/// The timer, as a weak reference.
	var/datum/weakref/timer_ref
	/// The floor inside the cell.
	var/list/turfs = list()

/// Returns everyone alive who is standing in the cell.
/datum/crew_npc_brig_cell/proc/occupants()
	var/list/inside = list()
	for(var/turf/spot as anything in turfs)
		for(var/mob/living/carbon/human/person in spot)
			if(person.stat != DEAD)
				inside += person
	return inside

/// Returns the cell's door, or null if it has none left.
/datum/crew_npc_brig_cell/proc/door()
	var/obj/machinery/status_display/door_timer/timer = timer_ref?.resolve()
	if(isnull(timer))
		return null
	for(var/datum/weakref/door_ref as anything in timer.doors)
		var/obj/machinery/door/door = door_ref.resolve()
		if(!QDELETED(door))
			return door
	return null

/// The station's brig cells, in order of name. Worked out once, the first time anyone asks.
GLOBAL_LIST_EMPTY(crew_npc_brig_cells)
/// TRUE once the station's brig cells have been looked for.
GLOBAL_VAR_INIT(crew_npc_brig_cells_found, FALSE)

/// Returns the station's brig cells: every door timer on a station level that has a cell behind it.
/proc/crew_npc_brig_cells()
	if(GLOB.crew_npc_brig_cells_found)
		return GLOB.crew_npc_brig_cells
	GLOB.crew_npc_brig_cells_found = TRUE
	var/list/found = list()
	for(var/obj/machinery/status_display/door_timer/timer as anything in SSmachines.get_machines_by_type_and_subtypes(/obj/machinery/status_display/door_timer))
		if(isnull(timer.id) || !is_station_level(timer.z))
			continue
		var/list/inside = crew_npc_cell_turfs(timer)
		if(!length(inside))
			continue
		var/datum/crew_npc_brig_cell/cell = new
		cell.name = format_text(timer.name)
		cell.timer_ref = WEAKREF(timer)
		cell.turfs = inside
		found += cell
	sortTim(found, GLOBAL_PROC_REF(cmp_crew_npc_brig_cells))
	GLOB.crew_npc_brig_cells = found
	return found

/// Puts brig cells in order of name: Cell 1, Cell 2, Cell 3. Only the order the list is shown in: free_cell() picks by room and distance.
/proc/cmp_crew_npc_brig_cells(datum/crew_npc_brig_cell/first, datum/crew_npc_brig_cell/second)
	return sorttext(second.name, first.name)

/**
 * Returns the floor inside the cell this timer is for: everything that can be walked to from
 * where its flasher hangs without going through a wall, a window or a door. The cell's own door
 * is a door whether it stands open or shut. An empty list if it has no flasher, or what lies
 * behind it is too big to be a cell.
 */
/proc/crew_npc_cell_turfs(obj/machinery/status_display/door_timer/timer)
	var/turf/start
	for(var/datum/weakref/flasher_ref as anything in timer.flashers)
		var/obj/machinery/flasher/flasher = flasher_ref.resolve()
		if(!QDELETED(flasher))
			start = get_turf(flasher)
			break
	if(isnull(start))
		return list()
	var/list/inside = list(start)
	var/list/frontier = list(start)
	while(length(frontier))
		var/turf/here = frontier[1]
		frontier.Cut(1, 2)
		for(var/direction in GLOB.cardinals)
			var/turf/next = get_step(here, direction)
			if(isnull(next) || (next in inside) || crew_npc_cell_wall_between(here, next, direction))
				continue
			inside += next
			frontier += next
			if(length(inside) > CREW_NPC_CELL_MAX_TURFS)
				return list()
	return inside

/// TRUE if a wall, a window or a door stands between this tile and the next one over.
/proc/crew_npc_cell_wall_between(turf/here, turf/next, direction)
	if(next.density)
		return TRUE
	for(var/obj/thing in here)
		// Something on this tile's edge, on the side being left by: a windoor, or a pane of glass.
		if((thing.flags_1 & ON_BORDER_1) && thing.dir == direction && (thing.density || istype(thing, /obj/machinery/door)))
			return TRUE
	for(var/obj/thing in next)
		if(thing.flags_1 & ON_BORDER_1)
			if(thing.dir == REVERSE_DIR(direction) && (thing.density || istype(thing, /obj/machinery/door)))
				return TRUE
			continue
		if(istype(thing, /obj/machinery/door))
			return TRUE
		// A window that fills its tile, a grille, a girder. A locker or a table is furniture, not a wall.
		if(thing.density && (istype(thing, /obj/structure/window) || istype(thing, /obj/structure/grille) || istype(thing, /obj/structure/girder) || istype(thing, /obj/structure/falsewall)))
			return TRUE
	return FALSE

/// Returns the brig cell this person is shut in, its timer running, or null.
/proc/crew_npc_cell_holding(mob/living/person)
	var/turf/spot = get_turf(person)
	if(isnull(spot))
		return null
	for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
		var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
		if(!isnull(timer) && timer.timing && (spot in cell.turfs))
			return cell
	return null

/// Returns the brig cell this tile is part of, or null.
/proc/crew_npc_cell_of(turf/spot)
	for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
		if(spot in cell.turfs)
			return cell
	return null

// Hands

/// Makes the hand the body uses the one that holds this. Returns FALSE if it is not holding it.
/datum/ai_controller/crew_npc/proc/hand_to(obj/item/thing)
	var/mob/living/carbon/human/body = pawn
	var/index = body.get_held_index_of_item(thing)
	if(!index)
		return FALSE
	if(index != body.active_hand_index)
		body.swap_hand(index)
	return body.get_active_held_item() == thing

/**
 * Takes something the body has on it into a hand, by a click, and makes that the hand it uses.
 * `gap` is the wait before the click. Returns FALSE if it could not. `serial` is the errand it is
 * for, if it is for one: called off, it stops (errand_over()).
 *
 * The hand is looked at again after the wait. The bar's monkey hands people drinks, and a bottle
 * pushed into the empty hand during the wait turned the click into a poke at its own belt with
 * the bottle: the baton stayed where it was.
 */
/datum/ai_controller/crew_npc/proc/draw_item(obj/item/thing, gap = CREW_NPC_KIT_GAP, serial = null)
	var/mob/living/carbon/human/body = pawn
	draw_stopped = null
	if(QDELETED(thing))
		draw_stopped = "it was gone"
		return FALSE
	if(body.is_holding(thing))
		return hand_to(thing)
	// Twice: a click that comes to nothing is made once more, a moment later.
	for(var/go in 1 to 2)
		if(!empty_clicking_hand())
			draw_stopped = "it had no hand it could empty"
			return FALSE
		sleep(go == 1 ? gap : 0.3 SECONDS)
		if(errand_over(serial))
			draw_stopped = "it was called away"
			return FALSE
		if(QDELETED(src) || QDELETED(body) || QDELETED(thing))
			draw_stopped = "it was gone"
			return FALSE
		if(body.is_holding(thing))
			return hand_to(thing)
		if(!empty_clicking_hand())
			draw_stopped = "something was put in its hand as it reached"
			continue
		// A player can click something in a belt or bag only once it is open on screen: the open
		// click (a right click with the empty hand) on each storage it is in, outermost first. A left
		// click would take a box out of the bag, or take off a worn thing with pockets. Storages that
		// show nothing when opened are left alone: a right click on them falls through to a pick-up.
		var/list/holders = list()
		var/atom/holder = thing.loc
		while(isitem(holder) && holder != body && holder.atom_storage)
			holders.Insert(1, holder)
			holder = holder.loc
		var/opened = TRUE
		for(var/obj/item/storage_item as anything in holders)
			if(!storage_item.atom_storage?.display_contents)
				continue
			if(!empty_clicking_hand() || !click_as_body(storage_item, "right=1", gap))
				opened = FALSE
				break
		if(QDELETED(src) || QDELETED(body) || QDELETED(thing))
			draw_stopped = "it was gone"
			return FALSE
		if(errand_over(serial))
			draw_stopped = "it was called away"
			return FALSE
		if(!opened)
			draw_stopped = "it could not open what it was kept in"
			continue
		if(!empty_clicking_hand())
			draw_stopped = "something was put in its hand as it reached"
			continue
		if(!click_as_body(thing, null, 0))
			draw_stopped = "it was in no state to reach for it"
			continue
		if(QDELETED(thing))
			draw_stopped = "it was gone"
			return FALSE
		if(body.is_holding(thing))
			draw_stopped = null
			return hand_to(thing)
		draw_stopped = "the click on it did not bring it to hand"
	return FALSE

/**
 * Lets go of whatever the body is holding that is not its own baton or cuffs, the way anyone
 * drops what they have in their hands to draw a weapon. It goes on the floor at its feet: there
 * is no time to find a table for it. The owner: "when they need to pull their weapon they should
 * probably drop whatever they are holding". The same before the cuffs (KNA-05, the owner's yes):
 * `what` names what it is drawing, for the log.
 */
/datum/ai_controller/crew_npc/proc/drop_for_weapon(what = "its baton")
	var/mob/living/carbon/human/body = pawn
	var/list/dropped = list()
	for(var/obj/item/held in body.held_items.Copy())
		if((held.item_flags & ABSTRACT) || istype(held, /obj/item/melee/baton/security) || istype(held, /obj/item/restraints/handcuffs))
			continue
		var/held_name = format_text(held.name)
		if(body.dropItemToGround(held))
			dropped += held_name
	if(length(dropped))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) dropped [english_list(dropped)] at [AREACOORD(body)] to draw [what].")

/// Puts something the body holds into the bag on its back, by a click on the bag. Returns FALSE if it is still in its hand.
/datum/ai_controller/crew_npc/proc/stow_in_bag(obj/item/thing)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(thing) || !body.is_holding(thing))
		return TRUE
	var/obj/item/bag = body.back
	if(isnull(bag) || !hand_to(thing))
		return FALSE
	click_as_body(bag)
	return QDELETED(thing) || !body.is_holding(thing)

/**
 * TRUE if the body could take a step now, as a player could: it is not stunned, out cold, dead
 * or buckled, and nobody has it in more than a passive grab. The game's own refusal of a step is
 * made where a player's key press asks for it, not in Move, so a body moved step by step in code
 * has to be asked first. Knocked to the floor alone, it may still crawl.
 */
/datum/ai_controller/crew_npc/proc/can_step()
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body) || QDELETED(src))
		return FALSE
	if(!(body.mobility_flags & MOBILITY_MOVE) || body.stat == DEAD || body.buckled)
		return FALSE
	if(body.pulledby && body.pulledby.grab_state > GRAB_PASSIVE)
		return FALSE
	return TRUE

/// TRUE if the body has been put down itself: stunned, out cold or dead, past using its hands or feet.
/datum/ai_controller/crew_npc/proc/knocked_down_itself()
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body) || QDELETED(src))
		return FALSE
	return body.stat == DEAD || !(body.mobility_flags & MOBILITY_MOVE) || INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_GRAB)

/**
 * Steps after someone who has moved off, a tile at a time, until the body is next to them:
 * straight at them, and round whatever is in the way when that step will not go. A bar is all
 * tables and stools, and a step straight at someone across one goes nowhere.
 *
 * `most` is how many steps it will take over it, and how far off they may be. `serial` is the
 * errand it is for: called off, it takes no more steps.
 * Returns FALSE if they are out of sight, too far off to step after, or there is no way to them.
 */
/datum/ai_controller/crew_npc/proc/close_with(mob/living/person, most = CREW_NPC_CLOSE_STEPS, serial = null)
	var/mob/living/carbon/human/body = pawn
	for(var/taken in 0 to most)
		if(QDELETED(person) || QDELETED(body) || QDELETED(src) || !isturf(person.loc) || !isturf(body.loc) || errand_over(serial))
			return FALSE
		if(can_reach_target_now(person))
			body.face_atom(person)
			return TRUE
		if(taken == most || get_dist(body, person) > most || !crew_npc_sees(person, body))
			return FALSE
		// Stunned, out cold or dead, it lies where it fell. Moved with no player behind it, it slid along the floor after them.
		if(!can_step())
			return FALSE
		var/turf/from = get_turf(body)
		var/turf/next = get_step_towards(body, person)
		if(!isnull(next) && crew_npc_safe_turf(next))
			body.Move(next, get_dir(body, next))
		// It did not move: something stands in the way. The first step of the way round it.
		if(get_turf(body) == from)
			// Straight steps only, as every crew walk: a diagonal step into someone just stops, while a
			// head-on one swaps places with them.
			var/list/path = get_path_to(body, person, max_distance = CREW_NPC_CELL_PATH, mintargetdist = 1, access = get_access(), diagonal_handling = DIAGONAL_REMOVE_ALL)
			if(QDELETED(person) || QDELETED(body) || QDELETED(src) || !length(path))
				return FALSE
			next = path[1]
			if(next == from && length(path) > 1)
				next = path[2]
			if(next == from || get_dist(from, next) > 1 || !crew_npc_safe_turf(next))
				return FALSE
			body.Move(next, get_dir(body, next))
			if(get_turf(body) == from)
				return FALSE
		sleep(max(movement_delay, 0.2 SECONDS))
	return FALSE

/**
 * Walks the body a short way, a step at a time, to this tile or to within `near` tiles of it. It is
 * for the few steps into a cell and out of it, where it has to be exactly where it means to be. A
 * door in the way that opens to its ID is walked into, which opens it, and tried again.
 *
 * Returns TRUE if it got there. `serial` is the errand it is for: called off, it stops where it is.
 */
/datum/ai_controller/crew_npc/proc/walk_steps(turf/destination, near = 0, serial = null)
	var/mob/living/carbon/human/body = pawn
	if(isnull(destination))
		return FALSE
	if(get_turf(body) == destination || (near && get_dist(body, destination) <= near && body.z == destination.z))
		return TRUE
	// Straight steps only, as every crew walk. The game swaps places only head-on: a diagonal step
	// past someone, such as out of a cell past the prisoner just let go, stops against them.
	var/list/path = get_path_to(body, destination, max_distance = CREW_NPC_CELL_PATH, mintargetdist = near, access = get_access(), diagonal_handling = DIAGONAL_REMOVE_ALL)
	if(QDELETED(src) || QDELETED(body) || !length(path) || errand_over(serial))
		return FALSE
	for(var/turf/next as anything in path)
		// A door walked into opens, and is not open yet: the step is tried until it has had time to be.
		var/tried_from = world.time
		while(get_turf(body) != next && world.time - tried_from < CREW_NPC_STEP_WAIT)
			if(!can_step())
				return FALSE
			body.Move(next, get_dir(body, next))
			sleep(max(movement_delay, 0.2 SECONDS))
			if(QDELETED(src) || QDELETED(body) || errand_over(serial))
				return FALSE
		if(get_turf(body) != next)
			return FALSE
	return TRUE

// Kit

/// TRUE if this is a stun baton with charge for at least one hit.
/datum/ai_controller/crew_npc/proc/is_live_baton(obj/item/thing)
	var/obj/item/melee/baton/security/baton = thing
	return istype(baton) && !isnull(baton.cell) && baton.cell.charge >= baton.cell_hit_cost

/// TRUE if this is a pair of handcuffs nobody is wearing.
/datum/ai_controller/crew_npc/proc/is_spare_cuffs(obj/item/thing)
	var/obj/item/restraints/handcuffs/cuffs = thing
	if(!istype(cuffs) || cuffs.used)
		return FALSE
	var/mob/living/carbon/wearer = cuffs.loc
	return !istype(wearer) || wearer.handcuffed != cuffs

/// Returns a stun baton the body has on it, in a hand or in its bag: one with charge if it has one. Null if it has none.
/datum/ai_controller/crew_npc/proc/baton_carried(charged_only = FALSE)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/melee/baton/security/flat
	for(var/obj/item/melee/baton/security/baton in body.get_all_contents())
		if(is_live_baton(baton))
			return baton
		flat ||= baton
	return charged_only ? null : flat

/// Returns a pair of handcuffs the body has on it, in a hand, a pocket or its bag. Null if it has none.
/datum/ai_controller/crew_npc/proc/cuffs_carried()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/restraints/handcuffs/cuffs in body.get_all_contents())
		if(is_spare_cuffs(cuffs))
			return cuffs
	return null

/// What the body has of its kit, for the brain.
/datum/ai_controller/crew_npc/proc/kit_details()
	return list("has_baton" = !isnull(baton_carried(TRUE)), "has_cuffs" = !isnull(cuffs_carried()))

/// TRUE if the body went for this lately and could not get it, or found nothing in it.
/datum/ai_controller/crew_npc/proc/kit_skips(atom/thing)
	var/skipped_at = kit_skipped[REF(thing)]
	return !isnull(skipped_at) && world.time - skipped_at < CREW_NPC_KIT_SKIP

/// Returns the nearest security officer's locker that opens to the body's ID and that it has not lately found empty. Null if there is none.
/datum/ai_controller/crew_npc/proc/kit_locker()
	var/mob/living/carbon/human/body = pawn
	var/static/list/lockers
	if(isnull(lockers))
		lockers = list()
		for(var/area/station/security/place in GLOB.areas)
			for(var/obj/structure/closet/secure_closet/security/sec/locker in place)
				lockers += WEAKREF(locker)
	var/obj/structure/closet/secure_closet/security/sec/nearest
	var/nearest_distance = INFINITY
	for(var/datum/weakref/locker_ref as anything in lockers)
		var/obj/structure/closet/secure_closet/security/sec/locker = locker_ref.resolve()
		if(QDELETED(locker) || locker.z != body.z || kit_skips(locker) || !locker.allowed(body))
			continue
		var/distance = get_dist(body, locker)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = locker
	return nearest

/**
 * Tool: see that the body has a stun baton and a pair of handcuffs on it. Security staff only.
 *
 * One of either lying in sight is picked up first: a baton knocked out of its hand, cuffs a
 * prisoner has worked off. Otherwise it goes to a security officer's locker, opens it with its
 * own ID, and takes what it is short of out of the belt inside. One call does one of those. The
 * brain is told what the body has after it.
 */
/datum/ai_controller/crew_npc/proc/tool_get_kit()
	if(!works_in_security())
		action_result(CREW_TOOL_GET_KIT, FALSE, "A baton and cuffs are for security to carry.")
		return
	var/mob/living/carbon/human/body = pawn
	var/need_baton = isnull(baton_carried(TRUE))
	var/need_cuffs = isnull(cuffs_carried())
	if(!need_baton && !need_cuffs)
		action_result(CREW_TOOL_GET_KIT, TRUE, "You have your baton and your cuffs.", kit_details())
		return
	var/obj/item/nearest
	var/nearest_distance = INFINITY
	for(var/obj/item/thing in crew_npc_visible(oview(CREW_NPC_VISION_RANGE, body), body))
		if(!isturf(thing.loc) || thing.anchored || kit_skips(thing))
			continue
		if(!(need_baton && is_live_baton(thing)) && !(need_cuffs && is_spare_cuffs(thing)))
			continue
		// What lies in a cell that is shut is left until the cell opens.
		if(!isnull(crew_npc_cell_holding(thing)))
			continue
		var/distance = get_dist(body, thing)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = thing
	var/atom/target = nearest || kit_locker()
	if(isnull(target))
		var/list/details = kit_details()
		details["reason"] = "no_locker"
		action_result(CREW_TOOL_GET_KIT, FALSE, "You are short of [need_baton ? "a baton" : ""][need_baton && need_cuffs ? " and " : ""][need_cuffs ? "cuffs" : ""], and know of no locker that has any.", details)
		return
	kit_target = WEAKREF(target)
	start_errand(target, CREW_TOOL_GET_KIT, null)

/// Takes what the body is short of from what it has walked up to: something on the floor, or a locker. Sleeps while it does so.
/datum/ai_controller/crew_npc/proc/take_kit(atom/target)
	var/serial = errand_serial
	var/gained = FALSE
	if(isitem(target))
		gained = pick_up_kit(target)
	else if(istype(target, /obj/structure/closet))
		gained = kit_from_locker(target, serial)
	if(QDELETED(src) || QDELETED(pawn))
		return list(FALSE, "You could not get to it.")
	if(errand_over(serial))
		return list(FALSE, "You break off.", list("reason" = "called_off"))
	var/list/details = kit_details()
	var/has_baton = details["has_baton"]
	var/has_cuffs = details["has_cuffs"]
	if(!gained && !QDELETED(target))
		kit_skipped[REF(target)] = world.time
	if(has_baton && has_cuffs)
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) has its baton and cuffs.")
		return list(TRUE, "You have your baton and your cuffs.", details)
	var/short = "[has_baton ? "" : "a baton"][!has_baton && !has_cuffs ? " or " : ""][has_cuffs ? "" : "cuffs"]"
	// The same, as it reads after "no".
	var/lacking = "[has_baton ? "" : "baton"][!has_baton && !has_cuffs ? " or " : ""][has_cuffs ? "" : "cuffs"]"
	if(gained)
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) took some of its kit at [AREACOORD(pawn)], and is still short of [short].")
		return list(TRUE, "You take what you can use. You still have no [lacking].", details)
	details["reason"] = "nothing"
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) found no [lacking] at [AREACOORD(pawn)].")
	return list(FALSE, "You find no [lacking] there.", details)

/// Picks a baton or a pair of cuffs up off the floor, by a click, and puts it in the bag. Returns TRUE if the body now has it.
/datum/ai_controller/crew_npc/proc/pick_up_kit(obj/item/thing)
	var/mob/living/carbon/human/body = pawn
	if(!isturf(thing.loc) || !empty_clicking_hand())
		return FALSE
	if(!click_as_body(thing) || QDELETED(thing) || !body.is_holding(thing))
		return FALSE
	stow_in_bag(thing)
	return TRUE

/**
 * Opens a security officer's locker and takes what the body is short of. A locked one is clicked
 * once to unlock it with the body's ID and again to open it, as a player does. What is inside
 * comes out onto the locker's tile: anything loose is picked up, and a belt is picked up, has what
 * is wanted taken out of it, and is put back. The locker is shut again after.
 *
 * Returns TRUE if the body came away with anything. Called off (`serial`, see errand_over()), it
 * stops where it is, the locker left as it is.
 */
/datum/ai_controller/crew_npc/proc/kit_from_locker(obj/structure/closet/locker, serial = null)
	if(!empty_clicking_hand())
		log_kit_step(locker, "it has no free hand to open the locker with")
		return FALSE
	if(!locker.opened)
		if(locker.locked)
			var/clicked = click_as_body(locker)
			if(!QDELETED(locker) && locker.locked)
				log_kit_step(locker, clicked ? "the locker is still locked after a click to unlock it" : "it could not reach the locker to unlock it")
		if(QDELETED(locker) || locker.locked || errand_over(serial))
			return FALSE
		if(!locker.opened)
			var/clicked = click_as_body(locker)
			if(!QDELETED(locker) && !locker.opened)
				log_kit_step(locker, clicked ? "the locker is unlocked and still shut after a click to open it" : "it could not reach the locker to open it")
		if(QDELETED(locker) || !locker.opened || errand_over(serial))
			return FALSE
	var/turf/spill = locker.drop_location()
	var/gained = FALSE
	// What the open locker has put on its tile, for the log: a trip that comes away with nothing says what it had to choose from.
	var/list/spilled = list()
	for(var/obj/item/thing in spill)
		spilled += thing.name
	for(var/go in 1 to 4)
		var/need_baton = isnull(baton_carried(TRUE))
		var/need_cuffs = isnull(cuffs_carried())
		if(QDELETED(src) || QDELETED(pawn) || (!need_baton && !need_cuffs) || errand_over(serial))
			break
		var/obj/item/loose
		var/obj/item/storage/belt/security/belt
		for(var/obj/item/thing in spill)
			if((need_baton && is_live_baton(thing)) || (need_cuffs && is_spare_cuffs(thing)))
				loose = thing
				break
			if(!istype(thing, /obj/item/storage/belt/security) || belt)
				continue
			for(var/obj/item/kept in thing)
				if((need_baton && is_live_baton(kept)) || (need_cuffs && is_spare_cuffs(kept)))
					belt = thing
					break
		if(loose)
			if(!pick_up_kit(loose))
				log_kit_step(locker, "it could not pick up [loose] from the locker's tile")
				break
			gained = TRUE
			continue
		if(isnull(belt))
			if(!gained)
				log_kit_step(locker, "nothing the open locker put down is what it is short of, loose or in a security belt. On the tile: [length(spilled) ? english_list(spilled) : "nothing"]")
			break
		// The belt goes on, baton and all, as anyone in security wears it. If it will not, what
		// is wanted is taken out of it.
		if(!wear_kit_belt(belt, locker, serial) && !kit_from_belt(belt, locker, serial))
			break
		gained = TRUE
	if(!QDELETED(locker) && !QDELETED(pawn) && locker.opened && empty_clicking_hand() && !errand_over(serial))
		click_as_body(locker)
	return gained

/// Writes to the round's game log which step at a locker came to nothing, and why. The body learns nothing from it.
/datum/ai_controller/crew_npc/proc/log_kit_step(obj/structure/closet/locker, why)
	if(QDELETED(pawn))
		return
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) at the [QDELETED(locker) ? "locker" : "[locker.name] at ([locker.x],[locker.y])"]: [why]. It stands at [AREACOORD(pawn)].")

/// Returns a charged stun baton the body has on it that is not inside this belt. Null if it has none.
/datum/ai_controller/crew_npc/proc/own_baton_apart_from(obj/item/storage/belt)
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/melee/baton/security/baton in body.get_all_contents())
		if(baton.loc != belt && is_live_baton(baton))
			return baton
	return null

/**
 * Puts a security belt on, as a player would. What the body wears on its belt now, its PDA, is
 * taken off with a click and put in a pocket with a click on the pocket: a pocket that is full
 * of something other than its cuffs is emptied into its bag first. Then the belt is picked up
 * and put on with the key that puts on whatever is in the hand.
 *
 * Returns TRUE if the belt is on. On FALSE the belt may be in its hand: kit_from_belt() goes on
 * from there. A PDA left in its hand is put back where it was.
 */
/datum/ai_controller/crew_npc/proc/wear_kit_belt(obj/item/storage/belt/security/belt, obj/structure/closet/locker, serial = null)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/worn = body.belt
	// One on already: this one is only for what is in it.
	if(istype(worn, /obj/item/storage/belt/security))
		return FALSE
	if(!isnull(worn))
		var/slot = isnull(body.r_store) ? ITEM_SLOT_RPOCKET : (isnull(body.l_store) ? ITEM_SLOT_LPOCKET : null)
		if(isnull(slot))
			// The pocket that does not hold its cuffs is emptied into its bag.
			var/obj/item/pocketed = istype(body.r_store, /obj/item/restraints/handcuffs) ? body.l_store : body.r_store
			slot = pocketed == body.r_store ? ITEM_SLOT_RPOCKET : ITEM_SLOT_LPOCKET
			if(!draw_item(pocketed) || !stow_in_bag(pocketed))
				log_kit_step(locker, "it could not clear a pocket for what it wears on its belt: the [pocketed.name] would not go into its bag")
				return FALSE
		if(!draw_item(worn))
			log_kit_step(locker, "it could not take the [worn.name] off its belt")
			return FALSE
		sleep(CREW_NPC_TIMER_GAP)
		if(QDELETED(src) || QDELETED(body) || QDELETED(worn) || errand_over(serial))
			return FALSE
		// A click on the pocket with it in hand.
		body.attack_ui(slot)
		if(body.get_item_by_slot(slot) != worn)
			log_kit_step(locker, "the [worn.name] would not go into its pocket")
			// Back where it was, with the key that puts on what is in the hand.
			if(body.is_holding(worn) && hand_to(worn))
				body.execute_quick_equip()
			return FALSE
	if(errand_over(serial) || !empty_clicking_hand() || !click_as_body(belt) || QDELETED(belt) || !body.is_holding(belt))
		if(!errand_over(serial))
			log_kit_step(locker, "it could not pick up the [belt.name] from the locker's tile")
		return FALSE
	if(!hand_to(belt))
		return FALSE
	sleep(CREW_NPC_TIMER_GAP)
	if(QDELETED(src) || QDELETED(body) || QDELETED(belt) || errand_over(serial))
		return FALSE
	body.execute_quick_equip()
	if(body.belt != belt)
		log_kit_step(locker, "the [belt.name] would not go on: it is [body.is_holding(belt) ? "still in its hand" : "not on it"]")
		return FALSE
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) put on the [belt.name] from the [locker.name] at ([locker.x],[locker.y]).")
	return TRUE

/// Picks a security belt up, takes what the body is short of out of it into its bag, and puts the belt back in the open locker. Returns TRUE if it took anything.
/datum/ai_controller/crew_npc/proc/kit_from_belt(obj/item/storage/belt/security/belt, obj/structure/closet/locker, serial = null)
	var/mob/living/carbon/human/body = pawn
	// What it is short of, worked out before the belt is in its hand: once it is, what is in the belt counts as carried.
	// It may have the belt in its hand already, having tried to put it on: so what is in the belt is left out of the count.
	var/need_baton = isnull(own_baton_apart_from(belt))
	var/need_cuffs = TRUE
	for(var/obj/item/restraints/handcuffs/cuffs in body.get_all_contents())
		if(cuffs.loc != belt && is_spare_cuffs(cuffs))
			need_cuffs = FALSE
			break
	if(errand_over(serial))
		return FALSE
	if(!body.is_holding(belt) && (!empty_clicking_hand() || !click_as_body(belt) || QDELETED(belt) || !body.is_holding(belt)))
		log_kit_step(locker, "it could not pick up the [belt.name] from the locker's tile")
		return FALSE
	var/took = FALSE
	for(var/obj/item/thing as anything in belt.contents.Copy())
		if(QDELETED(src) || QDELETED(body) || QDELETED(thing) || errand_over(serial))
			break
		var/is_baton = need_baton && is_live_baton(thing)
		if(!is_baton && !(need_cuffs && is_spare_cuffs(thing)))
			continue
		// The hand that is not holding the belt takes it out.
		if(!empty_clicking_hand() || !click_as_body(thing) || QDELETED(thing) || !body.is_holding(thing))
			log_kit_step(locker, "it could not take the [thing.name] out of the belt in its hand")
			continue
		if(!stow_in_bag(thing))
			log_kit_step(locker, "the [thing.name] would not go into its bag, and stays in its hand")
		if(is_baton)
			need_baton = FALSE
		else
			need_cuffs = FALSE
		took = TRUE
	if(!took)
		log_kit_step(locker, "it picked up the [belt.name] and took nothing out of it")
	// A click on an open locker with something in hand puts it down inside.
	if(!QDELETED(belt) && !QDELETED(locker) && body.is_holding(belt) && hand_to(belt))
		click_as_body(locker)
	return took

// The arrest

/// What an errand of security's tells the brain beyond its words: what the errand itself had to say, or why it came to nothing.
/datum/ai_controller/crew_npc/proc/security_details(tool, list/outcome)
	if(length(outcome) >= 3 && islist(outcome[3]))
		return outcome[3]
	if(outcome[1])
		return null
	// It never got there.
	var/list/details = list("reason" = (tool == CREW_TOOL_ARREST ? "lost" : "no_way"))
	// Someone it can still see is not lost: there is a door or a counter between them. The brain is told which room they are in.
	var/mob/living/carbon/human/wanted = arrest_target?.resolve()
	if(tool == CREW_TOOL_ARREST && !QDELETED(wanted) && !QDELETED(pawn) && crew_npc_sees(wanted, pawn))
		details["reason"] = "no_way"
		details["handle"] = handle_for(wanted)
		details["place"] = get_area_name(wanted, TRUE)
		details["keepers"] = room_keepers(get_area(wanted))
		// Fire doors shut between them are said, as for a walk: the brain resets a pulled alarm to open them.
		fire_door_report(details)
	if(tool == CREW_TOOL_GET_KIT)
		details += kit_details()
		var/atom/target = kit_target?.resolve()
		if(!QDELETED(target))
			kit_skipped[REF(target)] = world.time
	// A cell whose timer it could not get to is passed over for the next one, as a cell it could not
	// walk into is (put_in_cell). Not when it was knocked down itself: that is not the cell's doing.
	if(tool == CREW_TOOL_JAIL && !isnull(jail_cell) && !QDELETED(pawn) && !knocked_down_itself())
		var/mob/living/carbon/human/prisoner = arrested?.resolve()
		var/prisoner_name = QDELETED(prisoner) ? null : prisoner.name
		// Its prisoner is in this cell already, let go (PLAY-01): still stuck inside with them, and the
		// cell has not refused them.
		if(jail_left_inside == jail_cell)
			details["reason"] = "stuck_inside"
		else
			cell_refuses(jail_cell, prisoner_name || "its prisoner", "it could not get to the cell's timer")
		details["cell"] = jail_cell.name
		if(prisoner_name)
			details["prisoner"] = prisoner_name
	return details

/// room_keepers() for a room, worked out afresh once a minute at most: it is asked for with every look the body takes.
/datum/ai_controller/crew_npc/proc/keepers_known(area/room, place)
	// With no PDA it goes by who is in sight, which changes from one look to the next.
	if(isnull(pda_messenger()))
		return room_keepers(room)
	var/list/known = keepers_cache[place]
	if(known && world.time - known[1] < 1 MINUTES)
		return known[2]
	var/list/names = room_keepers(room)
	keepers_cache[place] = list(world.time, names)
	return names

/**
 * Returns the names on the body's PDA list whose job opens a door of this room, for a body that
 * is shut out of it with a warrant on someone inside: those who work behind the door first, then
 * heads of department, then the Captain, whose card opens every door. It is what anyone aboard
 * knows: cargo's people open cargo's doors. Going by job titles, not by anyone's card (CHEAT-02).
 * With no PDA of its own (taken, or lost), those in sight whose ID says a job that opens it
 * (KNA-26): someone it could call out to. Empty if the room has no door that is locked to it.
 */
/datum/ai_controller/crew_npc/proc/room_keepers(area/room)
	var/mob/living/carbon/human/body = pawn
	if(isnull(room) || QDELETED(body))
		return list()
	var/list/doors = list()
	for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(room, body.z))
		if(!door.allowed(body))
			doors += door
	if(!length(doors))
		return list()
	var/datum/computer_file/program/messenger/own_messenger = pda_messenger()
	if(!isnull(own_messenger))
		return crew_npc_contacts_who_open(doors, own_messenger)
	var/list/titles = list()
	if(can_perceive() && isturf(body.loc) && !body.is_blind())
		for(var/mob/living/carbon/human/person in crew_npc_visible(view(CREW_NPC_VISION_RANGE, body), body))
			if(person == body || person.stat > SOFT_CRIT)
				continue
			var/datum/job/their_job = crew_npc_job_of(person)
			if(their_job)
				titles[person.name] = their_job.title
	return crew_npc_keepers_by_title(doors, titles)

/**
 * Returns the names on a PDA's messenger list whose job, by the title the list shows, is one whose
 * card opens one of these doors: those who work behind them first, then heads of department, then
 * the Captain. What anyone reading the list knows (CHEAT-02): names and job titles, nothing of
 * where anyone is or what is on their card. A title that is no job (renamed, or one the Head of
 * Personnel made up) opens nothing, as someone reading it would take it. Someone far off or with
 * no card is written to all the same, and does not come; the wait then moves on to the next name.
 * A name not on the crew manifest, which every PDA can show, is left out (CHEAT-02, the owner's
 * answer A): PDAs in ruins and on other ships, and people who have left the station.
 */
/proc/crew_npc_contacts_who_open(list/doors, datum/computer_file/program/messenger/own_messenger)
	var/list/titles = list()
	var/list/aboard = crew_npc_manifest_names()
	for(var/messenger_ref in GLOB.pda_messengers)
		var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
		// As the messenger's own list goes (get_messengers()): not itself, not hidden, with a computer.
		if(candidate == own_messenger || candidate.invisible || isnull(candidate.computer) || !candidate.computer.saved_identification)
			continue
		if(!aboard[candidate.computer.saved_identification])
			continue
		titles[candidate.computer.saved_identification] = candidate.computer.saved_job
	return crew_npc_keepers_by_title(doors, titles)

/**
 * The names on the crew manifest (GLOB.manifest.general, what the PDA's crew manifest shows), as a
 * list keyed by name. Crew NPCs are spawned outside the job system and get no record, so each one's
 * name stands in for the record it should have (they are crew aboard), until their spawn puts them
 * on the manifest itself (CHEAT-02, held for crew_npc_spawn.dm).
 */
/proc/crew_npc_manifest_names()
	var/list/names = list()
	for(var/datum/record/crew/record as anything in GLOB.manifest.general)
		names[record.name] = TRUE
	for(var/owner in GLOB.crew_brain_links)
		var/datum/crew_brain_link/link = GLOB.crew_brain_links[owner]
		for(var/datum/ai_controller/crew_npc/controller as anything in link?.npcs)
			var/mob/living/carbon/human/crew_body = controller?.pawn
			if(!QDELETED(crew_body))
				names[crew_body.real_name] = TRUE
	return names

/**
 * Of these people, by name with the job title each is known by, those whose job opens one of
 * these doors: those who work behind them first, then heads of department, then the Captain.
 */
/proc/crew_npc_keepers_by_title(list/doors, list/titles)
	var/list/names = list()
	var/list/heads = list()
	var/list/captains = list()
	if(!length(doors))
		return names
	// What each title's card opens, worked out once a call: many share a job.
	var/list/opens_by_title = list()
	for(var/name in titles)
		var/title = titles[name]
		if(!istext(title) || !length(title))
			continue
		if(isnull(opens_by_title[title]))
			var/list/job_access = crew_npc_job_access(SSjob.get_job(title))
			var/opens = FALSE
			if(length(job_access))
				for(var/obj/machinery/door/airlock/door as anything in doors)
					if(door.check_access_list(job_access))
						opens = TRUE
						break
			opens_by_title[title] = opens
		if(!opens_by_title[title])
			continue
		var/datum/job/their_job = SSjob.get_job(title)
		if(istype(their_job, /datum/job/captain))
			captains += name
		else if(their_job?.departments_bitflags & DEPARTMENT_BITFLAG_COMMAND)
			heads += name
		else
			names += name
	return names + heads + captains

/**
 * Tool: go up to someone and arrest them. Security staff only.
 *
 * `how` is CREW_ARREST_QUIET (the cuffs, on someone who stands for it), CREW_ARREST_FORCE (the
 * baton first, then the cuffs) or CREW_ARREST_STOP (the baton and no cuffs, for someone who has
 * attacked the body and is not being arrested). Nobody arrests the Captain.
 */
/datum/ai_controller/crew_npc/proc/tool_arrest(handle, how)
	if(!works_in_security())
		action_result(CREW_TOOL_ARREST, FALSE, "Arresting people is security's job.")
		return
	var/mob/living/carbon/human/body = pawn
	var/datum/weakref/person_ref = istext(handle) ? handle_people[handle] : null
	var/mob/living/carbon/human/person = person_ref?.resolve()
	if(QDELETED(person) || !recently_saw(person))
		action_result(CREW_TOOL_ARREST, FALSE, "You cannot see that person.", list("reason" = "lost"))
		return
	if(!istext(how) || !(how in list(CREW_ARREST_QUIET, CREW_ARREST_FORCE, CREW_ARREST_STOP)))
		action_result(CREW_TOOL_ARREST, FALSE, "You do not know how you meant to go about it.", list("handle" = handle, "reason" = "how"))
		return
	if(person == body)
		action_result(CREW_TOOL_ARREST, FALSE, "You cannot arrest yourself.", list("handle" = handle, "reason" = "self"))
		return
	if(istype(crew_npc_job_of(person), /datum/job/captain))
		action_result(CREW_TOOL_ARREST, FALSE, "[person.name] is the Captain. Nobody lays a hand on the Captain.", list("handle" = handle, "reason" = "captain"))
		return
	// Stopping someone is the baton with no warrant, so it is no lawful arrest: never on a head of
	// staff, known by the card they wear or, with none, by their face and the PDA list (SENSE-08).
	if(how == CREW_ARREST_STOP && (crew_npc_is_command(person) || known_command_job(person)))
		action_result(CREW_TOOL_ARREST, FALSE, "[person.name] is a head of staff. With no warrant you do not lay a hand on them.", list("handle" = handle, "reason" = "command"))
		return
	arrest_target = WEAKREF(person)
	start_errand(person, CREW_TOOL_ARREST, how)

/**
 * Arrests the person the body has walked up to, the way it came to: errand_item says how.
 * Sleeps while the body does it.
 *
 * Returns a list: whether it went as asked, the words the brain is told, and the details.
 */
/datum/ai_controller/crew_npc/proc/make_arrest(mob/living/carbon/human/person)
	var/mob/living/carbon/human/body = pawn
	// The errand this run is for. Called off (told to go somewhere else, broken off hurt, taken by
	// the arm), the run stops where it is and lays no more hands on anyone: see errand_over().
	var/serial = errand_serial
	var/how = errand_item
	var/handle = handle_for(person)
	var/person_name = person.name
	var/hits = 0
	// One of the crew who heard the arrest line said (the brain says it before it sends the arrest)
	// has gone along already, by its own hearing: heard_arrest_line(), from on_pre_hear() (CHEAT-04).
	// One that is deaf or out of earshot goes along once it feels the cuffs and the hand on its arm
	// (hold_arrested()).
	// In cuffs already: someone has done that part. It only has to be taken by the arm.
	if(person.handcuffed && how != CREW_ARREST_STOP)
		var/closed = close_with(person, CREW_NPC_CLOSE_STEPS, serial)
		if(errand_over(serial))
			return broke_off(person_name, handle, 0)
		if(!closed)
			return list(FALSE, "[person_name] got away from you.", list("handle" = handle, "reason" = "lost", "hits" = 0))
		return hold_arrested(person, 0, FALSE)
	// Someone it only means to stop, who is down already, is stopped. Nobody hits someone who is
	// down, and there is no warrant to put cuffs on them for: left to the lines below, they were cuffed.
	if(how == CREW_ARREST_STOP && crew_npc_person_down(person))
		return list(TRUE, "[person_name] is down already. You leave [person.p_them()] be.", list("handle" = handle, "cuffed" = FALSE, "hits" = 0))
	var/obj/item/restraints/handcuffs/cuffs = cuffs_carried()
	if(how != CREW_ARREST_STOP && isnull(cuffs))
		return list(FALSE, "You have no cuffs to put on [person_name].", list("handle" = handle, "reason" = "no_cuffs", "hits" = 0))
	// Down already when it came with its baton: the cuffs alone, while they stay down. Someone who
	// had only slipped, or been sick, is up again before the cuffs are on, and gets the baton after all.
	if(how == CREW_ARREST_FORCE && crew_npc_person_down(person))
		var/cuffed_down = put_cuffs_on(person, cuffs, serial)
		if(errand_over(serial))
			return broke_off(person_name, handle, 0)
		if(cuffed_down)
			return hold_arrested(person, 0, TRUE, FALSE)
		if(cuffed_by_other(person, cuffs))
			stow_in_bag(cuffs)
			return other_cuffs_outcome(person, handle, 0)
		if(QDELETED(src) || QDELETED(body) || QDELETED(person))
			return list(FALSE, "[person_name] is gone.", list("handle" = handle, "reason" = "lost", "hits" = 0))
	// The baton, for someone who is still on their feet. Nobody hits someone who is down.
	if(how != CREW_ARREST_QUIET && !crew_npc_person_down(person))
		var/obj/item/melee/baton/security/baton = baton_carried(TRUE)
		if(isnull(baton))
			return list(FALSE, "You have no baton that works.", list("handle" = handle, "reason" = "no_baton", "hits" = 0))
		// The cuffs come out first, into the other hand, so that they are ready the moment the baton has done its work.
		if(how == CREW_ARREST_FORCE)
			draw_item(cuffs, CREW_NPC_KIT_GAP, serial)
		if(errand_over(serial))
			return broke_off(person_name, handle, 0)
		hits = baton_hits(person, baton, how == CREW_ARREST_STOP ? 2 : CREW_NPC_BATON_HITS, serial)
		// Called off, the baton stays in its hand: the next go at anyone, or at its kit, finds it there.
		if(errand_over(serial))
			return broke_off(person_name, handle, hits)
		if(QDELETED(src) || QDELETED(body) || QDELETED(person))
			return list(FALSE, "[person_name] is gone.", list("handle" = handle, "reason" = "lost", "hits" = hits))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) hit [key_name(person)] with its baton [hits] time\s at [AREACOORD(body)] ([how])[baton_stopped ? ": [baton_stopped]" : ""].")
		if(how == CREW_ARREST_STOP)
			put_baton_away(baton)
			if(!hits)
				if(knocked_down_itself())
					return knocked_down_outcome(person_name, handle, 0)
				return list(FALSE, "You could not get your baton to [person_name].", list("handle" = handle, "reason" = crew_npc_sees(person, body) ? "moved" : "lost", "hits" = 0))
			return list(TRUE, "You stop [person_name] with your baton.", list("handle" = handle, "cuffed" = FALSE, "hits" = hits))
		if(!hits)
			put_baton_away(baton)
			stow_in_bag(cuffs)
			if(knocked_down_itself())
				return knocked_down_outcome(person_name, handle, 0)
			return list(FALSE, "You could not get your baton to [person_name].", list("handle" = handle, "reason" = crew_npc_sees(person, body) ? "moved" : "lost", "hits" = 0))
		var/cuffed = put_cuffs_on(person, cuffs, serial)
		if(errand_over(serial))
			return broke_off(person_name, handle, hits)
		put_baton_away(baton)
		if(!cuffed)
			stow_in_bag(cuffs)
			if(cuffed_by_other(person, cuffs))
				return other_cuffs_outcome(person, handle, hits)
			if(knocked_down_itself())
				return knocked_down_outcome(person_name, handle, hits)
			return list(FALSE, "You could not get the cuffs on [person_name]: they would not stay still.", list("handle" = handle, "reason" = crew_npc_sees(person, body) ? "moved" : "lost", "hits" = hits))
		return hold_arrested(person, hits, TRUE, FALSE)
	// The cuffs alone.
	var/cuffed_alone = put_cuffs_on(person, cuffs, serial)
	if(errand_over(serial))
		return broke_off(person_name, handle, hits)
	if(!cuffed_alone)
		stow_in_bag(cuffs)
		if(QDELETED(src) || QDELETED(body) || QDELETED(person))
			return list(FALSE, "[person_name] is gone.", list("handle" = handle, "reason" = "lost", "hits" = 0))
		if(cuffed_by_other(person, cuffs))
			return other_cuffs_outcome(person, handle, 0)
		if(knocked_down_itself())
			return knocked_down_outcome(person_name, handle, 0)
		return list(FALSE, "You could not get the cuffs on [person_name]: they would not stay still.", list("handle" = handle, "reason" = crew_npc_sees(person, body) ? "moved" : "lost", "hits" = 0))
	// The cuffs alone went on: a quiet arrest stood for, or someone down already when the baton came.
	return hold_arrested(person, hits, TRUE, how == CREW_ARREST_QUIET)

/**
 * What an arrest comes to when it was called off part way: nothing more is done, and nobody is
 * told, since the brain has moved on and the words are not passed to it. The log says so.
 */
/datum/ai_controller/crew_npc/proc/broke_off(person_name, handle, hits)
	if(!QDELETED(pawn))
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) broke off its arrest of [person_name] at [AREACOORD(pawn)]: called off[hits ? ", after [hits] baton hit[hits == 1 ? "" : "s"]" : ""].")
	return list(FALSE, "You break off.", list("handle" = handle, "reason" = "called_off", "hits" = hits))

/**
 * What an arrest comes to when the body was put down itself before it was done: stunned, out
 * cold or dead. Not that they stepped away, nor that they will not stand still: the reason
 * "down" is its own, and counts against nobody's standing still.
 */
/datum/ai_controller/crew_npc/proc/knocked_down_outcome(person_name, handle, hits)
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) was knocked down itself while arresting [person_name] at [AREACOORD(pawn)].")
	return list(FALSE, "You were knocked down yourself before you were done with [person_name].", list("handle" = handle, "reason" = "down", "hits" = hits))

/**
 * Hits someone with the stun baton: takes it out by a click, switches it on in the hand, and
 * clicks them with it, with the baton's own wait between one hit and the next. Twice, and a
 * third time if they are still on their feet. It stops the moment they are in cuffs.
 *
 * Returns how many hits landed: the baton loses charge with each one that does.
 */
/datum/ai_controller/crew_npc/proc/baton_hits(mob/living/carbon/human/person, obj/item/melee/baton/security/baton, most, serial = null)
	var/mob/living/carbon/human/body = pawn
	var/landed = 0
	baton_stopped = null
	// Whatever else it is holding goes on the floor first. An officer with a circuit board in one
	// hand that it had not picked up never got its baton out, and was beaten down with a toolbox.
	drop_for_weapon()
	if(!draw_item(baton, CREW_NPC_KIT_GAP, serial))
		baton_stopped = "it could not get its baton into a free hand[draw_stopped ? ": [draw_stopped]" : ""]"
		return 0
	// A click on what is in the hand, with that hand, is using it: that switches a baton on.
	if(!baton.active)
		click_as_body(baton, null, CREW_NPC_KIT_GAP)
	if(errand_over(serial))
		baton_stopped = "it was called away"
		return 0
	if(QDELETED(baton) || !baton.active)
		baton_stopped = "its baton would not switch on"
		return 0
	// The baton is out and on before it closes with them, and the swing follows the last step at
	// once. Someone who will not stand still is a step away again within a second: a swing that
	// meets nothing is followed by another step and another swing, not by giving up.
	var/started = world.time
	var/swings = 0
	while(landed < most && swings < CREW_NPC_BATON_SWINGS && world.time - started < CREW_NPC_BATON_CHASE)
		if(QDELETED(src) || QDELETED(body) || QDELETED(person) || QDELETED(baton) || !body.is_holding(baton) || person.handcuffed)
			break
		if(errand_over(serial))
			baton_stopped = "it was called away"
			break
		// Two as a rule. A third only for someone who is still standing after them.
		if(landed >= 2 && crew_npc_person_down(person))
			break
		if(!baton.active)
			baton_stopped = "its baton went flat"
			break
		if(!close_with(person, CREW_NPC_CHASE_STEPS, serial))
			if(errand_over(serial))
				baton_stopped = "it was called away"
				break
			baton_stopped = knocked_down_itself() ? CREW_NPC_KNOCKED_DOWN : "it could not get near them"
			break
		if(!hand_to(baton))
			baton_stopped = knocked_down_itself() ? CREW_NPC_KNOCKED_DOWN : "its baton was not in its hand"
			break
		swings++
		var/charge_before = baton.cell?.charge
		// The strike gap is a sleep: called off in it, the swing is not counted as missed.
		var/swung = click_as_body(person, null, CREW_NPC_STRIKE_GAP)
		if(errand_over(serial))
			if(swung && !QDELETED(baton) && baton.cell?.charge < charge_before)
				landed++
			baton_stopped = "it was called away"
			break
		if(!swung)
			// Down itself, every swing fails, and they were said to have stepped out of reach of them all.
			if(knocked_down_itself())
				baton_stopped = CREW_NPC_KNOCKED_DOWN
				break
			baton_stopped = "they stepped out of reach of every swing"
			continue
		if(!QDELETED(baton) && baton.cell?.charge < charge_before)
			landed++
			baton_stopped = null
			if(landed < most)
				sleep(CREW_NPC_BATON_WAIT)
			continue
		// It reached them and the baton did nothing: it was not ready again yet.
		baton_stopped = "its baton did nothing when it touched them"
		sleep(0.5 SECONDS)
	return landed

/// Switches the baton off in the hand and puts it back in the bag, both by a click.
/datum/ai_controller/crew_npc/proc/put_baton_away(obj/item/melee/baton/security/baton)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(src) || QDELETED(body) || QDELETED(baton) || !body.is_holding(baton))
		return
	if(baton.active && hand_to(baton))
		click_as_body(baton)
	stow_in_bag(baton)

/**
 * Puts the cuffs on someone, by a click with them in the hand. That starts the four seconds it
 * takes, and they have to stay put for all of it. Returns TRUE if the cuffs are on, and FALSE
 * once the errand `serial` is for has been called off.
 */
/datum/ai_controller/crew_npc/proc/put_cuffs_on(mob/living/carbon/human/person, obj/item/restraints/handcuffs/cuffs, serial = null)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(cuffs))
		return FALSE
	// Whatever else it holds goes on the floor first, as before the baton (KNA-05): a thing pushed
	// into its hand on the way up would otherwise go into its bag to free a hand, and stay there.
	if(!body.is_holding(cuffs))
		drop_for_weapon("its cuffs")
	if(!draw_item(cuffs, CREW_NPC_KIT_GAP, serial))
		return FALSE
	// Twice, for someone who is down: they may be knocked a step off as the cuffs come up, and
	// are down for long enough to go after once more. Someone on their feet who would not stay
	// for the first try will not stay for a second.
	for(var/go in 1 to 2)
		if(QDELETED(src) || QDELETED(body) || QDELETED(person) || QDELETED(cuffs) || errand_over(serial))
			return FALSE
		if(!close_with(person, CREW_NPC_CHASE_STEPS, serial) || !hand_to(cuffs))
			return FALSE
		var/clicked = click_as_body(person, null, CREW_NPC_STRIKE_GAP)
		if(errand_over(serial))
			return FALSE
		if(clicked)
			var/waited = 0
			while(waited < CREW_NPC_CUFF_WAIT && !QDELETED(src) && !QDELETED(body) && !QDELETED(person) && isnull(person.handcuffed) && length(body.do_afters) && !errand_over(serial))
				sleep(0.5 SECONDS)
				waited += 0.5 SECONDS
		if(QDELETED(src) || QDELETED(body) || QDELETED(person) || errand_over(serial))
			return FALSE
		// Only its own pair is its arrest (MULTI-01). Cuffs someone else put on while it tried are
		// theirs: see cuffed_by_other().
		if(!isnull(person.handcuffed))
			return person.handcuffed == cuffs
		if(!crew_npc_person_down(person))
			return FALSE
	return FALSE

/// TRUE if the person is in cuffs that are not the pair the body was putting on: someone else got there first.
/datum/ai_controller/crew_npc/proc/cuffed_by_other(mob/living/carbon/human/person, obj/item/restraints/handcuffs/cuffs)
	return !QDELETED(person) && !isnull(person.handcuffed) && person.handcuffed != cuffs

/// What an arrest comes to when someone else's cuffs went on while the body's own were coming up. Not its arrest, and no try at them.
/datum/ai_controller/crew_npc/proc/other_cuffs_outcome(mob/living/carbon/human/person, handle, hits)
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) was arresting [key_name(person)] at [AREACOORD(pawn)] when someone else put cuffs on them.")
	return list(FALSE, "Someone else from security has put cuffs on [person.name] before you could.", list("handle" = handle, "reason" = "other_cuffs", "hits" = hits))

/// Takes someone who is in cuffs by the arm. `hits` and `counted` are for the report: how many baton hits it took, and whether this is an arrest the body made.
/datum/ai_controller/crew_npc/proc/hold_arrested(mob/living/carbon/human/person, hits, counted, stood = null)
	var/mob/living/carbon/human/body = pawn
	var/handle = handle_for(person)
	// One arrest for one person brought in, however many times the cuffs had to go on. `arrested` is
	// whoever it cuffed and has not yet put in a cell or let go: cuffed again after a cell that would
	// not take them, or after they got away, it is the same arrest.
	if(counted && arrested?.resolve() != person)
		work_arrests++
	// `stood` is whether they stood for the cuffs this time. Null (taken by the arm in cuffs someone
	// put on) keeps what it knew of the same arrest, and knows nothing of anyone else's.
	if(!isnull(stood))
		arrested_stood = stood
	else if(arrested?.resolve() != person)
		arrested_stood = FALSE
	arrested = WEAKREF(person)
	// Sat in a chair or lying in a bed is being strapped to it: walked off by the arm, they stay where
	// they are and the hold breaks on the first step. Got up first, by the click a player makes.
	if(!unbuckle_for_hold(person))
		if(QDELETED(src) || QDELETED(body) || QDELETED(person))
			return list(FALSE, "You could not get to it.")
		var/atom/movable/seat = person.buckled
		return list(FALSE, "[person.name] is in cuffs, but strapped to the [seat?.name || "seat"], and you cannot get them loose.", list("handle" = handle, "reason" = "no_hold", "cuffed" = TRUE, "hits" = hits, "buckled" = TRUE))
	body.start_pulling(person)
	if(body.pulling != person)
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) cuffed [key_name(person)] at [AREACOORD(body)] and could not get a hold of them.")
		return list(FALSE, "[person.name] is in cuffs, but you cannot get a hold of them.", list("handle" = handle, "reason" = "no_hold", "cuffed" = TRUE, "hits" = hits))
	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
	if(istype(their_controller))
		their_controller.being_arrested(body)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) [counted ? "arrested" : "took hold of"] [key_name(person)] at [AREACOORD(body)][hits ? ", after [hits] baton hit\s" : ""].")
	return list(TRUE, "You [counted ? "cuff [person.name] and take" : "take [person.name], who is in cuffs,"] [counted ? "[person.p_them()] " : ""]by the arm.", list("handle" = handle, "cuffed" = TRUE, "hits" = hits))

/**
 * Gets someone loose of the chair or bed they are strapped to, by a click with the empty hand on
 * it, as a player makes (a click on the person is only a touch). Sleeps for the click.
 * Returns TRUE if they are not strapped to anything now.
 */
/datum/ai_controller/crew_npc/proc/unbuckle_for_hold(mob/living/carbon/human/person)
	var/mob/living/carbon/human/body = pawn
	var/atom/movable/seat = person.buckled
	if(isnull(seat))
		return TRUE
	var/seat_name = seat.name
	if(empty_clicking_hand())
		click_as_body(seat)
	if(QDELETED(src) || QDELETED(body) || QDELETED(person))
		return FALSE
	var/loose = isnull(person.buckled)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) [loose ? "got [key_name(person)] up from" : "could not get [key_name(person)] loose of"] the [seat_name] at [AREACOORD(body)].")
	return loose

// The cell

/**
 * Works a cell timer's controls, as the body.
 *
 * The game will not open a window for a body with no player behind it, so what the window would
 * send is sent to the timer's own handler, after the checks the window makes: the body is next
 * to the timer and fit to use it, and the timer has power. This is the stand-in work_window() is
 * for a machine's window, with one thing more: the timer's handler asks who is using it and
 * checks their ID, so the call is made as the body.
 *
 * Returns FALSE, having sent nothing, if the body cannot use the timer.
 */
/datum/ai_controller/crew_npc/proc/work_timer(obj/machinery/status_display/door_timer/timer, action, list/params, serial = null)
	var/mob/living/carbon/human/body = pawn
	sleep(CREW_NPC_TIMER_GAP)
	if(QDELETED(body) || QDELETED(timer) || QDELETED(src) || errand_over(serial))
		return FALSE
	if(!can_reach_target_now(timer) || !timer.can_interact(body))
		return FALSE
	body.face_atom(timer)
	// Never opened: it only stands for the window the body would be looking at.
	var/datum/tgui/window = new(body, timer, "CrewNpcHands")
	world.push_usr(body, CALLBACK(timer, TYPE_PROC_REF(/datum, ui_act), action, params || list(), window, window.state))
	qdel(window)
	return TRUE

/// TRUE if the body, seeing what is in in_sight, can see this cell's timer or into the cell: what a player looking would know of it.
/datum/ai_controller/crew_npc/proc/sees_cell(datum/crew_npc_brig_cell/cell, list/in_sight)
	var/mob/living/carbon/human/body = pawn
	var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
	if(isnull(timer) || QDELETED(body))
		return FALSE
	if(timer in in_sight)
		return TRUE
	if(timer.z != body.z || get_dist(body, timer) > CREW_NPC_VISION_RANGE + 3)
		return FALSE
	for(var/turf/spot as anything in cell.turfs)
		if(spot in in_sight)
			return TRUE
	return FALSE

/**
 * Why a cell cannot take a prisoner, as seen by someone looking at it: "dark" (its timer has no
 * power or is broken: a blank display), "in use" (its timer running, or someone in it other than
 * this person and the body), "smashed" (its door is gone), or null if it can.
 */
/datum/ai_controller/crew_npc/proc/cell_unusable(datum/crew_npc_brig_cell/cell, mob/living/apart_from)
	var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
	if(isnull(timer))
		return "smashed"
	if(timer.machine_stat & (NOPOWER|BROKEN))
		return "dark"
	if(timer.timing || length(cell.occupants() - apart_from - pawn))
		return "in use"
	// Its glass door smashed: a windoor at no integrity is deleted, not left broken. It shuts nobody in.
	if(isnull(cell.door()))
		return "smashed"
	return null

/**
 * Returns the best brig cell to take a prisoner to: one in the Brig before a checkpoint's, and one
 * in a prison or isolation room last, then one the body can see is free before one it cannot see
 * from here, then the nearest. Not by name: on Tramstation "Cargo Cell", across the station, came
 * before every other.
 *
 * Senses only (CHEAT-03): a cell the body can see is passed over if it is in use, dark or smashed.
 * One it cannot see may be any of those: it is walked to and looked at, and put_in_cell() picks
 * again from there. So "every cell is in use" is only ever found out by looking.
 *
 * One the body lately could not get a prisoner into is passed over while there is another, and
 * is the one tried again, the longest left first, when there is not. Null if every cell it can
 * see is no use and there is none it cannot see.
 */
/datum/ai_controller/crew_npc/proc/free_cell(mob/living/apart_from)
	var/mob/living/carbon/human/body = pawn
	var/can_look = can_perceive() && isturf(body.loc) && !body.is_blind()
	var/list/in_sight = can_look ? view(CREW_NPC_VISION_RANGE, body) : list()
	var/datum/crew_npc_brig_cell/refused
	var/refused_at = INFINITY
	var/datum/crew_npc_brig_cell/best
	var/best_rank = INFINITY
	var/best_dist = INFINITY
	for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
		var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
		if(isnull(timer) || timer.z != body.z)
			continue
		var/seen = can_look && sees_cell(cell, in_sight)
		if(seen && !isnull(cell_unusable(cell, apart_from)))
			continue
		var/last_refused = cell_refused[cell.name]
		if(isnull(last_refused) || world.time - last_refused >= CREW_NPC_CELL_SKIP)
			var/area/room = get_area(timer)
			var/rank = 2
			if(istype(room, /area/station/security/brig))
				rank = 0
			else if(istype(room, /area/station/security/execution) || istype(room, /area/station/security/prison))
				rank = 4
			if(!seen)
				rank++
			var/dist = get_dist(body, timer)
			if(rank < best_rank || (rank == best_rank && dist < best_dist))
				best = cell
				best_rank = rank
				best_dist = dist
			continue
		if(last_refused < refused_at)
			refused_at = last_refused
			refused = cell
	return best || refused

/// Notes that the body could not get its prisoner into this cell, and writes where it stuck to the round's game log.
/datum/ai_controller/crew_npc/proc/cell_refuses(datum/crew_npc_brig_cell/cell, prisoner_name, why)
	cell_refused[cell.name] = world.time
	if(!QDELETED(pawn))
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) could not put [prisoner_name] in [cell.name]: [why]. It stands at [AREACOORD(pawn)].")

/**
 * Tool: walk whoever the body has arrested to a free brig cell, put them in it, and start its
 * timer for this many minutes. Security staff only.
 */
/datum/ai_controller/crew_npc/proc/tool_jail(minutes)
	if(!works_in_security())
		action_result(CREW_TOOL_JAIL, FALSE, "The cells are security's to use.")
		return
	var/mob/living/carbon/human/body = pawn
	var/mob/living/carbon/human/prisoner = arrested?.resolve()
	// In the cell already and let go, and it could not get back out past them a moment ago (PLAY-01):
	// the timer is all that is left. Walked out to and started, as a player would, nobody taken
	// by the arm again. Not if they have left the cell, or someone else has come into it.
	var/datum/crew_npc_brig_cell/left_in = jail_left_inside
	jail_left_inside = null
	if(!isnull(left_in) && left_in == jail_cell && !QDELETED(prisoner) && body.pulling != prisoner && (get_turf(prisoner) in left_in.turfs))
		var/obj/machinery/status_display/door_timer/left_timer = left_in.timer_ref?.resolve()
		if(!QDELETED(left_timer) && !left_timer.timing && !length(left_in.occupants() - prisoner - body))
			jail_left_inside = left_in
			start_errand(left_timer, CREW_TOOL_JAIL, left_in.name)
			return
	// Let go of for a moment, and still standing there in cuffs: taken by the arm again. Not if they
	// have sat down or been strapped in: walked off, they would stay put. The arrest again gets them
	// up first (unbuckle_for_hold()), which takes a click this answer has no time for.
	if(!QDELETED(prisoner) && prisoner.handcuffed && isnull(prisoner.buckled) && body.pulling != prisoner && can_reach_target_now(prisoner))
		body.start_pulling(prisoner)
	if(QDELETED(prisoner) || !prisoner.handcuffed || body.pulling != prisoner || !isnull(prisoner.buckled))
		action_result(CREW_TOOL_JAIL, FALSE, "You have nobody in cuffs and by the arm to put in a cell.", list("reason" = "no_hold"))
		return
	var/wanted = isnum(minutes) ? minutes : text2num("[minutes]")
	jail_minutes = clamp(round(wanted || 5), 1, 15)
	jail_cell = free_cell(prisoner)
	var/obj/machinery/status_display/door_timer/timer = jail_cell?.timer_ref?.resolve()
	if(isnull(timer))
		var/list/answer = no_cell_answer(prisoner.name)
		action_result(CREW_TOOL_JAIL, FALSE, answer[2], answer[3])
		return
	start_errand(timer, CREW_TOOL_JAIL, jail_cell.name)

/**
 * The answer when no cell will do, every one of them seen (free_cell() leaves none unseen): "no_power" if
 * every cell on this level is dark (ARR-04), and "no_cell" if they are in use, or some of each.
 * A list as put_in_cell() returns.
 */
/datum/ai_controller/crew_npc/proc/no_cell_answer(prisoner_name)
	var/mob/living/carbon/human/body = pawn
	var/dark = 0
	var/other = 0
	for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
		var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
		if(isnull(timer) || QDELETED(body) || timer.z != body.z)
			continue
		if(cell_unusable(cell, null) == "dark")
			dark++
		else
			other++
	if(dark && !other)
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) found no cell's timer with power, at [AREACOORD(body)].")
		return list(FALSE, "No cell's timer has power: their displays are blank.", list("reason" = "no_power", "prisoner" = prisoner_name))
	return list(FALSE, "Every cell is in use.", list("reason" = "no_cell", "prisoner" = prisoner_name))

/// Says where someone who got away was last seen, for the brain: the room they are in if they are in sight.
/datum/ai_controller/crew_npc/proc/got_away_details(mob/living/carbon/human/prisoner, prisoner_name)
	var/mob/living/carbon/human/body = pawn
	var/list/details = list("reason" = "got_away", "prisoner" = prisoner_name, "cell" = jail_cell?.name)
	if(!QDELETED(prisoner) && !QDELETED(body) && crew_npc_sees(prisoner, body))
		details["place"] = get_area_name(prisoner, TRUE)
		details["handle"] = handle_for(prisoner)
	else if(!QDELETED(body))
		details["place"] = get_area_name(body, TRUE)
	return details

/**
 * put_in_cell()'s walk in: the prisoner by the arm to the back of the cell, let go, and one of the
 * crew has the cuffs taken off. Sleeps while it does so.
 *
 * Returns null once they are in and let go, or put_in_cell()'s list for why they are not.
 */
/datum/ai_controller/crew_npc/proc/walk_in_and_let_go(datum/crew_npc_brig_cell/cell, atom/door, mob/living/carbon/human/prisoner, prisoner_name, turf/outside, serial)
	var/mob/living/carbon/human/body = pawn
	// In, to the tile furthest from the door, so that whoever trails a step behind is inside too.
	var/turf/deep
	var/deep_distance = -1
	for(var/turf/spot as anything in cell.turfs)
		if(spot.is_blocked_turf(exclude_mobs = TRUE))
			continue
		var/distance = get_dist(spot, door)
		if(distance > deep_distance)
			deep_distance = distance
			deep = spot
	if(isnull(deep) || !walk_steps(deep, 0, serial))
		if(QDELETED(src) || QDELETED(body))
			return list(FALSE, "You could not get to it.")
		if(errand_over(serial))
			return jail_broken_off(prisoner_name, cell)
		if(QDELETED(prisoner) || body.pulling != prisoner)
			return list(FALSE, "[prisoner_name] got away from you at the door of [cell.name].", got_away_details(prisoner, prisoner_name))
		// Knocked down on the way in: that is not the cell refusing them.
		if(knocked_down_itself())
			return list(FALSE, "You were knocked down yourself at the door of [cell.name].", list("reason" = "down", "prisoner" = prisoner_name, "cell" = cell.name))
		var/obj/machinery/door/cell_door = cell.door()
		cell_refuses(cell, prisoner_name, isnull(deep) ? "it found no clear floor inside" : "it could not walk in to ([deep.x],[deep.y]), [length(cell.turfs)] tiles of cell, the door [isnull(cell_door) ? "not found" : (cell_door.density ? "shut" : "open")]")
		return list(FALSE, "You cannot get into [cell.name] with [prisoner_name].", list("reason" = "no_way", "prisoner" = prisoner_name, "cell" = cell.name))
	if(QDELETED(prisoner) || body.pulling != prisoner || !(get_turf(prisoner) in cell.turfs))
		// Not inside: the cell is too small for two, or they slipped the hold in the doorway.
		var/slipped = QDELETED(prisoner) || body.pulling != prisoner
		walk_steps(outside, 0, serial)
		if(errand_over(serial))
			return jail_broken_off(prisoner_name, cell)
		if(slipped)
			return list(FALSE, "[prisoner_name] got away from you at the door of [cell.name].", got_away_details(prisoner, prisoner_name))
		cell_refuses(cell, prisoner_name, "it walked in and [prisoner_name] did not come all the way in behind it")
		return list(FALSE, "You cannot get [prisoner_name] all the way into [cell.name].", list("reason" = "no_way", "prisoner" = prisoner_name, "cell" = cell.name))
	body.stop_pulling()
	// Whoever stood for a quiet arrest, player or crew, has the cuffs taken off (CHEAT-04 A).
	if(arrested_stood)
		take_cuffs_off(prisoner, serial)
	return null

/**
 * Puts the prisoner in the cell whose timer the body has walked up to. Sleeps while it does so.
 *
 * What a player does, in the order a player does it: set the time on the timer, walk the prisoner
 * in to the back of the cell, let go, step out, and start the timer, which shuts the door. Whoever
 * stood for a quiet arrest, player or crew, has the cuffs taken off first (CHEAT-04 A). Anyone who
 * had the baton is left in them: they are in a cell, and the four seconds it takes are four seconds
 * with the door open.
 * Back at the timer of a cell it left them in and could not get out of (jail_left_inside), only
 * the timer is left to start.
 *
 * Returns a list: whether they are in the cell with the timer running, the words, and the details.
 */
/datum/ai_controller/crew_npc/proc/put_in_cell(obj/machinery/status_display/door_timer/timer)
	var/mob/living/carbon/human/body = pawn
	// Called off part way, it stops where it is. Its prisoner stays its own (`arrested`), so that the
	// next go at a cell takes hold of them again. Read once: a new go at a cell sets them again.
	var/serial = errand_serial
	var/datum/crew_npc_brig_cell/cell = jail_cell
	var/minutes = jail_minutes
	var/mob/living/carbon/human/prisoner = arrested?.resolve()
	var/prisoner_name = prisoner?.name
	// Back at the timer of a cell it left them in and could not get out of past them (PLAY-01): they
	// are in already, and only the timer is left to start.
	var/finishing = !isnull(cell) && jail_left_inside == cell
	jail_left_inside = null
	if(finishing && !QDELETED(prisoner) && body.pulling != prisoner)
		if(!(get_turf(prisoner) in cell.turfs))
			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) had [prisoner_name] walk out of [cell.name] before the timer was started.")
			return list(FALSE, "[prisoner_name] walked out of [cell.name] before you could shut it.", got_away_details(prisoner, prisoner_name))
	else
		finishing = FALSE
	if(QDELETED(prisoner) || (!finishing && body.pulling != prisoner))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) reached [cell?.name] without its prisoner.")
		return list(FALSE, "[prisoner_name || "Your prisoner"] got away from you on the way to the cell.", got_away_details(prisoner, prisoner_name))
	if(isnull(cell) || cell.timer_ref?.resolve() != timer)
		return list(FALSE, "[cell?.name || "The cell"] is in use.", list("reason" = "no_cell", "prisoner" = prisoner_name))
	// Chosen from afar, and looked at now it is here (CHEAT-03): in use, dark or smashed. Passed over
	// for a while, and the next one it can see that will do is gone to at once. None: it says so
	// from here, where it can see that, still holding them.
	var/why_not = cell_unusable(cell, prisoner)
	if(!isnull(why_not))
		if(why_not != "smashed")
			cell_refuses(cell, prisoner_name, "it came to its timer and found it [why_not]")
			var/datum/crew_npc_brig_cell/other = free_cell(prisoner)
			if(isnull(other))
				return no_cell_answer(prisoner_name)
			return list(FALSE, "[cell.name] is [why_not]. You will try [other.name].", list("reason" = "no_way", "prisoner" = prisoner_name, "cell" = cell.name))
	// Its door was smashed while the prisoner was walked there. Before anyone is let go: the next
	// cell is tried with them still by the arm.
	var/atom/door = cell.door()
	if(isnull(door))
		cell_refuses(cell, prisoner_name, "its door is broken")
		return list(FALSE, "The door of [cell.name] is smashed. It will not hold [prisoner_name].", list("reason" = "no_way", "prisoner" = prisoner_name, "cell" = cell.name))
	// The time, before anyone goes in: once the prisoner is inside there is no moment to spare for it.
	var/wanted = minutes MINUTES
	if(timer.timer_duration != wanted && !work_timer(timer, "time", list("adjust" = "[wanted - timer.timer_duration]"), serial))
		if(errand_over(serial))
			return jail_broken_off(prisoner_name, cell)
		cell_refuses(cell, prisoner_name, "its timer would not let it set the time")
		return list(FALSE, "You cannot get at the timer of [cell.name]. It may have no power.", list("reason" = "timer", "prisoner" = prisoner_name, "cell" = cell.name))
	if(errand_over(serial))
		return jail_broken_off(prisoner_name, cell)
	if(QDELETED(timer) || timer.timer_duration != wanted)
		cell_refuses(cell, prisoner_name, "its timer would not take the time")
		return list(FALSE, "The timer of [cell.name] will not take the time.", list("reason" = "timer", "prisoner" = prisoner_name, "cell" = cell.name))
	var/turf/outside = get_turf(body)
	var/datum/ai_controller/crew_npc/their_controller = prisoner.ai_controller
	if(!finishing)
		var/list/walked_in = walk_in_and_let_go(cell, door, prisoner, prisoner_name, outside, serial)
		if(islist(walked_in))
			return walked_in
	if(errand_over(serial))
		return jail_broken_off(prisoner_name, cell)
	// Out, and the timer started at once. Stopped on the way, most likely by the prisoner it has just
	// let go standing where it would step, it waits a moment for them to shift and tries once more.
	var/got_out = walk_steps(outside, 0, serial)
	if(!got_out && !QDELETED(src) && !QDELETED(body) && !errand_over(serial) && !knocked_down_itself())
		sleep(1.5 SECONDS)
		if(!QDELETED(src) && !QDELETED(body))
			got_out = walk_steps(outside, 0, serial)
	if(!got_out)
		if(QDELETED(src) || QDELETED(body))
			return list(FALSE, "You could not get to it.")
		if(errand_over(serial))
			return jail_broken_off(prisoner_name, cell)
		if(knocked_down_itself())
			return list(FALSE, "You were knocked down yourself in [cell.name], before you could start its timer.", list("reason" = "down", "prisoner" = prisoner_name, "cell" = cell.name))
		// They are in and let go: the cell did not refuse them. Most likely they stand where it would
		// step and will not swap places (in combat mode, as a player can be). The next go at a cell
		// only walks out and starts this one's timer (tool_jail).
		jail_left_inside = cell
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) could not get past [prisoner_name] to the door of [cell.name]. It stands at [AREACOORD(body)], they at [AREACOORD(prisoner)].")
		return list(FALSE, "You cannot get past [prisoner_name] to the door of [cell.name].", list("reason" = "stuck_inside", "prisoner" = prisoner_name, "cell" = cell.name))
	if(QDELETED(prisoner) || !(get_turf(prisoner) in cell.turfs))
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) had [prisoner_name] walk out of [cell.name] before the timer was started.")
		return list(FALSE, "[prisoner_name] walked out of [cell.name] before you could shut it.", got_away_details(prisoner, prisoner_name))
	if(errand_over(serial))
		return jail_broken_off(prisoner_name, cell)
	if(!work_timer(timer, "start", null, serial) || QDELETED(timer) || !timer.timing)
		if(errand_over(serial))
			return jail_broken_off(prisoner_name, cell)
		cell_refuses(cell, prisoner_name, "its timer would not start")
		return list(FALSE, "The timer of [cell.name] will not start.", list("reason" = "timer", "prisoner" = prisoner_name, "cell" = cell.name))
	// The door takes a moment to shut. Anyone who is out of the cell when it has is not in it.
	sleep(1 SECONDS)
	if(QDELETED(src) || QDELETED(body))
		return list(FALSE, "You could not get to it.")
	if(QDELETED(prisoner) || !(get_turf(prisoner) in cell.turfs))
		if(!QDELETED(timer) && timer.timing)
			work_timer(timer, "stop")
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) had [prisoner_name] get out of [cell.name] as the door shut, and stopped the timer.")
		return list(FALSE, "[prisoner_name] got out of [cell.name] as the door shut.", got_away_details(prisoner, prisoner_name))
	arrested = null
	// One cell, one prisoner: whoever it put in this cell before is not in it now.
	for(var/name in jailed)
		if(jailed[name] == cell)
			jailed -= name
	jailed[prisoner_name] = cell
	if(istype(their_controller))
		their_controller.put_in_custody(cell, minutes, body)
	var/cuffs_left = !isnull(prisoner.handcuffed)
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) put [key_name(prisoner)] in [cell.name] for [minutes] minute\s[cuffs_left ? ", still in cuffs" : ""].")
	return list(TRUE, "You put [prisoner_name] in [cell.name] and start its timer: [minutes] minute\s.[cuffs_left ? " [prisoner.p_They()] still [prisoner.p_have()] your cuffs on." : ""]", list("cell" = cell.name, "minutes" = minutes, "prisoner" = prisoner_name, "cuffs_left" = cuffs_left))

/// What a go at a cell comes to when it was called off part way. Nobody is told: the brain has moved on. The log says so.
/datum/ai_controller/crew_npc/proc/jail_broken_off(prisoner_name, datum/crew_npc_brig_cell/cell)
	if(!QDELETED(pawn))
		log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) broke off putting [prisoner_name] in [cell?.name || "a cell"] at [AREACOORD(pawn)]: called off.")
	return list(FALSE, "You break off.", list("reason" = "called_off", "prisoner" = prisoner_name, "cell" = cell?.name))

/**
 * Takes the cuffs off someone the body is standing next to, and picks them up.
 *
 * A player does this from the window that shows what someone has on them. The game will not open
 * a window for a body with no player, so the steps that window takes are taken here, in its
 * order and with its checks: the body is next to them and fit to do it, the cuffs may be taken
 * off, the four seconds it takes are waited out with both of them standing still, and they are
 * the same cuffs at the end of it. The cuffs fall at the wearer's feet, as they do for a player.
 *
 * Returns TRUE if the cuffs are off. Called off (`serial`, see errand_over()), it stops.
 */
/datum/ai_controller/crew_npc/proc/take_cuffs_off(mob/living/carbon/human/person, serial = null)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/restraints/handcuffs/cuffs = person.handcuffed
	if(isnull(cuffs))
		return TRUE
	var/datum/strippable_item/slot = GLOB.strippable_human_items[STRIPPABLE_ITEM_HANDCUFFS]
	if(isnull(slot))
		return FALSE
	sleep(CREW_NPC_TIMER_GAP)
	if(QDELETED(src) || QDELETED(body) || QDELETED(person) || person.handcuffed != cuffs || errand_over(serial))
		return FALSE
	if(!can_reach_target_now(person) || !body.can_perform_action(person, SILENT_ADJACENCY))
		return FALSE
	body.face_atom(person)
	if(!slot.should_show(person, body) || !slot.try_unequip(person, body))
		return FALSE
	// This is the four seconds. It comes to nothing if either of them moves.
	if(!slot.start_unequip(person, body))
		return FALSE
	if(QDELETED(src) || QDELETED(body) || QDELETED(person) || person.handcuffed != cuffs || !body.Adjacent(person) || errand_over(serial))
		return FALSE
	slot.finish_unequip(person, body)
	if(!isnull(person.handcuffed))
		return FALSE
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) took the cuffs off [key_name(person)] at [AREACOORD(body)].")
	if(!QDELETED(cuffs) && isturf(cuffs.loc))
		pick_up_kit(cuffs)
	return TRUE

// Letting someone go

/// TRUE if this name is the one asked for: the same, or, unless `whole` is set, the words of the name asked for are among its words.
/datum/ai_controller/crew_npc/proc/is_named(mob/living/person, wanted, whole = FALSE)
	var/lower = LOWER_TEXT(person.name)
	return whole ? lower == wanted : crew_npc_name_fits(lower, wanted)

/// The words of a name, lower case, split on anything that is not a letter or a figure.
/proc/crew_npc_name_words(name)
	var/list/words = list()
	for(var/word in splittext(LOWER_TEXT("[name]"), regex(@"[^a-z0-9]+")))
		if(length(word))
			words += word
	return words

/**
 * TRUE if the name asked for names this one, as sameName does in the window: its words come in a
 * row among this name's words ("dan" names "Dan Reyes", not "Jordan Smith"), or, written as one
 * word of four letters or more, it is some of this name's words run together ("punpun", "Pun Pun").
 */
/proc/crew_npc_name_fits(name, wanted)
	var/list/have = crew_npc_name_words(name)
	var/list/need = crew_npc_name_words(wanted)
	if(!length(need))
		return FALSE
	for(var/start in 1 to length(have) - length(need) + 1)
		var/all = TRUE
		for(var/index in 1 to length(need))
			if(have[start + index - 1] != need[index])
				all = FALSE
				break
		if(all)
			return TRUE
	var/run = jointext(need, "")
	if(length(run) < 4)
		return FALSE
	for(var/start in 1 to length(have))
		var/joined = ""
		for(var/end in start to length(have))
			joined += have[end]
			if(joined == run)
				return TRUE
			if(length(joined) >= length(run))
				break
	return FALSE

/// The names in the list of who it put in a cell that are the one asked for: the whole name if any is, or else those the name asked for names (crew_npc_name_fits).
/datum/ai_controller/crew_npc/proc/jailed_names(wanted)
	var/list/whole = list()
	var/list/part = list()
	for(var/name in jailed)
		var/lower = LOWER_TEXT(name)
		if(lower == wanted)
			whole += name
		else if(crew_npc_name_fits(lower, wanted))
			part += name
	return length(whole) ? whole : part

/**
 * Tool: let someone go. Security staff only.
 *
 * Whoever the body has by the arm, or sees standing in cuffs, is let go of and has the cuffs taken
 * off. Someone it put in a cell, or sees in one, is let out by stopping that cell's timer, which
 * opens the door. `person_name` is a name, not a handle: they may be out of sight in a cell.
 */
/datum/ai_controller/crew_npc/proc/tool_free(person_name)
	if(!works_in_security())
		action_result(CREW_TOOL_FREE, FALSE, "Letting a prisoner go is security's job.")
		return
	var/mob/living/carbon/human/body = pawn
	var/wanted = istext(person_name) ? LOWER_TEXT(trim(person_name)) : null
	if(!length(wanted))
		action_result(CREW_TOOL_FREE, FALSE, "You did not decide who to let go.", list("reason" = "who"))
		return
	// The whole name is looked for first, everywhere, and only then a name the one asked for is
	// part of: told to let "Pun Pun" go, it does not open the cell on Pun Pun II with Pun Pun in
	// the next one.
	var/mob/living/carbon/human/held = arrested?.resolve()
	var/list/in_sight = crew_npc_visible(view(CREW_NPC_VISION_RANGE, body), body)
	for(var/whole in list(TRUE, FALSE))
		// By the arm, or arrested and still about.
		if(!QDELETED(held) && is_named(held, wanted, whole) && (body.pulling == held || recently_saw(held)))
			start_errand(held, CREW_TOOL_FREE, held.name)
			return
		// What it can see goes before what it remembers. Its list of who it put where is not kept up
		// when a time runs out or someone else lets them out, and the cell is given to the next one:
		// gone by first, it opened a cell on somebody else.
		// In a cell it can see them in.
		for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
			var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
			if(isnull(timer) || !timer.timing)
				continue
			for(var/mob/living/carbon/human/person as anything in cell.occupants())
				if(is_named(person, wanted, whole) && (person in in_sight))
					jail_cell = cell
					start_errand(timer, CREW_TOOL_FREE, person.name)
					return
		// Standing about in cuffs, in sight.
		for(var/mob/living/carbon/human/person in in_sight)
			if(person != body && person.handcuffed && is_named(person, wanted, whole))
				start_errand(person, CREW_TOOL_FREE, person.name)
				return
		// In a cell it put them in, out of sight. It goes to the timer, and looks in before it stops it.
		for(var/name in jailed)
			var/lower = LOWER_TEXT(name)
			if(whole ? lower != wanted : !crew_npc_name_fits(lower, wanted))
				continue
			var/datum/crew_npc_brig_cell/cell = jailed[name]
			var/obj/machinery/status_display/door_timer/timer = cell?.timer_ref?.resolve()
			if(isnull(timer) || !timer.timing)
				continue
			jail_cell = cell
			start_errand(timer, CREW_TOOL_FREE, name)
			return
	for(var/name in jailed_names(wanted))
		jailed -= name
	action_result(CREW_TOOL_FREE, TRUE, "Nothing is holding [person_name] that you know of.", list("freed" = person_name, "nothing" = TRUE))

/**
 * Lets go whoever the body came to let go: someone it is standing next to, or someone behind
 * the timer it is standing at. Sleeps while it does so.
 */
/datum/ai_controller/crew_npc/proc/set_free(atom/target)
	var/mob/living/carbon/human/body = pawn
	var/serial = errand_serial
	var/freed = errand_item
	if(istype(target, /obj/machinery/status_display/door_timer))
		var/obj/machinery/status_display/door_timer/timer = target
		var/datum/crew_npc_brig_cell/cell = jail_cell
		var/wanted = LOWER_TEXT("[freed]")
		var/mob/living/carbon/human/prisoner
		var/list/inside = cell?.occupants()
		for(var/whole in list(TRUE, FALSE))
			for(var/mob/living/carbon/human/person as anything in inside)
				if(is_named(person, wanted, whole))
					prisoner = person
					freed = person.name
					break
			if(prisoner)
				break
		// Nobody of that name is in there now: their time ran out, or someone let them out, and the
		// cell may hold somebody else. The timer is left alone, and what it remembered is put right.
		// Someone whose face is hidden in there is not known by it either, and is left too.
		if(isnull(prisoner))
			for(var/name in jailed_names(wanted))
				jailed -= name
			log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) came to let [freed] out of [cell?.name || "a cell"] and found [freed] not in it.")
			return list(TRUE, "[freed] is not in [cell?.name || "the cell"] any more.", list("freed" = freed, "nothing" = TRUE))
		if(timer.timing && !work_timer(timer, "stop", null, serial))
			if(errand_over(serial))
				return list(FALSE, "You break off.", list("reason" = "called_off", "freed" = freed))
			return list(FALSE, "You cannot get at the timer of [cell?.name || "the cell"]. It may have no power.", list("reason" = "timer", "freed" = freed))
		if(QDELETED(timer) || timer.timing)
			return list(FALSE, "The timer of [cell?.name || "the cell"] will not stop.", list("reason" = "timer", "freed" = freed))
		for(var/name in jailed)
			if(jailed[name] == cell)
				jailed -= name
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) stopped the timer of [cell?.name] to let [freed] out.")
		// Still in cuffs in there: it goes in and takes them off.
		var/cuffs_left = FALSE
		if(!QDELETED(prisoner) && prisoner.handcuffed)
			var/turf/outside = get_turf(body)
			sleep(1 SECONDS)
			cuffs_left = errand_over(serial) || QDELETED(prisoner) || !walk_steps(get_turf(prisoner), 1, serial) || !take_cuffs_off(prisoner, serial)
			if(!errand_over(serial))
				walk_steps(outside, 0, serial)
		if(QDELETED(src) || QDELETED(body))
			return list(FALSE, "You could not get to it.")
		return list(TRUE, "You stop the timer of [cell?.name || "the cell"], and its door opens for [freed].", list("freed" = freed, "from" = cell?.name, "cuffs_left" = cuffs_left))
	var/mob/living/carbon/human/person = target
	if(!istype(person))
		return list(FALSE, "You forget who you came to let go.", list("reason" = "who", "freed" = freed))
	freed = person.name
	if(body.pulling == person)
		body.stop_pulling()
	var/cuffs_left = !take_cuffs_off(person, serial)
	if(QDELETED(src) || QDELETED(body) || QDELETED(person))
		return list(FALSE, "You could not get to it.")
	// Called off before the cuffs came off: it has let go, and does no more. With them off, it is done.
	if(cuffs_left && errand_over(serial))
		return list(FALSE, "You break off.", list("reason" = "called_off", "freed" = freed))
	if(arrested?.resolve() == person)
		arrested = null
	// Nothing is told to them by a call (CHEAT-04): one of the crew finds the hand gone and the cuffs
	// off, and is free once its grace has run (custody_tick()), as anyone let go finds it out.
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) let [key_name(person)] go at [AREACOORD(body)][cuffs_left ? ", but could not get the cuffs off" : ""].")
	return list(TRUE, cuffs_left ? "You let go of [freed], but could not get the cuffs off [person.p_them()]." : "You take the cuffs off [freed] and let [person.p_them()] go.", list("freed" = freed, "from" = "hold", "cuffs_left" = cuffs_left))

// Being arrested

/// TRUE if the body is under arrest, shut in a cell, or working its way out of cuffs it was left in.
/datum/ai_controller/crew_npc/proc/in_custody()
	return !isnull(custody_phase)

/// Says why the body can do nothing but talk just now, if it is because it is under arrest. Null if it is not.
/datum/ai_controller/crew_npc/proc/custody_words()
	switch(custody_phase)
		if(CREW_CUSTODY_CELL)
			return "You are in [custody_cell] until your time is up."
		if(CREW_CUSTODY_ARREST)
			return "[arrested_by_name] has arrested you. You go where you are taken."
		if(CREW_CUSTODY_CUFFS)
			return "You are working your handcuffs off."
	return null

/**
 * Someone from security is arresting this body. It stops what it is doing, lets go of anything it
 * has hold of, and stands still for it. From here it goes where it is taken, until it is let go
 * or the cell it is put in opens.
 */
/datum/ai_controller/crew_npc/proc/being_arrested(mob/living/carbon/human/by)
	var/mob/living/carbon/human/body = pawn
	if(custody_phase == CREW_CUSTODY_ARREST && arrested_by?.resolve() == by)
		held_at = world.time
		hold_in_custody()
		return
	var/was_held = in_custody()
	cancel_search()
	cancel_errand()
	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
	body.stop_pulling()
	arrested_by = WEAKREF(by)
	arrested_by_name = by.name
	held_at = world.time
	custody_phase = CREW_CUSTODY_ARREST
	custody_timer = null
	custody_cell = null
	cuff_tries = 0
	hold_in_custody()
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) is being arrested by [key_name(by)] at [AREACOORD(body)], and stands still.")
	emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] is arresting you. You stand still.", list("under_arrest" = TRUE, "by" = by.name))
	if(!was_held)
		addtimer(CALLBACK(src, PROC_REF(custody_tick)), 1 SECONDS)

/**
 * The body has heard a line said (on_pre_hear() calls this with what it heard). Someone who
 * works in security, by the ID they wear, telling it by name that it is under arrest: it goes
 * along quietly, on what it heard (CHEAT-04), whether the one arresting it is crew or a player.
 * Returns TRUE if it took the line for its own arrest.
 */
/datum/ai_controller/crew_npc/proc/heard_arrest_line(mob/living/carbon/human/speaker, message)
	var/mob/living/carbon/human/body = pawn
	if(!istype(speaker) || QDELETED(body) || speaker == body || !istext(message))
		return FALSE
	if(!findtext(message, "under arrest") || !findtext(message, body.name))
		return FALSE
	var/datum/job/their_job = crew_npc_job_of(speaker)
	if(isnull(their_job) || !(their_job.departments_bitflags & DEPARTMENT_BITFLAG_SECURITY))
		return FALSE
	being_arrested(speaker)
	return TRUE

/// The cell this body was walked into has been shut on it.
/datum/ai_controller/crew_npc/proc/put_in_custody(datum/crew_npc_brig_cell/cell, minutes, mob/living/carbon/human/by)
	var/mob/living/carbon/human/body = pawn
	var/was_held = in_custody()
	arrested_by = WEAKREF(by)
	arrested_by_name = by.name
	custody_phase = CREW_CUSTODY_CELL
	custody_timer = cell.timer_ref
	custody_cell = cell.name
	hold_in_custody()
	// The time is what its timer shows, and so known only if the timer can be seen from inside (CHEAT-04).
	var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
	var/sees_timer = !QDELETED(timer) && !QDELETED(body) && can_perceive() && !body.is_blind() && (timer in view(CREW_NPC_VISION_RANGE, body))
	if(sees_timer)
		emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] has put you in [cell.name]. Its timer shows [minutes] minute\s.", list("in_cell" = cell.name, "minutes" = minutes))
	else
		emit_sense(CREW_SENSE_KNOWLEDGE, "[by.name] has put you in [cell.name].", list("in_cell" = cell.name))
	if(!was_held)
		addtimer(CALLBACK(src, PROC_REF(custody_tick)), 1 SECONDS)

/// Keeps a body that is under arrest where it is for a few seconds more: it does not walk off, and its brain is told it is in hand.
/datum/ai_controller/crew_npc/proc/hold_in_custody()
	in_hand_until = world.time + CREW_NPC_CUSTODY_HOLD
	in_hand_of = arrested_by_name
	stand_still(CREW_NPC_CUSTODY_HOLD, arrested_by?.resolve())

/**
 * Looks, once a second, at whether a body under arrest is still held, and lets it go when it is not.
 *
 * It goes by what holds it, not by a clock of its own. Under arrest, that is the hand on its arm
 * or the cuffs on its wrists. In a cell, it is the cell's timer: the door opens when that stops,
 * whoever stopped it. Left in cuffs with nobody to take them off, it works them off itself, the
 * way anyone does, and is free when they are off.
 */
/datum/ai_controller/crew_npc/proc/custody_tick()
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(src) || QDELETED(body) || isnull(custody_phase))
		return
	var/held = FALSE
	switch(custody_phase)
		if(CREW_CUSTODY_ARREST)
			var/mob/living/carbon/human/by = arrested_by?.resolve()
			if(!QDELETED(by) && body.pulledby == by)
				held_at = world.time
				held = TRUE
			else if(body.handcuffed)
				// In cuffs with nobody's hand on it. Whoever arrested it may be back for it.
				held = world.time - held_at < CREW_NPC_CUFFED_ALONE
			else
				// No cuffs and no hand: the arrest is still being made, or has come to nothing. Counted
				// from the last hand on its arm, not the start of the arrest: in the cell the officer lets
				// go and takes the cuffs off before it steps out and starts the timer, most often well
				// over the grace after the arrest began, and the prisoner was told it was free to go.
				held = world.time - held_at < CREW_NPC_ARREST_GRACE
		if(CREW_CUSTODY_CELL)
			var/obj/machinery/status_display/door_timer/timer = custody_timer?.resolve()
			held = !QDELETED(timer) && timer.timing
		if(CREW_CUSTODY_CUFFS)
			// Held for as long as the cuffs are on (SEC-07): told it was free in them, it went back to
			// its work with its hands bound, and every errand failed for the rest of the round. A
			// player in cuffs presses Resist again and again until they are off; so does it.
			held = !isnull(body.handcuffed)
			// Not at it just now: it starts, or starts again. A try is counted only if the game
			// really began one: it does not while its resist is cooling down, while it lies down,
			// is buckled or is inside something. Counted on every press, a try broken in its first
			// ten seconds used up the rest in two.
			if(held && !length(body.do_afters))
				INVOKE_ASYNC(body, TYPE_PROC_REF(/mob/living, execute_resist))
				if(length(body.do_afters))
					cuff_tries++
					log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) begins try [cuff_tries] at working its cuffs off, at [AREACOORD(body)].")
					// Three real tries have come to nothing. It keeps at them, and says so once: only
					// security takes cuffs off one of the crew (SEC-07, the owner's answer B), and its brain
					// may tell its head. Nobody else is asked to.
					if(cuff_tries > CREW_NPC_CUFF_TRIES_ALONE && !cuffs_stuck_told)
						cuffs_stuck_told = TRUE
						log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) cannot get its cuffs off by itself after [CREW_NPC_CUFF_TRIES_ALONE] tries, at [AREACOORD(body)].")
						emit_sense(CREW_SENSE_KNOWLEDGE, "You cannot get these handcuffs off by yourself. Only security can take them off you.", list("stuck_in_cuffs" = TRUE, "tries" = cuff_tries - 1))
	if(!held && custody_phase != CREW_CUSTODY_CUFFS && body.handcuffed)
		// Let go of, or the cell has opened, and still in cuffs. It sets about getting out of them.
		custody_phase = CREW_CUSTODY_CUFFS
		custody_timer = null
		custody_cell = null
		cuff_tries = 0
		cuffs_stuck_told = FALSE
		held = TRUE
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was left in cuffs at [AREACOORD(body)], and is working them off.")
		emit_sense(CREW_SENSE_KNOWLEDGE, "You are still in handcuffs, and nobody is taking them off. You start working them off.", list("working_off_cuffs" = TRUE))
	if(held)
		hold_in_custody()
		addtimer(CALLBACK(src, PROC_REF(custody_tick)), 1 SECONDS)
		return
	let_out_of_custody()

/// The body is free again: nobody has it by the arm, it is in no cell, and it may get on with its work.
/datum/ai_controller/crew_npc/proc/let_out_of_custody()
	if(isnull(custody_phase))
		return
	custody_phase = null
	arrested_by = null
	arrested_by_name = null
	custody_timer = null
	custody_cell = null
	in_hand_until = 0
	in_hand_of = null
	// It may move again. The loop that kept it still sees this at its next turn and lets it go.
	talk_hold_until = min(talk_hold_until, world.time)
	log_game("Crew NPC [key_name(pawn)] (owner: [brain_link?.owner_ckey || "none"]) is free to go at [AREACOORD(pawn)].")
	emit_sense(CREW_SENSE_KNOWLEDGE, "You are free to go.", list("set_free" = TRUE))

// Fighting back

/// Starts noticing who lays a hand on the body. Security staff only: nobody else has anything to do about it yet.
/datum/ai_controller/crew_npc/proc/start_security_senses(mob/living/carbon/human/body)
	// This runs while the controller is being given its body, before it has one of its own to ask:
	// the job is read from the body handed in. Read from its own, it was nobody's, the listening
	// never began, and an officer being hit was told nothing of it.
	if(security_senses_on || !works_in_security(body))
		return
	security_senses_on = TRUE
	if(!HAS_TRAIT(body, TRAIT_RELAYING_ATTACKER))
		body.AddElement(/datum/element/relay_attackers)
	RegisterSignal(body, COMSIG_ATOM_WAS_ATTACKED, PROC_REF(on_struck))
	RegisterSignal(body, COMSIG_LIVING_GET_PULLED, PROC_REF(on_grabbed))
	RegisterSignal(body, COMSIG_MOB_UNEQUIPPED_ITEM, PROC_REF(on_kit_gone))

/// Stops noticing who lays a hand on the body.
/datum/ai_controller/crew_npc/proc/stop_security_senses(mob/living/carbon/human/body)
	if(!security_senses_on)
		return
	security_senses_on = FALSE
	UnregisterSignal(body, list(COMSIG_ATOM_WAS_ATTACKED, COMSIG_LIVING_GET_PULLED, COMSIG_MOB_UNEQUIPPED_ITEM))

/// Someone has hit the body, or shoved it.
/datum/ai_controller/crew_npc/proc/on_struck(datum/source, atom/attacker, attack_flags)
	SIGNAL_HANDLER
	if(isliving(attacker))
		tell_struck(attacker, (attack_flags & ATTACKER_SHOVING) ? "shove" : "hit")

/// Someone has taken hold of the body. Whether that is an attack is settled a moment later, in grab_felt:
/// the pull signal comes inside start_pulling, before a keeper walking the body out has told it so.
/datum/ai_controller/crew_npc/proc/on_grabbed(datum/source, mob/living/puller)
	SIGNAL_HANDLER
	if(isliving(puller))
		addtimer(CALLBACK(src, PROC_REF(grab_felt), WEAKREF(puller)), 0)

/**
 * Tells the brain of a hold on the body, unless the body already knows why it is held: whoever
 * has it by the arm to walk it out of a room (it was told so in words), or whoever has arrested it.
 * A hold by anyone else is told as before.
 */
/datum/ai_controller/crew_npc/proc/grab_felt(datum/weakref/puller_ref)
	var/mob/living/puller = puller_ref?.resolve()
	if(QDELETED(src) || QDELETED(pawn) || QDELETED(puller))
		return
	if(world.time < in_hand_until && in_hand_of == puller.name)
		return
	if(in_custody() && arrested_by?.resolve() == puller)
		return
	tell_struck(puller, "grab")

/// Its baton or its cuffs have left the body. A moment later it looks at whose hands they are in.
/datum/ai_controller/crew_npc/proc/on_kit_gone(datum/source, obj/item/item)
	SIGNAL_HANDLER
	if(istype(item, /obj/item/melee/baton/security) || istype(item, /obj/item/restraints/handcuffs))
		addtimer(CALLBACK(src, PROC_REF(kit_taken), WEAKREF(item)), 0.5 SECONDS)

/// Tells the brain if a baton or cuffs that left the body are now in someone else's hands.
/datum/ai_controller/crew_npc/proc/kit_taken(datum/weakref/item_ref)
	var/obj/item/item = item_ref?.resolve()
	if(QDELETED(src) || QDELETED(pawn) || QDELETED(item))
		return
	var/mob/living/taker = item.loc
	if(!istype(taker) || taker == pawn || !taker.is_holding(item))
		return
	tell_struck(taker, "took", format_text(item.name))

/// Tells the brain that someone has laid a hand on the body, and how. Once every few seconds for any one person.
/datum/ai_controller/crew_npc/proc/tell_struck(mob/living/attacker, how, what)
	var/mob/living/carbon/human/body = pawn
	if(QDELETED(body) || attacker == body)
		return
	var/key = REF(attacker)
	if(world.time - (struck_told_at[key] || -INFINITY) < CREW_NPC_STRUCK_GAP)
		return
	struck_told_at[key] = world.time
	var/text
	switch(how)
		if("shove")
			text = "[attacker.name] shoves you."
		if("grab")
			text = "[attacker.name] takes hold of you."
		if("took")
			text = "[attacker.name] takes your [what] out of your hand."
		else
			text = "[attacker.name] hits you."
	log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) was laid hands on by [key_name(attacker)] at [AREACOORD(body)]: [how].")
	emit_sense(CREW_SENSE_KNOWLEDGE, text, list("struck_by" = ishuman(attacker) ? handle_for(attacker) : null, "struck_name" = attacker.name, "how" = how))

// What the brain is told

/**
 * Returns what security staff know of their kit and the brig, for the brain window, or null for
 * anyone else.
 *
 * They know each cell by name, as the crew know every room by name. Whether a cell's timer is
 * running, how long it has left and who is inside they know only by looking: those are filled in
 * for a cell that is in the body's view now, and are null for the rest.
 */
/datum/ai_controller/crew_npc/proc/security_state()
	if(!works_in_security())
		return null
	var/mob/living/carbon/human/body = pawn
	var/obj/item/melee/baton/security/baton = baton_carried()
	if(baton)
		own_baton = WEAKREF(baton)
	var/can_look = can_perceive() && isturf(body.loc) && !body.is_blind()
	var/list/in_sight = can_look ? view(CREW_NPC_VISION_RANGE, body) : list()
	// Of that, what it can make out: lit, or right beside it (CHEAT-15). A cell's timer shows by its
	// own display, so a cell is seen by in_sight; who is inside it, and its baton, only by this.
	var/list/made_out = crew_npc_visible(in_sight, body)
	// Its own baton, off its body and in sight: on the floor, or in someone's hand.
	var/list/baton_seen
	var/obj/item/melee/baton/security/lost = baton ? null : own_baton?.resolve()
	if(!QDELETED(lost))
		var/mob/living/holder = lost.loc
		if(isturf(lost.loc) && (lost in made_out))
			baton_seen = list("where" = "floor", "by" = null)
		else if(istype(holder) && holder != body && holder.is_holding(lost) && (holder in made_out))
			baton_seen = list("where" = "held", "by" = holder.name)
	var/list/cells = list()
	for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
		var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
		if(isnull(timer))
			continue
		var/seen = can_look && sees_cell(cell, in_sight)
		var/list/names
		if(seen)
			names = list()
			for(var/mob/living/carbon/human/person as anything in cell.occupants())
				if(person in made_out)
					names += person.name
		// The room the cell is in, and how far off it is on this level (null on another): where to
		// wait with a prisoner when no cell is in the Brig, as on Tramstation (MAP-04).
		cells += list(list(
			"name" = cell.name,
			"running" = seen ? !!timer.timing : null,
			"left" = seen ? round(timer.time_left(seconds = TRUE)) : null,
			"occupants" = names,
			"room" = get_area_name(timer, TRUE),
			"dist" = timer.z == body.z ? get_dist(body, timer) : null,
		))
	var/mob/living/held = body.pulling
	// Who it can ask to open each room it lately found no way into, and each other room it can see
	// someone in: it may have a warrant on someone in there.
	var/list/keepers = list()
	var/list/places = crew_npc_station_places()
	for(var/place in blocked_place_names())
		var/list/names = keepers_known(places[place], place)
		if(length(names))
			keepers[place] = names
		// And the room it is reached through, if that is locked to it as well: the Quartermaster's
		// Office opens off the Cargo Bay, and it is the bay's people who can let it that far.
		var/through = reached_through[place]
		for(var/step in 1 to 4)
			if(isnull(through) || keepers[through])
				break
			var/list/outer_names = keepers_known(places[through], through)
			if(length(outer_names))
				keepers[through] = outer_names
			through = reached_through[through]
	if(can_look)
		var/area/own_room = get_area(body)
		for(var/mob/living/carbon/human/person in made_out)
			var/area/their_room = get_area(person)
			var/their_place = get_area_name(person, TRUE)
			if(their_room == own_room || keepers[their_place])
				continue
			var/list/names = keepers_known(their_room, their_place)
			if(length(names))
				keepers[their_place] = names
	return list(
		"keepers" = keepers,
		"has_baton" = !isnull(baton_carried(TRUE)),
		"has_cuffs" = !isnull(cuffs_carried()),
		"holding" = istype(held) ? held.name : null,
		"health" = round(body.health / max(body.maxHealth, 1) * 100),
		"baton_seen" = baton_seen,
		"cells" = cells,
	)

#undef CREW_NPC_TIMER_GAP
#undef CREW_NPC_BATON_WAIT
#undef CREW_NPC_BATON_HITS
#undef CREW_NPC_CUFF_WAIT
#undef CREW_NPC_CLOSE_STEPS
#undef CREW_NPC_BATON_SWINGS
#undef CREW_NPC_BATON_CHASE
#undef CREW_NPC_CHASE_STEPS
#undef CREW_NPC_KIT_GAP
#undef CREW_NPC_STRIKE_GAP
#undef CREW_NPC_CELL_MAX_TURFS
#undef CREW_NPC_CELL_PATH
#undef CREW_NPC_STEP_WAIT
#undef CREW_NPC_CELL_SKIP
#undef CREW_NPC_CUSTODY_HOLD
#undef CREW_NPC_ARREST_GRACE
#undef CREW_NPC_EARSHOT
#undef CREW_NPC_CUFFED_ALONE
#undef CREW_NPC_STRUCK_GAP
#undef CREW_NPC_KIT_SKIP
#undef CREW_NPC_KNOCKED_DOWN
#undef CREW_CUSTODY_ARREST
#undef CREW_CUSTODY_CELL
#undef CREW_CUSTODY_CUFFS
#undef CREW_NPC_CUFF_TRIES_ALONE
