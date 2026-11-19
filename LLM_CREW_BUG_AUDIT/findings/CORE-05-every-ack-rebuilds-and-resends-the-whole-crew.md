---
id: CORE-05
title: Every ack the window sends makes the server rebuild and resend every body's whole state, though nothing the window shows has changed
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_brain_link.dm:221, code/modules/tgui/tgui.dm:400, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:741
fix: Return FALSE from ui_act for ack, as brain_log already does, since the window already knows the number it has just sent
---

## What is wrong

See also: HOLE-09, which counts the updates and proposes the larger rework, and PERF-02, whose fix step 3 is this one. This one is a two-line saving that can go in on its own.

The window sends `ack` each time it has taken in new events for a body (`brain.ts:741`). In `ui_act` the `ack` branch ends `return TRUE`. The base `on_act_message` calls `SStgui.update_uis(src_object)` whenever `ui_act` returns TRUE, which rebuilds `ui_data` for every body (forty-odd procs each, see HOLE-09 and CORE-04) and sends it all again. The only thing that changed is `acked_seq` on one body, and the window is the one that sent it.

So every sense event costs two full rebuilds: one from `emit_sense` → `on_sense_event`, and one from the ack that follows. The window then runs `ingest`, `syncTasks` and `drive` for every body again on the second one too. `round-20.00.21`'s `href.log` has 1,204 acks in about 17 minutes (HOLE-09's count), so about 1,200 rebuilds of the whole crew for nothing.

`tool_call` also returns TRUE for every call, including ones the rate limit dropped and the `hold` the window sends each time a body is queued to talk (`stopToTalk`). Those that changed nothing could return FALSE too, but which tool changed what the window shows is harder to say, and the action result each sends already causes its own update. Returning FALSE for `tool_call` as well is worth trying once the `ack` change is in.

## Where

`code/modules/llm_crew/crew_brain_link.dm:221`:

    		if("ack")
    			var/seq = params["seq"]
    			if(!isnum(seq))
    				return FALSE
    			npc.acked_seq = clamp(round(seq), npc.acked_seq, npc.next_event_seq - 1)
    			return TRUE

and, beside it, the right shape:

    		if("brain_log")
    			write_brain_log(npc, params)
    			// Nothing the window shows has changed.
    			return FALSE

`code/modules/tgui/tgui.dm:400` (base):

    	if(src_object.ui_act(act_type, payload, src, state))
    		SStgui.update_uis(src_object)

## How it was found

Read from the code. The count of acks is HOLE-09's, from `href.log` of `round-20.00.21`.

## How to fix it

1. In `ui_act`, make the `ack` branch `return FALSE`, with the same comment as `brain_log`.
2. Check the window does not wait for an update after acking: it does not (it sets `brain.lastSeq` itself before sending).
3. Optionally, for `tool_call`, return FALSE as well: every tool that does anything ends in `action_result`, which calls `emit_sense` and so `update_uis` already. Check `tool_rest` and `tool_hold`, which emit nothing: `resting` would then reach the window on the next once-a-second update instead of at once, which is fine.

## How to test the fix

- Server compile.
- Run a round for five minutes before and after, and compare the number of `update` messages: the tgui debug log, or a counter added to `ui_data` for the test. Expect about half.
- The simulator plays the server itself, so it does not test this.
