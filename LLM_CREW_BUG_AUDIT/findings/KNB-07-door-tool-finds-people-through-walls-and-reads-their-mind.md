---
id: KNB-07
title: The door tool finds the person it is opening for through a shut door, by name or by job, and reads which door they want straight from their controller
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:433, code/modules/llm_crew/crew_npc_doors.dm:546, code/modules/llm_crew/crew_npc_doors.dm:561, code/modules/llm_crew/crew_npc_doors.dm:570
fix: Open the door that was named by the knock, the PDA message or the speech, and learn who is there by seeing them once it is open
---

## What is wrong

The rule is "Senses only. A crew member knows what its own body could see, hear or be sent. No hidden channel between them." The door tool breaks it in four places, all on the server, where a technician's body is given facts no technician standing in the bay could have:

1. `room_door_for` reads `their_controller.wanted_door` off the other NPC's controller: the door that body last decided to stand at. That is one NPC reading another's intention.
2. `person_at_room` finds whoever goes by a given name within reach of any door of the room, or anywhere inside the room, with no check that the technician can see them. It is used exactly when the technician has "never set eyes on" them.
3. `shut_in_at_door` finds anyone standing inside at a door who "cannot open that door for themselves", by testing that person's ID against the door.
4. `janitor_at_door` finds a janitor standing outside at any door of the room, by reading the job on their ID, through the shut door.

Listed as known and left:

- 2026-11-18 09:40, "the mail chute again": "The door tool finds a person it cannot see by name, and reads which door another crew body wants straight from that body. Both are knowledge a technician would not have. Not changed."
- 2026-11-18 12:00, under "Not built": "A knock is still answered by name. The plan had the technician go to the door and open it to see who is there. The door tool is built round a named person from end to end (`tool_open_door`, `hold_door_for`) ... Rewriting it blind seemed worse than leaving it."

Since those entries two more of the four were added (3 and 4, in the 15:00 entry), so it has grown, not shrunk. And since the 13:30 entry the honest facts are all there to be used: a knock carries the door's name and which side it came from (`knock_door`, `knock_from_inside` in `tool_knock`), a PDA message names the door ("I am at the Deliveries door of the Cargo Bay ..."), and speech within two tiles of a door carries that door (`near_door` in `on_pre_hear`). The tool still does not trust them alone.

Concrete case: a player Captain (no controller, so case 1 does not apply) stands in the maintenance tunnel and knocks on nothing, saying nothing. A janitor NPC is waiting at the lobby door. A technician asked to open "the door" for the janitor by a message with no door named: `room_door_for` reads the janitor's `wanted_door` and opens the right one. Swap the janitor for a human player waiting at the same door and the tool falls to the scoring loop and may open another door. The crew are served better than a player is, because the code can read their minds.

