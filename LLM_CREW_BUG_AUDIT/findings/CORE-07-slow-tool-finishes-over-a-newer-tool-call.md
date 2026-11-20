---
id: CORE-07
title: A tool that takes time to choose (explore, force_door, go_to_door) starts its walk when it is done even if a newer tool call came in meanwhile, and the newer one is lost without a word
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: 4cf71442a2a, 8e156ed55d1
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_tools.dm:265, code/modules/llm_crew/crew_npc_tools.dm:36, code/modules/llm_crew/crew_npc_tools.dm:65, code/modules/llm_crew/crew_npc_forcing.dm:105, code/modules/llm_crew/crew_npc_doors.dm:298
fix: Count accepted tool calls on the controller, have each slow tool note the count when it starts and, when it is done choosing, drop its walk and say nothing if the count has moved on
---

## What is wrong

`handle_tool_call` has no idea of a tool being in progress. Most tools act at once. Two do not: `explore` and `force_door` are started with `INVOKE_ASYNC` because they test routes with `get_path_to`, which sleeps until the pathfinder answers. `explore` tests up to `CREW_NPC_EXPLORE_TRIES` (4) rooms, and more when a room is skipped as locked; `force_door` up to `CREW_NPC_DOORS_TRIED` (3) doors. Each test is a full route search of up to 250 tiles.

While they sleep, the window can send another tool call, and the server takes it: a `step_aside` because someone asked the body to move, an order from someone it answers to that drops what it is doing (`orderToDrop`), "leave" from its head (`dropToLeave`). That call starts its own walk or errand. Then the slow tool wakes up and calls `start_walk` (explore) or `start_errand` (force_door) as if nothing had happened. `start_walk` cancels the errand; it replaces the newer walk. The newer call is never reported: `walk_finished` returns early for a walk that has been replaced ("A newer walk has replaced this one; it will report for itself"), and `cancel_errand` reports nothing by design.

`go_to_door` does the same, though it is not started with `INVOKE_ASYNC`: `tool_go_to_door` (`crew_npc_doors.dm:298`) tests up to three doors with `get_path_to` (`crew_npc_doors.dm:373`), which sleeps in `UNTIL` (`code/__HELPERS/paths/path.dm:29`), and then calls `start_walk(best_spot, CREW_TOOL_TO_DOOR, ...)`. Since `ui_act` is run as a queued verb callback, a second `ui_act` for the same body is taken while the first sleeps.

The guards that are there stop only a second call of the same tool (`choosing_where_to_explore`, `finding_door_to_force`, `finding_door`). There is an `errand_serial` for errands, but nothing like it covers tool calls as a whole.

How often the window can send that second call: `drive()` (`driver.ts`) sets `brain.driveAfter` to 2.5 seconds (`SETTLE_MS`) after any step it issues, 5 seconds (`IDLE_GAP_MS`) after an idle `explore`, and issues nothing before then, `step_aside`, `orderToDrop` and `dropToLeave` included. So through `drive()` alone the race needs the route tests to take longer than that, which happens only when the server is lagging or the pathfinder is backed up. The ungated way in is a tool the model agrees to when someone speaks: `brain.ts` runs those with `runTool` at once (around line 1512, a `go_to` to lead someone, a `walk_to`), and the `hears` request a few lines later (`runTool(brain, request)`). Those land whenever the model's answer comes back, with no regard to `driveAfter`.

