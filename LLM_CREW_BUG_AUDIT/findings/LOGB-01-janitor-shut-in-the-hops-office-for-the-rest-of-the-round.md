---
id: LOGB-01
title: A janitor shut in the Head of Personnel's Office stays there for the rest of the round, with the head in the room and asked twice
kind: bug
severity: high
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:493, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:981, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:187, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:148
fix: Let anyone whose own ID opens the room open its door to let out someone inside who asks, not only cargo, and send a head the head form of the shut-in line even when its ID opens the door
---

## What is wrong

Only a cargo technician ever opens a door for someone. The brain plans `open_door` in one place, `jobs/cargo.ts`, and the server tool refuses anyone else ("Cargo staff only"). So a body shut in any room that is not cargo's can only be let out by the Captain, a player, or by chance.

The shut-in body does all it is built to do: it asks whoever is in the room aloud, then writes by PDA to whoever's own ID opens the door, then to its head. When the room is a head's office, the head is both: its ID opens the door, so it is written to as a keeper, and the head form of the line is never sent. A head acts on only the head form (`SHUT_IN_WORDS`, "... and nobody has come to the door"), and passes that one to the Captain. The keeper form ("... and am at the X door. Could you let me out ...") matches nothing in `head.ts`. So the head does not open the door, cannot, and does not pass the word up either. Its LLM, asked aloud, promises to: "Arleen, I'll see you to the Command Hallway."

This is not the cause KNA-01 gives for the change log's "A janitor was shut in the Head of Personnel's Office" (18:05 entry, "Seen and left alone"). KNA-01 is a cargo technician overwriting one door ask with another. No technician was asked here: the room is not cargo's.

The case, `data/logs/2026/11/18/round-17.48.05`, MetaStation (log times are 6 hours ahead). Arleen Fleming is a janitor; Corrine Raub is the Head of Personnel, her head.

