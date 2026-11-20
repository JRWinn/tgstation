/**
 * AI controller for crew NPCs whose goals are chosen by an LLM on the owning player's machine.
 *
 * The behavior tree here is only the motor layer and the default behavior: it carries out
 * actions and keeps the body wandering when no brain is attached. It never picks goals.
 */
/// Why a walk ended when the body went down under it (stunned, out cold, dead or taken over), not the walk itself.
#define CREW_NPC_WALK_KNOCKED_DOWN "you were knocked off your feet"

/datum/ai_controller/crew_npc
	ai_movement = /datum/ai_movement/navmap_astar/crew_npc
	movement_delay = 0.4 SECONDS
	behavior_tree_json = "code/modules/llm_crew/crew_npc.bt.json"
	/// The link to the owning player's brain window, if this NPC has an owner.
	var/datum/crew_brain_link/brain_link
	/// Short name the brain window uses for this NPC, unique among its owner's NPCs.
	var/npc_id
	/// Recent sense events, oldest first. Each is a list with seq, time, kind, text and details.
	var/list/sense_events = list()
	/// Sequence number given to the next sense event.
	var/next_event_seq = 1
	/// Handles the brain uses to point at people, keyed by person_key().
	var/list/person_handles = list()
	/// Weak references to the people behind each handle, keyed by handle.
	var/list/handle_people = list()
	/// world.time each person was last in view, keyed by person_key().
	var/list/last_seen_at = list()
	/// The people in view right now. Each is a list with handle and name.
	var/list/people_in_view = list()
	/// The notable things in view right now, most notable first. Each is a list with name, count and kind.
	var/list/things_in_view = list()
	/// Rooms the body has been in, by name. Each value is list(x, y, z): a spot inside that it can walk back to.
	var/list/visited_places = list()
	/// Name of the room the body is in now.
	var/current_place
	/// How many looks in a row the body has been in current_place.
	var/looks_in_place = 0
	/// What the body is inside, in words, while it is not standing on a floor: "pipes" for the disposal pipes. Null while it is on one.
	var/off_floor_in
	/// Whether each room it has had cause to ask about is locked to it, by name: list(locked, world.time it was worked out).
	var/list/locked_place_cache = list()
	/// The slippery things it has seen lying about, by REF, as weakrefs: what it knows to walk over and not run.
	var/list/slippery_seen = list()
	/// The tool that started the walk in progress.
	var/walk_tool
	/// Where the walk in progress is headed, in words.
	var/walk_goal
	/// How long the walk in progress may take.
	var/walk_timeout
	/// Rooms the body has found it cannot get into, by name, so it stops trying to explore them.
	var/list/unreachable_places = list()
	/// Name of the room that is the body's post, if its job has one.
	var/post_place
	/// Name of the room that is the body's office, if its job gives it one to go back to between errands.
	var/office_place
	/// Name of the room a head calls its staff together in: one that is open to all of them.
	var/meeting_place
	/// The spot in post_place where the body stands to do its job.
	var/turf/post_turf
	/// Name of whoever the body last heard speak.
	var/last_heard_speaker
	/// Name of whoever the supplies on order are for.
	var/order_for
	/// How many crates the order on the go is for, of every kind together.
	var/order_count = 1
	/// What the order on the go is for: how many crates of each kind, by the name the kind is ordered under.
	var/list/order_items = list()
	/// The order on the go in words, as it is spoken of: "the Janitorial Supplies Crate", "2 of the Janitorial Supplies Crate and the Replacement Lights".
	var/ordered_words
	/// The manifest numbers of the crates of the order on the go.
	var/list/ordered_numbers = list()
	/// What kind each crate of the order on the go is, by its manifest number as text.
	var/list/ordered_kinds = list()
	/// A crate the body unpacked and has yet to take back to cargo, as a weak reference.
	var/datum/weakref/crate_to_return
	/// PDA messages the body owes about crates: each a list with to (a name), kind (CREW_NOTICE_*), numbers and, for an order that has come in, what.
	var/list/notices_owed = list()
	/// PDA messages its PDA would not send, kept to send again: "name|text" to a list with to, text and at (world.time it was first tried).
	var/list/unsent_messages = list()
	/// TRUE while a timer is running to try those again.
	var/unsent_retry_due = FALSE
	/// Name of whoever a held crate is being brought out to the lobby for.
	var/release_for
	/// The room a crate the body has collected is being taken to, by name.
	var/collect_to
	/// world.time the body next goes to look over the crates waiting to be collected, or 0 while none are.
	var/held_check_at = 0
	/// The last time someone at its post said they were going to look that this body has counted from.
	var/held_claim_seen = 0
	/// TRUE from the moment the body places an order until the shuttle docks with it or it gives up waiting.
	var/supply_run_active = FALSE
	/// The supply order the body has placed, as a weak reference. The game deletes it once the crate is loaded.
	var/datum/weakref/pending_order
	/// The name of the crate the body last ordered.
	var/ordered_crate_name
	/// world.time the supply shuttle was first found unable to leave for the order in progress, or 0.
	var/supply_held_up_since = 0
	/// The last look at the freight, as freight_state() gives it, and world.time it was taken.
	var/list/freight_cache
	var/freight_cached_at = 0
	/// The name of the crate the body is hauling: into the bay, aboard the shuttle, out to the lobby, or away to where it is wanted.
	var/hauled_name
	/// world.time the supply run in progress started.
	var/supply_run_started_at = 0
	/// The PDAs the body is listening to for messages, as weak references.
	var/list/watched_pdas = list()
	/// How many messes a cleaner grenade would reach if thrown now, or 0 if the body has none or it would be a waste.
	var/grenade_messes = 0
	/// How each person in view, and the body itself, looked at the last look, keyed by person_key(). Each value is list(health, stat, knocked out, world.time).
	var/list/health_seen = list()
	/// world.time the brain was last told each person had been hurt, keyed by person_key().
	var/list/harm_told_at = list()
	/// People the brain has already been told are down or dead, by person_key(), so it is told once.
	var/list/bodies_noticed = list()
	/// Messes the body has seen and not yet seen gone, keyed by REF. Each value is list(weak reference, room name, turf).
	var/list/remembered_messes = list()
	/// How many times running the body has tried to leave the room it is in and found no way out.
	var/ways_out_failed = 0
	/// TRUE once the body has looked for a way out of the room it is in and found there is none.
	var/shut_in = FALSE
	/// TRUE while it is testing routes to find out whether it is shut in.
	var/checking_shut_in = FALSE
	/// world.time until which the body stands still because it is talking with someone.
	var/talk_hold_until = 0
	/// Weak reference to whoever the body last walked into and did not get past.
	var/datum/weakref/blocked_by
	/// The tile the body walked into them from.
	var/turf/blocked_from
	/// How many times running it has walked into them from that tile.
	var/blocked_bumps = 0
	/// world.time it last walked into them.
	var/blocked_at = 0
	/// Weak reference to something it walked into that will never step aside or swap places (a parked
	/// MULEbot, a body with nobody in it), and the tile it stood on. The walk's next plan goes round that
	/// tile while it is still there. Cleared at the start of each walk.
	var/datum/weakref/avoid_ref
	var/turf/avoid_turf
	/// TRUE once this walk found no way round it: it then plans through, and is stopped by it as before.
	var/avoid_gave_up = FALSE
	/// TRUE once the way round it has been logged, this walk.
	var/avoid_logged = FALSE
	/// world.time until which a door someone opened for the body is being held open.
	var/door_held_until = 0
	/// world.time until which a door is being held open for the body to leave the room it is in.
	var/let_out_until = 0
	/// The room a door is being held open for the body to go into, and the name of whoever is holding it. Kept while it is in that room.
	var/let_into_place
	var/let_in_by
	/// That door, as a weak reference.
	var/datum/weakref/let_in_door
	/**
	 * The way the body came, since it was last somewhere it could leave by itself: each room that is
	 * locked to it, in the order it went into them. Each is a list with place (the room), from (the
	 * room it came into it from), door (the door between the two, as a weak reference, if someone
	 * opened one for it) and by (the name of whoever opened it). The first one's "from" is where it
	 * was last out, and getting back there is what getting out means.
	 */
	var/list/trail = list()
	/// TRUE from the moment the body finds it cannot get out by itself until it is back where its trail began.
	var/wants_out = FALSE
	/// How many steps the last route planned for the walk in progress runs to: 0 if no way was found, null if none has been planned.
	var/last_route_steps
	/// The door the body has gone to stand at because it wants through, as a weak reference.
	var/datum/weakref/wanted_door
	/// The room that door is the way into, or out of, and which of the two it is.
	var/wanted_door_place
	var/wanted_door_leaving = FALSE
	/// What that door is called, to tell it from the room's other doors: see crew_npc_door_label.
	var/wanted_door_label
	/// The room whose door the body is on its way to open for someone: its post, or another room of its department.
	var/door_room
	/// Fire alarms the body set off for and could not reach, keyed by REF, with world.time it gave up on each.
	var/list/fire_alarms_failed = list()
	/// The last look at what is lying about in the work area, as tidy_state() gives it, and world.time it was taken.
	var/list/tidy_cache
	var/tidy_cached_at = 0
	/// The thing the body has picked up to put away, and where it is taking it, as weak references.
	var/datum/weakref/tidy_item
	var/datum/weakref/tidy_place
	/// Things the body could not put away, by REF, with the world.time it gave up on each.
	var/list/tidy_skipped = list()
	/// The crate the body is hauling into the bay or aboard the shuttle, as a weak reference.
	var/datum/weakref/hauled_ref
	/// How many times the crate of the haul in progress has got away and been taken up again.
	var/haul_tries = 0
	/// The haul the body has given up on while it puts the crate clear of the doors: the tool that began it, and why it failed. Null when it has not given one up.
	var/gave_up_tool
	var/gave_up_reason
	/// TRUE for the moment between one step of seeing to a crate and the next: a walk has ended and the errand that follows it has not begun. The brain is told the body is busy throughout.
	var/seeing_to_crate = FALSE
	/// TRUE while that haul is being reported to the brain as failed, so the report says where the crate was left.
	var/reporting_gave_up = FALSE
	/// TRUE once the body has tried to pull that crate clear and could not. Pushing it is what is left.
	var/clear_by_pushing = FALSE
	/// Where the crate of a haul that was given up has been left, in words for the brain, and whether it was pushed there. Null if it could not be put clear.
	var/left_clear_in
	var/left_clear_pushed = FALSE
	/// What the body goes back to once a crate that was shutting its way is clear: a list with either walk (target, tool, goal, timeout) or haul (crate as a weak reference, tool, name, tries). Null when it is not clearing its way.
	var/list/after_clearing
	/// world.time the body last set about moving a crate that was shutting its way, or 0. It does not do so again for a while, so a crate it cannot shift is not gone at over and over.
	var/way_cleared_at = 0
	/// TRUE if the room the body is in is locked to it: none of its doors open for the body.
	var/out_of_bounds = FALSE
	/// The doors into the body's post, as weak references. Null until they have been looked for.
	var/list/post_door_refs
	/// Whoever the body is walking out of its post, as a weak reference.
	var/datum/weakref/evicting
	/// world.time until which someone has the body by the arm, and their name.
	var/in_hand_until = 0
	var/in_hand_of
	/// TRUE if the body is shut in and can see a door standing open.
	var/open_door_in_view = FALSE
	/// Rooms the body lately failed to find a way into, by name, with the world.time it failed.
	var/list/blocked_places = list()
	/// How many times running the body has found no way into each of those rooms, by name.
	var/list/blocked_tries = list()
	/// Names of the rooms that are this body's to keep fit to work in: its post, and where it serves the crew.
	var/list/work_area = list()
	/// Names of the other rooms of its department that its own ID opens. It looks in on them when it has nothing to do.
	var/list/look_in_rooms = list()
	/// Names of those of its rooms, its post among them, that every door into is locked to the crew at large.
	var/list/closed_rooms = list()
	/// Those of its rooms that can only be got into through another of them, as room name -> the room every door of it opens from. A locked room inside a locked room.
	var/list/reached_through = list()
	/// Messes the body has scrubbed at without success, keyed by REF, so it does not keep trying them.
	var/list/stubborn_messes = list()
	/// Names of the messes in view that the body could clean with what it holds.
	var/list/cleanable_messes = list()
	/// Messes still to be cleaned in the cleaning job in progress.
	var/list/clean_queue = list()
	/// How many messes the cleaning job in progress has cleaned.
	var/cleaned_count = 0
	/// Something that turned up in its hand without its picking it up, as a weakref: it has yet to put it down.
	var/datum/weakref/unasked_item
	/// How many times it has put off putting that down because its hands were busy.
	var/unasked_item_waits = 0
	/// When one of the crew last handed it something. What comes to hand then is given, not found there.
	var/handed_at = 0
	/// How many messes it has tried in the cleaning job in hand and could not shift or could not get to.
	var/clean_failed_count = 0
	/// The kind of thing it was cleaning with when it found the messes in stubborn_messes would not come off.
	var/stubborn_with
	/// How many messes of each kind have not come off with that, by the kind's type.
	var/list/stubborn_kinds = list()
	/// How many messes the body has cleaned up this shift, and how many things it has put away. Its head hears of them at staff meetings.
	var/work_cleaned = 0
	var/work_put_away = 0
	/// How many crates the body has hauled in off the supply shuttle this shift, and how many it has sent out: brought out to whoever came for one, or put aboard the shuttle to go back.
	var/work_crates_in = 0
	var/work_crates_out = 0
	/// How many machines the body has set this shift: a pump turned on, a canister connected, an emitter switched. Engineering staff.
	var/work_machines_set = 0
	/// Goes up each time an errand starts or is abandoned, so a finished step can tell whether it is still the current one.
	var/errand_serial = 0
	/// Goes up with each tool call that is carried out, other than speaking and holding still, so a tool that sleeps can tell whether a newer one has come since (CORE-07).
	var/tool_serial = 0
	/// TRUE if the body has water to hand that a dry mop can be wetted with: a sink in sight, a mop bucket or cart in sight with water in it, or a bucket of water in its other hand.
	var/sink_in_view = FALSE
	/// What that water is in, by name: "sink", "bucket", "janitorial cart". Null if there is none to hand.
	var/water_from
	/// TRUE if the body holds a bucket that is under half full and can see a water tank or a sink to fill it at.
	var/bucket_to_fill = FALSE
	/// The tool that started the errand in progress.
	var/errand_tool
	/// The name of the item the errand in progress is after, in lower case.
	var/errand_item
	/// What the body last saw in each container, keyed by its REF. Each value is a list with the container (a weak reference) and items (names).
	var/list/storage_memory = list()
	/// Containers still to be looked inside during the search in progress.
	var/list/storage_queue = list()
	/// The tool that started the search in progress.
	var/search_tool
	/// How many containers the search in progress has seen inside.
	var/search_count = 0
	/// world.time each container was last looked at, keyed by its REF.
	var/list/storage_checked_at = list()
	/// world.time the storage in each room was last looked through, by room name. Only rooms with storage are listed.
	var/list/room_searched_at = list()
	/// How many containers in the body's room are in view and have not been looked inside lately.
	var/storage_here = 0
	/// TRUE once the last search for somewhere to explore found nothing left that the body can reach.
	var/nowhere_new_left = FALSE
	/// TRUE while the body is taking a break: it stays put, where otherwise it would wander.
	var/resting = FALSE
	/// TRUE while the body is working out where to explore.
	var/choosing_where_to_explore = FALSE
	/// TRUE while the body is working out which door of a room it can walk up to.
	var/finding_door = FALSE
	/// Highest sense event sequence number the brain window says it has dealt with.
	var/acked_seq = 0
	/// world.time the current tool call counting window started.
	var/tool_window_started = 0
	/// Tool calls received in the current counting window.
	var/tool_calls_in_window = 0
	/// Cooldown between things the body says.
	COOLDOWN_DECLARE(say_cooldown)
	/// Cooldown between attempts to step back to the body's post.
	COOLDOWN_DECLARE(post_return_cooldown)
	/// Looping timer that runs look_around().
	var/look_timer

