---
id: CHEAT-11
title: A body knows the air pressure on tiles it cannot see, behind shut doors and in rooms it has never entered, and steers by it
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_motor.dm:43, code/modules/llm_crew/crew_npc_tools.dm:370, code/modules/llm_crew/crew_npc_doors.dm:323, code/modules/llm_crew/crew_npc_quartermaster.dm:200, code/modules/llm_crew/crew_npc_forcing.dm:200
fix: Test the air only on tiles the body stands on or can see, and judge unseen rooms by what shows from outside - shut fire doors, a door's pressure warning, an alarm in view
---

## What is wrong

`crew_npc_safe_turf(turf)` reads the gas on any tile (`destination.return_air()`, pressure between the warning limits). That is a fair test for the tile the body is about to step onto: a player feels the cold and sees the pressure warning on their HUD. But it is used, more often, on tiles far away and out of sight, to choose where to go:

- **Exploring.** `pick_somewhere_new` asks `safe_spot_in(room)` for a spot in each room the body has never been in. `safe_spot_in` samples up to 40 of the room's tiles and keeps only safe ones. A room that has been vented has none, so no spot, no route is tried, and the room is written into `unreachable_places` for good: the body has learned, from across the station, that the room is a vacuum.
- **Going to a door.** `tool_go_to_door` skips any door whose far side has bad air when leaving: "Nobody waits at a door where the air is bad, on this side of it or the other." The far side is behind a shut door.
- **Forcing a door.** `tool_force_door` skips a door whose working side has bad air, for every door of the room, from wherever the engineer is when told.
- **The order book's paper.** `nearest_paper_bin` skips every bin on the level that stands in bad air.
- **Meeting spots, posts, crate spots, the spot outside a post** (`middle_of`, `find_post_turf`, `room_middle`, `storage_spot`, `spot_outside_post`, `learn_place`) all filter on it for tiles that may be rooms away.

Concrete case: a meteor holes the Library and it vents. A janitor that has never been there is choosing somewhere to explore. Every tile of the Library fails `crew_npc_safe_turf`, `safe_spot_in` returns null, and the Library is marked unreachable without the janitor going near it. A player would walk up, see the fire doors down and the red lights, or walk in and be hurt. The same janitor, told to leave a room whose only other door opens onto the vented Library, picks the other door without having seen why.

## Where

`code/modules/llm_crew/crew_npc_motor.dm:43`:

    /proc/crew_npc_safe_turf(turf/destination)
    ...
    	var/datum/gas_mixture/air = destination.return_air()
    ...
    	return pressure >= WARNING_LOW_PRESSURE && pressure <= WARNING_HIGH_PRESSURE

`code/modules/llm_crew/crew_npc_tools.dm:376`, `safe_spot_in`, used by `pick_somewhere_new`:

    	for(var/sample in 1 to min(length(place_turfs), 40))
    		var/turf/candidate = pick(place_turfs)
    		if(!crew_npc_safe_turf(candidate) || candidate.is_blocked_turf())
    			continue

`code/modules/llm_crew/crew_npc_doors.dm:322`, in `tool_go_to_door`:

    		// Nobody waits at a door where the air is bad, on this side of it or the other.
    		if(!crew_npc_safe_turf(spot) || (leaving && !crew_npc_safe_turf(sides[2])))
    			continue

`code/modules/llm_crew/crew_npc_quartermaster.dm:200`, in `nearest_paper_bin`:

    		if(!istype(room, /area/station) || locked_out_of(room) || !crew_npc_safe_turf(get_turf(bin)))

## How it was found

Read from the code. Not seen in a round log: a vented room is not common in test rounds.

## How to fix it

1. Split the test in two:
   - `crew_npc_safe_turf(turf)` stays for a tile next to the body or in view (the step itself, the wander step in `try_random_step`, the tile it stands on in `tool_reset_alarm`, the steps in `close_with`). Rename nothing; just stop calling it on far tiles.
   - `crew_npc_looks_unsafe(turf, body)`: TRUE only for what can be seen. The tile is in `view()` and its air is bad; or a shut fire door stands on the way into that room and the body can see it (`/obj/machinery/door/firedoor` with `density` in view, which is what the fire-door report already looks for); or the body remembers bad air in that room from having been there.
