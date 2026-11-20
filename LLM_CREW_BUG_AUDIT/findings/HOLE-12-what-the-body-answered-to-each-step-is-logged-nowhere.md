---
id: HOLE-12
title: The logs say what each crew member was told to do and almost never how it went, so a round cannot be read back
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: logs
files: code/modules/llm_crew/crew_npc_tools.dm:129, code/modules/llm_crew/crew_npc_senses.dm:86, code/modules/llm_crew/crew_npc_tools.dm:116, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1785, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943
fix: Write every action result to the round's crew brain log from the server, with the tool, whether it went, and the words, and log tool calls the rate limit drops
---

## What is wrong

The owner tests by playing a round and reading the logs after. Every entry in the change log is built on that. The logs hold half of each step.

- **What was asked for is logged.** Each step the driver takes is a `ROUTINE (no LLM)` record in `crew_brain.log` (`logRoutine`), with where the body was, what it held, why, and the tool call.
- **What came of it is not.** The server's answer to a tool call is a sense event made by `action_result`. `action_result` and `emit_sense` write to no log. The crew's server code has about 170 calls of `action_result` and about 50 of `log_game`; most of the 50 are in security and doors. So whether a `pick_up`, `clean`, `tidy`, `search`, `give`, `order`, `note`, `work_machine` or `message` went, and the words the body was told ("You cannot reach it", "There is nothing here you can clean with what you hold"), is in nobody's log. In the window, `noteResult` takes the answer, puts the step in backoff if it failed, and logs nothing.
- **The one place results do show** is inside the next model call's context, as lines of the report, and only if the model happens to be woken while they are among the last ten lines. Steps taken by code are most of what a body does.

Other things that leave no trace:

- **A tool call dropped by the rate limit.** `tool_call_allowed` answers the ninth call in ten seconds with "Slow down" and drops the rest "quietly". The window believes it issued the step, waits `LOST_ACT_MS` (12 seconds), and marks it failed. Neither side logs it. (The call's arrival is in `href.log`, since the base game logs every window action there, which is not where anyone looks.)
- **A brain log record over the limit** (see HOLE-09, point 2).
- **"Your body is not responding"** (asleep, dead, the controller switched off) and "Your body does not know how to do that".
- **Why a task came or went.** `syncTasks` adds and finishes tasks on every update. The log shows steps, never "task added: clean the Bar, told by X" or "task dropped: the mess is gone". When a body does nothing, the idle step lists "what stands in the way" for up to four tasks, which helps, but a body that is waiting (`return null` in `nextStep`) logs nothing at all, for as long as it waits.
- **The window opening and closing** (see HOLE-02).

One concrete case of what this costs, from the change log itself: "**Which step of taking the baton out failed is not known**: ... the log said no more than that" (the 20:53 entry), and "Crates the owner pushed about were hauled again, but the logs do not say where to" (line 255). Each time, a `log_game` line was added for that one tool after the round was lost. Logging the result of every tool in one place ends that.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:129`:

    /datum/ai_controller/crew_npc/proc/action_result(tool, succeeded, text, list/extra_details)
    	...
    	var/list/details = list("tool" = tool, "ok" = succeeded)
    	if(extra_details)
    		details += extra_details
    	emit_sense(CREW_SENSE_ACTION_RESULT, text, details)

`code/modules/llm_crew/crew_npc_tools.dm:123`, `tool_call_allowed`:

    	// Say so once per window, then drop the rest quietly so a runaway brain cannot flood its own senses.
    	if(tool_calls_in_window == CREW_NPC_TOOL_CALL_LIMIT + 1)
    		action_result(null, FALSE, "You are trying to do too many things at once. Slow down.")
    	return FALSE

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1785`, `logRoutine`, sends the record when the step is taken. `tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943`, `noteResult`, hears how it went and sends nothing.

## How it was found

Read from the code, and from reading `crew_brain.log` and `game.log` of `data/logs/2026/11/19/round-20.00.21`: the brain log's records are `ROUTINE` steps and model calls, with no record kind for a result.

## How to fix it

Do it on the server, in one place, so that it cannot be dropped by the window's own limit and is there even when the window is not.

1. In `action_result`, after `emit_sense`, write one line to the round's crew brain log with the same writer `write_brain_log` uses: `rustg_log_write("[GLOB.log_directory]/crew_brain.log", json_encode(list("npc" = npc_id, "name" = body.real_name, "kind" = "result", "tool" = tool, "ok" = succeeded, "text" = text, "at" = AREACOORD-style place)), "true")`. Same file, so that step and answer read in order. Keep `details` out of it except `tool` and `ok`: some are long.
2. Do the same for the other sense kinds that change what a body does and are rare: `pda_message` is already in `pda.log`; add `knowledge` events (arrested, put out of a room, let in, out of the pipes), which are few. Leave out `person_in_view` and `speech_heard`: they are many, and speech is in `game.log`.
3. In `tool_call_allowed`, when a call is dropped, `log_game` once per counting window: "Crew NPC X sent more than 8 tool calls in 10 seconds: N dropped", with the tools' names.
4. In the window, when `nextStep` returns null because the body is waiting on something (`plan.wait`), log one `ROUTINE` record the first time for that task and step text, and not again until the text changes. Keep a `brain.lastWaitLogged` string for that.
5. In `syncTasks` in `tasks.ts`, where a task is added or finished (`addTask`, `finishTask`, `dropTask`), push a short line onto a per-brain list that `logRoutine` sends with the next record as a new field `tasks_changed`. No extra records, so the limit is not strained.
6. Tell `README.md`'s "Reading round logs" section about the new `kind`.

The base game's `href.log` gets a copy of every window action, payload and all: 741 brain log records, 940 tool calls and 1,204 acks in the 17 minutes of that round, 1.4 MB. That is the base game's doing (`log_tgui` in `/datum/tgui/proc/on_message`) and harmless, but it means the brain log is written twice. It is not worth a base-game edit to stop.

## How to test the fix

- Server compile and type check.
- Play five minutes. In `crew_brain.log`, every `ROUTINE` record with a tool call in `reply` should be followed, for the same `npc`, by a `"kind":"result"` record. Count them: `grep -c '"kind":"result"'` should be close to the count of `ROUTINE` records that are not `say(`.
- Send nine tool calls in ten seconds from the simulator's side is not possible (it plays the server): check step 3 by reading `game.log` after a busy round.
