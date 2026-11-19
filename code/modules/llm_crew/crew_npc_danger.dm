/**
 * Danger: what a crew NPC's body notices of harm coming to people, itself included, and how it gets clear.
 *
 * The body only reports what a bystander would see: someone is hurt, has collapsed, has died, or is
 * lying still, and who is standing over them with what in their hand. It does not say who did it.
 * Working that out, and deciding what to do about it, is the brain's business.
 *
 * NOT SWITCHED ON. Nothing calls watch_for_harm(), and the flee tool is not one the brain can call.
 * The brain window has no handling for danger yet. To switch it on: call watch_for_harm() for each
 * person in look_around() and for the body itself, call forget_old_looks() after, and add
 * CREW_TOOL_FLEE to handle_tool_call().
 */

/**
 * Compares someone in view, or the body itself, with how they looked a moment ago, and tells the brain
 * if they have come to harm.
 *
 * Arguments:
 * * person - Who to look at. The body itself is looked at the same way.
 * * in_sight - Everything the body can see, to find who is beside them.
 */
/datum/ai_controller/crew_npc/proc/watch_for_harm(mob/living/carbon/human/person, list/in_sight)
	var/mob/living/carbon/human/body = pawn
	var/key = person_key(person)
	var/list/before = health_seen[key]
	health_seen[key] = list(person.health, person.stat, IS_UNCONSCIOUS(person), world.time)
	var/is_self = person == body
	var/down = person.stat == DEAD || person.stat >= HARD_CRIT || IS_UNCONSCIOUS(person)

	var/what
	if(isnull(before) || world.time - before[4] > CREW_NPC_SIGHT_MEMORY)
		// Someone newly in view who is already down is a body found, and worth saying once.
		if(is_self || !down || (key in bodies_noticed))
			return
		bodies_noticed += key
		what = person.stat == DEAD ? CREW_HARM_BODY : CREW_HARM_DOWN
	else if(person.stat == DEAD && before[2] != DEAD)
		what = CREW_HARM_DIED
	else if(down && before[2] < HARD_CRIT && !before[3])
		what = CREW_HARM_COLLAPSED
	else if(before[1] - person.health >= CREW_NPC_HARM_NOTICED)
		what = CREW_HARM_HURT
	if(isnull(what))
		return
	// Blows land faster than anyone could remark on them. One report every few seconds is enough.
	if(what == CREW_HARM_HURT && world.time - (harm_told_at[key] || 0) < CREW_NPC_HARM_REPORT_GAP)
		return
	harm_told_at[key] = world.time
	if(what != CREW_HARM_HURT)
		bodies_noticed |= key

	var/badly = person.health < person.maxHealth * 0.5
	var/text
	switch(what)
		if(CREW_HARM_BODY)
			text = "[person.name] is lying dead on the floor."
		if(CREW_HARM_DOWN)
			text = "[person.name] is lying on the floor, not moving."
		if(CREW_HARM_DIED)
			text = is_self ? "You are dying." : "[person.name] has just died in front of you."
		if(CREW_HARM_COLLAPSED)
			text = is_self ? "You are collapsing." : "[person.name] has just collapsed."
		if(CREW_HARM_HURT)
			text = is_self ? "You have just been hurt[badly ? ", and you are badly wounded" : ""]." : "[person.name] has just been hurt[badly ? ", and is badly wounded" : ""]."

	var/list/details = list(
		"what" = what,
		"self" = is_self,
		"victim" = person.name,
		"victim_handle" = is_self ? null : handle_for(person),
	)
	var/mob/living/carbon/human/nearby = who_is_beside(person, in_sight)
	if(nearby)
		var/obj/item/weapon = held_weapon(nearby)
		text += " [nearby.name] is right beside [is_self ? "you" : "them"][weapon ? ", holding \a [weapon.name]" : ""]."
		details["beside"] = nearby.name
		details["beside_handle"] = handle_for(nearby)
	emit_sense(CREW_SENSE_DANGER, text, details)

/**
 * Returns whoever is standing right beside someone who has come to harm and looks most as if they had a
 * hand in it: armed, or squaring up. Returns null if nobody beside them looks that way.
 */
/datum/ai_controller/crew_npc/proc/who_is_beside(mob/living/carbon/human/person, list/in_sight)
	var/mob/living/carbon/human/likeliest
	for(var/mob/living/carbon/human/other in in_sight)
		if(other == person || other == pawn || other.stat == DEAD || get_dist(other, person) > 1)
			continue
		if(held_weapon(other))
			return other
		if(other.combat_mode)
			likeliest = other
	return likeliest

/// Returns something this person is holding that could do real harm, or null.
/datum/ai_controller/crew_npc/proc/held_weapon(mob/living/carbon/human/person)
	for(var/obj/item/held in person.held_items)
		if(held.force >= CREW_NPC_WEAPON_FORCE)
			return held
	return null

/// Forgets how people looked once they have been out of view a while, so the lists do not grow all round.
/datum/ai_controller/crew_npc/proc/forget_old_looks()
	for(var/key in health_seen)
		var/list/seen = health_seen[key]
		if(world.time - seen[4] > CREW_NPC_SIGHT_MEMORY)
			health_seen -= key
			harm_told_at -= key

/**
 * Tool: get clear of where the body is. It heads for the nearest room it knows that is far enough off
 * to be out of sight of here.
 */
/datum/ai_controller/crew_npc/proc/tool_flee()
	var/turf/here = get_turf(pawn)
	var/here_name = get_area_name(here, TRUE)
	var/best_place
	var/turf/best_turf
	var/best_distance = INFINITY
	for(var/place in visited_places)
		if(place == here_name || (place in unreachable_places))
			continue
		var/list/spot = visited_places[place]
		if(spot[3] != here.z)
			continue
		var/turf/there = locate(spot[1], spot[2], spot[3])
		var/distance = get_dist(here, there)
		if(distance <= CREW_NPC_VISION_RANGE || distance >= best_distance)
			continue
		best_distance = distance
		best_place = place
		best_turf = there
	if(isnull(best_turf))
		action_result(CREW_TOOL_FLEE, FALSE, "You know of nowhere to run to.")
		return
	start_walk(best_turf, CREW_TOOL_FLEE, best_place, CREW_NPC_TRAVEL_TIMEOUT)
