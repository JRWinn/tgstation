---
id: KNB-14
title: Walks tried while the body is shut in where it stands are counted against the room it was going to, so twice shut in writes that room off for fifteen minutes
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: a6797f1035d
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_tools.dm:485, code/modules/llm_crew/crew_npc_cleaning.dm:308, code/modules/llm_crew/crew_npc_cleaning.dm:314, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:773, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:475
fix: In walk_finished do not mark blocked_places or blocked_tries for the goal when the walk failed because the body is shut in where it stands, and clear what was marked while shut in once it is out
---

## What is wrong

See also: CORE-11, HAND-09 (two more wrong write-offs of a room in `walk_finished`, with other causes).

See also: LIFE-01 (a walk cut short by a stun marks the room, for a different reason).

When a walk to a room ends with "there is no way through", `walk_finished` writes the room the body was going to into `blocked_places`, and adds one to `blocked_tries` for it. Two such failures and the room is left alone for fifteen minutes (`CREW_NPC_BLOCKED_PLACE_LONG`), and, by the 13:30 entry's own design, "a door being opened for it does not wipe that" (`ways_reopened` only clears rooms with fewer than two tries).

That is right when the trouble is getting **into** that room. It is wrong when the trouble is getting **out of the room the body stands in**. The code knows the difference: four lines further down it asks `locked_out_of(goal_room)` before it counts the failure towards being shut in. But the count against the goal is made first, for every failure, with no such test.

A body that is shut in walks at the same shut door again and again, by design. The driver lets it try every 20 seconds (`TRY_LEAVING_MS`), or every two minutes if it was let in by someone (`TRY_LEAVING_LET_IN_MS`). Each try is a `go_to` to whatever its next piece of work is, and each one that fails adds one to that room's `blocked_tries`. The second one writes the room off for fifteen minutes, though the room was never the problem.

The 12:00 entry ("eleven faults from the 09:12 round", Known and not fixed) has the start of this as a known cost and nothing more: "A janitor let into a locked room and finished now has to find it is shut in before it asks out: one failed walk, then the door." That first failed walk is the first of the two.

Concrete case:

1. A technician lets a janitor into the Delivery Office to clean. The janitor finishes. Its next call is a mess in the Bar.
2. It walks for the Bar. There is no way: the door it came in by does not open for it. `walk_finished` sets `blocked_places["Bar"]` and `blocked_tries["Bar"] = 1`. Because it has a trail, `note_way_out_failed` sets `shut_in` at once.
3. It goes to the door, knocks, and sends word to whoever let it in. The technician is out at the shuttle, or the door is the keeper's and the other technician waits 45 seconds (`KEEPER_WAIT_DS`), or the PDA will not send (power gone, see the 2026-11-18 morning entry).
4. For the next five minutes (`CREW_NPC_BLOCKED_PLACE_TIME`) the Bar is in `blockedPlaces`, so `noWayIn` blocks the Bar call and the tries the driver lets through every two minutes (`TRY_LEAVING_LET_IN_MS`) are `go_to`s to its other calls or its post. Each of those rooms gets the same mark and a first try.
5. When the five minutes are up, `is_blocked_place` drops the Bar from `blocked_places` but leaves `blocked_tries["Bar"]` at 1 (only arriving in the Bar, `crew_npc_tools.dm:481`, or forcing its door clears it). The Bar call is ready again, the next try goes at it, fails the same way: `blocked_tries["Bar"] = 2`.
6. The technician comes and opens the door. `door_opened_for` calls `ways_reopened`, which leaves the Bar alone because its tries are 2. For the next fifteen minutes the Bar is in the window's `blockedPlaces`, the Bar call stays blocked with `NO_WAY_IN`, and the janitor stands about with a call it could walk to.

So the fifteen-minute write-off needs the body shut in for over five minutes (with a trail; a body with no trail tries every 20 seconds, so the same). A shorter time shut in does less harm, but some at once: the first failed walk already puts the goal in `blockedPlaces`, and the window acts on that in the same update (below). Being let out through `door_opened_for` clears a goal with one try; getting out any other way (a player opening the door, a door left standing) does not, and the mark stands its five minutes.

The same mark does harm in other jobs that read `blockedPlaces`:

- `jobs/orders.ts` (`:97`, on the first failure): a "look in on X" order given to a body shut in somewhere else is finished with "I could not get in: there is no way in for me." That goes back to whoever gave the order, and it is false: the body never got out of where it was.
- `jobs/rounds.ts`: a technician's look round to X is dropped and noted as looked at.
- `jobs/arrests.ts`: an officer's sighting or last-seen place is passed over.

