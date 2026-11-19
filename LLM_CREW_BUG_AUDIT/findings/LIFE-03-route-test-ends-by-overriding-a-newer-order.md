---
id: LIFE-03
title: Explore, force door and go to door test routes in a sleep and then start their walk over whatever the body was told to do meanwhile
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_tools.dm:265, code/modules/llm_crew/crew_npc_forcing.dm:190, code/modules/llm_crew/crew_npc_doors.dm:354, code/modules/llm_crew/crew_npc_hands.dm:449, code/modules/llm_crew/crew_npc_tools.dm:409
fix: Note errand_serial before the route tests and drop the result if it has moved on, and report the body as busy while it tests routes
---

## What is wrong

Three tools work out where to go by testing routes with `get_path_to`, which sleeps until the pathfinder answers, once per route tried:

- `tool_explore` → `pick_somewhere_new` (up to four rooms, then up to four tunnels), run with `INVOKE_ASYNC`.
- `tool_force_door` (up to three doors, two routes each), run with `INVOKE_ASYNC`.
- `tool_go_to_door` for a door into a room (up to three doors; a door out of the room it is in is not route tested), run straight from `ui_act`, which the verb queue runs async.

When the tests are done each of them goes straight on to `start_walk` or `start_errand`. None looks at whether the body has been given anything else to do while it was testing, or whether it can still act. `start_walk` and `start_errand` both clear the other's blackboard key, so the late one wins: the order the body was given in the meantime is thrown away.

And the order thrown away is never answered. `walk_finished` returns at once when the walk it is told about is not the one in the blackboard ("A newer walk has replaced this one; it will report for itself"), and `start_errand` has just cleared the walk key, so the newer walk ends with no `action_result`. The window waits `LOST_ACT_MS` (12 seconds) and then counts the step as failed and backs off it.

The window is not told the body is busy while it tests routes. `describe_doing` has nothing for `choosing_where_to_explore`, `finding_door` or `finding_door_to_force`, and the `walking` field in `ui_data` does not count them either. So the driver is held off only by its own `lastAct`, and the cases that break through that (`orderToDrop` for an emergency task, `dropToLeave`, `dropToMove`) do so freely. So does the 12 seconds of `LOST_ACT_MS` itself, which only waits while `walking` or `doing` is set.

One concrete case:

1. The Chief Engineer is told to force a door of the Bar. `tool_force_door` is started async and calls `get_path_to` for the first door's far side.
2. The Captain, standing by, says "come here, now". That is an order from someone it answers to, an emergency task. `orderToDrop` returns it and the driver sends `walk_to(captain)`. `tool_walk_to` → `start_walk`. The body turns to the Captain.
3. The route tests finish. `tool_force_door` reaches `start_errand(best, CREW_TOOL_FORCE_DOOR, ...)`, which clears `BB_CREW_NPC_WALK_TARGET`.
4. The walk leaf is reset and calls `walk_finished(captain, FALSE, null)`. The blackboard's walk key is now null, not the Captain, so it returns without a word.
5. The Chief Engineer walks off to the Bar. The window still has `walk_to(captain)` as `lastAct`, and it is worse than a 12 second wait: while the forcing errand runs, `walking` and `doing` are set, so `LOST_ACT_MS` does not fire, and `orderToDrop` returns null because `lastAct.task` is the Captain's own task ("already about that job"). The forcing errand's `action_result` is for `force_door`, which `noteResult` ignores as not the last step. So the Captain is ignored for the whole forcing job, and only when the body is idle again is the walk counted as failed and backed off.

The same with explore: a janitor told by its head to come to a staff meeting while it is choosing where to explore walks off exploring, and the meeting walk is lost the same way.

