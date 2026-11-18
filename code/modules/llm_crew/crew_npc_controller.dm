/**
 * AI controller for crew NPCs whose goals are chosen by an LLM on the owning player's machine.
 *
 * The behavior tree here is only the motor layer and the default behavior: it carries out
 * actions and keeps the body wandering when no brain is attached. It never picks goals.
 */
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
	/// How many crates the order on the go is for.
	var/order_count = 1
	/// The manifest numbers of the crates of the order on the go.
	var/list/ordered_numbers = list()
	/// A crate the body unpacked and has yet to take back to cargo, as a weak reference.
	var/datum/weakref/crate_to_return
	/// PDA messages the body owes about crates: each a list with to (a name), kind (CREW_NOTICE_*), numbers and, for an order that has come in, what.
	var/list/notices_owed = list()
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
	/// world.time until which a door someone opened for the body is being held open.
	var/door_held_until = 0
	/// world.time until which a door is being held open for the body to leave the room it is in.
	var/let_out_until = 0
	/// The room the body was let into through a door it cannot open itself, and the name of whoever let it in.
	var/let_into_place
	var/let_in_by
	/// The door the body was let in by, as a weak reference. It is the one it goes back to when it wants out.
	var/datum/weakref/let_in_door
	/// The door the body has gone to stand at because it wants through, as a weak reference.
	var/datum/weakref/wanted_door
	/// The room that door is the way into, or out of, and which of the two it is.
	var/wanted_door_place
	var/wanted_door_leaving = FALSE
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
	/// Names of the rooms that are this body's to keep fit to work in: its post, and where it serves the crew.
	var/list/work_area = list()
	/// Names of the other rooms of its department that its own ID opens. It looks in on them when it has nothing to do.
	var/list/look_in_rooms = list()
	/// Names of those of its rooms, its post among them, that every door into is locked to the crew at large.
	var/list/closed_rooms = list()
	/// Messes the body has scrubbed at without success, keyed by REF, so it does not keep trying them.
	var/list/stubborn_messes = list()
	/// Names of the messes in view that the body could clean with what it holds.
	var/list/cleanable_messes = list()
	/// Messes still to be cleaned in the cleaning job in progress.
	var/list/clean_queue = list()
	/// How many messes the cleaning job in progress has cleaned.
	var/cleaned_count = 0
	/// Goes up each time an errand starts or is abandoned, so a finished step can tell whether it is still the current one.
	var/errand_serial = 0
	/// TRUE if the body can see a sink, where a dry mop can be wetted.
	var/sink_in_view = FALSE
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
	// Routes are planned as if nobody were in the way, and bodies only swap places head-on, never on
	// a diagonal. Several NPCs in one small room would jam solid. Letting them step past people fixes that.
	human_pawn.pass_flags |= PASSMOB
	start_senses(human_pawn)
	return ..()

/datum/ai_controller/crew_npc/UnpossessPawn(destroy)
	if(!isnull(pawn))
		UnregisterSignal(pawn, COMSIG_MOB_MOVESPEED_UPDATED)
		var/mob/living/carbon/human/human_pawn = pawn
		human_pawn.pass_flags &= ~PASSMOB
		stop_senses(pawn)
	return ..()

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
