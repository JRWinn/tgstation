---
id: DOOR-07
title: An engineer sent to open a door for someone else reports it open when it only opens to the engineer, or was open for a moment
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: c156e008b44
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_forcing.dm:152, code/modules/llm_crew/crew_npc_forcing.dm:204, code/modules/llm_crew/crew_npc_forcing.dm:443, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:380
fix: In tool_force_door and force_door_open force a door that opens to the engineer's own ID like any other, count an open door only if it will stay open, and test the way round with no ID, so that "open" is only answered when anyone can walk in
---

## What is wrong

Also written up as: KNA-10

An engineer is sent to force a door because someone else cannot get through it: `forcing.ts` says "Security needs the door of the X opened, and nobody whose ID opens it has". The server tool does not know that. It judges the door by the engineer's own ID and by how the door stands that instant, and answers "succeeded" in three cases where nobody else can get in:

1. **The door opens to the engineer's own ID.** `tool_force_door` answers TRUE, "The ... door of X opens to your ID. There is no need to force it."
2. **A door of the room is standing open at that instant.** It answers TRUE, "... is standing open already." An airlock that someone has just walked through is open for about eight seconds and then shuts itself. A door held open by a cargo technician (`hold_door_for`) is open for fifteen.
3. **The engineer can walk in some other way.** It answers TRUE, "There is a way into X already." That route was planned with the engineer's access (`access = get_access()`), a maintenance door for instance.

The window reads only whether the tool succeeded. The detail `already_open` is not read anywhere in the window code. On success `forcingAfterActing` drops the job and sends whoever asked `forceDoneLine`: "<name>, the door of the X is open." The Head of Security passes that to its officer as "engineering has opened the X".

