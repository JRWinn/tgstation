---
id: SIM-04
title: The stand-in server never gives most of the failures the real tools give, so the window code that handles them has never run
kind: gap
severity: medium
effort: large
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:521, code/modules/llm_crew/crew_npc_tools.dm:10, code/modules/llm_crew/crew_npc_motor.dm:94, tools/llm_crew/sim.ts:1091
fix: Give the stand-in a per-tool table of the real failures and a FAULTS switch that makes a named one happen, then add one scenario per job that runs with faults on
---

## What is wrong

`toolCall` in `sim.ts` answers each of the 35 tools it knows. For each, the real proc in `code/modules/llm_crew/` was read and its `action_result(..., FALSE, ...)` lines listed. Most of those failures are never given by the stand-in, in any scenario. The window code has branches for many of them (some are the subject of other findings), and none of those branches has ever been run end to end.

The whole-body failures first, because every tool has them:

| Real failure | Where | In the stand-in |
| --- | --- | --- |
| "Your body is not responding." (asleep, knocked out, dead) | `handle_tool_call` | never: `awake: 1` always (`sim.ts:1091`) |
| "You are trying to do too many things at once. Slow down." then silence, past 8 calls in 10 seconds (`say` and `hold` count) | `tool_call_allowed` | never. An instrumented run of `quiet qm`, `chatty crew`, `chatty warrant` and `quiet engine` showed no body going over 8 today, so this is only a hole, not a fault |
| A body that is hurt, stunned, cuffed by a player, or pulled away mid-walk | everywhere | never, outside the security scenarios' own arrests |
| A person seen as `down: 1` | `people_in_view` | never: `down: 0` always |

Then tool by tool. "Never" means no scenario can produce it; "one" means a single scenario fakes it.

| Tool | Real failures the stand-in never gives |
| --- | --- |
| `say` | "You only just spoke" (4 second cooldown), the word filter, "You try to speak but cannot". The stand-in gives no result for `say` at all, so `BRAIN-04` (a refused line counted as said) cannot show |
| `message` | no PDA, name not on the PDA, PDA will not send: see `SIM-01` |
| `go_to` | "it was taking too long" (the 3 minute timeout), "you were interrupted", "You cannot work out the way back to", a loose name matched to another room. Only "there is no way through" is given |
| `walk_to` | "the person you were heading for is gone", "near enough to talk" |
| `explore` | the real one runs `INVOKE_ASYNC` and tests routes for some seconds before the body shows as walking; the stand-in is busy at once. A gap of over 12 seconds with nothing walking or doing trips `LOST_ACT_MS` in `driver.ts`, so the step is failed while the server is still choosing |
| `order` | "You cannot think where there is a supply console", the console with no power (`RT-04`), "has still not come" after 6 minutes, "The supply shuttle will not leave", "docked, but you cannot see what you ordered". And the arrival is only told to a body standing at its post (`crew_npc_cargo.dm:439`); the stand-in tells it wherever it is, 20 seconds after the order, where the real shuttle takes minutes |
| `release`, `collect_crate`, `unload`, `recycle`, `take_back`, `stow_crate` | the grip lost on the way, someone standing in the way (`in_the_way`), the regrip, the crate put clear, `gave_up`. Only `qmstuck` fakes one `gave_up`, on `unload` |
| `open_door` | "The door will not open for you" (bolted, welded, no power, emagged), "You cannot see which door", "Whoever wanted the door has gone" |
| `go_to_door`, `knock` | a door the planner cannot reach, the fire-door report on the way |
| `throw_out` | "they got away from you" mid-haul |
| `step_aside` | "There is nowhere here to step aside to", a step that comes to nothing |
| `reset_alarm` | an alarm that cannot be reached, or will not reset |
| `get_kit` | lockers locked or empty (`nobaton` covers the baton only, as "nothing") |
| `arrest` | "You do not know how you meant to go about it" (a bad `how`), cuffed already, down already, "You cannot arrest yourself", the target walking off in the fight; the stand-in treats any `how` that is not `quiet` or `stop` as a hit-free arrest that works |
| `jail` | "no_hold" (the pull broken on the way), "got_away" with where they were last seen. `badcell` covers one refused cell door |
| `work_machine` | "That is not something you can do with the X" (a `how` that kind of machine does not take; the stand-in takes any), no wrench, no free hand, cannot reach, "may have no power", the air alarm locked. `enginestuck` covers "will not connect" only |
| `force_door` | not in the stand-in at all: the default answer "Your body does not know how to do that." So `jobs/forcing.ts` (an engineer forcing a door for security) has never run, and no scenario has a locked room for it to force |
| `rest`, `put_down`, `give`, `grenade` | not in the stand-in. `rest` gets "does not know how" at once where the real one gives no answer at all and the driver waits out `LOST_ACT_MS` |