/datum/ai_controller/crew_npc/Destroy(force)
	brain_link?.remove_npc(src)
	return ..()

/datum/ai_controller/crew_npc/TryPossessPawn(atom/new_pawn)
	if(!ishuman(new_pawn))
		return AI_CONTROLLER_INCOMPATIBLE

	var/mob/living/carbon/human/human_pawn = new_pawn
	RegisterSignal(human_pawn, COMSIG_MOB_MOVESPEED_UPDATED, PROC_REF(update_movespeed))
	movement_delay = human_pawn.cached_multiplicative_slowdown
	// A body gets past people as a player does: by walking into them and swapping places, which the
	// game allows only head-on (see the crew movement datum, whose routes have no diagonal steps),
	// and not with someone in combat mode, holding a prisoner, or on walk intent. Who stops it is noted.
	RegisterSignal(human_pawn, COMSIG_MOVABLE_BUMP, PROC_REF(on_bump))
	start_senses(human_pawn)
	return ..()

/datum/ai_controller/crew_npc/UnpossessPawn(destroy)
	if(!isnull(pawn))
		UnregisterSignal(pawn, list(COMSIG_MOB_MOVESPEED_UPDATED, COMSIG_MOVABLE_BUMP))
		stop_senses(pawn)
	blocked_by = null
	avoid_ref = null
	avoid_turf = null
	return ..()

