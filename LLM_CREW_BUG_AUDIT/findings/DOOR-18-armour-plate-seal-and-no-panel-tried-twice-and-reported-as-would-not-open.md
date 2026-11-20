---
id: DOOR-18
title: A door with armour plating, a seal or no panel is gone at twice, and security and the Captain are told only that it would not open
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_forcing.dm:450, code/modules/llm_crew/crew_npc_forcing.dm:459, code/modules/llm_crew/crew_npc_forcing.dm:467, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:378, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:97
fix: Give the lasting causes their own reasons (plated, sealed, no_panel), add them to the final list in forcing.ts and give whyNot words for each
---

## What is wrong

`force_door_open` knows, and says to the body, three causes that will be the same on a second try:

- the door has a seal across it: reason `pry`, "has a seal across it. It will not pry until the seal is taken off";
- the door has no maintenance panel: reason `panel`, "has no panel to open";
- the door's wires are under armour plating (`door.is_secure()`): reason `wire`, "its wires are behind a plate of armour".

They share their reason codes with causes that can pass (a screwdriver click that did nothing, a pulse that did not take, power that came back before the pry). `forcing.ts` takes only `bolted`, `welded`, `no_tools`, `no_knowledge` and `no_door` as final, so each of these is tried a second time: the engineer walks back, and for the plated door opens the panel with the screwdriver and shuts it again. Then `whyNot` has no words for `pry`, `panel` or `wire` and gives "it would not open", which the Chief Engineer passes to security and the Head of Security to the Captain. The body's own words ("behind a plate of armour", "a seal across it") never reach anyone.

One concrete case. Someone with a warrant is behind a door that has been reinforced with iron or plasteel sheets (anyone with the sheets and the panel open can do it, `try_reinforce` in `airlock.dm`; no airlock type was found that starts plated). The engineer opens the panel, sees the plating, shuts the panel, and reports reason `wire`. `forcing.ts` counts one try and sends it again. Same again. The Captain gets "engineering could not open the X: it would not open", and has no idea that cutting through the plating (wirecutters, a welder, a crowbar) is what is needed.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:450`, in `force_door_open`:

    	if(door.seal)
    		return forcing_failure("pry", "The [door_words] has a seal across it. It will not pry until the seal is taken off.", door, room_name, label)

`code/modules/llm_crew/crew_npc_forcing.dm:458`:

    			if(!door.has_access_panel)
    				return forcing_failure("panel", "The [door_words] has no panel to open.", door, room_name, label)

`code/modules/llm_crew/crew_npc_forcing.dm:467`:

    		var/why_no_wires = door.is_secure() ? "its wires are behind a plate of armour" : take_door_power(door)
    		...
    			return forcing_failure("wire", "You could not take the power away from the [door_words]: [why_no_wires].", door, room_name, label, "Its panel is [door.panel_open ? "open" : "shut"]")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:378`:

    	const final = ['bolted', 'welded', 'no_tools', 'no_knowledge', 'no_door'];

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:97`, `whyNot`, which has no case for these and ends `default: return 'it would not open';`.

## How it was found

Read from the code on both sides of the line. Not seen in a round.

## How to fix it

1. In `force_door_open`, give the three lasting causes their own reasons: `sealed` for the seal (both places it is tested, lines 450 and 515), `no_panel` for `!door.has_access_panel`, and `plated` when `door.is_secure()` (both the wires test at 467 and the crowbar test at 481). Keep `pry`, `panel` and `wire` for the causes that can pass.
2. In `forcing.ts`, add `sealed`, `no_panel` and `plated` to `final`.
3. In `whyNot`, add: `sealed` "it has a seal across it", `no_panel` "it has no panel to get at its wires", `plated` "its wires are behind armour plating".
4. Check `KNA-12` (the voice not told how a job ended) at the same time, since both touch the end of a forcing job in `forcing.ts`.

## How to test the fix

- Type check and compile.
- Simulator: add cases to the forcing table in `tools/llm_crew/` where the server answers each new reason, and check there is one try, and the Captain's PDA line carries the new words.
- In a round: reinforce a door with plasteel, ask for it to be forced, and check `game.log` has one `could not force ... (plated)` line.
