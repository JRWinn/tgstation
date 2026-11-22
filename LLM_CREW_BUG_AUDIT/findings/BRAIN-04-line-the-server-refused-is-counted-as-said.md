---
id: BRAIN-04
title: A line the server refuses or throws away is counted as said, and the work goes on as if it had been heard
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: d8d8ce1120e, b03cbc91a52
found_by: Fable 5.2
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1766, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1531, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943, code/modules/llm_crew/crew_npc_tools.dm:116, code/modules/llm_crew/crew_npc_tools.dm:140
fix: Read the server's refusal of a say in ingest and say the line again once, and keep the window's own count of tool calls so the server's limit is never reached
---

## What is wrong

When the brain has a line said, it sends a `say` tool call and at once treats the line as spoken: `lastSayAt`, `lastSaid` (what the window shows under "Last said"), `saidLately`, the talk log, the count of replies to whoever it was answering, and every `afterSaying` hook (the job's, guarding, meetings, orders, rounds, pickups, tasks). Those hooks are what mark "I have asked to be let in", "I have called on this one for a report", "I have told them it is done".

The server can refuse the line or drop it:

- dropped with no word at all when the body has made more than 8 tool calls in 10 seconds (`tool_call_allowed`). Only the first dropped call of the window gets an event, and that event names no tool (`action_result(null, ...)`).
- refused with an event when the body spoke under 4 seconds ago ("You only just spoke"), cannot speak, is not responding, or the words trip the filter. The server also has the body speak lines of its own (`speak_plainly` in `crew_npc_held.dm`: "Still waiting: ...", the claim before looking over held crates), which start the same 4 seconds and which the window knows nothing of.

No code in the window acts on a `say` result. `noteResult` only looks at results for the driver's own last step, and a line is never that. The refusal's text does go into `brain.pending` (`brain.ts:731`), so the model may read "You only just spoke" in its next prompt, but by then the hooks have run and nothing undoes them. So the line was not said, nobody heard it, and the NPC goes on as though they had: it waits for an answer to a question it did not ask.

One concrete case, from a round (`data/logs/2026/11/18/round-21.49.53`):

1. At 04:15:14 the janitor Manuel Sheets (npc4) used up its eight tool calls on `hold` (see BRAIN-03). The server's count ran until about 04:15:24.
2. At 04:15:16 a technician spoke to it. The LLM call ended at 04:15:21 with an answer, and with the line its work called for ("Arielle, I am at the door about the mess in the Cargo Bay...") counted as covered because the answer had "Arielle" in it. `crew_brain.log` 04:15:21.047: `"say": "It sure did sing, Allegria! ... I'm just waiting here for Arielle to let me into the Cargo Bay so I can tackle that oil mess next!"`
3. `game.log` has no "was told by its brain to say" for Manuel Sheets between 04:14:54.722 and 04:15:25.854. The line was thrown away by the server.
4. No refusal event followed (the next report, 04:15:26.401, has none), so it was the silent drop.
5. The janitor's `afterSaying` had run. It never did ask Arielle to let it into the bay: the step does not come up again in the log.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1766`, `runTool`: the call is sent and nothing is kept to match an answer to.

    if (tool === 'say') {
      const text = String(action.text ?? '');
      logTalk(brain, brain.name, text, true);
      brain.lastSaid = { time: new Date().toLocaleTimeString(), text };
    }
    act('tool_call', { npc: brain.id, tool: serverTool, args });
    return serverTool;

`brain.ts:1531`, in `think`: the line is taken as said the moment it is sent.

    if (actions.some((action) => action.tool === 'say')) {
      brain.lastSayAt = Date.now();
      ...
      jobFor(brain.job).afterSaying?.(brain, mustSay);
      guardAfterSaying(brain, mustSay);
      meetingsAfterSaying(brain, mustSay);
      ordersAfterSaying(brain, mustSay);
      roundsAfterSaying(brain, mustSay);
      pickupsAfterSaying(brain, mustSay);

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:943`, `noteResult`: the only reader of results, and it lets this one go by.

    const last = brain.lastAct;
    if (!last || event.kind !== 'action_result' || event.details.tool !== last.tool) {
      return;
    }

`code/modules/llm_crew/crew_npc_tools.dm:116`, `tool_call_allowed`:

    tool_calls_in_window++
    if(tool_calls_in_window <= CREW_NPC_TOOL_CALL_LIMIT)
        return TRUE
    // Say so once per window, then drop the rest quietly so a runaway brain cannot flood its own senses.
    if(tool_calls_in_window == CREW_NPC_TOOL_CALL_LIMIT + 1)
        action_result(null, FALSE, "You are trying to do too many things at once. Slow down.")
    return FALSE

`crew_npc_tools.dm:162`, in `tool_say`:

    if(!COOLDOWN_FINISHED(src, say_cooldown))
        action_result(CREW_TOOL_SAY, FALSE, "You only just spoke. Wait a moment before speaking again.")
        return

Also `brain.ts:1597`, in the `catch` of `think`, two lines sent in the same instant when the model is down and the NPC both took a request and had a line to say. The second is always refused by the 4 seconds, and its hooks have run:

    runTool(brain, request);
    runTool(brain, { tool: 'say', text: 'I will see to it.' });
    ...
    if (mustSay && brain.peopleInView.length > 0) {
      runTool(brain, { tool: 'say', text: mustSay });

## How it was found

Seen in a round log, as above: the brain log has the line, the game log does not. Then read from the code on both sides. "You only just spoke" turns up once in all the brain logs on disk (`round-09.12.44`), and "too many things at once" in three rounds (`round-17.48.05`, `round-20.48.14`, `round-21.49.53`). In `round-17.48.05` the head's lines all reached `game.log`, so what was dropped there was something else, most likely a `hold`.

The two-lines-at-once case in the `catch` was read from the code, not seen.

Not in `LLM_CREW_CHANGELOG.md` or the plans (searched "only just spoke", "too many things", `say_cooldown`).

## How to fix it

Window only, in four steps. A fifth on the server is worth having and is small.

1. Keep what was last sent to be said. In `think`, where a `say` goes out, set `brain.sentSay = { text, mustSay, needs: mustSayNeeds, exact, at: Date.now(), tries }` (new field on `NpcBrain`).
2. Read the refusal. In `ingest`, in the loop over events, next to `noteResult(brain, event)`: if `event.kind === 'action_result' && event.details.tool === 'say' && !event.details.ok` and `brain.sentSay` is under about 10 seconds old, the line was not said. Take it back out of `saidLately` and the talk log, and say it again once after the cooldown: set `brain.mustSay = brain.sentSay.text`, `brain.mustSayExact = true` (word for word, no second model call is needed for words already found), `brain.wake = true`, and count the try so that a line the filter will never pass is given up after one more go. The hooks do not need undoing if the line then goes out. If it is given up, log it (`brain_log` with the error) so the round's log shows a line was lost.
3. Stop sending two lines at once in the `catch`: when both a request and a `mustSay` are there, say one line, `mustSay`, and leave "I will see to it." out.
4. Keep a count in the window of tool calls sent for each NPC in the last 10 seconds (in `runTool` and `stopToTalk`). When it is at 6, `stopToTalk` sends nothing. When it is at 8, a driver step is not issued this turn (return null from `issue`, which `drive` already treats as a failed step) and a `say` waits a moment. The server's limit is then never met and nothing is dropped unseen.
5. Server, `tool_call_allowed`: do not count `CREW_TOOL_HOLD`, which moves nothing. Do this only together with, or after, BRAIN-03's fixes 1 and 3. Today the refusal of the ninth call is the one thing that ends BRAIN-03's fast loop of `hold`s. Without it, that loop would run for the whole wait. And when the call being dropped is a `say`, give the event its tool name (`action_result(CREW_TOOL_SAY, FALSE, ...)`) every time, not once a window: lines are seconds apart, so this cannot flood. Step 2 then catches the silent drop as well.

Owner's question: none. The limit of 8 in 10 seconds is there to protect the server from a runaway window and should stay.

## How to test the fix

- Simulator: `tools/llm_crew/sim.ts` plays the server. Make its `say` handler refuse a line that comes under 4 simulated seconds after the last, and drop every call past the eighth in 10 seconds, as the game does. Run `crew`, `qm`, `office`, `nested` and `waiting` quiet and dead: no scenario should end with a body waiting on an answer to a line that is not in its `said` list.
- Type check from `tgui/`. Server compile if step 5 is done.
- Next round: for each NPC, every `"say"` in `crew_brain.log` that was not filtered should have a "was told by its brain to say" line in `game.log` within a second. A short script over the two logs can check that.

## Check

Checked by Opus 5.5, from the code on both sides and the round named.

- The quotes still match: `runTool` (`brain.ts:1766`) sends the call and keeps nothing to check an answer against. The block at `brain.ts:1531` runs every `afterSaying` hook as soon as a `say` is in `actions`. The test at the top of `noteResult` (`driver.ts:945`) returns at once, doing nothing, for any result that is not for `brain.lastAct`. `tool_call_allowed` (`crew_npc_tools.dm:116`) sends one event per window, with a null tool. `tool_say` (`crew_npc_tools.dm:140`, refusals at `:156` to `:163`) has the filter, `can_speak` and cooldown refusals. `speak_plainly` (`crew_npc_held.dm:255`) starts `say_cooldown` without the window being told.
- Searched the window for any other reader of a `say` result: `details.tool` is read only for `locate`, `gave_up` and in `noteResult`, and nothing matches "only just spoke" or "too many things". None found.
- The round case holds up, and is worse than written. In `data/logs/2026/11/18/round-21.49.53`, `crew_brain.log` has three model answers for Manuel Sheets with a `"say"`: 04:15:12.403, 04:15:15.844 and 04:15:21.047. `game.log` has no "was told by its brain to say" for him between 04:14:54.722 and 04:15:25.854. The 04:15:15.844 record's prompt holds the one refusal, `[22:15:14] You are trying to do too many things at once. Slow down.` So all three lines were dropped by the limit, two of them with no word.
- The `catch` case reads as written: two `runTool` says in one instant (`brain.ts:1598` and `:1612`). The server's cooldown refuses the second.
- Not in the change log or the plans (searched "only just spoke", "too many things", `say_cooldown`).
- Severity medium is right: the job is not lost for good, because the driver asks again after `fail`'s wait, but the hooks mark asks as made that were never heard. Effort medium is right.
- Fix: sound. One caution added to step 5 (BRAIN-03 depends on the ninth-call refusal today). For step 2, re-say an LLM answer that was dropped only if it carried `mustSay`. A dropped piece of small talk can simply be lost. That saves a second line nobody needs.

## Fix so far

Steps 1 to 4 are built in the window (`brain.ts`): `brain.sentSay` keeps the last line sent and whether it carried the line its work called for; a `say` refused by the server (`action_result` with `tool: say`, not ok, within 10 seconds) is taken back out of `saidLately` and the talk log, and a carried line is said again word for word after the cooldown (`sayRefused`, `resayIfDue`); a second refusal gives it up and writes `[line lost: ...]` to the brain log. The model-down path no longer sends "I will see to it." beside the line. The window counts each NPC's tool calls over 10 seconds (`callsLately`, `noteCall`): at 6 no `hold` is sent, at 8 no driver step is sent and a `say` is held back and treated as refused. Table: `tools/llm_crew/brain3-said.ts`.

Held (step 5, server, `code/modules/llm_crew/crew_npc_tools.dm`, `tool_call_allowed`): give the dropped call's event its tool name every time it is a `say` (`action_result(CREW_TOOL_SAY, FALSE, ...)`), so the window's refusal reading catches it; and, only together with BRAIN-03's fixes 1 and 3, stop counting `CREW_TOOL_HOLD`. The window's own count should keep the limit from being met, so this is a second line.
