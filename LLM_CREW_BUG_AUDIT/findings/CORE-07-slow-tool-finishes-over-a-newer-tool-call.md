---
id: CORE-07
title: A tool that takes time to choose (explore, force_door) starts its walk when it is done even if a newer tool call came in meanwhile, and the newer one is lost without a word
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_tools.dm:265, code/modules/llm_crew/crew_npc_tools.dm:36, code/modules/llm_crew/crew_npc_tools.dm:65, code/modules/llm_crew/crew_npc_forcing.dm:105
fix: Count accepted tool calls on the controller, have each slow tool note the count when it starts and, when it is done choosing, drop its walk and say nothing if the count has moved on
---

## What is wrong

`handle_tool_call` has no idea of a tool being in progress. Most tools act at once. Two do not: `explore` and `force_door` are started with `INVOKE_ASYNC` because they test routes with `get_path_to`, which sleeps until the pathfinder answers. `explore` tests up to `CREW_NPC_EXPLORE_TRIES` (4) rooms, and more when a room is skipped as locked; `force_door` up to `CREW_NPC_DOORS_TRIED` (3) doors. Each test is a full route search of up to 250 tiles.

While they sleep, the window can send another tool call, and the server takes it: a `step_aside` because someone asked the body to move, an order from someone it answers to that drops what it is doing (`orderToDrop`), "leave" from its head (`dropToLeave`). That call starts its own walk or errand. Then the slow tool wakes up and calls `start_walk` (explore) or `start_errand` (force_door) as if nothing had happened. `start_walk` cancels the errand; it replaces the newer walk. The newer call is never reported: `walk_finished` returns early for a walk that has been replaced ("A newer walk has replaced this one; it will report for itself"), and `cancel_errand` reports nothing by design.

The guards that are there stop only a second call of the same tool (`choosing_where_to_explore`, `finding_door_to_force`). There is an `errand_serial` for errands, but nothing like it covers tool calls as a whole.

One concrete case. A janitor with nothing to do is told to `explore`. `pick_somewhere_new` starts testing routes. The Captain walks up and says "move, please" in the doorway; the window sends `step_aside`. `tool_step_aside` starts a walk to a spot a tile away. Half a second later the route test comes back and `tool_explore` calls `start_walk(destination, CREW_TOOL_EXPLORE, ...)`. The janitor walks off to explore (or, because of CORE-01, keeps heading for the step-aside spot while the walk leaf waits for the far room). The step aside is never reported, so the window's `lastAct` for it is only dropped after `LOST_ACT_MS` once the body stops walking, and the step goes into back-off as a failure.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:34`:

    		if(CREW_TOOL_EXPLORE)
    			// Choosing somewhere to explore means testing routes, which takes time.
    			INVOKE_ASYNC(src, PROC_REF(tool_explore))
    ...
    		if(CREW_TOOL_FORCE_DOOR)
    			// Choosing which door to make for means testing routes, which takes time.
    			INVOKE_ASYNC(src, PROC_REF(tool_force_door), arguments["place"], arguments["door"])

`code/modules/llm_crew/crew_npc_tools.dm:265`, `tool_explore`:

    	choosing_where_to_explore = TRUE
    	var/turf/destination = pick_somewhere_new()
    	choosing_where_to_explore = FALSE
    	if(QDELETED(src) || QDELETED(pawn))
    		return
    	...
    	start_walk(destination, CREW_TOOL_EXPLORE, "somewhere new", CREW_NPC_TRAVEL_TIMEOUT)

`code/modules/llm_crew/crew_npc_tools.dm:332`, the sleep inside `pick_somewhere_new`:

    				route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())

`code/modules/llm_crew/crew_npc_tools.dm:410`, `walk_finished`, which is why the replaced walk says nothing:

    	// A newer walk has replaced this one; it will report for itself.
    	if(blackboard[BB_CREW_NPC_WALK_TARGET] != target)
    		return

## How it was found

Read from the code: `handle_tool_call`, `tool_explore`, `pick_somewhere_new`, the top of `tool_force_door`, `start_walk`, `start_errand`, `walk_finished`, and in `driver.ts` the three ways a busy body is given a new step (`orderToDrop`, `dropToLeave`, `dropToMove`). Not seen in a round log. How long a route test takes on this machine was not measured.

## How to fix it

1. Add `var/tool_serial = 0` to the controller. In `handle_tool_call`, once a call has passed every check and is about to be run, do `tool_serial++`. `say` and `hold` do not change what the body is doing, so leave them out of the count.
2. In `tool_explore`, keep `var/serial = tool_serial` before `pick_somewhere_new()`. After it returns, if `tool_serial != serial`, return without walking and without a result: the newer call is what the brain is waiting on, and it will get that result. Log one line to `game.log` so the case can be seen.
3. The same in `tool_force_door`, around the route-testing loop, before it starts its walk or errand.
4. Any later tool that sleeps before acting should follow the same pattern. Note it in the comment on `handle_tool_call`.

## How to test the fix

- Server compile.
- In a round, tell a janitor to explore and at once (within a second) ask it to step aside. It should step aside and stay, not walk off. Grep `game.log` for the new "gave up exploring: a newer order came" line.
- Without the fix, the same test shows the explore walk starting after the step aside.