One concrete case. A wanted person (or the bar's monkey) is in Tech Storage, or any room of the engineering department. The door is locked to security, so the Head of Security asks the Chief Engineer, who sends an engineer. The engineer's ID opens that door. `tool_force_door` answers TRUE at once, without the engineer taking a step. Security is told "the door of the Tech Storage is open", the officer goes to it and finds it shut and locked to it. Nothing opens it. Security may ask again after `ASK_AGAIN_DS` (ten minutes) and gets the same answer.

From KNA-10: the rooms case 1 hits are exactly the ones engineering staff work in (Engineering, Atmospherics, Tech Storage and the like), where security's ID does not open the door and an engineer's does, and a suspect hiding in engineering's own rooms is the plainest case for calling an engineer. The chain in full: warrant on someone in Atmospherics, the officer is shut out, asks whoever's ID opens it, nobody answers in 90 seconds, it reports "nobody has opened the Atmospherics for security", the Head of Security asks the Chief Engineer, whose engineer gets `force_door("Atmospherics")` and at once sends "Ada, the door of the Atmospherics is open." It is also the unbuilt item in the change log entry of 2026-11-18, 16:50 to 17:35, "Not built": "Anyone but a cargo technician or the Captain opening a door for security." The "way into X already" answer is at `crew_npc_forcing.dm:232`.

`force_door_open` makes the same two judgements again when the body reaches the door ("came to force ... and did not"), so a door that swings open as the engineer arrives ends the job the same way.

## Where

`code/modules/llm_crew/crew_npc_forcing.dm:152`, in `tool_force_door`:

    	for(var/obj/machinery/door/airlock/door as anything in (named ? list(named) : doors))
    		var/standing_open = !door.density
    		if(!standing_open && !(door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
    			continue
    		...
    		action_result(CREW_TOOL_FORCE_DOOR, TRUE, standing_open ? "The [labels[door]] door of [room_name] is standing open already." : "The [labels[door]] door of [room_name] opens to your ID. There is no need to force it.", list("place" = room_name, "door" = labels[door], "already_open" = TRUE))
    		return

`code/modules/llm_crew/crew_npc_forcing.dm:209`, the way round, by the engineer's own access:

    			var/list/round_it = get_path_to(body, far_side, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
    			...
    			if((length(round_it) && !route_by_open_door(round_it)) || get_turf(body) == far_side)
    				leads_nowhere ||= nearest
    				continue

`code/modules/llm_crew/crew_npc_forcing.dm:443`, in `force_door_open`:

    	if(!door.density || (door.allowed(body) && door.hasPower() && !door.locked && !door.welded))
    		...
    		return list(TRUE, door.density ? "The [door_words] opens to your ID. There is no need to force it." : "The [door_words] is standing open already.", list("place" = room_name, "door" = label, "already_open" = TRUE))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:380`, in `forcingAfterActing`:

      if (!ok) {
        job.tries++;
        ...
      }
      forcing.jobs = forcing.jobs.filter((it) => it !== job);
      ...
        ok
          ? forceDoneLine(to, job.room)

## How it was found

Read from the code on both sides. `already_open` was searched for in `tgui/packages/tgui/interfaces/CrewBrain/` and is not there. Not seen in a round: the one forcing in the change log's rounds was of the Bar Backroom, which does not open to an engineer.

## How to fix it

The honest thing for an engineer to do with a door that opens to it, when the door is wanted open for someone else, is what it does to any other door: take its power away and pry it, so it is left standing open. That is what a player engineer would do, and it uses nothing new.

1. **Server.** Give `tool_force_door` a third argument, `for_others` (the window sends `for: 'others'` in the act). When it is set:
   - a door that opens to the body's own ID is not a reason to stop. Skip the `door.allowed(body)` half of the test at line 152 and of the test at line 443. The rest of `force_door_open` already works on such a door.
   - a door standing open counts only if it will stay open: `!door.density && (!door.autoclose || !door.hasPower())`. A door that is open and will shut itself is forced like a shut one: by the time the body is there it has shut. (In `force_door_open`, if it is still open on arrival and has power, wait for it to shut, a few seconds at most, then go on.)
   - the way-round test at line 209 is kept, but run with no ID (`access = list()`) in place of `get_access()`. Do not skip it: it was added on purpose for the bar's kitchen door (change log, "An engineer does not force a door that leads only to floor it can walk to already"), and skipped, the engineer would force that door again and let nobody into the bar. With no ID only open ways count, and `route_by_open_door` still passes over a door that happens to stand open.
2. Keep today's behaviour when `for_others` is not set, for a future case of an engineer forcing a door for its own use.
3. **Window.** In `planForcing` add `for: 'others'` to the act. In `forcingAfterActing`, read `details.already_open`: with the server change it will only be set for a door that really stands open and will stay so, and the line "the door of the X is open" is then true.
4. `still_forcing`, the answers and the log lines stay as they are.
5. Another way for case 1, from KNA-10: walk to the door (`start_errand(door, CREW_TOOL_FORCE_DOOR, label)`) and, in the branch at line 443 where `door.density` is true, open it with the ID the way a player does (`click_as_body(door)`, then wait up to `CREW_NPC_PRY_WAIT` for it to stand open), answering TRUE with "You open the X door of Y with your ID. It stands open." and `opened_by_id = TRUE`. A door opened by ID shuts itself in a few seconds, so the engineer would have to hold it until security is through: section 4.8 of `LLM_CREW_PLAN_NO_CHEATS.md` (stand by it, open it again if it shuts), or until that is built `hold_door_for` with its known cheat (KNA-04), which needs the officer's name in the tool call (`job.by` is the Chief Engineer or the Head of Security). Prying, as in step 1, leaves the door standing open with nobody waiting by it, which is why I would take step 1. **Second question for the owner (KNA-10's):** if the ID way is taken, should the engineer wait at the door until an officer comes, or open it, say so and leave, accepting that it will have shut again?
6. Window, if the way-round answer is kept for some case: send a different fixed line for "There is a way into X already", since nothing was opened: "Ada, there is a way into the X already, by the Y door.", and let the Head of Security pass that to the officer in place of "engineering has opened". Add the reader for any new line to `forcingReads`.

Question for the owner: is a forced door meant to be left open for the rest of the round? Today it is ("The door is left standing open"), and its timer does not shut it once power is back. A door of the armoury or a head's office forced this way stays open to everyone. If that is not wanted, the engineer could click it shut again once whoever asked says they are through, which needs one more message each way.

## How to test the fix

- Type check and lint the window (see README). Server compile.
- Add a case to the forcing scenario in `tools/llm_crew/sim.ts` (the simulator plays the server): the tool answers TRUE with `already_open`, and the engineer's message must not be sent unless the answer says the door will stay open. As the simulator plays the server, its stand-in for `force_door` needs the new argument too.
- `tools/llm_crew/security.ts` (the chain end to end, 17 cases): a case where `force_door` comes back ok with `already_open` and each of the three wordings, checking what is sent to the Chief Engineer and on to the officer.
- In a round: have security declare a warrant on someone standing in an engineering room (Atmospherics or Engineering). `game.log` should show `forced open ... by pulsing a main and a backup power wire and prying it`, and not `was told to force ..., and did not: it opens to its ID`.

## Check

Checked by Opus 5.5. Confirmed.

- The quotes hold today: the early return at `crew_npc_forcing.dm` about 152-160 answers TRUE with `already_open` for `!door.density` or for a door `allowed(body)` with power and no bolt or weld; the way-round answer is at about 232-235 and its route uses `get_access()` (about 212); `force_door_open` repeats the first test at about 443.
- `already_open` appears nowhere under `tgui/packages/tgui/interfaces/CrewBrain/` (searched). `forcingAfterActing` in `jobs/forcing.ts` (about 362-405) looks only at `ok` and sends `forceDoneLine` on any success.
- The chain is real: `force_door` is sent from one place only, `planForcing` in `jobs/forcing.ts` (about 353), and that job only exists because security asked; and the change log's "Not built" list of 2026-11-18 (about line 333) says nobody but a cargo technician or the Captain opens a door for security, so an engineer whose ID opens the room is never asked earlier in the chain.
- Airlocks have `autoclose = TRUE` (`airlock.dm` 84) and shut 8 seconds after opening at normal speed (`airlock.dm` about 1340), as the write-up says.

Corrections to the fix:

- Because `force_door` is only ever sent for someone else, the `for_others` argument is not needed today: the server can always behave that way, and the fix is then server only (medium). Steps 3 and 6 on the window side become optional.
- The way-round test must not be skipped (see the mended step 1). Run with no ID, every door on a route it finds is one that stood open at that instant, so for this test pass over a route that crosses any airlock that is open and will shut itself (`!door.density && door.autoclose && door.hasPower() && !door.locked`), not only one the engineer's ID does not open, which is what `route_by_open_door` tests.
- In `force_door_open`, a door still open on arrival with power: waiting for it to shut, as step 1 says, is right; give the wait a limit (the 8 seconds of the airlock's own timer and a little more) and fall through to the forcing after it.