And state the stand-in sends that is never in its failed form:

- `engineering.reading` is never null. The real one is null with no PDA network, which is the case from the moment station power goes (`engine_reading`, `crew_npc_engineering.dm:105`). `KNB-11` is the window fault this hides.
- `has_pda` is always 1, `pda_people` lists every NPC aboard whether or not they could be reached.
- `seen.full` is sent for every machine; the real server sends it for pumps only.

## Where

`tools/llm_crew/sim.ts:521`, `toolCall`, and its `default:` case:

    default:
      return result(body, tool, false, 'Your body does not know how to do that.');

`code/modules/llm_crew/crew_npc_tools.dm:10`, `handle_tool_call`, for the whole-body checks; `crew_npc_motor.dm:94` for the walk's reasons:

    if(world.time - started_at > (crew_controller.walk_timeout || CREW_NPC_WALK_TIMEOUT))
        fail_reason = "it was taking too long"
    ...
    fail_reason = crew_controller.walk_tool == CREW_TOOL_EVICT ? "they got away from you" : CREW_NPC_GRIP_LOST

The rest are the `action_result(..., FALSE` lines in each tool's proc.

## How it was found

Read from the code: every case of `toolCall` against the tool proc it stands for. The rate-limit and say-cooldown counts were checked by running an instrumented copy of `sim.ts` (outside the repo, `BRAIN=` pointed at the real window code) over the four scenarios named above; it counted every tool call per body in the server's own 10 second windows, and every `say` within 4 seconds of the last. All were zero.

## How to fix it

1. Make a table in `sim.ts`, one entry per failure: `{ tool, name, words, details }`, with the words copied from the real proc so the window reads them as it would in the game. Keep it next to `toolCall`, with the real proc's file and name beside each, so a change to a proc can be carried over.
2. Add `FAULTS=` (a list of names, or `all` with a rate such as `FAULT_RATE=0.2`, from a seeded random source: see `GAP-22`). `toolCall` looks the tool up and, when a fault is due, answers with it instead of the normal outcome, after the same delay the real one would take.
3. Add the whole-body faults as timed events a scenario can set: `knockedOut(body, from, until)` (awake 0, every tool "not responding"), `pdaDown(from, until)` (`SIM-01`), `powerOut(from)` (PDAs down, reading null, consoles and door timers dead).
4. Add `force_door`, `rest` (no answer), `put_down` and `give` to the stand-in, each with its real outcomes.
5. For each job, one scenario that runs with `FAULTS=all FAULT_RATE=0.2` and checks only what must hold whatever goes wrong: nobody loops on one step more than a set number of times, nobody stands with a step outstanding for more than two minutes, everyone owed word gets it or is told it could not be sent, and the run ends with no task stuck in progress.

Step 5 will fail at first. Each failure is a fault in the window code, to be written up and fixed against its job, not against the simulator.

## How to test the fix

`sim.ts quiet crew` and the other scenarios with no `FAULTS` must give the same results as before. With `FAULTS=go_to:taking_too_long` a scenario must show the window getting the real words. Then the per-job fault scenarios, run ten times each with different seeds, the failures counted and written down.
