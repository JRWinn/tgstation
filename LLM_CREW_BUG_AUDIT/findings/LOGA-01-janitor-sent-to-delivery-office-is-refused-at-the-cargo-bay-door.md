---
id: LOGA-01
title: A janitor sent for to the Delivery Office who asks at the Cargo Bay door is told nobody sent for it, because the office also has a door into the security post
kind: bug
severity: high
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: logs
files: code/modules/llm_crew/crew_npc_cargo.dm:148, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1172, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1297
fix: Leave out of the outer-room test any door that opens from a room the crew at large cannot walk into, so the Delivery Office is known to be reached through the Cargo Bay
---

## What is wrong

A cargo technician sends a janitor to a mess in the Delivery Office. The janitor cannot get to either door of the office (one opens from the Cargo Bay, the other from the cargo security post), so it is told "it opens from Cargo Bay, which is locked to you as well", walks to the Cargo Bay door and sends "I am at the Quartermaster Maintenance door of the Cargo Bay about the mess in the Delivery Office. Could you let me in, please?". The technician that sent for it answers "Sorry, Marina, nobody here sent for you to the Cargo Bay, so I cannot let you in." The mess is never cleaned by that janitor.

It should be let into the Cargo Bay on its way to the office, as the code means to do for "a locked room inside a locked room" (`boundBeyond`).

Why: the window learns which rooms lie inside another from `rooms_through`, which the server works out once at spawn in `learn_department`. A room goes into that list only if **every** door of it opens from a locked room **of the department**. The Delivery Office on MetaStation has a second door, "Security Post - Cargo", whose far side is `Security Post - Cargo Bay`. That area is `/area/station/security/checkpoint/supply`, of the security department, so it is not in cargo's `closed_rooms`, `beyond - closed_rooms` is not empty, and the office is skipped. With no entry for the Delivery Office, `boundBeyond(brain, name, "Cargo Bay")` finds nothing, `sentFor` is false (the call was for the Delivery Office, not the Cargo Bay), and `mayPass` returns null.

It works only by luck when the same janitor has also been called to the Cargo Bay itself: then `sentFor` for the Cargo Bay is true. That is what happened in the 19:33 round, where Penelope and Reuben had both been sent a Cargo Bay call as well and were let in. Marina, in the 20:00 round, had been called to the Delivery Office alone.

Concrete case, `data/logs/2026/11/19/round-20.00.21`:

1. 02:09:16, `pda.log`: Jaden Prechtl to Marina Shaffer, "There is a mess in the Delivery Office: wrapping shreds. Collin could not shift it with what they had. Could you come and try, please? Come to its door and knock, and I will let you in." That is the only call Marina had from cargo.
2. 02:09:17, `game.log`: "Crew NPC (Marina Shaffer) ... found no way to Security Post - Cargo at Security Post - Cargo Bay (82,141,2), a door into Delivery Office, and looks for another." The other door, Deliveries, opens from the Cargo Bay.
3. 02:09:33, `pda.log`: Marina to Jaden, "I am at the Quartermaster Maintenance door of the Cargo Bay about the mess in the Delivery Office. Could you let me in, please?"
4. 02:09:33, the same second, `crew_brain.log` for Jaden: "Marina Shaffer has asked by PDA to be let in to the Cargo Bay. Nobody who works here sent for them, so you are sending back that you cannot." and `pda.log`: "Sorry, Marina, nobody here sent for you to the Cargo Bay, so I cannot let you in."
5. Marina went off to other work. The wrapping shreds in the Delivery Office were not cleaned by her.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:141`, in `learn_department`:

    	for(var/place_name in closed_rooms)
    		var/area/station/place = place_name == post_place ? post_area : places[place_name]
    		var/list/doors = crew_npc_doors_of(place, body.z)
    		var/list/beyond = list()
    		for(var/obj/machinery/door/airlock/door as anything in doors)
    			var/list/sides = doors[door]
    			beyond |= get_area_name(sides[2], TRUE)
    		if(!length(beyond) || length(beyond - closed_rooms))
    			continue
    		reached_through[place_name] = (post_place in beyond) ? post_place : beyond[1]

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1172`, in `boundBeyond`, which reads only that list:

      return Object.keys(brain.roomsThrough).find((inner) => {
        if (!brain.areaMesses[inner] || !expectedCall(post, name, brain.now, inner)) {
          return false;
        }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1297`, in `mayPass`:

      const beyond = boundBeyond(brain, name, wanted);
      if (!brain.areaMesses[wanted] && !beyond) {
        return null;
      }
      const sentFor =
        !!brain.areaMesses[wanted] && !!expectedCall(post, name, brain.now, wanted);

The janitor's side, `tool_go_to_door` in `crew_npc_doors.dm` (about line 388), tries each door of the Delivery Office and, finding no way to any, names the room the first locked one opens from: the Cargo Bay. So the two sides disagree about whether the office lies inside the bay.

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-20.00.21`, `pda.log` 02:09:16 and 02:09:33, `game.log` 02:09:17, `crew_brain.log` 02:09:33 (Jaden Prechtl). Compared with `round-19.33.50`, `pda.log` 01:41:15 to 01:41:37, where Penelope had been sent both a Cargo Bay and a Delivery Office call and was let in. The area type of the security post was read from the door line in `game.log` and `code/game/area/areas/station/security.dm`; the map file itself was not opened. Whether `locked_out_of` counts the security post as locked to a janitor was not settled: the janitor's answer comes out as "opens from Cargo Bay" either way, because the security post door has no route to it.

## How to fix it

1. In `learn_department` (`crew_npc_cargo.dm`), when building `beyond` for a room, leave out a door whose far side is a room the crew at large cannot walk into and which is not one of the department's own rooms. Test that with `crew_npc_room_is_closed(get_area(sides[2]), body.z)`: a room closed to everyone is no way in for a janitor either. Keep the rest as it is: if every door left opens from one of `closed_rooms`, record the room, with the post first.
2. If no door is left after that (every door opens from a locked room of another department), do not record it: nothing changes from today.
3. Second, cheaper safety net in the window, if the owner prefers not to touch the server: in `mayPass`, when `room` is the post and the ask names a further room of the department after "about the mess in the" (the janitor's own words, built in `jobs/desk.ts`), accept a standing `expectedCall` for that further room as the permission, the same as `beyond`. I would do step 1, because the window then needs no reading of words.
4. Keep working: a room with a door onto a public hallway must still not be put in `reached_through`, and the Mining Office and Bitrunning Den entries must come out as before.

## How to test the fix

- Server compile to a side copy.
- In a round on MetaStation, print the cargo technician's `reached_through` (View Variables on its controller): the Delivery Office should be there, against the Cargo Bay.
- In a round: let a technician call one janitor to the Delivery Office only. In `pda.log` the janitor's "at the ... door of the Cargo Bay about the mess in the Delivery Office" should be answered "I am coming to the ... door of the Cargo Bay to let you in", never "nobody here sent for you".
- Simulator: none of this is server code it runs, but a scenario where `rooms_through` has `{"Delivery Office": "Cargo Bay"}` and the janitor asks at the Cargo Bay door with only a Delivery Office call should already pass; add it so that it stays passing.