2. Keep a per-body memory, `bad_air_seen[room name] = world.time`, written in `look_around` when a tile in view has bad air, and dropped after a few minutes or when the room is seen with good air.
3. For far tiles (`safe_spot_in`, `middle_of`, `room_middle`, `storage_spot`, `learn_place`, `nearest_paper_bin`, the far side in `tool_go_to_door` and `tool_force_door`), use `crew_npc_looks_unsafe` against the memory instead of reading the gas. Keep the parts of `crew_npc_safe_turf` that are not air (open turf, not space, no external airlock): those are the map, which a body may know. A spot in an unseen room is picked as if its air were fine.
3a. (Checker: this step is missing from the first write-up, and without it the fix walks bodies into vacuum.) There is no air test on a walk today. The only per-step test is in the wander step, `try_random_step` (`crew_npc_motor.dm:28`); a planned walk (`crew_npc_walk` in `crew_npc_motor.dm`, moved by `navmap_astar`) never looks at the air, and base pathfinding does not either (nothing under `code/datums/pathfinding/` reads pressure). So add one to `crew_npc_walk/perform`: if the next tile on the path, or the tile the body is about to step onto, fails `crew_npc_safe_turf`, stop and fail with the reason "the air in there is bad" (a new reason, carried to `walk_finished`), and write that room into the memory of step 2. That tile is next to the body, so it is fair to test. Only then take the far tests out.
4. `unreachable_places` should not be written for bad air: a room that was vented is repaired.

Question for the owner: the far-air test keeps bodies from walking into a breach, which a careless player does. Is the body allowed to be that careless, with the step test as its only guard, or should a room it cannot see into be treated as unsafe until it has looked?

## How to test the fix

- Server compile.
- A round: vent a room with an admin tool (or open its airlock to space) while a janitor is exploring. The janitor should walk to its door, stop with "the air in there is bad", and not be told the room is unreachable for good.
- `game.log` "walk failed ... the air in there is bad" for that room only.

## Check

Checked by Opus 5.5. Confirmed, with the fix corrected.

- Read `crew_npc_safe_turf` (`crew_npc_motor.dm:43`): it reads `return_air()` on whatever turf it is given, with no test of sight or distance. `grep crew_npc_safe_turf` lists 25 call sites; the far ones named in the finding are as it says: `safe_spot_in` (`crew_npc_tools.dm:378`) feeding `pick_somewhere_new`, which writes `unreachable_places` for good when no spot comes back (line 338, "No way in with this body's access"); the far side in `tool_go_to_door` (`crew_npc_doors.dm:323`); the near side in `tool_force_door` (`crew_npc_forcing.dm:200`), tested for every door of the room from wherever the engineer stands; every paper bin on the level in `nearest_paper_bin` (`crew_npc_quartermaster.dm:200`). The concrete case (a vented Library written off unseen) follows step by step.
- The owner has ruled on the same kind of thing: `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, "the engineer does not know whether an alarm is real ... thats cheating", and "the door shutting itself is the answer", where a room is flagged unsafe once it is seen to be. That is the fix's memory of seen bad air, and it goes most of the way to answering the finding's question for the owner: judge an unseen room by what shows, not by the gas.
- The fix as first written was wrong in one step: it said "the step test stops the body at the door", but a planned walk has no air test at all (`crew_npc_walk/perform` checks time, grip, arrival and `movement_failed`; only `try_random_step` tests the air). Taking the far tests out alone would walk a body into a vented room. Step 3a added.
- Not in the change log as known. Severity medium: rare in test rounds (a vented room), but when it happens the room is lost for the round and the knowledge is not a player's. Effort medium: one new proc, a per-body memory, a walk-step test, and a dozen call sites, all on the server.
- Not run: nothing here needed a script.
