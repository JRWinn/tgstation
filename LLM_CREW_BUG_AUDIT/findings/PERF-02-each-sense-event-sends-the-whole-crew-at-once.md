---
id: PERF-02
title: Each sense event sends the whole crew's state at once, one update per event even when many come in one tick, about 150 KB each at 11 crew and 600 KB at 40, 90 percent of it old events
kind: bug
severity: high
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_brain_link.dm:55, code/modules/llm_crew/crew_brain_link.dm:201, code/modules/llm_crew/crew_npc_senses.dm:98, code/controllers/subsystem/tgui.dm:226, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:565
fix: Let on_sense_event ask for one update at the end of the tick instead of one at once, and send each body's events newer than its acked_seq only
---

## What is wrong

See also: HOLE-09 (the whole picture, unmeasured) and CORE-05 (the ack). This finding puts numbers on it from the latest round and a measurement of the window code, and adds the cheapest fix that HOLE-09 does not name: one update a tick, not one per event.

`emit_sense` calls `brain_link.on_sense_event`, which calls `SStgui.update_uis`. That does `INVOKE_ASYNC(ui, /datum/tgui/proc/process, ..., TRUE)`, which runs straight away: `ui_interact`, `try_update_ui`, `send_update`, `ui_data` for every body, `json_encode`, `url_encode`, and `output()` to the client. Nothing gathers events up. So:

- A line said in a room with eight crew is heard by seven of them, in one tick, and that is seven full rebuilds and seven full sends in that tick.
- The whole crew's looks fire in the same tick each second (PERF-03), so every "comes into view" event of that second lands in one tick as well.
- Each send carries every body's last 30 events in full (`"events" = npc.sense_events`), though the window skips every event at or below its own `lastSeq` (`brain.ts:566`). Only one or two of the thirty are ever new.

**How many updates.** In `data/logs/2026/11/19/round-20.43.32` (11 crew, 1,066 seconds from the first to the last brain log line), the highest `seq` in each body's acks adds up to 1,262 sense events, and `href.log` has 1,262 acks: one ack, so one update, for every event, never two events in one update. Every update the window gets then makes it send an ack, and every ack and every tool call returns TRUE from `ui_act`, which makes one more full update each (CORE-05). With the tgui subsystem's own update every 0.9 seconds:

| cause | count in the round |
| --- | --- |
| sense events | 1,262 |
| acks (return TRUE) | 1,262 |
| tool calls (return TRUE) | 998 |
| tgui subsystem, every 0.9 s | about 1,184 |
| **full rebuilds and sends** | **about 4,700, 4.4 a second** |

**How big.** The size of one update was not logged. I measured it with the window's own types: a throwaway script built a payload of N bodies shaped as `ui_data` builds them (four people in view, a few things, the PDA list of everyone aboard plus ten more, thirty events of the three commonest kinds at their real lengths) and called the real `ingest` on it, with `fetch` stubbed out so no model was called. Results (bun, this PC):

| crew | bytes per update | window time per update (parse and `ingest`) |
| --- | --- | --- |
| 11 | 147,249 | 0.9 ms |
| 40 | 605,744 | 3.9 ms |

About 12,000 of the 13,400 bytes a body are its thirty events. The window's own work is small; it is the server and the pipe that pay. At 4.4 updates a second that is about 650 KB a second `json_encode`d, `url_encode`d and pushed through `output()` today. At forty crew there are at least 3.6 times the events (more for speech, which every hearer reports), so some 13 updates a second of 600 KB: about 8 MB a second, on the same PC that runs the game and the model.

## Where

`code/modules/llm_crew/crew_npc_senses.dm:86`, `emit_sense`:

    	sense_events += list(event)
    	if(length(sense_events) > CREW_NPC_EVENT_HISTORY)
    		sense_events.Cut(1, 2)
    	brain_link?.on_sense_event(src)

`code/modules/llm_crew/crew_brain_link.dm:55`:

    /datum/crew_brain_link/proc/on_sense_event(datum/ai_controller/crew_npc/npc)
    	SStgui.update_uis(src)

`code/modules/llm_crew/crew_brain_link.dm:200`, in `ui_data`:

    			"acked_seq" = npc.acked_seq,
    			"events" = npc.sense_events,

`code/controllers/subsystem/tgui.dm:223` (base): `INVOKE_ASYNC(ui, TYPE_PROC_REF(/datum/tgui, process), wait * 0.1, TRUE)`; with `force` TRUE, `process` calls `src_object.ui_interact(user, src)` and so `send_update()` at once.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:565`, in `ingest`:

    for (const event of npc.events) {
      if (event.seq <= brain.lastSeq) {
        continue;
      }

## How it was found

Read from the code; the counts from `href.log` of `round-20.43.32` (`grep -c "Action: ack"`, `grep -c "Action: tool_call"`, and the highest `seq` per body summed); the sizes and window times from a throwaway bun script in the session's scratch folder that imports `brain.ts` and `memory.ts` and calls `ingest` 200 times for 11 and for 40 bodies. The server time spent in `ui_data`, `json_encode` and `output()` was not measured: that is why this is `likely`.

## How to fix it

1. **One update a tick.** In `/datum/crew_brain_link`, add `var/update_due = FALSE`. In `on_sense_event`, do nothing if `update_due`; otherwise set it and `addtimer(CALLBACK(src, PROC_REF(send_due_update)), 1)`. `send_due_update` clears the flag and calls `SStgui.update_uis(src)`. Seven hearers of one line, or ten bodies seeing the Captain walk in, then cost one rebuild. The delay is a tenth of a second, which nothing in the window is timed that finely against.
2. **Only the new events.** In `ui_data`, send `npc.sense_events` from the first one whose `seq` is greater than `npc.acked_seq`. The window must not lose events it has not acked: it acks only after taking them in, so anything not acked is still sent. One thing reads other bodies' old events: `nearestToSpeaker` in `brain.ts` looks for the same line among the other bodies' `events`. Give it its own short list instead: in `ingest`, keep a module-level list of `{speaker, message, at, npc, distance}` for lines heard in the last `SAME_LINE_DS`, filled as events are read, and search that. Check ASYNC-01, which is about the same function, before changing it.
3. **Do not answer an ack or a tool call with an update** (CORE-05): return FALSE for both. Every tool that does anything ends in `action_result`, which is an event and so an update by step 1.
4. Keep the subsystem's own update every 0.9 seconds: the window learns that a body has walked into a new room, or that someone is in view, only from it, since neither is an event.

With all four, the round above would have had at most about 2,400 sends instead of 4,700 (no more than one a tick for the 1,262 events, plus the subsystem's 1,184), of about 15 to 20 KB each instead of 150 KB.

## How to test the fix

- Server compile; type check and lint the window code.
- The simulator plays the server and sends all thirty events itself (`sim.ts`, `events: [...body.events]`): change it to send only those past `acked_seq` as well, and run the `crew` scenario four times before and after. Nothing the brains do should change.
- In a round, add a debug counter to `ui_data` (calls a minute, and `length(json_encode(data))` once a minute) and read it in `game.log`: with eleven crew the calls a minute should fall from about 265 to 135 or fewer, and the size to about a tenth.
- Watch that greetings and answers still come: a body must still hear every line said to it.
