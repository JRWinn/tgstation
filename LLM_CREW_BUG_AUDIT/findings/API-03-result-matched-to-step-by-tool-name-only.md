---
id: API-03
title: The driver takes any result with the same tool name as its own step's, so a walk or an order the LLM sent is read as the driver's step having gone
kind: bug
severity: medium
effort: medium
confidence: sure
status: duplicate
found_by: Opus 5.5
duplicate_of: ASYNC-02
area: core
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:945, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1512, code/modules/llm_crew/crew_npc_tools.dm:129, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1916, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:654
fix: Send a step number with every tool call the driver makes, have action_result echo it in details, and have noteResult act only on a result that carries the number of lastAct
---

## What is wrong

See also: ASYNC-02, written a few minutes before this by another reviewer, which keeps the write-up. The same fault and the same fix; nothing here adds to it beyond the late `order` results from `supply_run_step` and `order_arrived`, which ASYNC-02 also names.

A tool call carries no id, and an `action_result` names only the tool. `noteResult` decides that a result is the outcome of the driver's last step by the tool name alone:

    if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
      return;
    }

But the driver is not the only sender. The LLM's chosen move goes out through `runTool` in `think` with no `lastAct` of its own (brain.ts:1512), and on the server a newer walk or errand silently replaces the older one (`walk_finished` returns early when "a newer walk has replaced this one"; `start_errand` cancels the last). So when the LLM sends the same tool the driver is waiting on, the driver's step is never reported, and the LLM's step's result is taken as the driver's. The job's `afterActing`, `meetingsAfterActing`, `pickupsAfterActing` and the rest then run with the driver's `act` and `task` and the LLM step's `ok`.

Two cases where it bites:

1. A janitor called to a staff meeting is walking there (driver `lastAct = { tool: 'go_to', act: { place: 'Bar' }, task: <summons> }`). Someone stops it and asks to be shown to Medbay. The LLM is offered `go_to` (options.ts) and takes it. The server starts the walk to Medbay; the Bar walk ends unreported. "You arrive in Medbay." comes back with tool `go_to`, ok TRUE. `meetingsAfterActing` sees `act.place === summons.room` and `ok`, and sets `summons.toldArrivedAt`, so the janitor counts as at the meeting the moment its head is in sight, wherever it is. `failures` for the Bar walk is cleared as a success too.
2. A cargo technician is on its way to the console with an order the Quartermaster gave it (`task.kind === GIVEN`). A head who has said the Quartermaster did not answer (`qmSilent`) asks it for something, and the LLM takes the `order` move. The head's order replaces the errand. Its "You order ... at the supply console" result is read as the Quartermaster's order being placed: `given.placed = true` (cargo.ts:1916), and the Quartermaster's book goes on to wait for a crate that was never ordered.

The same holds for any late result the server sends under a tool name with no call behind it: `supply_run_step` and `order_arrived` send `order` results minutes after the call.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943`, `noteResult`:

    const last = brain.lastAct;
    if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1766`, `runTool`, used for the LLM's moves, sets no `lastAct` and sends no id:

    act('tool_call', { npc: brain.id, tool: serverTool, args });

`code/modules/llm_crew/crew_npc_tools.dm:129`, `action_result`:

    var/list/details = list("tool" = tool, "ok" = succeeded)

`code/modules/llm_crew/crew_npc_tools.dm:409`, `walk_finished`:

    // A newer walk has replaced this one; it will report for itself.
    if(blackboard[BB_CREW_NPC_WALK_TARGET] != target)
        return

## How it was found

Read from the code on both sides. Not seen in a round log; the first case needs the LLM to agree to lead someone while the driver is mid-walk, which the options allow.

## How to fix it

1. Window: give `NpcBrain` a counter. In `drive`, before `issue(step.act)`, set `step.act.step = ++brain.stepSerial` (or pass it alongside), and keep it in `lastAct.serial`. `runTool` passes `args` through, so the server gets `args.step`.
2. Server: keep the step number of the call that started the current walk, errand or search on the controller (`current_step`), set in `handle_tool_call` from `arguments["step"]` when it is a number, and add it to `details` in `action_result` as `"step"`. Results the server makes on its own, with no call behind them (late order results, the auto-clean after a pick up), carry none.
3. Window: in `noteResult`, act only when `event.details.step === last.serial`. A result with no step, or another step, is still shown to the LLM as now but does not touch `lastAct`.
4. Keep the `LOST_ACT_MS` fallback for a step whose result never comes.
5. Simpler stop-gap if the above is too much now: in `think`, do not run an LLM move whose tool equals `brain.lastAct?.tool`, or clear `lastAct` (without failing it) when the LLM sends a move that replaces it. That stops the false success but loses the driver's step silently.

## How to test the fix

- Simulator: add a scenario in `tools/llm_crew/sim.ts` where a janitor walking to a meeting is asked the way; check that `summons.toldArrivedAt` stays null until it reaches the meeting room.
- Type check the window and compile the server.
- In a round, grep `crew_brain.log` for ROUTINE `go_to` records followed by an LLM `go_to(...)` in the next decision, and check the meeting outcome.
