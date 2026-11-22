---
id: ENG-01
title: An emitter that will not switch off is tried for ever, and neither the Chief Engineer nor the Captain is told the engine is still firing
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: f4cd1ae82b2
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:596, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:333, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:291
fix: Count failed switch_off and switch_on steps per emitter as the lighting steps are counted, after two move on to the next emitter, and at the end tell the Chief Engineer which would not go off and why, who tells the Captain
---

## What is wrong

The one emergency in engineering is the order "Emitters off, now". The engineer takes it as an emergency task (`SHUT`) and works down the emitters. When a switch-off does not take, nothing is noted. `afterActing` returns at once on a failure for `SHUT` and `RELIGHT`:

    if (!ok || (task?.kind !== SHUT && task?.kind !== RELIGHT)) {
      return;
    }

So `plan()` picks the same emitter again, the driver's `fail()` holds it back 20 s, 40 s, ... up to two minutes, and it is tried again, for the rest of the round. Worse: `plan()` always takes the *first* emitter not yet switched, so while emitter 1 will not go off, emitters 2 and 3 are never tried at all. One locked emitter keeps all three firing. (The task's 30-minute `GIVE_UP_DS` in `tasks.ts` does not end it: `keep` opens it again on the next sync while `engine.shutting` stands.) There is no try count (the lighting steps have `engine.tries` and `STEP_TRIES`; the shut-off has nothing), there is no word for "the emitters will not go off" in `jobs/engineering.ts`, and `engine.words` gets nothing. The Chief Engineer, having heard nothing, gives the order again every 90 seconds (`SHUT_AGAIN_DS`), and that resets `engine.switched = []` in `takeWord`, which changes nothing.

Meanwhile the crystal is losing integrity with the emitters still firing. The Captain was told once, "I am having the emitters switched off", and is told nothing more. The Chief Engineer's cue says "You have ordered the emitters off, and have not yet heard that they are" for ever.

The server gives a reason with each failure, so the cause is known to the body and lost by the brain. From `switch_emitter` and the walk:

- "The emitter will not switch off: its controls are locked" (an emitter a player has locked with an ID swipe);
- "You cannot reach the emitter to switch it off" (`click_as_body` refused: the body is stunned, the emitter is behind something);
- "You have no free hand to switch the emitter off with";
- a walk to the emitter that fails: the engine room is behind fire doors, the room's doors have lost power, or the radiation shutters are down. A crystal that is losing integrity is exactly when the engine room gets hot and its fire doors drop.

The same is true of the `RELIGHT` task (switch-on): a failure is retried for ever with no word back. That one is not dangerous, only stuck.

The surest case is a locked emitter: `interact()` in `code/modules/power/singularity/emitter.dm` returns before touching `active` when `locked`, so the click does nothing every time. The case below, through fire doors, is likely but not traced to the doors' code.

One case: the engine is lit. Its cooling fails (someone turns off a pump, or the loop is breached) and integrity falls to 94. `syncTasks` in `chiefengineer.ts` sets `chief.shut`, the order goes to the engineer, the engineer walks for the engine room. The engine room's fire doors have shut on the heat. `go_to`/the errand walk fails: `ok` is false, `afterActing` returns. The driver holds the step back and tries again in 20 s, 40 s, 60 s... The engineer stands about between tries, doing its rounds. The crystal delaminates. Nobody aboard was told the order could not be carried out, so the Captain, who could have gone to the engine room, never knew to.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:596`, in `afterActing`:

    if (!ok || (task?.kind !== SHUT && task?.kind !== RELIGHT)) {
      return;
    }
    if (!engine.switched.includes(key)) {
      engine.switched.push(key);
    }

