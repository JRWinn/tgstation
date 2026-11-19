---
id: DOOR-12
title: A door is reported forced open, or standing open, while a shut fire door on the same square still bars the way
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_forcing.dm:155, code/modules/llm_crew/crew_npc_forcing.dm:443, code/modules/llm_crew/crew_npc_forcing.dm:507, code/modules/llm_crew/crew_npc_doors.dm:593
fix: Before answering that a door is open, look for a shut fire door on the airlock's square and answer it as fire doors, with the fire_doors detail fire_door_report gives
---

## What is wrong

The door code looks only at the airlock. On the maps a fire door very often stands on the same square as an airlock: in MetaStation.dmm, 219 of the 485 map keys that hold an airlock hold a fire door as well. When the fire alarm of either room is on, that fire door is shut (`density` TRUE) under an airlock that may be shut or open.

`tool_force_door` and `force_door_open` judge "open" by the airlock's `density` alone, so in three places they tell the brain the way is open when it is not:

1. In `tool_force_door`, an airlock that is standing open is "standing open already", with `already_open = TRUE`, though the fire door under it is shut.
2. In `force_door_open`, the same test when the body gets there.
3. In `force_door_open`, after the crowbar: the airlock has slid open, so the answer is "You open the panel of the X door of Y, take its power away and pry it open. It stands open." The fire door under it is still down.

`hold_door_for` (cargo letting someone in or out) has the same blind spot: it opens the airlock, tells the person "opens the door ... and holds it for you", and starts the watch, while the fire door is shut on the square.