/**
 * Notes who the body walked into, and how many times running it has walked into them from the
 * same tile: a swap that went through moves the body, so only being stopped counts up.
 */
/datum/ai_controller/crew_npc/proc/on_bump(datum/source, atom/bumped)
	SIGNAL_HANDLER
	if(!isliving(bumped))
		return
	var/turf/here = get_turf(pawn)
	if(blocked_by?.resolve() == bumped && blocked_from == here)
		blocked_bumps++
	else
		blocked_by = WEAKREF(bumped)
		blocked_from = here
		blocked_bumps = 1
	blocked_at = world.time
	// Nobody to ask and nothing that will ever move for it: it goes round, as a player would, from the
	// next plan of the walk, the first time it is walked into. There is nothing to wait for.
	if(!avoid_gave_up && avoid_ref?.resolve() != bumped && blocker_will_not_move(bumped))
		avoid_ref = WEAKREF(bumped)
		avoid_turf = get_turf(bumped)
		avoid_logged = FALSE

/**
 * TRUE if this can never be got past by swapping places, nor asked to move: the game will not swap
 * with it (a MULEbot), or nobody is behind it to hear (a bot, an animal, a body whose player is gone).
 * A player, or a crew member whose brain can be asked to step aside, is not: it is stopped by them,
 * and its brain asks.
 */
