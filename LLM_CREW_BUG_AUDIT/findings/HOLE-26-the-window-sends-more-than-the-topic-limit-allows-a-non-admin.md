---
id: HOLE-26
title: The brain window sends the server two to three hundred calls a minute, over the game's topic limit, which only admins are spared, so an owner who deadmins, or any owner who is not an admin, has crew steps dropped and their own clicks refused
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: brain
files: code/modules/client/client_procs.dm:54, config/config.txt:413, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:743, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1777, code/modules/admin/holder2.dm:177, code/modules/llm_crew/crew_brain_link.dm:209
fix: Batch the window's traffic into one call per update (acks, tool calls and log records together), keep it under the game's limits by a margin, and decide with the owner whether a crew owner is exempt from the topic limit by a check in client Topic
---

## What is wrong

Every `act()` from a tgui window is a topic call from the owner's client. The game limits topic calls for anyone who is not an admin: 10 a second and 200 a game minute in the shipped config (`config/config.txt:413` and `:415`, "Admins are exempt from these limits"). Over the limit, the call is thrown away before tgui sees it, the player is told "Your previous action was ignored because you've done too many in a minute", and once a minute every admin gets "has hit the per-minute topic limit" with a kick link (`client_procs.dm:54`).

The Crew Brain window makes three kinds of call, each a topic: an `ack` for every NPC that had new events, on every update (`brain.ts:743`); a `tool_call` for every step (`brain.ts:1777`, `:801`); and a `brain_log` for every routine step and every model call (`brain.ts:1131`, `:1266`, `:1679`, `:1803`). In the round `data/logs/2026/11/19/round-20.43.32`, with eleven crew, `href.log` has 3,109 calls in about 15 minutes, nearly all from `tgui-window-1` (the Crew Brain): 280 in the game minute starting 02:45, 200 to 222 in four other minutes, and 39 in the single second 02:44:49.

Today the owner is an admin, so none of this is limited. It bites when:

- **The owner deadmins to play.** `deadmin` runs `disassociate`, which sets `owner.holder = null` (`holder2.dm:177`). From then on the limit applies. Past 200 calls in a minute, every tool call, ack and log record is dropped until the minute turns. The window does not know: a dropped `tool_call` is taken as sent, waited on for `LOST_ACT_MS` and marked failed; a dropped `ack` leaves the server's `acked_seq` behind, so `ui_data` keeps sending old events. The owner's chat fills with "Your previous action was ignored", and **the owner's own clicks on any window are refused too**, since the count is per client: a Captain who cannot open a door from the ID console, buy at a vendor or use the comms console. The admins are paged once a minute about the owner.
- Deadminning also takes the admin verbs away (`remove_admin_verbs`), so the "Crew Brain" verb to open the window again is gone until they readmin.
- **Any owner who is not an admin**, which is what the brief's "player-facing spawn UI and per-player limits" (section 8) and HOLE-10's hand-over both lead to.

The per-second limit is also hit by bursts: one look round that brings eleven bodies new events sends eleven acks at once, before any tool call.

## Where

`code/modules/client/client_procs.dm:54`, in `/client/Topic`, before `tgui_Topic` is reached:

    	var/mtl = CONFIG_GET(number/minute_topic_limit)
    	if (!holder && mtl)
    		...
    		if (topiclimiter[MINUTE_COUNT] > mtl)
    			var/msg = "Your previous action was ignored because you've done too many in a minute."
    			...
    				message_admins("[ADMIN_LOOKUPFLW(usr)] [ADMIN_KICK(usr)] Has hit the per-minute topic limit of [mtl] topic calls in a given game minute")
    			to_chat(src, span_danger("[msg]"))
    			return

`config/config.txt:413`:

    SECOND_TOPIC_LIMIT 10

    MINUTE_TOPIC_LIMIT 200

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:743`, in `ingest`, once for each NPC with new events on every update:

        act?.('ack', { npc: brain.id, seq: brain.lastSeq });

`code/modules/admin/holder2.dm:177`, in `disassociate` (run by deadmin):

    		owner.holder = null

## How it was found

Read from the code and the config, and counted in `href.log` of `round-20.43.32` (`grep "HREF" href.log | awk '{print substr($2,1,5)}' | sort | uniq -c`). Not seen to bite: the owner has been an admin in every round. Not checked whether `href.log` lists every act or only some, so the real rate may be higher. Not checked: whether tgui sends other calls of its own (pings) that also count.

## How to fix it

1. Send one call per update, not one per thing. In `ingest`, collect every NPC's ack, every tool call and every log record made in that pass into one `act('batch', { acks: {...}, calls: [...], logs: [...] })`. In `crew_brain_link/ui_act`, add a `batch` action that runs each part through the code that handles it now (`find_npc`, `handle_tool_call`, the `ack` clamp, `write_brain_log`). Keep the per-body rate limit and the log limit as they are.
2. Hold the batch to at most one call every half second (a short timer in the window), so a burst of updates is one call. That is under 2 a second and 120 a minute.
3. Question for the owner: should owning crew exempt a client from the topic limit? If yes, test for it in `/client/Topic` next to `!holder` (`GLOB.crew_brain_links[ckey]` with NPCs in it). That is a base-game edit; step 1 and 2 avoid needing it.
4. Give the Crew Brain verb (and the spawn verbs, if wanted) to the owner by ckey rather than by admin rights, so a deadminned owner can reopen the window.
5. Whatever is chosen, when the window's act is refused the window should know. Until then, log on the server when an owner of crew hits the topic limit (`log_game` with "Crew Brain owner").

## How to test the fix

- Type check and server compile.
- In a round: deadmin with the crew running and count "Your previous action was ignored" lines in chat and `topic limit` lines in `game.log`, before and after.
- After the fix, `href.log` should show about two calls a second from the Crew Brain window.