With a body shut in with no trail (the door lost power, or `check_shut_in` found no way out), the tries are 20 seconds apart, so the room it means to go to is written off within forty seconds.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:483`, in `walk_finished`:

    		else
    			// A room it cannot find a way into is left alone for a while: a locked door does not open for asking twice.
    			if(tool == CREW_TOOL_GO_TO && goal)
    				blocked_places[goal] = world.time
    				if(reason == CREW_NPC_NO_WAY)
    					blocked_tries[goal]++

and a few lines later, the test it does make, but only for being shut in:

    			var/area/goal_room = isturf(target) ? get_area(target) : null
    			if(reason == "there is no way through" && !length(fire_doors) && !(tool == CREW_TOOL_EXPLORE && isturf(target)) && !(goal_room && locked_out_of(goal_room)))
    				note_way_out_failed()

`code/modules/llm_crew/crew_npc_cleaning.dm:308`, `is_blocked_place`, and `:314`, `ways_reopened`:

    	if(world.time - blocked_at > (blocked_tries[place] >= 2 ? CREW_NPC_BLOCKED_PLACE_LONG : CREW_NPC_BLOCKED_PLACE_TIME))

    /datum/ai_controller/crew_npc/proc/ways_reopened()
    	for(var/place in blocked_places.Copy())
    		if(blocked_tries[place] < 2)
    			blocked_places -= place

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:773`, the tries while shut in:

    if (walksOut && brain.shutIn && !wayOutOpen(brain)) {
      if (now < brain.tryLeavingAt) {
        return null;
      }
      ...
      brain.tryLeavingAt =
        now + (brain.wantsOut ? TRY_LEAVING_LET_IN_MS : TRY_LEAVING_MS);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:475`:

    const noWayIn =
      !brain.doorHeld &&
      task.place !== brain.location &&
      brain.blockedPlaces.includes(task.place);

## How it was found

Read from the code, following the 12:00 entry's note about the one failed walk. Not seen in a round log: the next person should grep `game.log` for a body that "tested whether it is shut in" or was let out, followed by "walk failed (go_to, to X)" twice for the same X, and then no walk to X for fifteen minutes.

## How to fix it

1. In `walk_finished`, work out first whether this failure is the body failing to get out of where it stands. It is when the reason is `CREW_NPC_NO_WAY`, there are no fire doors, the goal room is not locked to the body (`!(goal_room && locked_out_of(goal_room))`), and either the body has a trail or is already `shut_in`. Move the `note_way_out_failed()` call above the `blocked_places` lines and test `shut_in` after it.
2. When it is, do not touch `blocked_places[goal]` or `blocked_tries[goal]`. The room was not the problem.
3. As a belt and braces, in `note_place` where `shut_in` is cleared on reaching a new room, and in `door_opened_for`, drop `blocked_tries` and `blocked_places` entries written while it was shut in. That needs a note of when it became shut in (a `shut_in_since` time) and a comparison with each `blocked_places[place]`.
4. Keep what the 13:30 entry's fix (6) is for: a room the body really cannot get into from outside, twice, is still left fifteen minutes.
5. Know the cost: with a trail, `note_way_out_failed` already takes any failed walk to mean shut in, so after step 2 a goal that is really sealed off elsewhere (not locked to the body by its doors) is never marked while the body has a trail. That is only tried again at the shut-in pace (every two minutes), so it is acceptable; do not try to settle it here.

## How to test the fix

- Compile.
- The simulator does not run `walk_finished`, so there is no scenario that shows this. A `nested` run with the inner door left shut for over two minutes would show it on the window side if the simulator's stand-in kept a blocked list like the server's; it does not today.
- In the next round: `grep -n "walk failed (go_to" game.log` for a janitor let into a cargo room. After the fix, a janitor let out goes straight on to its next call, and no "I could not get in" report follows a time shut in.

## Check

Read `walk_finished` (`crew_npc_tools.dm:409-505`): the goal is marked in `blocked_places`/`blocked_tries` before, and with no test like, the `locked_out_of` test that guards `note_way_out_failed`. Read `note_way_out_failed` (`crew_npc_doors.dm:42`: with a trail one failure sets `shut_in` and `wants_out`), `is_blocked_place` and `ways_reopened` (`crew_npc_cleaning.dm:301-318`), `door_opened_for` (`crew_npc_doors.dm:805`), every write of `blocked_tries` (only arrival at `crew_npc_tools.dm:481` and forcing at `crew_npc_forcing.dm:520` clear it), the driver's shut-in throttle (`driver.ts:766-783`, `TRY_LEAVING_MS` 20 s, `TRY_LEAVING_LET_IN_MS` 120 s) and the shut-in steps before it (`driver.ts:315-400`), and the readers of `blockedPlaces` in `jobs/janitor.ts:475`, `jobs/orders.ts:97`, `jobs/rounds.ts:107`, `jobs/arrests.ts`. The fault holds, but the write-up's step 4 was wrong: after the first failure the Bar call itself is blocked by `noWayIn` for five minutes, so the very next try cannot be at the Bar. The second strike comes only when that mark lapses while `blocked_tries` keeps its 1. I rewrote steps 4-6 to say so. The wrong "I could not get in" report from `orders.ts` and the dropped look round in `rounds.ts` follow from the first failure alone. Both change log notes are as quoted (lines 682 and 812) and neither fixes this. Severity medium stands. Confidence likely stands: read from the code only, the timing not seen in a round. The fix is sound and small.
