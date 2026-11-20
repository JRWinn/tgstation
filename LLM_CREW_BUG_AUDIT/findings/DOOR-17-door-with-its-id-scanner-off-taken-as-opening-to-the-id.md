---
id: DOOR-17
title: A door whose ID scanner is cut or switched off opens to nobody, and the door code takes it as opening to everyone whose ID has the access
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_forcing.dm:156, code/modules/llm_crew/crew_npc_forcing.dm:443, code/modules/llm_crew/crew_npc_guarding.dm:132, code/modules/llm_crew/crew_npc_doors.dm:585, code/modules/llm_crew/crew_npc_doors.dm:158
fix: Add one helper for whether a door will open to a body by hand, requiresID and allowed and power and no bolts or weld, and use it wherever the door code now asks allowed alone
---

## What is wrong

The door code asks `door.allowed(body)` to mean "this door opens for this body". The game does not open a door by hand on `allowed` alone. `try_to_activate_door` (what a click or a bump reaches) needs `requiresID()` as well:

    	// note: if the ID wire is cut no ID cards are checked at all! (This is intentional!)
    	if(access_bypass || (requiresID() && user_can_activate_door(user)))

and an airlock's `requiresID()` is FALSE when its ID-scan wire is cut or the AI has switched its scanner off:

    /obj/machinery/door/airlock/requiresID()
    	return !(wires.is_cut(WIRE_IDSCAN) || aiDisabledIdScanner)

So such a door is shut to everyone, whatever their ID. Players use this: the AI's airlock window has an "ID scanner" switch, and a traitor cuts the ID wire to keep a room shut without bolting it.

Where our code goes wrong on such a door:

1. `tool_force_door` and `force_door_open` answer success, "The X door of Y opens to your ID. There is no need to force it.", with `already_open = TRUE`. `forcing.ts` passes on that the door is open. Nobody can get in.
2. `locked_out_of` says the room is not locked to the body, so a janitor goes for a mess in there (`place_locked_to_body`) and walks at a door that will not open, and a body standing in there is not out of bounds.
3. `hold_door_for` calls `door.open()` itself after checking `allowed`, which opens a door that no player could open by hand. (KNB-04 and GAP-03 already replace that `open()` with a click; with the click the door would refuse, and this finding's helper gives the reason.)
4. `door_keepers` lists, as people to send word to, those whose cards pass `check_access`, though they cannot open it either.

One concrete case. Someone wanted by security shuts themselves in Tech Storage and cuts the door's ID-scan wire. The officer's ID does not open it, nobody it asks does, and the Head of Security asks the Chief Engineer. The engineer sent has tech-storage access, so `allowed` passes and the door has power and no bolts: `tool_force_door` answers "The X door of Tech Storage opens to your ID. There is no need to force it.", the engineer never goes near it, and security is told "engineering has opened the Tech Storage". The officer walks at a door that opens for nobody.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:154`, in `tool_force_door`:

    		if(!standing_open && !(door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
    			continue

`code/modules/llm_crew/crew_npc_forcing.dm:443`, in `force_door_open`, the same test.

`code/modules/llm_crew/crew_npc_guarding.dm:132`, in `locked_out_of`:

    	for(var/obj/machinery/door/airlock/door as anything in doors)
    		if(door.allowed(body))
    			return FALSE

`code/modules/llm_crew/crew_npc_doors.dm:585`, in `hold_door_for`:

    	if(door.locked || door.welded || !door.hasPower() || !door.allowed(body))

`code/modules/llm_crew/crew_npc_doors.dm:158`, in `door_keepers`:

    		if(!card || !door.check_access(card))
    			continue

The base procs: `code/game/machinery/doors/door.dm:334` (`try_to_activate_door`) and `code/game/machinery/doors/airlock.dm:353` (`requiresID`).

## How it was found

Read from the code, following what a click on an airlock reaches. Not seen in a round. How often doors have their scanner off in the owner's rounds is not known; it needs the AI or a player with the wires.

## How to fix it

1. Add `/proc/crew_npc_door_opens_for(obj/machinery/door/airlock/door, mob/living/who)` in `crew_npc_doors.dm`: TRUE if `door.requiresID() && door.allowed(who) && door.hasPower() && !door.locked && !door.welded && !(door.obj_flags & EMAGGED)`. Those are the tests `try_to_activate_door` and `open()` make, so it is what a player would find by trying it. Whether the scanner is off is not something the body can see before it tries; this only stops the code from saying a door opens when trying it would show it does not, and it should be used only where the body tries the door or is told how it went.
2. Use it in the two "opens to your ID" tests in `crew_npc_forcing.dm`.
3. In `hold_door_for`, use it in place of the four separate tests (and give the reasons separately, see DOOR-14).
4. Leave `locked_out_of` and `door_keepers` on `allowed`/`check_access` unless the owner wants otherwise: those are about who has a right to be in a room, not whether a door works at this moment, and the body has not tried the door. Question for the owner: should a door that a body has tried and found dead (scanner off, no power) count as locked to it for a while? The `locked_place_cache` is where that would go.

## How to test the fix

- Compile.
- In a round: as the AI, switch off the ID scanner of a door, have security ask for it to be opened, and check `game.log` shows the engineer forcing it (or failing for a real reason), not "did not: it opens to its ID".
