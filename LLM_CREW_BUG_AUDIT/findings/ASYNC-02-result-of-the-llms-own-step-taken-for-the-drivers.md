---
id: ASYNC-02
title: The answer to a step the LLM took is read as the answer to the driver's step, because answers are matched by tool name only
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1512, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1766, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1915, code/modules/llm_crew/crew_npc_tools.dm:129, code/modules/llm_crew/crew_npc_hands.dm:161
fix: Send a call number with every tool call, have the server put it on the action_result, and match noteResult on it, or at the least drop lastAct, without failing it, when the LLM sends a walk or errand (never on a say)
---

## What is wrong

The driver keeps one step it is waiting to hear about, `brain.lastAct`. When an `action_result` comes in, `noteResult` takes it to be the answer to that step if its `tool` is the same, and nothing else is checked: not the place, not the crate, not when it was sent. The server's `action_result` carries no number to say which call it answers.

But the driver is not the only one sending steps. `think()` sends the LLM's own steps (leading someone with `go_to`, an `order`, a `give`, whatever a job `offers`) through `runTool`, and so does the dead-model fallback in its `catch`. `runTool` does not touch `lastAct`. The server, given a second errand or walk, drops the first one without a word (`start_errand` bumps `errand_serial` and sets the new target; `cancel_errand` says nothing). So the answer that comes back is the answer to the LLM's step, and the driver takes it for its own: a step that never happened is counted as done, or one that went fine is counted as failed and held back for 20 seconds or more.

Concrete case, cargo:

1. The Quartermaster gives technician Ann order 7. Ann's plan (`cargo.ts` near line 1007) sends `{ tool: 'order', ..., ref: 7 }`. `brain.lastAct = { tool: 'order', task: <the GIVEN task> }`. The server's `tool_order` calls `start_errand`: Ann sets off for the console. `supply_run_active` is still FALSE, because it is only set in `place_order`, at the console.
2. On the way, the Captain says "the QM isn't answering, Ann, could you order me a medical crate?". The `order` option is on offer only because of the first half of that: `offers` in `cargo.ts` (line 1859) returns nothing while a Quartermaster is in view or on the PDA list (`quartermasterAboard`, `jobs/supply.ts:27`), which is always so when a Quartermaster gave the order, unless this asker has just said the Quartermaster did not answer (`brain.qmSilent`, set in `overhears` from `QM_SILENT_WORDS`). Past that, it holds the option back only when `brain.orderPending` (that is `supply_run_active`) is TRUE, which it is not yet. The LLM takes it. `think()` calls `runTool(brain, { tool: 'order', crate: 'Medical Supplies Crate', for: 'p2' })`.
3. On the server, `tool_order` overwrites `order_for`, `order_items`, `order_via`, `order_ref`, and `start_errand` replaces the Quartermaster's errand. Ann places the Captain's order. `action_result(CREW_TOOL_ORDER, TRUE, "You order ... for Zim Fire ...")`.
4. In the window, `noteResult` sees `tool === 'order'`, the same as `lastAct.tool`, and calls `CARGO.afterActing` with the GIVEN task and `ok = true`. That sets `given.placed = true`.
5. Order 7 was never placed, and nothing in the window will place it now: the plan only sends it while `!given.placed`. The Quartermaster's book has it as given.

So the cargo case needs a head to have said the Quartermaster is not answering while a technician carries one of the Quartermaster's orders: rare, but the effect (an order silently lost from the book) is the worst of these.

The same goes for walks, which are far more common. A janitor walking to the Kitchen for a mess (`lastAct` is `go_to Kitchen`) is asked the way to the Bar and leads the asker there. The walk to the Bar arriving is taken as the walk to the Kitchen arriving: the Kitchen walk's failure record is wiped, the loop count (`brain.repeats`) is kept against the Kitchen key, and `meetingsAfterActing` would mark a summoned body as having been told it arrived at its meeting (`summons.toldArrivedAt`) when it had been walking to it. That last one counts as being at the meeting only once its head is also in view (`meetings.ts:147`), so it bites when the head walks past the place it led someone to. For the plain Kitchen walk the harm is small: the driver plans the Kitchen walk again from the Bar.

