---
id: PERF-01
title: href.log and href.log.json are 99 percent crew traffic, every brain log record written there in full a second time, past the trim and the rate limit
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: logs
files: code/modules/tgui/tgui.dm:356, code/modules/llm_crew/crew_brain_link.dm:227, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:743, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1803
fix: Send acks for all crew as one act per update, stop sending a ROUTINE brain log record that repeats the last one for that body, and ask the owner whether tgui may skip logging the payload of a crew brain link act
---

## What is wrong

See also: HOLE-12, which notes in passing that `href.log` gets a copy of every window action and calls it harmless. Measured, it is not small, and it grows with the crew.

Every message the brain window sends (`tool_call`, `ack`, `brain_log`) goes through the base `/datum/tgui/proc/on_message`, which writes it to `href.log` and `href.log.json` with its whole payload, before `ui_act` is even called. So:

- every brain log record is written twice, once trimmed to `crew_brain.log` and once in full to `href.log` (and a third time to `href.log.json`);
- the copy in `href.log` is not cut to `CREW_NPC_LOG_FIELD_LENGTH`, and it is written even for the records `write_brain_log` drops over `CREW_NPC_LOG_RECORD_LIMIT`;
- every `ack` (one per body per update that had news) and every `tool_call` is a three-line entry.

Measured in the latest round, `data/logs/2026/11/19/round-20.43.32` (11 crew, about 18 minutes from 02:44:49 to 03:02:35):

| | lines | bytes |
| --- | --- | --- |
| `href.log`, whole file | 9,297 | 1,512,630 |
| of it, entries about `/datum/crew_brain_link` | 3,040 entries | 1,502,614 (99.3 %) |
| `brain_log` action lines | 779 | 940,203 |
| `tool_call` action lines | 998 | 103,386 |
| `ack` action lines | 1,262 | 49,584 |
| `href.log.json`, whole file | 3,110 | 2,086,240 |
| of it, `crew_brain_link` entries | 3,040 | 2,064,857 (99 %) |
| `crew_brain.log` (for comparison) | 779 | 975,194 |

So about 85 KB a minute to `href.log` and 115 KB a minute to `href.log.json` with eleven crew, against 54 KB a minute of `crew_brain.log`. Everything here grows at least in step with the crew: at forty that is some 18 MB an hour to `href.log` and 25 MB an hour to `href.log.json`, every entry `json_encode`d on the server by the logger, for a copy nobody reads. The same records then crowd out everything a reader of `href.log` actually goes there for (a player's clicks): one line in 300 is not ours.

Much of it is the same line again. In `crew_brain.log`, 779 records hold 624 distinct ones once the time is taken off, and one record ("ROUTINE (no LLM) in Delivery Office, holding mop, bucket: You are cleaning up the mess her...") is there 36 times; the matching `tool_call {"npc":"npc5","tool":"clean","args":{}}` is in `href.log` 42 times, and `hold` calls for one person by one body up to 32 times.

## Where

`code/modules/tgui/tgui.dm:354` (base game), in `on_message`, for every `act/` message:

    	if(type && copytext(type, 1, 5) == "act/")
    		var/act_type = copytext(type, 5)
    		log_tgui(user, "Action: [act_type] [href_list["payload"]]",
    			window = window,
    			src_object = src_object)

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:741`, in `ingest`, one act per body:

    if (brain.lastSeq > startSeq) {
      changed = true;
      act?.('ack', { npc: brain.id, seq: brain.lastSeq });
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1785`, `logRoutine`: one `brain_log` act for every step the driver takes, whether or not it is the same step as last time.

`code/modules/llm_crew/crew_brain_link.dm:249`, `write_brain_log`: the trim to 6,000 characters and the cap of 40 records in 10 seconds, both of which come after the base game has already logged the untrimmed payload.

## How it was found

Counted in `data/logs/2026/11/19/round-20.43.32`: `grep -c "Action: brain_log" href.log`, the same for `ack` and `tool_call`, `wc -c` of each set of lines, and an awk pass summing the bytes of every `href.log` entry whose "Using:" line names `/datum/crew_brain_link`. The longest `brain_log` line in `href.log` is 9,558 characters. Nothing was played for this.

## How to fix it

1. **One ack per update, not one per body.** In `ingest`, gather `{id: lastSeq}` for each brain whose `lastSeq` moved, and after the loop send one `act('ack', { seqs })`. In `ui_act`, take `params["seqs"]` as an assoc list, check each key with `find_npc` and each value with `isnum`, and clamp as now. Return FALSE (see CORE-05). This also cuts the full rebuilds CORE-05 is about from one per body to none.
2. **Do not log a routine step that repeats the last one.** In `logRoutine`, keep the last `trigger` and `reply` sent for that brain (`brain.lastLoggedRoutine`). If both are the same, count it instead (`brain.routineRepeats++`) and send nothing; when a different step comes, send the new record with `"repeats": N` added to the previous one's count in its own field, or a line "(the step before was taken N more times)". `write_brain_log` needs a numeric `repeats` field passed through. The 36 identical records become one.
3. **Do not send a `hold` that is already in force.** `stopToTalk` sends `hold` every time a brain is queued and again when its call starts. Keep `brain.heldUntil` in the window (now + 4 s on each send) and skip the call while it is still in force for the same person.
4. **The base-game copy.** Ask the owner: may `on_message` in `code/modules/tgui/tgui.dm` skip the payload for a source object that asks it to? A one-line change: a var on `/datum` such as `var/tgui_log_payloads = TRUE`, set FALSE on `/datum/crew_brain_link`, and `log_tgui(user, "Action: [act_type][src_object.tgui_log_payloads ? " [href_list["payload"]]" : ""]", ...)`. The action name is still logged, so who did what stays traceable. If the owner does not want a base-game edit, steps 1 to 3 still take about half of it away.

## How to test the fix

- Type check and lint the window code; compile the server.
- Play a round of about fifteen minutes and compare with the table above: `grep -c "Action: ack" href.log` should be no more than the number of updates that carried events, `brain_log` lines should fall by the number of repeats, and with step 4 the `href.log` size per minute should be a few KB.
- `crew_brain.log` must still hold one record for every distinct step, with the repeat count where steps were folded.
