---
id: DOOR-08
title: Of two doors of a room that go by one name, the first found is opened, not the one the person is standing at
kind: bug
severity: low
effort: small
confidence: likely
status: found
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:420, code/modules/llm_crew/crew_npc_doors.dm:268
fix: Among the doors that match the name given, take the one the person stands at, or failing that the nearest to them
---

## What is wrong

A door is told from a room's other doors by a label (`crew_npc_door_label`): the name on the door, or, when that is only the room's own name, the name of the room it opens from. Nothing makes a label unique. Two doors of one room that both carry the room's name and both open from the same hallway or lobby get the same label. So do two doors with the same name on them.

`room_door_for` looks for the named door first, before it looks at where the person is standing, and returns the first door in the list that matches and that the body can open. The list is in the order `crew_npc_doors_of` walks the room's tiles. So with two doors of one label, the one opened is whichever the tile walk meets first.

One concrete case. A room has two doors named for the room, both onto the Central Primary Hallway, twelve tiles apart. A janitor called to a mess there stands at the far one and knocks. The knock carries `knock_door = "Central Primary Hallway"`. The technician inside calls `open_door` with that label. `room_door_for` returns the near one. Then in `tool_open_door`, `at_the_door` is worked out against that door: the janitor is not within two tiles of it, and if the technician cannot see the janitor either (a door hides them) the answer is "You cannot see that person, and they are not at the door of X". If it can see them, it walks to the wrong door and holds it open while the janitor waits at the other.

Side-by-side double doors with one name are not harmed: either of the pair will do.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:420`, in `room_door_for`:

    	if(istext(door_label) && length(trim(door_label)))
    		var/wanted_label = LOWER_TEXT(trim(door_label))
    		for(var/obj/machinery/door/airlock/door as anything in doors)
    			var/list/sides = doors[door]
    			...
    			if((LOWER_TEXT(crew_npc_door_label(door, room, sides[2])) == wanted_label || LOWER_TEXT(format_text(door.name)) == wanted_label) && door.allowed(pawn))
    				return door

`code/modules/llm_crew/crew_npc_doors.dm:268`, `crew_npc_door_label`:

    	var/own_name = format_text(door.name)
    	if(LOWER_TEXT(own_name) != LOWER_TEXT(format_text(room.name)))
    		return own_name
    	return outside ? get_area_name(outside, TRUE) : own_name

The same first-match rule is in `tool_force_door` (`crew_npc_forcing.dm:145`), but there the nearest matching door to the body is kept (`scores[door] < scores[named]`), which is the right shape.

## How it was found

Read from the code, not seen in a round. No map was searched for a room with two far-apart doors of one label, so how often this bites on MetaStation is not known.

## How to fix it

1. In the label branch of `room_door_for`, do not return at the first match. Collect every door that matches and that the body can open.
2. If the person is a crew NPC whose `wanted_door` is among the matches and they are still within `CREW_NPC_AT_DOOR` of it, return that one.
3. Otherwise return the match nearest the person (`get_dist(door, person)`).
4. With no match, fall through to the rest of the proc as now.
5. Optional, and better in the long run: make labels unique when they are built. In `crew_npc_door_label`, if another door of the room has the same label, add which side of the room it is on ("north", "east") from `get_dir` of the room's middle to the door. That changes what is said aloud and what `doorNamed` in `jobs/janitor.ts` reads back, so the window's cases for door names would need looking at.

## How to test the fix

- Server compile.
- In a round, find or build a room with two same-named doors off one hallway, call a janitor to a mess in it, and see that the door it knocks at is the one that opens. In `game.log`, the `opened <door> to let` line names the door: check its coordinates against where the janitor stood.
