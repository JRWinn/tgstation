---
id: DOOR-15
title: An electrified door shocks a body without insulated gloves, the Chief Engineer always, as it goes for the wires, and the brain is told only that a wire would not pulse, so it goes back for a second shock
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_forcing.dm:381, code/modules/llm_crew/crew_npc_forcing.dm:405, code/modules/llm_crew/crew_npc_forcing.dm:343, code/datums/wires/airlock.dm:66, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:380
fix: Watch for the body being shocked at the door (COMSIG_LIVING_ELECTROCUTE_ACT) and answer reason electrified, which forcing.ts takes as final, and check for insulated gloves before going into the wires of a door that has shocked it
---

## What is wrong

`take_door_power` clicks the door with the multitool to go into its wires. On an airlock with its panel open that click reaches `attempt_wire_interaction`, then `/datum/wires/airlock/interact`, which shocks anyone who is not a silicon at 125% chance if the door is electrified:

    /datum/wires/airlock/interact(mob/user)
    	var/obj/machinery/door/airlock/airlock_holder = holder
    	if (!HAS_SILICON_ACCESS(user) && airlock_holder.isElectrified() && airlock_holder.shock(user, 125))
    		return

`shock()` does nothing to someone in shock-proof gloves (`electrocute_mob` and `should_electrocute` look at `wearing_shock_proof_gloves()`, which wants `siemens_coefficient == 0`). A station engineer spawns in yellow insulated gloves. The Chief Engineer does not: its outfit, `/datum/outfit/job/ce`, has `gloves = /obj/item/clothing/gloves/color/black`, and black gloves keep the base `siemens_coefficient = 0.5`. `forcing.ts` says the Chief Engineer forces the door itself when no engineer is aboard ("With no engineer aboard, the Chief Engineer does it"). An engineer who has lost its gloves is in the same place.

The forcing code never looks for a shock. It goes on:

1. The click on the door with the multitool shocks the body: burn damage from the area's power and a knock-down.
2. `wires_shown` still works. `work_wires` then refuses, because the body is down (`can_perform_action` fails) or because `/datum/wires/airlock/interactable` refuses an electrified, powered door to anyone `should_electrocute` says yes to.
3. `take_door_power` returns "you could not pulse its red wire", the screwdriver click to shut the panel may fail too (a carbon's knock-down from a shock comes about two seconds after it, by timer), and the brain gets reason `wire`: "You could not take the power away from the X door of Y: you could not pulse its red wire."
4. `forcing.ts` counts `wire` as worth one more try (`final` holds only bolted, welded, no_tools, no_knowledge and no_door). The Chief Engineer walks back to the same door and is shocked again. Then security is told "it would not open", with nothing about the shock.

A player shocked by a door knows it is live and why the wires would not take: they go for insulated gloves, or ask the AI or whoever electrified it. The body is told something that is not the reason.

One concrete case. The AI, or a traitor with the shock wire, electrifies the Bar Backroom door. Security asks for it to be opened. The station has a Chief Engineer and no engineer. The Chief Engineer walks to the door, opens the panel (a screwdriver click does not shock), clicks the door with its multitool and is shocked and knocked down. The pulses fail, the result is reason `wire`, the brain tries once more, and the Chief Engineer is shocked a second time.

The confidence is "likely" rather than "sure" only because the size of the shock (how much damage, how long the stun) depends on the area's power and was not worked out; that the shock happens, and that the answer names the wrong cause, is read from the code.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:381`, in `take_door_power`: the comment knows of the shock, and nothing after it checks for one:

    	// The click that brings the wires window up for a player. For this body no window comes, but
    	// the door does the rest of what it does to anyone who goes into its wires: one that is
    	// electrified shocks them.
    	var/why_not
    	if(!click_as_body(door))
    		why_not = "you could not reach its wires with your multitool"
    	...
    		if(!work_wires(door.wires, "pulse", list("wire" = colour)))
    			why_not = "you could not pulse its [colour] wire[length(pulsed) ? ", having pulsed the [english_list(pulsed)]" : ""]"

`code/datums/wires/airlock.dm:73`, why the pulse is refused afterwards:

    	if(!HAS_SILICON_ACCESS(user) && !isdrone(user) && airlock.isElectrified() && airlock.hasPower())
    		var/mob/living/carbon/carbon_user = user
    		if (!istype(carbon_user) || carbon_user.should_electrocute(get_area(airlock)))
    			return FALSE

`code/modules/jobs/job_types/chief_engineer.dm:75`, the Chief Engineer's gloves (only the MODsuit outfit, `/datum/outfit/job/ce/mod`, has yellow ones):

    	gloves = /obj/item/clothing/gloves/color/black

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:378`, the retry:

    	const final = ['bolted', 'welded', 'no_tools', 'no_knowledge', 'no_door'];
    	if (!ok) {
    		job.tries++;
    		if (job.tries < FORCE_TRIES && !final.includes(reason)) {
    			return;

## How it was found

Read from the code: `take_door_power`, the airlock's `item_interaction` (a wire tool on an open panel goes to `attempt_wire_interaction`), `/datum/wires/airlock/interact` and `interactable`, the CE and engineer outfits, and `forcing.ts`'s retry rule. Not seen in a round. How often doors are electrified in the owner's rounds is not known.

## How to fix it

1. In `take_door_power`, before the multitool click, `RegisterSignal(body, COMSIG_LIVING_ELECTROCUTE_ACT, PROC_REF(note_shocked))`, where `note_shocked` sets a var such as `shocked_at = world.time` (the signal is sent from `electrocute_act`, `living_defense.dm:631`). Unregister it straight after the click: `attempt_wire_interaction` runs `interact` by `INVOKE_ASYNC`, but `shock()` does not sleep, so the shock lands before `click_as_body` returns. Feeling the shock is what any player would know, so this keeps "senses only".
2. If the body was shocked, stop there and return "the door shocked you as you went for its wires: it is electrified". In `force_door_open`, turn that into `forcing_failure("electrified", ...)`, and skip the panel screwdriver step while the body is down (it cannot do it; say in the log that the panel was left open).
3. In `forcing.ts`, add `electrified` to `final`, and give `whyNot` a case: "it is electrified".
4. Optional, and the owner's call: before going into the wires of a door that has shocked it once this round, the body checks its own gloves (it can see what it wears: `body.gloves?.siemens_coefficient == 0`) and, if they are not insulated, says so and refuses. Getting insulated gloves would go through the usual way supplies come (the Chief Engineer asking, cargo ordering), not made in code.
5. Question for the owner: should the Chief Engineer's body be told at spawn that its gloves are not insulated? It can see that as a player can, so it is not a cheat, but it would change who is sent.

## How to test the fix

- Compile.
- In a round: electrify a door with the AI or the shock wire, with a Chief Engineer and no engineer aboard, and have security ask for it. `game.log` should show one `could not force ... (electrified)` line, no second try, and the Captain told it is electrified.
- With a station engineer in yellow gloves the same door should still be forced as before.