A smaller fault in the same lines: a second call while the first is still testing is dropped with no answer at all (`if(choosing_where_to_explore) return`, `if(finding_door) return`, `if(finding_door_to_force) return`). If the first call was for another room (`tool_go_to_door("Bar")` then `tool_go_to_door("Kitchen")`), the second is never done and the answer that comes is for the first.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:265`, `tool_explore`:

    	choosing_where_to_explore = TRUE
    	var/turf/destination = pick_somewhere_new()
    	choosing_where_to_explore = FALSE
    	if(QDELETED(src) || QDELETED(pawn))
    		return
    	...
    	start_walk(destination, CREW_TOOL_EXPLORE, "somewhere new", CREW_NPC_TRAVEL_TIMEOUT)

`code/modules/llm_crew/crew_npc_forcing.dm:218` and `:241`, `tool_force_door`:

    		var/list/route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
    		if(QDELETED(src) || QDELETED(body))
    			return
    	...
    	start_errand(best, CREW_TOOL_FORCE_DOOR, labels[best])

`code/modules/llm_crew/crew_npc_doors.dm:373` and `:407`, `tool_go_to_door`:

    		var/list/route = get_path_to(body, spot, max_distance = CREW_NPC_MAX_PATH_LENGTH, access = get_access())
    		if(QDELETED(src) || QDELETED(body))
    			return
    	...
    	start_walk(best_spot, CREW_TOOL_TO_DOOR, goal, CREW_NPC_TRAVEL_TIMEOUT)

`code/modules/llm_crew/crew_npc_tools.dm:409`, why the replaced order is never answered:

    /datum/ai_controller/crew_npc/proc/walk_finished(atom/target, succeeded, reason)
    	// A newer walk has replaced this one; it will report for itself.
    	if(blackboard[BB_CREW_NPC_WALK_TARGET] != target)
    		return

`code/__HELPERS/paths/path.dm:29` (base), the sleep:

    	UNTIL(length(hand_around))

## How it was found

Read from the code, following `get_path_to` into its `UNTIL`, and `start_errand` into the walk leaf's reset. Not seen in a round.

## How to fix it

1. In each of the three tools, before the first `get_path_to`, note `var/serial = errand_serial`. Every `start_walk` and `start_errand` already moves `errand_serial` on (through `cancel_errand` and `start_errand`), so it tells whether anything new was started.
2. After the tests, before `start_walk` / `start_errand` and before any `action_result`, if `errand_serial != serial`, or `!can_sense()`, clear the busy flag, write one line to `game.log` ("worked out where to explore, and had been given something else to do meanwhile"), and return without starting anything. No answer is owed for the old tool: the brain moved on from it.
3. In `describe_doing`, return "working out the way" while `choosing_where_to_explore`, `finding_door` or `finding_door_to_force` is set, and count them in `ui_data`'s `walking`. Then the driver holds off as it does for a walk, and `LOST_ACT_MS` does not fire on a body that is only slow to choose.
4. For the second call while one is testing: answer it, `action_result(tool, FALSE, "You are still working out the way.")`, rather than dropping it. Or, simpler, let the second call win: note what it asked for, and have the first one's end start that instead. The first is less change and is what I would do.

## How to test the fix

- Compile.
- Simulator: `sim.ts` answers tools at once, so route testing cannot be held up there. A case can still check step 3: put `choosing_where_to_explore` in the fake state and see the driver does not issue another step.
- Next round: grep `game.log` for the new line. Before the fix, a `walk_to` or `go_to` sent while an `explore` or `force_door` was in hand shows as a step that never gets an answer in `crew_brain.log`.

## Check

Confirmed, read from the code, not run. The quotes are what the code says today.

- `ui_act` dispatch (`crew_npc_tools.dm:36`, `:65`, `:101`): `explore` and `force_door` go through `INVOKE_ASYNC`, `go_to_door` is called straight, so a sleep in any of them leaves the body free to take the next tool.
- `get_path_to` (`code/__HELPERS/paths/path.dm:29`) waits in `UNTIL(length(hand_around))` for `SSpathfinder` (wait 0.5). Each route test is a tick or more; `pick_somewhere_new` can make up to eight, `tool_force_door` up to six, `tool_go_to_door` up to three.
- After the tests, `tool_explore` (`crew_npc_tools.dm:265`), `tool_force_door` (`crew_npc_forcing.dm:241`) and `tool_go_to_door` (`crew_npc_doors.dm:407`) go straight to `start_walk` / `start_errand` with no look at whether anything else was started. Their only checks are `QDELETED(src) || QDELETED(body)`.
- `start_walk` calls `cancel_errand` (`errand_serial++`) and `start_errand` does `errand_serial++` and clears `BB_CREW_NPC_WALK_TARGET` (`crew_npc_hands.dm:161`). The cut-off walk's leaf then reaches `walk_finished`, finds the blackboard key no longer its target, and returns silently (`crew_npc_tools.dm:409`).
- Window side: `noteResult` (`driver.ts:943`) ignores a result whose tool is not `lastAct.tool`; `orderToDrop` (`driver.ts:631`) will not break off for an order whose task is already `lastAct.task`; `LOST_ACT_MS` (`driver.ts:672`) waits while `walking` or `doing` is set. That makes the case in step 5 worse than first written, and the body is corrected above.
- `describe_doing` (`crew_npc_hands.dm:449`) and `walking` in `ui_data` have nothing for the three busy flags.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions the busy flags or this race.

How often: the window for it is the time the route tests take, a fraction of a second to a second or so, so it needs an order, an eviction or a step-aside request to land in that time. Explore is called often by idle bodies, so it will come up, but not in most rounds' every hour. Medium stands.

On the fix: step 1 and 2 work as written, since every new walk or errand moves `errand_serial` on, and the guard must also be put after the early returns inside the loops that `return` on `QDELETED` (none of which clear the busy flag, though there the controller is gone anyway). For step 3, setting `walking` while route testing is right; `dropFor`, `dropToLeave` and `dropToMove` still break in, which is what step 2 handles. For step 4, the "answer it" form is the one to build: `action_result(tool, FALSE, "You are still working out the way.")`. A test case for the window can put `doing: "working out the way"` and `walking: true` in the fake state and check that `drive` returns null and does not count `lastAct` as lost after `LOST_ACT_MS`.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 4cf71442a2a.

- LIFE-03: part done. tool_explore (crew_npc_tools.dm) and tool_go_to_door (crew_npc_doors.dm) keep errand_serial and tool_serial from before their route tests. If either has moved on, or the body cannot sense, they start no walk, give no result, and write '... and had been given something else to do meanwhile' to game.log. A second explore or go_to_door while one is still testing is answered 'You are still working out the way.' instead of being dropped. Left: (1) code/modules/llm_crew/crew_npc_forcing.dm, tool_force_door: at the top, before the finding_door_to_force test, keep var/serial = errand_serial and var/calls = tool_serial. After the route loop (after finding_door_to_force = FALSE), and before any start_errand or action_result, add: if(errand_serial != serial || tool_serial != calls || !can_sense()) { log_game("... worked out which door to force, and had been given something else to do meanwhile."); return }. The early return 'if(finding_door_to_force) return' should become action_result(CREW_TOOL_FORCE_DOOR, FALSE, "You are still working out the way.") then return (handle_tool_call already does not count that repeat call in tool_serial). (2) code/modules/llm_crew/crew_npc_hands.dm, describe_doing: return "working out the way" while choosing_where_to_explore, finding_door or finding_door_to_force is TRUE. (3) code/modules/llm_crew/crew_brain_link.dm ui_data 'walking': OR in npc.choosing_where_to_explore || npc.finding_door || npc.finding_door_to_force. (4) A window case: fake state with doing 'working out the way' and walking true, checking that drive returns null and does not count lastAct as lost after LOST_ACT_MS.
