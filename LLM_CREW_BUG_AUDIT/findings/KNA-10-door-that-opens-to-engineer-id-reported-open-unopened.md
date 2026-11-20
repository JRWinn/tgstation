---
id: KNA-10
title: An engineer sent to a door that its own ID opens reports the door open without opening it
kind: bug
severity: medium
effort: medium
confidence: sure
status: duplicate
duplicate_of: DOOR-07
found_by: Fable 5.2
area: engineering
files: code/modules/llm_crew/crew_npc_forcing.dm:154, code/modules/llm_crew/crew_npc_forcing.dm:443, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:386
fix: When the door opens to the engineer's ID, have it open the door and hold it for security, and say the door is open only when it stands open
---

## What is wrong

Security asks engineering to open a door nobody has opened for it. If the door is one the engineer's own ID opens, the server answers the tool call as a success ("opens to your ID. There is no need to force it."), with the door still shut. The window takes any success as the job done and sends up the chain "the door of the X is open". The Head of Security tells its officer "engineering has opened the X". The officer walks to a shut door.

The rooms this happens for are exactly the ones engineering staff work in: Engineering, Atmospherics, Tech Storage and the like, where security's ID does not open the door and an engineer's does. A suspect who hides in engineering's own rooms is the plainest case for calling an engineer.

It is also the unbuilt item in the change log entry of 2026-11-18, 16:50 to 17:35, "Not built": "Anyone but a cargo technician or the Captain opening a door for security." An engineer with the right ID standing at the door is someone who can open it, and does not.

The same wrong success is sent when "There is a way into X already": that is worked out for the engineer's access, not for security's.

The case: warrant on someone last seen in Atmospherics. The officer is shut out, asks whoever's ID opens it, nobody answers in 90 seconds, and reports "nobody has opened the Atmospherics for security". The Head of Security asks the Chief Engineer, who sends its engineer: `force_door("Atmospherics")`. In `tool_force_door` the loop at line 154 finds a door with `door.allowed(body)` true and answers at once, without the engineer moving:

    action_result(CREW_TOOL_FORCE_DOOR, TRUE, ... "The [labels[door]] door of [room_name] opens to your ID. There is no need to force it.", list("place" = room_name, "door" = labels[door], "already_open" = TRUE))

The engineer's brain sends "Ada, the door of the Atmospherics is open." It is not.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:154`, `tool_force_door`:

    for(var/obj/machinery/door/airlock/door as anything in (named ? list(named) : doors))
    	var/standing_open = !door.density
    	if(!standing_open && !(door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
    		continue
    	log_game("... was told to force ..., and did not: it [standing_open ? "is standing open" : "opens to its ID"].")
    	action_result(CREW_TOOL_FORCE_DOOR, TRUE, ...
    	return

`crew_npc_forcing.dm:443`, `force_door_open`: the same answer when it finds this at the door.

`crew_npc_forcing.dm:232`: "There is a way into [room_name] already", also `TRUE`.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:386`, `forcingAfterActing`: nothing reads `already_open`. `grep -rn already_open tgui/ tools/` finds no reader at all.

    forcing.jobs = forcing.jobs.filter((it) => it !== job);
    const to = addressOf(job.by, jobOf(brain, job.by));
    send(
      brain,
      job.by,
      ok
        ? forceDoneLine(to, job.room)

## How it was found

Read from the code. Not seen in a round: no round has had a suspect in a room an engineer's ID opens.

## How to fix it

1. Server, `tool_force_door`: when a door of the room opens to the body's ID and is shut, do not answer at once. Walk to it as for forcing (`start_errand(door, CREW_TOOL_FORCE_DOOR, label)`), and in `force_door_open`, in the branch at line 443 where `door.density` is true, open it the way a player with the ID does: a click on it (`click_as_body(door)`), then wait up to `CREW_NPC_PRY_WAIT` for it to stand open. Answer `TRUE` with "You open the X door of Y with your ID. It stands open." and details `opened_by_id = TRUE`.
2. A door opened by ID shuts itself again in a few seconds, unlike a pried one. So the engineer has to hold it until security is through. The honest way is section 4.8 of `LLM_CREW_PLAN_NO_CHEATS.md` (stand by it, open it again if it shuts). Until that is built the existing `hold_door_for` could be used, with its known cheat (KNA-04): give it whoever asked (`job.by` is the Chief Engineer or the Head of Security, not the officer, so the server would need the officer's name in the tool call; `forcing.ts` has it in the message it was sent: "X is inside on a warrant" names the suspect, not the officer). **Question for the owner:** should the engineer wait at the door until an officer comes, or open it, say so and leave, accepting that the door will have shut again?
3. Window, `forcingAfterActing`: read `details.already_open`. For "standing open already" the done line is true as it is. For "a way in already" send a different fixed line, since nothing was opened: "Ada, there is a way into the X already, by the Y door." and let the Head of Security pass that to the officer in place of "engineering has opened".
4. Add the reader for the new line to `forcingReads` and cases to `tools/llm_crew/security.ts` (the chain is tested there end to end: 17 cases).

Keeps the rules: an ID used at its own door is what a player would do.

## How to test the fix

- `tools/llm_crew/security.ts`: a case where `force_door` comes back `ok` with `already_open` and each of the three wordings; check what is sent to the Chief Engineer.
- Server compile.
- In a round: as Captain, declare a warrant on a monkey or a body placed in Atmospherics or Engineering, and watch `game.log` for "opens to its ID" followed by a door that is in fact opened.
