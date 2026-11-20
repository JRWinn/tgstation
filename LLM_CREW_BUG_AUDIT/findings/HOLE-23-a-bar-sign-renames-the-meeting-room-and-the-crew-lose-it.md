---
id: HOLE-23
title: Rooms are known by a name taken once at round start, so when a player sets the bar sign the Bar Lounge is renamed, the Head of Personnel's meetings there never gather, and the new name is no room at all
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_places.dm:14, code/game/machinery/barsigns.dm:41, code/__HELPERS/areas.dm:314, code/modules/llm_crew/crew_npc_cargo.dm:77, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:442, code/modules/llm_crew/crew_brain_link.dm:70
fix: Key every room by its area (a stable id sent with the name) instead of by its display name, and when rename_area runs tell every crew controller and the window the room's new name
---

## What is wrong

The crew know every room by its display name, and the list of names is made once. Rooms are renamed during a round by ordinary play, and nothing in our code notices.

The commonest rename: **setting the bar sign renames the room the sign is in** (`barsigns.dm:41`, `rename_area(bar_area, sign.name)`). A bartender choosing a sign at the start of a shift is routine. On MetaStation, Tramstation, NebulaStation and CatwalkStation the sign is in `/area/station/commons/lounge`, the "Bar Lounge" (checked in each `.dmm`: the barsign tile's area). On IceBox and KiloStation it is in `/area/station/service/bar/atrium`. Those are the first and second rooms the Head of Personnel picks for its staff meetings (`crew_npc_cargo.dm:77`). The other renames are the blueprints (`blueprints.dm:221`, the Chief Engineer's office holds a set) and an emagged sign ("Syndi Cat").

What happens when the Bar Lounge becomes "The Drunk Carp":

1. `crew_npc_station_places()` was worked out once, at spawn, and keeps "Bar Lounge" as the key for that area (`crew_npc_places.dm:14`). "The Drunk Carp" is not in it. The window's list of rooms is `ui_static_data`, sent once when the window opens (`crew_brain_link.dm:70`), so it does not have the new name either.
2. The Head of Personnel's `meeting_place` is the text "Bar Lounge", set at spawn.
3. When it calls a meeting, staff are sent to the "Bar Lounge". The server still finds the area by the old key and walks them there. But every body standing in it now reads its location as "The Drunk Carp" (`get_area_name`), so in the window `brain.location === room` is false for everyone (`meetings.ts:442`, `:484`, `:509`, `head.ts:545`). Nobody is counted as there, the head waits its seven minutes with its staff standing round it, and reports "0 of 3 there" (the shape of HEAD-06). Every later meeting goes the same way.
4. Anyone who says "there is blood in the Drunk Carp" names no room (`find_known_place` and the window's readers look only in the old list), and a janitor told to clean the "Bar Lounge" walks into a room that never reads as the Bar Lounge, so the task never sees it has arrived.
5. The airlocks are renamed too (`set_area_machinery_title`, `areas.dm:334`, includes `/obj/machinery/door`), so door labels kept by name go stale.

Concrete case: MetaStation, a player bartender sets the sign to "The Drunk Carp" ten minutes in. The Head of Personnel's next staff meeting is called "in the Bar Lounge" by PDA. The three janitors walk to the middle of the lounge and stand there. In each brain the location is "The Drunk Carp", so none is "inside"; the head stands with them for seven minutes and closes the meeting with nobody's report, and does it again every meeting for the rest of the round.

## Where

`code/game/machinery/barsigns.dm:36`:

    /obj/machinery/barsign/proc/set_sign(datum/barsign/sign)
    	...
    	var/area/bar_area = get_area(src)
    	if(change_area_name && sign.rename_area)
    		rename_area(bar_area, sign.name)

`code/modules/llm_crew/crew_npc_places.dm:14`:

    /proc/crew_npc_station_places()
    	if(length(GLOB.crew_npc_station_places))
    		return GLOB.crew_npc_station_places
    	...
    		var/place_name = format_text(place.name)

`code/modules/llm_crew/crew_npc_cargo.dm:77`, the Head of Personnel's meeting room:

    		for(var/room_type in list(/area/station/commons/lounge, /area/station/service/bar/atrium, /area/station/service/cafeteria, /area/station/service/bar))
    			...
    			meeting_place = learn_place(room_type, well_inside = TRUE)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:442`:

      inside: brain.location === room,

`code/modules/llm_crew/crew_brain_link.dm:70`: the room list goes to the window as static data, once.

## How it was found

Read from the code, and the barsign's area looked up in each map file (`grep -n "^/obj/machinery/barsign"` and the area line of that tile's block). Not seen in a round: no test round has had a bartender. Not checked: whether every barsign map spot is the one whose area the Head of Personnel uses on each map (it is the lounge's own area on four maps and the atrium on two).

## How to fix it

1. Give every station room a stable key that does not change with its name: the area's `REF` or its type path (a station has one area of each type). Keep the display name beside it for words.
2. In `crew_npc_station_places`, key by that id. Send rooms to the window as `{id, name}`, and give each body's location in `ui_data` as both.
3. In the window, compare rooms by id wherever it compares locations (`brain.location === room` and the like), and keep the name only for what is said.
4. Listen for renames: `rename_area` has no signal, so add one in our own code instead of the base proc, by keeping the last name of each room in `crew_npc_station_places` and checking it each time a body looks round. When a room's name has changed, update the name, emit a knowledge event to each body that knows the room ("The Bar Lounge is now called The Drunk Carp"), and push the new room list to the window (send it in `ui_data`, not `ui_static_data`).
5. A cheaper half-fix if the owner wants it now: in `get_area_name` uses inside crew code, read the area's `initial(name)` for comparisons, and keep the live name for words. This keeps meetings working, but a player's "the Drunk Carp" is still no room.

## How to test the fix

- Simulator: rename the meeting room in the stand-in server mid-scenario and check the meeting still counts its staff in.
- In a round on MetaStation: set the bar sign from the Captain's body (or by VV call `set_sign_by_name`), have the Head of Personnel call a meeting, and read `crew_brain.log` for the meeting's count of who is there.