1. 23:52:15: Arleen "found no route to Greater Starboard Maintenance from Head of Personnel's Office (98,133,2)".
2. 23:52:23, said aloud with the head in the room (the head's brain at 23:52:26 has "People in view: Arleen Fleming, Janitor"): "Corrine, could you let me out to the Command Hallway, please? I cannot get out of here by myself."
3. 23:52:26, the head's voice: "Arleen, I'll see you to the Command Hallway. Just let me know if there's anything else on your list before we go." Nothing follows it.
4. 23:53:34, PDA to the head: "I am shut in the Head of Personnel's Office and am at the Head of Personnel door. Could you let me out to the Command Hallway, please?" This is the keeper form (`driver.ts:397`).
5. 00:02:10 and 00:16:29: "I am shut in the Head of Personnel's Office. I will come to the Bar Lounge as soon as I am let out." Two meetings were missed this way.
6. 00:19:36, the last line of the round from her: "I am stuck here with my mop, Corrine. ..." from the Head of Personnel's Office (98,133,2). The round ended at 00:21. She was shut in for 29 minutes.

PDA was working all the while (the last line of `pda.log` is at 00:20:08). No random event touched the door; the events were Space Dust, Shuttle Loan, Camera Failure, Radiation Storm and a gravitational anomaly. The Captain was never told: no PDA to "Zim Fire" mentions her.

Side effect, seen in the same round: her aloud ask at step 2, "I cannot get out of here by myself", has "out of" in it, which the head's `NEED_WORDS` takes for asking for supplies (HEAD-04). Order 2 (23:56:02) was "Your staff need supplies (Arleen Fleming)". When crate #7739, which was order 1's and Vincent's, was unpacked at 23:57:32, her ask was marked told as well (HEAD-08), and that let a new one be noted: at 00:00:31 she said to the head, in the same room, "I am already cleaning the Mining Office mess, Corrine. Just stay out of my way or leave." ("out of" again), and order 3 (00:00:54) was "Your staff need supplies (Arleen Fleming)" too. Two crates of janitorial supplies, 800 credits, for a janitor locked in the head's own office who had said "I need nothing" by PDA at 23:51:55. That is the cause of the change log's "The Head of Personnel ordered a crate of janitorial supplies three times in nine minutes", also left alone in the 18:05 entry.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:492`, in `tool_open_door`:

    /datum/ai_controller/crew_npc/proc/tool_open_door(handle, place, person_name, door_label)
    	if(!works_in_cargo() || isnull(post_turf))
    		action_result(CREW_TOOL_DOOR, FALSE, "You have no door of your own to open for anyone.")
    		return
    	var/room_name = own_room_named(place)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:981` is the only place the brain asks for that tool (`grep -n "tool: 'open_door'"` finds nothing else).

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:198`, in `nextToWrite`: keepers come first, and someone written to as a keeper is never written to again as the head:

    const keepers = brain.doorKeepers.filter((name) => name !== brain.name);
    const keeper = keepers.find((name) => !written(name));
    if (
      keeper &&
      keepers.filter((name) => asks.wrote.includes(name)).length < KEEPERS_WRITTEN_TO
    ) {
      return { name: keeper, head: false };
    }
    ...
    return head && !written(head.name) ? { name: head.name, head: true } : null;

`driver.ts:395`, the two forms:

    text: next.head
      ? `I am shut in the ${brain.location} and nobody has come to the door. Could you send someone to let me out${outTo}, please?`
      : `I am shut in the ${brain.location} and am at the ${doorCalled(brain, brain.location)}door. Could you let me out${outTo}, please?`,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:148`, all a head reads of it:

    const SHUT_IN_WORDS =
      /^I am shut in the (.+?) and nobody has come to the door/i;

## How it was found

Seen in a round log (`round-17.48.05`, `game.log` and `crew_brain.log` lines quoted above), then the cause read in the current code. The code on disk is as it was for this: `nextToWrite`, the two message forms, `SHUT_IN_WORDS` and the cargo-only `tool_open_door` are all unchanged in their effect. Not seen: how she came to be in the office (most likely she followed the head through its door). Not checked: whether the head's guarding code (`jobs/guarding.ts`) would ever walk her out as a stranger; it did not in this round, and it should not, since she is the head's own staff.

## How to fix it

0. The quickest part, and worth doing first on its own: step 3 below. It is window only, a few lines in `nextToWrite`, and gets the word to the Captain, who can open any door.
1. Server, `tool_open_door`: drop the `works_in_cargo()` gate for letting someone out. Mind the no-cheats rule: the door is opened by `hold_door_for`, which calls `door.open()` and turns off the auto-close by code, and is on the list of cheats to take out (`LLM_CREW_PLAN_NO_CHEATS.md`, the "Door" row). Do not hand that to every job as it is: build this on the player's way of opening (the body at the door, clicking it, or bumping it from inside) that the no-cheats plan puts in its place, or do this step after that one. Let any body open a door of the room it is standing in, or of a room its own ID opens (`door.allowed(body)`, which `hold_door_for` checks already), when the person is inside that room. Keep letting someone in to cargo staff and the janitor-with-a-mess rule as it is. `own_room_named` and `post_turf` are cargo's ideas; for the let-out case use the body's current area, or the area named, and the door from `room_door_for`.
2. Brain: move the "let out someone inside who asks" part of cargo's door work (`mayPass`, the `DOOR` task, `doorWanted`) into a shared place every job runs, as `jobs/guarding.ts` already is for keeping a locked room. It fires on the driver's own fixed ask, said to it by name ("could you let me out", "could you open the door for me") or sent by PDA ("Could you let me out"), when the asker is in a room this body's ID opens. It needs no model. Never for someone it holds or has a warrant on.
3. `nextToWrite`: when a keeper is also the body's own head, send that person the head form, so a head that cannot or will not open still passes the word up. Or make `SHUT_IN_WORDS` also read "I am shut in the (.+?) and am at the". The first keeps the two lines meaning what they say.
4. The head's LLM line at step 3 is a promise code does not keep. Once step 2 exists, the promise is true; until then, add a cue for a head asked for its door: "Your body does not open doors for anyone: say so."
5. HEAD-04 is the fix for the two extra orders: the driver's let-out line must not be read as a need.

The owner may want to decide whether heads open doors with their own hands (this fix) or only pass the word on. The project's rule "an example is not the scope" points to the first: anyone with a post behind a locked door.

## How to test the fix

- Simulator: a scenario with a janitor shut in the Head of Personnel's Office with the head in the room, and one with the head outside. Want an `open_door` step from the head within a minute, and the janitor out. And one where the room is a head's office and the head is away: want the Captain sent "X, one of my staff, is shut in ...".
- Type check and server compile.
- Next round, `game.log`: "opened ... to let X out of Head of Personnel's Office" from a body that is not cargo. No "Your staff need supplies (X)" in the head's `crew_brain.log` from a let-out line.
