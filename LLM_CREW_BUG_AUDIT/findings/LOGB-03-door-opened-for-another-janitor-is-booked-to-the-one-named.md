---
id: LOGB-03
title: A door the server opens for some other janitor is booked by the brain as opened for the one it named, who is then let out of a room they were never in for good
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_doors.dm:511, code/modules/llm_crew/crew_npc_doors.dm:629, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1975, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1441
fix: Send back who the door was opened for in the open_door result details and have the brain book that person, not task.item, and never book a let-in for a name the server did not find
---

## What is wrong

See also: CARGO-09 (the note that someone is inside never lapses) and KNB-07 (the door tool finds people through a shut door). This is a third fault between them, and it is how the stale note in CARGO-09 came about in a real round.

A technician asked to open a door names who it is for. If the server cannot find that person at the door or in the room, `tool_open_door` does not refuse. It takes whoever it can find instead: anyone shut inside at a door (`shut_in_at_door`), or any janitor standing outside a door of the room (`janitor_at_door`). It opens the door for that person and answers "You open the door for <that person> and hold it ...", ok TRUE, with no field that says who.

The brain does not read the name in the text. `afterActing` for the DOOR task books the let-in to `task.item`, the name it asked for. So the department's shared list (`expected.ts`) now says the named person is inside the room. Three minutes later, with the mess gone, the long stop in `doorSought` wants to let them out, the server answers "You do not know who that is, and there is nobody of that name at the door of X" (a failure, so the note is not struck), and it is tried again after each back-off for the rest of the round, by every technician at the post. That is CARGO-09's loop, and while it runs the technician takes no orders, makes no rounds and calls no janitor (CARGO-09 points 2 to 4).

The case, `data/logs/2026/11/18/round-17.48.05` (log times):

1. 23:50:40: Monte Mcmullen sends Arleen Fleming, a janitor, "There is a mess in the Delivery Office ... Come to its door and knock, and I will let you in." Arleen is now expected at the Delivery Office. She never comes: from 23:52 she is shut in the Head of Personnel's Office across the station for the rest of the round (LOGB-01).
2. Vincent Briner, the other janitor, is called to the same rooms and knocks. The knock names a door and not a person, and `doorSought` gives it to whoever is expected there: Arleen.
3. 00:01:13, Monte's brain: "Arleen Fleming was sent for to clean up the mess in the Cargo Bay ... open the Cargo Lobby door for them" => `open_door("Arleen Fleming", "Cargo Bay", "Cargo Lobby")`. 00:01:14, `game.log`: "Monte Mcmullen opened Cargo Bay to let Vincent Briner into Cargo Bay."
4. 00:07:03, Monte's brain: `open_door("Arleen Fleming", "Delivery Office", "Deliveries")`. 00:07:04: "Monte Mcmullen opened Deliveries to let Vincent Briner into Delivery Office."
5. From 00:10:07 to 00:17:24 the two technicians send `open_door("Arleen Fleming", "Delivery Office")` thirteen times between them ("Arleen Fleming is inside the Delivery Office and cannot get out by themselves"), and each time are told "You do not know who that is, and there is nobody of that name at the door of Delivery Office." The voice says "Arleen! I am unlocking the door right now so you can get out" (00:12:58) and "I'm letting Arleen out of the Delivery Office right now" (00:16:14) to a room with nobody in it. The round ended at 00:21 with the loop still running.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:505`, in `tool_open_door`, the stand-ins:

    	if(QDELETED(person) && istext(person_name))
    		person = person_at_room(person_name, room)
    		if(person)
    			handle = handle_for(person)
    	// A knock from inside says where, and not who. Whoever is standing inside at a door of the
    	// room, and cannot open it for themselves, is who knocked.
    	if(QDELETED(person))
    		person = shut_in_at_door(room) || janitor_at_door(room)
    		if(person)
    			handle = handle_for(person)

`crew_npc_doors.dm:629`, the answer, with the real name in the text only:

    	return list(TRUE, "You open the door for [person.name] and hold it, to let them [inside ? "out of" : "into"] [room_name].")

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1975`, in `afterActing`, booked to the name asked for:

      if (ok && task.item && task.place && brain.post) {
        noteSentFor(brain, task.item);
        ...
        } else {
          noteLetIn(brain.post, task.item, task.place, brain.name, brain.now);
        }

`cargo.ts:1441`, the knock from outside given to whoever is expected:

      const due = expectedAt(post, knock.room, brain.now).find((entry) =>
        mine(entry.by),
      );
      if (due && brain.areaMesses[knock.room]) {
        return { name: due.name, room: knock.room, out: false };
      }

## How it was found

Seen in a round log, as quoted from `game.log` and `crew_brain.log`, and the cause read in the current code, which is unchanged at each place quoted. The step from the knock to Arleen's name (point 2) is inferred: `crew_brain.log` holds the step and not the knock. Either way the server opened for Vincent what the brain asked for Arleen.

## How to fix it

1. Server, `hold_door_for`: add the name to the result's details, `list("for" = person.real_name, "out" = inside)`. `action_result` already takes a details list; `hold_door_for` returns `list(ok, text)` to the errand code (`crew_npc_hands.dm`, the `CREW_TOOL_DOOR` cases), so that return needs a third element carried through to the `action_result` call.
2. Brain, `afterActing` for the DOOR task in `jobs/cargo.ts`: book the let-in or let-out to `details.for` when it is there, and only fall back to `task.item` when the server did not say. When `details.for` differs from `task.item`, also leave the named person's expectation standing (they have not been let in).
3. Better still, and in line with KNB-07: drop the stand-ins. A knock that names no one is answered by going to the door and opening it to whoever is there (the server can report who walked through), not by a name guessed from the list.
4. CARGO-09's fix (strike the note when a let-out is refused because nobody of that name is there) closes the loop even if a wrong booking gets through, and should go in as well.

## How to test the fix

- A simulator scenario with two janitors called to the same cargo room, one of whom never comes, and the other knocking. Want the door opened once, booked to the one who knocked, and no `open_door` for the absent one afterwards.
- Type check and server compile.
- Next round, `game.log`: for every "opened X to let Y into Z", the technician's brain step just before it names Y. No run of "You do not know who that is, and there is nobody of that name at the door" in the brain's memory.
