---
id: PERF-04
title: Nothing measures what the crew costs the server, and the round's perf csv cannot show it, so a forty-crew round would show only lag with no cause
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: logs
files: code/controllers/subsystem/time_track.dm:126, code/modules/llm_crew/crew_brain_link.dm:76, code/modules/llm_crew/crew_npc_senses.dm:127
fix: Count the time and the calls of ui_data, look_around and the sends to the window, and the bytes sent, and write them once a minute as one crew_cost line in game.log
---

## What is wrong

The owner wants to know whether forty crew will run on one PC. The only timing the server writes is `perf-<round>-<map>.csv`, from `SStime_track`, every 10 seconds. Its columns are time dilation, map tick, the number of timers, atmospherics, database queries, and the map-sending stats. None is the crew's, and there is no per-proc or per-subsystem time in it.

What the latest round's file says (`data/logs/2026/11/19/round-20.43.32/perf-NULL-MetaStation.csv`, 109 rows, 11 crew, one player):

- Time dilation (`tidi`): mean 1.16 %, highest 6.9 % (in the first two minutes, while the round settled), and mostly under 3 %.
- `num_timers`: 22 to 37 for most of the round, once 183. The crew's own timers are a handful.
- `maptick`: 0.05 to 0.95 % of a tick, creeping up over the round.

So at eleven crew the server as a whole is not straining, and that is all the file can say. It cannot say what part of that 1 % is the crew, and it will not say, at forty, whether lag comes from `ui_data` (PERF-02), the looks all landing in one tick (PERF-03), the sends to the window, or anything else. The crew's work runs in timer callbacks and `INVOKE_ASYNC`, which the MC's own subsystem costs do not break out either: `look_around` is counted under the timer subsystem, and `ui_data` and the sends under whatever proc emitted the event.

HOLE-09 step 1 proposes timing `ui_data`. This is the rest of what is needed to answer the owner's question with numbers instead of guesses.

## Where

`code/controllers/subsystem/time_track.dm:126`, the whole row written: `world.time`, clients, four time dilation figures, `MAPTICK_LAST_INTERNAL_TICK_USAGE`, `length(SStimer.timer_id_dict)`, atmospherics costs and counts, database counts, and the send-maps profile. Nothing else.

The crew's three heavy places, none of which counts itself:

- `code/modules/llm_crew/crew_brain_link.dm:76`, `ui_data`;
- `code/modules/llm_crew/crew_npc_senses.dm:127`, `look_around`;
- `code/modules/tgui/tgui_window.dm:245` (base), `send_message`, which `json_encode`s and `url_encode`s the payload (`TGUI_CREATE_MESSAGE`).

## How it was found

Read `time_track.dm` and the round's CSV (`awk -F, '{print $3}'` and the like over the 109 rows). Nothing else in `data/logs/2026/11/19/round-20.43.32` holds a time for any crew proc.

## How to fix it

1. Add a global counter datum, `GLOB.crew_npc_cost`, with for each of `ui_data`, `look_around`, `on_pre_hear` and `send`: the number of calls, the total time (`TICK_USAGE` before and after, summed with `TICK_DELTA_TO_MS`), and the highest single call; plus the bytes sent (`length(json_encode(data))` in `ui_data`, which is paid anyway by the send).
2. Wrap each of the three procs: read `TICK_USAGE` at the top, add to the counter at every return. For `look_around`, which has several early returns, wrap it as `look_around()` calling `look_around_now()`.
3. Once a minute (one looping timer on the brain link), write one line to `game.log`: `Crew cost: 11 crew, ui_data 265 calls 412 ms (max 4 ms), 9.2 MB sent; look_around 660 calls 380 ms (max 2 ms); heard 310 calls 20 ms`, and reset the counters.
4. Leave `time_track.dm` alone: it is base game, and a game.log line is enough for our own rounds.
5. Optional: put the same counts on the Crew Brain window's status bar, so the owner sees them while playing.

The numbers in step 3 are made up for the shape of the line; nobody has measured them.

## How to test the fix

- Server compile.
- Play a round of ten minutes with the standing crew and read the `Crew cost:` lines. Then spawn a second standing crew with the "Spawn Test Crew" verb (22 crew) and read them again: how the numbers grow from 11 to 22 is the best guide to 40 there is short of spawning 40.