When the two tools differ the answer is not mixed up, but the driver's step is still lost. A janitor on its way to clean (`lastAct` is `clean`) leads someone to the Bar instead. The `clean` errand was replaced on the server and no answer for it will ever come. Once the lead walk is over (`walking` false) and 12 seconds have passed since the clean was sent, `drive` takes the clean to have come to nothing (`LOST_ACT_MS`) and calls `fail` on it: the clean is held back for 20 seconds, then 40, and so on if it happens again, though it was never tried.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943`, `noteResult`:

    export function noteResult(brain: NpcBrain, event: SenseEvent): void {
      const last = brain.lastAct;
      if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
        return;
      }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1766`, `runTool`, used by `think()` for the LLM's steps (`brain.ts:1512`) and by its fallback (`brain.ts:1597`), and by the driver through `issue`. It does not know which of them is calling:

    function runTool(brain: NpcBrain, action: Action): string | null {
      const { tool, ...args } = action;
      const serverTool = serverToolName(tool);
      ...
      act('tool_call', { npc: brain.id, tool: serverTool, args });
      return serverTool;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1915`:

    const given = brain.givenOrder;
    if (task?.kind === GIVEN && act.tool === 'order' && given) {
      if (ok) {
        given.placed = true;

`code/modules/llm_crew/crew_npc_tools.dm:129`, no call number on the answer:

    /datum/ai_controller/crew_npc/proc/action_result(tool, succeeded, text, list/extra_details)
    	...
    	var/list/details = list("tool" = tool, "ok" = succeeded)

`code/modules/llm_crew/crew_npc_hands.dm:161`, a new errand quietly replaces the old one:

    /datum/ai_controller/crew_npc/proc/start_errand(atom/target, tool, wanted)
    	cancel_search()
    	clear_blackboard_key(BB_CREW_NPC_WALK_TARGET)
    	...
    	errand_serial++
    	set_blackboard_key(BB_CREW_NPC_ERRAND_TARGET, target)

## How it was found

Read from the code: `noteResult`, every caller of `runTool`, `CARGO.afterActing` and `offers`, `meetingsAfterActing`, and on the server `handle_tool_call`, `tool_order`, `start_errand`, `cancel_errand`, `place_order` and `action_result`. Not seen in a round.

## How to fix it

I would do both 1 and 2. Step 2 alone is a window-only stopgap.

1. **Number the calls (the real fix).** In `runTool`, give each call a number (`brain.nextCall++`) and send it as `args.call`. On the server, in `handle_tool_call`, keep it as `current_call` before the `switch`; in `start_errand` and `start_walk` copy it to `errand_call` / `walk_call`; in `action_result` add `details["call"]` = the number of the call this answers (the errand's or walk's for results from `finish_errand` and the walk leaves, `current_call` for answers given at once). Results not tied to a call (the late "the shuttle has docked" from `order_arrived`, the rate limit's) send none. In `noteResult`, when `event.details.call` is a number, match on `last.call === event.details.call` and nothing else; fall back to the tool name only when it is missing. The driver's `issue` is `(action) => runTool(brain, action)` (`brain.ts:752`) and `drive` sets `lastAct` from what `issue` returns, so `runTool` must hand the number back (return `{ tool, call }`, or set `brain.lastCall`) for `drive` to keep it in `lastAct.call`. The server keeps whatever else `args` holds as before; `handle_tool_call` reads arguments by name, so an extra `call` key breaks nothing.
2. **Stop the clash in the window.** In `think()`, before `runTool(brain, action)` at `brain.ts:1512` and in the `catch` at `brain.ts:1597`: if `brain.lastAct` is set and the server would carry the new call out as an errand or walk, set `brain.lastAct = null` without calling `fail` (the driver's step was not tried and failed, it was replaced). "Errand or walk" is not "anything outside `STAYS`": `say` is outside `STAYS` and goes through the same `runTool` on nearly every reply (`brain.ts:1598`, `1613`), and must leave `lastAct` alone, or every answer the NPC gives would throw away the driver's step. Test `action.tool !== 'say' && !STAYS.has(action.tool)` (export `STAYS` from `driver.ts`), or better, list the tools the LLM can be offered that start a walk or errand: today `go_to` (options.ts) and `order` (cargo `offers`). The driver will plan it again when the body is free. For the cargo case this means the GIVEN order is placed after the Captain's, as the plan already says ("You have an order on the go already, and place this one when that has come in").
3. **Hold the order option back while a given order is in hand.** In `cargo.ts` `offers`, also return `[]` while `brain.givenOrder && !brain.givenOrder.placed && brain.lastAct?.act.tool === 'order'`: the technician is on its way to place one. Whether the Captain's order should go before the Quartermaster's is the owner's call; today it silently replaces it.

## How to test the fix

- Simulator: a scenario in `tools/llm_crew/sim.ts` where a technician is sent to place a given order and, while `walking` is true, the Captain asks it for a crate and the model agrees. The given order must still be placed afterwards (look for a second `order` call with `ref` set), and `given.placed` must not be set by the Captain's order's result.
- A table case for `noteResult`: `lastAct` go_to Kitchen, result `{ tool: 'go_to', ok: true, place: 'Bar', call: <other> }` must not clear the Kitchen key's failure record.
- Type check from `tgui/`; server compile check.
- Next round: grep `game.log` for "was told by its brain" lines; an `order` for the Captain while a technician holds a Quartermaster's order should be followed by the Quartermaster's order being placed.
- For step 2, a simulator case where a janitor walking to a mess answers a plain "hello" (a `say` only): `lastAct` must still be the walk afterwards.

## Check

Checked by Opus 5.5. The quotes are what the code says: `noteResult` (`driver.ts:943-947`) matches on `event.details.tool !== last.tool` only; `runTool` (`brain.ts:1766-1779`) sends `args` with no number and does not touch `lastAct`; `action_result` (`crew_npc_tools.dm:129-137`) sends only `tool` and `ok` plus extras; `start_walk` (`crew_npc_tools.dm:397`) calls `cancel_errand`, and `walk_finished` returns without a word when "a newer walk has replaced this one" (`crew_npc_tools.dm:409-412`). `think` is started from the talk queue (`startTalk`, `brain.ts:1137`) with no check of `walking` or `lastAct`, so the LLM's `go_to` can go out mid-walk. The `LOST_ACT_MS` path (`driver.ts:671-679`) fails a step whose answer never came, as the write-up says. Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers it; API-03 is already marked a duplicate of this file.
Corrected: the cargo case missed the `quartermasterAboard` guard in `offers` (`cargo.ts:1863`), which blocks the Captain's order whenever a Quartermaster is aboard unless that asker has just said the Quartermaster did not answer; the example now says so, and it is rare. Step 2 of the fix as first written would have dropped `lastAct` on every `say`; fixed. Added how `drive` gets the call number back. Effort raised to large: the real fix is on both the server and the window. Severity stays medium: the common case (a lead walk mid-walk) costs a re-planned walk or a 20-second hold, the rare cargo case loses an order.