`jobs/engineer.ts:333`, in `plan`: the next emitter is the first one not switched, so a failed one comes round again.

    if (task.kind === SHUT) {
      const next = emitterSteps(brain.machines, 'switch_off').find(
        (action) => !engine.switched.includes(action.key),
      );

Compare the lighting steps, a few lines above in `afterActing`, which do count:

    engine.tries[key] = (engine.tries[key] ?? 0) + 1;
    if (engine.tries[key] >= STEP_TRIES) {
      stick(brain, engine, step.fails);
    }

`jobs/chiefengineer.ts:291`, in `syncTasks`: the only thing the Chief Engineer does with silence is say it again.

    if (
      chief.shut &&
      !chief.emittersOff &&
      !chief.order &&
      chief.shutGivenAt !== null &&
      brain.now - chief.shutGivenAt > SHUT_AGAIN_DS
    ) {
      chief.order = { what: 'shut', givenAt: null, sent: false };
    }

`code/modules/llm_crew/crew_npc_machines.dm:330`, `switch_emitter`: the reasons the brain is given and drops.

    if(!click_as_body(emitter) || QDELETED(emitter))
    	return list(FALSE, "You cannot reach the emitter to switch it [wanted].", FALSE)
    if(!!emitter.active != on)
    	return list(FALSE, "The emitter will not switch [wanted]: [emitter.locked ? "its controls are locked" : (emitter.powernet ? "it does not answer" : "it is not on a wire")].", FALSE)

## How it was found

Read from the code, not seen in a round. No round has yet had the integrity fall. The driver's back-off (`fail`, `RETRY_MS` 20 s up to `RETRY_MAX_MS` 2 minutes in `driver.ts`) was read to confirm the step is held back and tried again rather than dropped.

## How to fix it

1. In `jobs/engineer.ts`, add to `EngineWork` (in `types.ts`) a count of failed switches, for example `switchTries: Record<string, number>`, cleared with `switched` wherever `switched = []` is set (the `SHUT_WORDS` and `RELIGHT_WORDS` branches of `takeWord`).
2. In `afterActing`, for `task.kind === SHUT || RELIGHT` and `!ok`: add one to `switchTries[key]`. After two (the same `STEP_TRIES`), put that emitter in `switched` so the next one is tried, and remember it as one that would not go (`unswitched: string[]`, with the server's text, which `afterActing` does not get today: pass `event.text` through, or take the reason from a `details.reason` the server adds to `work_machine`'s failures).
3. When every emitter is either switched or given up on, and some were given up on: for `SHUT`, set `shutting = false` and owe a new word, `'notoff'`, with a fixed line in `jobs/engineering.ts`: "Ada, I cannot switch the emitters off: <reason>." plus `NOT_OFF_WORDS`. For `RELIGHT`, the same with "cannot switch the emitters on again".
4. In `jobs/chiefengineer.ts` `hearEngineer`, read `NOT_OFF_WORDS`: stop re-giving the order (`chief.order = null`, and do not let the `SHUT_AGAIN_DS` branch fire again while this stands), and `tellCaptain` "The emitters will not go off: <reason>. The engine is still firing." That is the one line in engineering that must reach someone who can act.
5. Keep the shut order an emergency: the step is still tried at once each time the Chief Engineer re-orders, so a door that opens again is used. Steps 4 and 5 pull against each other: if step 4 stops the re-orders, nothing ever tries the given-up emitter again. Take the middle way: after `'notoff'`, the Chief Engineer still re-orders, but on a slower clock (for example every five minutes, not 90 seconds), and tells the Captain only once, not on every re-order.

Owner's question: once the engineer cannot get the emitters off, should the Chief Engineer go itself? Decision 2 of the plan says it never works the engine room while an engineer is aboard. A stuck shut-off may be a reason to change that.

## How to test the fix

- Add a case to `tools/llm_crew/engine.ts`: a brain with `shutting` set, `afterActing` given `ok = false` for `work_machine` on one emitter twice. It should move on to the next emitter (the other two must be switched off: today they never are) and, at the end, owe the `'notoff'` word. Also: after a fresh "Emitters off, now", the given-up emitter is tried again.
- Add a simulator scenario where one emitter answers every switch-off with failure: the Chief Engineer should send the Captain "The emitters will not go off" within a few minutes, and the engineer should not stand trying the same emitter for the rest of the run.
- In a round, grep `game.log` for "could not work the emitter" and then for the PDA line to the Captain in `pda.log`.

## Check

Checked by Opus 5.5. Confirmed.

- Every quote matches the code today: `afterActing` at `engineer.ts:596`, `plan` at `engineer.ts:333`, the lighting count at `engineer.ts:581`, `syncTasks` at `chiefengineer.ts:291`, `switch_emitter` at `crew_npc_machines.dm:330`.
- Traced the failure path: `noteResult` in `driver.ts` calls `fail()` (20 s times the count, at most 2 minutes) and the job's `afterActing`, which returns at once. Nothing else counts the failures; `orderToDrop` takes the emergency again once the back-off ends. The base `emitter/interact()` returns before touching `active` when `locked`, so a locked emitter fails every time.
- Ran a throwaway script (bun, outside the repo) that gave the engineer "Emitters off, now" and failed every switch-off of emitter `m1`: ten turns picked `m1` ten times, `m2` and `m3` were never tried, `engine.words` stayed empty and `shutting` stayed true. So one stuck emitter keeps all three on. That was added to the write-up.
- `afterActing` gets `event.details`, which holds only `tool` and `ok` (`action_result` in `crew_npc_tools.dm`). The server's reason is in `event.text`, which only `wantedAfterActing` gets. Fix step 2 is right that it has to be passed through.
- Nothing in `LLM_CREW_CHANGELOG.md` or `LLM_CREW_PLAN_ENGINEERING.md` covers a shut-off that fails. The plan's "a step is tried twice" is for lighting only.
- Severity left at high. Integrity falling has not been seen in a round, but this is the one safety order, and a locked emitter or a shut door stops it for good while the crystal comes apart. Effort small holds if the reason text is left for later; passing `event.text` through the driver makes it medium.
- Fix steps 4 and 5 contradicted each other. Step 5 now says how to settle it.

## Fix so far

Round A1, group a-heads (2026-11-22), on the owner's answer B: once its engineer says "I cannot switch the emitters off: ...", the Chief Engineer opens an emergency task of its own (`chief_emitters_off`, `selfShuts` in `jobs/chiefengineer.ts`) and works each emitter off itself with `work_machine`, as the engineer does: a switch that does not take is tried once more (one refused as `unknown` is not), then the next emitter. When all are seen to it tells the Captain "I have switched the emitters off myself. The engine is not to be lit again unless you say so." (and takes them as off) or "I went to switch the emitters off myself and could not: REASON. The engine is still firing." It goes once per shut-off; the engineer is still re-ordered every five minutes. Its staff meeting is held back meanwhile. With no engineer aboard it does not go (the answer is for an engineer that has said it cannot). Table cases in `tools/llm_crew/engine.ts`.
