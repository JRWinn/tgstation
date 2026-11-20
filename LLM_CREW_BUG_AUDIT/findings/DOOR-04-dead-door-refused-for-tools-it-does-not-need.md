---
id: DOOR-04
title: A door with no power is refused for want of a screwdriver, a multitool and wire skill, when a crowbar alone opens it
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: e5240125a75
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_forcing.dm:169, code/modules/llm_crew/crew_npc_forcing.dm:108, code/modules/llm_crew/crew_npc_forcing.dm:453
fix: In tool_force_door ask for the screwdriver, the multitool and the wire skill only when the door to be forced has power, and for the crowbar always
---

## What is wrong

`force_door_open` already knows that a door with no power is only pried: "A door that has no power to begin with is only pried". It skips the panel and the wires when `door.hasPower()` is FALSE and goes straight to the crowbar. That is what a player does, and anyone with a crowbar can do it.

But `tool_force_door`, which runs first, refuses the whole job unless the body carries all three tools and has the engineer's wire skill, whatever state the door is in:

- no screwdriver, no multitool or no crowbar: "You have no multitool on you. It takes a screwdriver, a multitool and a crowbar to open a locked door." (`no_tools`)
- no `TRAIT_KNOW_ENGI_WIRES`: "You do not know one wire in an airlock from another..." (`no_knowledge`)

So an engineer who has lost its multitool cannot pry a dead door that it is standing next to with a crowbar on its belt.

One concrete case. The station loses power about fifteen minutes into test rounds (the owner's notes: no NPC runs the engine yet). From then every airlock is dead: `CanAStarPass` in `airlock.dm` wants `hasPower()` for a shut door, so no route goes through any shut door and the crew are shut in wherever they stand. Prying is then the only way through a door, and it needs only a crowbar. The engineer is sent to force the door of the room someone is shut in. If the engineer has been shocked at an electrified door earlier, it dropped what it held, and the multitool it was holding is on the floor somewhere (a shock stuns, and a stunned body drops what is in its hands; nothing in this file picks the tool up again). `tool_carried(TOOL_MULTITOOL)` is null, and the answer is `no_tools`, for a door that would have slid open under the crowbar.

There is a second, wider side to this, which is for the owner to decide (see the question below): the tool is for engineering staff only (`works_in_engineering()`), so during a power cut nobody else can pry a door either, though any player with a crowbar could.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:169`, in `tool_force_door`, before any door is chosen:

    	var/list/missing = list()
    	for(var/tool_kind in list(TOOL_SCREWDRIVER, TOOL_MULTITOOL, TOOL_CROWBAR))
    		if(isnull(tool_carried(tool_kind)))
    			missing += tool_kind
    	if(length(missing))
    		forcing_failure("no_tools", "You have no [english_list(missing, and_text = " or ")] on you. It takes a screwdriver, a multitool and a crowbar to open a locked door.", first, room_name, first_label, more_details = list("missing" = missing), tell_now = TRUE)
    		return
    	if(!HAS_TRAIT(body, TRAIT_KNOW_ENGI_WIRES))
    		forcing_failure("no_knowledge", ...

`code/modules/llm_crew/crew_npc_forcing.dm:453`, in `force_door_open`, which needs none of that for a dead door:

    	var/had_power = door.hasPower()
    	var/opened_panel = FALSE
    	if(had_power)
    		// The panel: a click on the door with a screwdriver opens it.

`code/game/machinery/doors/airlock.dm:1276`, `try_to_crowbar`, the base game's rule:

    	if(!hasPower())
    		if(operating)
    			return
    		...
    		INVOKE_ASYNC(src, density ? PROC_REF(open) : PROC_REF(close), BYPASS_DOOR_CHECKS, user)
    		return

## How it was found

Read from the code, not seen in a round. That a shocked body drops its multitool is from the base game's stun rules and was not traced line by line.

## How to fix it

1. In `tool_force_door`, move the tools and skill checks to after the door is chosen (after the `while` loop, where `best` is known), or work out before the loop whether every candidate door is dead.
2. Always need the crowbar. Need the screwdriver, the multitool and `TRAIT_KNOW_ENGI_WIRES` only if `best.hasPower()`. Word the refusal to match: for a dead door, "You have no crowbar on you. A door with no power only wants prying."
3. Keep the `missing` detail in the answer as it is, so the window's `whyNot` in `jobs/forcing.ts` still reads it.
4. `force_door_open` needs no change: it looks at the door again when the body gets there. If power has come back by then and the body lacks the other tools, `use_tool_on_door` and `take_door_power` already answer "you no longer have a ... on you".
5. Separately, a small gap: after a failed forcing, a tool the body dropped is left on the floor. Worth a line in the answer ("your multitool is on the floor") only if this is seen in a round.

Question for the owner: should crew who are not engineers pry a dead door with a crowbar they are carrying or can find (an emergency crowbar, a toolbox)? A player can. If yes, the `works_in_engineering()` gate becomes "engineering, or the door has no power and the body has a crowbar", and each job's plan needs a step for it. That is a design change, not part of this fix.

## How to test the fix

- Server compile.
- `tools/llm_crew/` has no case for the server side of forcing. In a round: cut the power to a room (or wait for the station to lose it), take the engineer's multitool away, and have the Chief Engineer send it to force a door. `game.log` should show `forced open ... by prying it` and not `could not force ... (no_tools)`.

## Check

Checked by Opus 5.5. Confirmed.

- The quotes are what the code says today: the tools loop and the `no_tools` / `no_knowledge` refusals in `tool_force_door` (`crew_npc_forcing.dm` about 167-179) run before any door is chosen and whatever state the doors are in; `force_door_open` (about 453) skips the panel and wires when `had_power` is FALSE; `try_to_crowbar` in `airlock.dm` opens a door with no power for anyone with a crowbar.
- The drop is real: a shock that paralyses sets `TRAIT_HANDS_BLOCKED`, and `on_handsblocked_start` in `code/modules/mob/living/living.dm` (about 2748) calls `drop_all_held_items()`. `take_door_power` holds the multitool in hand when it clicks the door, and an electrified door shocks whoever goes into its wires, so an engineer can lose its multitool exactly there.
- The skill half matters less than the write-up suggests: every body `works_in_engineering()` lets through (Station Engineer, Chief Engineer) gets `TRAIT_KNOW_ENGI_WIRES` from its job skill chip (`station_engineer.dm` and `chief_engineer.dm`, `skillchips = list(/obj/item/skillchip/job/engineer)`). In practice the fault is the tools check. Both engineers spawn with `/obj/item/storage/belt/utility/full`, which holds all three tools, so the case needs a tool lost first. That is why it stays medium and not high.
- The change log entry of 18:50 ("An engineer forces a door security cannot get through") chose the skill-chip refusal for wire work and says "A door that already has no power is only pried": nothing there chose to refuse a dead door for want of a multitool.

Notes for whoever fixes it: after the loop the door is `best`, so pass `best` and `labels[best]` to `forcing_failure`, not `first`. If power is back when the body arrives and it lacks the screwdriver or multitool, the failure says "you no longer have a ... on you", which is a little untrue (it never had one) but safe; a body without the skill chip gets "the wires window does not show you which wire is which" from `take_door_power`, also safe. No change needed in `forcing.ts`: `no_tools` stays a final reason there.