One concrete case. A janitor in a job step is sent to `go_to_door` the Bar, or told to `explore`. While the route tests run, a visitor who spoke a few seconds earlier gets the model's answer: the janitor agrees to lead them to Medbay, and `runTool` sends `go_to`. `tool_go_to` starts a walk to Medbay. The route test comes back and the older tool calls `start_walk` for its own target, replacing the walk to Medbay; the visitor is never led and no result for `go_to` comes. The same with a step aside when the server is slow: the window sends `step_aside`. `tool_step_aside` starts a walk to a spot a tile away. The route test comes back and `tool_explore` calls `start_walk(destination, CREW_TOOL_EXPLORE, ...)`. The janitor walks off to explore (or, because of CORE-01, keeps heading for the step-aside spot while the walk leaf waits for the far room). The step aside is never reported, so the window's `lastAct` for it is only dropped after `LOST_ACT_MS` once the body stops walking, and the step goes into back-off as a failure.

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
3. The same in `tool_force_door`, around the route-testing loop, before it starts its walk or errand, and in `tool_go_to_door` before its `start_walk`.
4. Any later tool that sleeps before acting should follow the same pattern. Note it in the comment on `handle_tool_call`.
5. Where to bump the count: after the `can_sense()` and `in_hand_until` refusals and the `islist` fix-up, just before `switch(tool)`, so a refused call does not cancel a slow tool. `INVOKE_ASYNC` runs `tool_explore` and `tool_force_door` up to their first sleep at once, so the `serial` they keep already includes their own call. Take the snapshot at the very top of each slow proc, before its `choosing_where_to_explore` / `finding_door_to_force` / `finding_door` test, and check it after every `get_path_to` return that leads to `start_walk`, `start_errand` or an `action_result`, not only the last: a late "You cannot find a way to ..." result is harmless (the window matches results by tool, `noteResult` in `driver.ts`) but a late walk is not.
6. A slow tool dropped this way after a call that `drive()` did not issue (the model's `runTool` path) leaves the window's `lastAct` on the slow tool; it lapses after `LOST_ACT_MS` into back-off, which is acceptable. Do not send a failed result for it instead: that puts the step in back-off at once.

## How to test the fix

- Server compile.
- The window's 2.5 to 5 second gap after each step makes this hard to hit by hand. To see it, put a `sleep(5 SECONDS)` in `tool_explore` after `pick_somewhere_new()` on a throwaway test build (not committed), then in a round wait for a janitor to start exploring and ask it to step aside, or ask it to lead you somewhere. It should step aside and stay, not walk off. Grep `game.log` for the new "gave up exploring: a newer order came" line.
- Without the fix, the same test shows the explore walk starting after the step aside.

## Check

Checked by Opus 5.5. The quotes match the code. `tool_explore` and `tool_force_door` are started with `INVOKE_ASYNC` (`crew_npc_tools.dm:34`, `:63`); `pick_somewhere_new` and the loops in `tool_force_door` (`crew_npc_forcing.dm`) and `tool_go_to_door` (`crew_npc_doors.dm`, `get_path_to` in the door loop) sleep in `get_path_to`'s `UNTIL` (`path.dm:29`); `ui_act` runs from a queued verb callback (`tgui.dm:360`, `on_act_message`), so a second `tool_call` is handled while the first sleeps. `start_walk` replaces the walk target and `walk_finished` returns at once for a replaced target, so the newer walk is never reported. Nothing in the change log or plans covers it. The write-up's case was too easy, though: `drive()` in `driver.ts` will not issue any step, `step_aside` and the drops included, until `driveAfter` (2.5 s after a step, 5 s after an idle explore), and route tests on the pathfinder (`SSpathfinder`, `wait = 0.5`) normally finish well inside that. The real ungated way in is `runTool` in `brain.ts`, which sends a tool the model agreed to (a `go_to` to lead someone) as soon as the answer arrives. Mended the case, the test and the fix's details. Kept medium (a request or a lead lost without a word, rarely); confidence lowered to likely because the timing was not measured.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 4cf71442a2a.

- CORE-07: part done. New tool_serial (crew_npc_controller.dm) goes up in handle_tool_call for every call carried out except say and hold, and except a repeat call to a tool still testing routes. explore and go_to_door do nothing more if it moved while they tested routes (shared with LIFE-03). Left: crew_npc_forcing.dm tool_force_door: the same guard, as written under LIFE-03 item (1).

Round two (branch crew-bug-fixes-medium): 8e156ed55d1. This finishes the parts left above, apart from any step that waits on the owner.