/datum/ai_controller/crew_npc/proc/blocker_will_not_move(mob/living/blocker)
	if(HAS_TRAIT(blocker, TRAIT_NOMOBSWAP))
		return TRUE
	if(blocker.client || istype(blocker.ai_controller, /datum/ai_controller/crew_npc))
		return FALSE
	return TRUE

/**
 * The tile the walk's next plan should leave out: where a blocker that will not move still stands.
 * Never the body's own tile, nor the one it is walking to; the planner finds nothing from or to a tile
 * it is told to leave out. Null, and forgotten, once the blocker has gone from it.
 */
/datum/ai_controller/crew_npc/proc/tile_to_go_round(atom/walk_target)
	if(isnull(avoid_turf))
		return null
	var/mob/living/blocker = avoid_ref?.resolve()
	if(avoid_gave_up || QDELETED(blocker) || get_turf(blocker) != avoid_turf || get_turf(pawn) == avoid_turf || get_turf(walk_target) == avoid_turf)
		avoid_ref = null
		avoid_turf = null
		return null
	return avoid_turf

/datum/ai_controller/crew_npc/setup_able_to_run()
	. = ..()
	RegisterSignal(pawn, COMSIG_MOB_INCAPACITATE_CHANGED, PROC_REF(update_able_to_run))

/datum/ai_controller/crew_npc/clear_able_to_run()
	UnregisterSignal(pawn, COMSIG_MOB_INCAPACITATE_CHANGED)
	return ..()

/datum/ai_controller/crew_npc/get_able_to_run()
	var/mob/living/living_pawn = pawn
	// Cuffed or grabbed crew can still shuffle about and talk; stunned or unconscious crew cannot.
	if(INCAPACITATED_IGNORING(living_pawn, INCAPABLE_RESTRAINTS|INCAPABLE_STASIS|INCAPABLE_GRAB))
		return AI_UNABLE_TO_RUN
	return ..()

/datum/ai_controller/crew_npc/proc/update_movespeed(mob/living/source)
	SIGNAL_HANDLER
	movement_delay = source.cached_multiplicative_slowdown