Second case, the wrong person: two janitors stand at two doors of the Cargo Bay. One knocks at the tunnel door. The brain (`doorSought` in `jobs/cargo.ts`) puts the name of whoever it expects there, or `SOMEONE_INSIDE`, and the knock's door label (`knockAt.door`). The label wins in `room_door_for`, so the tunnel door is the one chosen, not the lobby's (corrected by the checker). But the person is found by name or by `janitor_at_door`, from anywhere at any door of the room: the expected janitor may be the one at the lobby door, or `janitor_at_door` may return the first janitor at *any* door. The tool then either fails ("You cannot see that person, and they are not at the door") and the knocker is left, or, if that janitor is in sight, opens the tunnel door "for" the one in the lobby and `watch_door` watches the wrong body. The door opened is the knocked one; who it is opened for is guessed.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:433`, in `room_door_for`:

    	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
    	if(istype(their_controller) && (isnull(room_name) || their_controller.wanted_door_place == room_name))
    		var/obj/machinery/door/airlock/wanted = their_controller.wanted_door?.resolve()
    		if(!QDELETED(wanted) && doors[wanted] && wanted.allowed(pawn) && get_dist(person, wanted) <= CREW_NPC_AT_DOOR)
    			return wanted

`:546`, `person_at_room`:

    	for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(room, body.z))
    		for(var/mob/living/carbon/human/person in range(CREW_NPC_AT_DOOR, door))
    			if(person != body && LOWER_TEXT(person.name) == wanted)
    				return person
    	for(var/mob/living/carbon/human/person in room)
    		if(person != body && LOWER_TEXT(person.name) == wanted)
    			return person

`:570`, `janitor_at_door`:

    			if(person != body && get_area(person) != room && findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor"))
    				return person

and in `tool_open_door`, the check that would have stopped it is waived for exactly these people:

    	if(!recently_saw(person) && !inside && !at_the_door)

The same file has one more of the kind, in `hold_door_for`: `their_controller.door_opened_for(body, room_name, spot, door)` tells the visitor, and "anyone else who is shut in" the room, that the door is open, whether or not they can see it. That one is close to honest (a door opening in front of you is seen) but it goes to bodies anywhere in the room.

## How it was found

Read from the code. The 09:40 and 12:00 entries say it in a sentence each. Not seen to go wrong in a round, though the 17:06 round's "The Quartermaster answered one knock five times" and the many "opened X to let Y" lines for the wrong door in the 12:23 and 13:32 rounds are what guessing a person behind a door looks like.

## How to fix it

Turn the tool round: it opens a **door**, and finds out **who** by looking.

1. Give `tool_open_door` the door first. The brain already has it in every case: `knock_door` from a knock, `doorNamed(text)` from a PDA message or speech (`jobs/janitor.ts`), `near_door` from speech. `room_door_for(person, room, room_name, door_label)` already takes the label first: make that the only way when there is a label, and drop the `their_controller.wanted_door` branch.
2. With no label and the person in sight (`recently_saw(person)`): the nearest door to them that the body's ID opens, as the scoring loop does now. That is what a technician looking through the counter window would do.
3. With no label and the person not in sight: do not guess. Return "You do not know which door [name] is at." The brain then sends the fixed line the 13:30 entry meant to build and listed as not built ("(9) The call does not name the door to come to"): "Which door are you at?". Or simpler and already half there: every call a technician sends says "Come to the Cargo Lobby", so with nothing else to go by it opens the lobby door.
4. Whether to let them in is decided **after** the door is open and they are seen, for a knock from outside: the body opens the door, looks (`look_around`), and if the one standing there is not someone it sent for, says the "nobody here sent for you" line and lets the door shut. For a knock from inside, anyone is let out, as now, and no name is needed at all.
5. Delete `person_at_room`, `shut_in_at_door` and `janitor_at_door` once nothing calls them.
6. `door_opened_for` goes only to bodies that can see the door (`door in view(CREW_NPC_VISION_RANGE, their body)`).
7. This is best done in the same sitting as KNB-04 (the door opened by a click), since both rewrite `hold_door_for` and `watch_door`, and `watch_door` needs a person to watch: it becomes "whoever is seen at the door when it opens".

What must keep working: a named door wins over everything (the three-door Cargo Bay), someone let in is noted as inside (`expected.ts`), nobody is let into the bay unless sent for.

Question for the owner: when a technician cannot tell which door a caller is at, should it ask ("Which door are you at?"), or open the lobby door, which is where its calls tell people to come?

## How to test the fix

- Server compile to a side copy.
- Simulator: its `open_door` takes a person. It has to take a door as well. Then `nested`, `office`, `vouch`, `crew`, `qm`, and one new scenario: two janitors at two doors of one room, one knocks, and the door opened is the one knocked at.
- A round: every "opened X to let Y into Z" in `game.log` should have X equal to the door Y's last message or knock named.

## Check

Checked by Opus 5.5. Confirmed.

- Read `crew_npc_doors.dm` today: `room_door_for` (the `their_controller.wanted_door` branch at about line 433), `tool_open_door` (492), `person_at_room` (546), `shut_in_at_door` (561), `janitor_at_door` (570) and `hold_door_for` (579). Every quote is what the code says. No guard elsewhere stops it: `tool_open_door` waives `recently_saw` for anyone `inside` or within `CREW_NPC_AT_DOOR` of the door, which are exactly the people these helpers find through walls.
- Read the window side: the only `open_door` step is in `jobs/cargo.ts` `plan()` (the `DOOR` task). It sends `name`, `place`, the handle if it has one, and `door` from `brain.doorAsked` or `brain.knockAt`. Its own comment says "the server finds whoever of that name is at the door", so the brain leans on the hidden lookup on purpose. `doorSought` sends `SOMEONE_INSIDE` for a knock from inside with nobody on record, which only `shut_in_at_door` can turn into a person.
- The second concrete case was wrong in one step: when a knock is answered the label is sent and wins, so the knocked door is opened; it is who the door is opened for that is guessed. Mended above. The first case and the four breaches stand.
- The change log lists it as known and not changed (09:40 entry, line 935; 12:00 entry "A knock is still answered by name", line 799) and the 15:00 entry (line 466) added `shut_in_at_door` and `janitor_at_door`. No later entry removes any of them. It is not an owner choice: the 12:00 entry says the plan was to open the door and look, and it was left only because the rewrite was big.
- Severity medium, as the other knowledge findings (CHEAT-02, CHEAT-05). Effort large: the tool, `hold_door_for`, `watch_door`, the brain's DOOR step and the simulator's `open_door` all change. The fix is sound; step 1 should keep the label-first lookup that is there now, and step 4 needs `look_around` after the door opens, which KNB-04's rewrite of `hold_door_for` will also touch, so do them together as step 7 says.
- Not run: nothing in this needed a script.