One concrete case. The fire alarm in the Cargo Bay is pulled by the bar's monkey or goes off for bad air. Every fire door of the Cargo Bay shuts, including the one under the Cargo Bay's airlock from the lobby. Security has a warrant on someone inside, and the Chief Engineer hands the door to an engineer. The engineer walks to the airlock, opens its panel, pulses a main and a backup power wire, and pries it. The airlock slides open. `door.density` is now FALSE, so the result is success, "It stands open", details `place` and `door` and nothing about fire doors. `forcing.ts` passes word to security that the door is open. The officer walks to it and is stopped by the fire door: its walk fails with "there is no way through" and a fire-door report, which is a different path in the brain from "the engineer opened it". The engineer is back at its own work, the airlock is left standing open with no power for a minute and then open for good (it does not shut itself, see the comment on `force_door_open`), and nobody has been let in.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:154`, in `tool_force_door`:

    	for(var/obj/machinery/door/airlock/door as anything in (named ? list(named) : doors))
    		var/standing_open = !door.density
    		if(!standing_open && !(door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
    			continue

`code/modules/llm_crew/crew_npc_forcing.dm:443`, in `force_door_open`:

    	if(!door.density || (door.allowed(body) && door.hasPower() && !door.locked && !door.welded))

`code/modules/llm_crew/crew_npc_forcing.dm:507`, in `force_door_open`, after the pry, where only the airlock is looked at before the success words:

    	if(door.density)
    		...
    	// A way is open that was not, so a room it gave up on getting into may be worth another try.
    	ways_reopened()

`code/modules/llm_crew/crew_npc_doors.dm:593`, in `hold_door_for`:

    	if(door.density && !door.open())

The base fire door shows why it cannot be left open by a crowbar while its alarm is on: `try_to_crowbar` in `code/game/machinery/doors/firedoor.dm:545` only holds it open while the one holding the crowbar stays beside it and on its feet (`handle_held_open_adjacency`, then `correct_state()`), and the right-click way (`try_to_crowbar_secondary`) shuts it again after two seconds when the alarm is active.

No code in `code/modules/llm_crew/crew_npc_forcing.dm` mentions a fire door at all.

## How it was found

Read from the code, and the count of map keys with both an airlock and a fire door was made with awk over `_maps/map_files/MetaStation/MetaStation.dmm` (it counts kinds of square in the map's key list, not squares, so it says only that this is common). Not seen in a round.

## How to fix it

1. Add a small helper in `crew_npc_doors.dm`, beside `fire_door_report`: `/proc/crew_npc_fire_door_on(obj/machinery/door/airlock/door)`, returning the shut fire door on the airlock's square (`for(var/obj/machinery/door/firedoor/fire in get_turf(door)) if(fire.density) return fire`), or null.
2. In `tool_force_door`, in the "standing open or opens to its ID" loop, skip a door that has a shut fire door on it, so it is not answered as open.
3. In `force_door_open`, at the first test and again after the pry (before `ways_reopened()`), if `crew_npc_fire_door_on(door)` is not null, return `forcing_failure("fire_doors", "The [door_words] is open, but the fire door under it is shut.", ...)` with `more_details = list("fire_doors" = <the alarmed room's name>)`. Work the room out as `fire_door_report` does (the fire door's `affecting_areas`, the one whose alarm is on). The airlock may then be left open, as it is now; that is no worse than a player who pried it.
4. In `hold_door_for`, return `list(FALSE, "The fire door at the door is shut.")` before opening anything when there is one.
5. In `forcing.ts`, treat reason `fire_doors` like a walk stopped by fire doors: add it to `final` in `forcingAfterActing` (a second go finds the same fire door), give `whyNot` a case for it ("the fire doors are shut in X"), and leave the rest to the fire-alarm path (see GAP-05 and `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, the owner's direction of 2026-11-18, for what the owner wants there).
6. Better order in `force_door_open`: make the fire-door test before the screwdriver, not only after the pry, when the airlock is shut and the fire door under it is shut too. Then no airlock is left without power and standing open for a fire door that stops everyone anyway. Whether the engineer should pry the airlock regardless, so the way is ready once the alarm is reset, is the owner's call; ask with the question below.

Question for the owner: should an engineer instead hold the fire door open with its crowbar while the other person walks through (a player can do that, standing beside it)? That needs the engineer to wait at the door for them, which the forcing errand does not do today.

Keep `fire_door_report`'s own use as it is. Do not use `crew_npc_alarm_was_pulled` in the new words: KNA-15 says the server must not tell the body whether an alarm was pulled.

## How to test the fix

- Simulator: add a force-door case in `tools/llm_crew/` where the server answers `reason: "fire_doors"`, and check that security is told the fire doors are shut, not that the door is open.
- In a round: pull the fire alarm in a room with a fire door under its airlock, send an engineer to force it, and look in `game.log` for `could not force ... (fire_doors)` and no `forced open` line for that door.

## Check

Checked by Opus 5.5, read from the code and the map; not seen in a round.

- The quotes are what the code says today: the `standing_open` loop in `tool_force_door` (`crew_npc_forcing.dm:154`), the first test in `force_door_open` (`:443`), the `if(door.density)` block before `ways_reopened()` (`:507`), and `if(door.density && !door.open())` in `hold_door_for` (`crew_npc_doors.dm:593`). `grep firedoor` finds nothing in `crew_npc_forcing.dm`.
- The base game bears it out: `try_to_crowbar` and `handle_held_open_adjacency` in `firedoor.dm` (545, 578) hold a fire door open only while the one with the crowbar stands next to it, and the right-click way shuts it again after two seconds while it is active. A shut fire door is dense, so the officer's walk is stopped by it and the server answers with `fire_door_report`, a different path in the brain from "forced".
- `forcingAfterActing` in `forcing.ts` (about line 361) sends `forceDoneLine` on any `ok`, and has no case for fire doors.
- Counted again with awk over `MetaStation.dmm`: 485 map keys hold an airlock, 219 of them a fire door as well. The Cargo Bay airlock at (78,146) (key `dHi`) is one of them, so the write-up's case is on the map as told.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers forcing a door with a fire door under it. The security plan's fire-door section is about bodies stopped by fire doors, not this.
- Effort raised to medium: the fix is a helper and three tests in two server files plus `forcing.ts`. Added steps 5 (`final` and `whyNot`) and 6 (test before the work begins). Severity kept at medium: it needs a fire alarm on in the room being forced, which is not most rounds, but when it comes security is told a door is open that is not.
