---
id: SIM-02
title: A crash in the window code after the model answers is caught as a dead model, and the simulator still says all passed
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:1058, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1337, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1572
fix: Have the stand-in act() count every brain_log decision whose error is not the stand-in's own dead-model words, print them, and fail the run if there are any
---

## What is wrong

`think` in `brain.ts` wraps everything from the model call to the end of acting on the reply in one `try`. That includes far more than the network call: `parseReply`, `withRemark`, `takeToldWork`, every job's `agrees` and `fills`, `runTool`, `workInWords`, and the six `...AfterSaying` hooks that each job module adds. Any exception thrown in any of them lands in the `catch`, which is the dead-model path: the error text goes into `decision.error`, the plain fallback line is said, `hears` is tried, and the brain carries on as if Ollama had not answered.

So a TypeError in, say, `meetingsAfterSaying` (a field read off a brain that has no meeting, as `CHK-01` found with `beyondKinds`) does not stop anything. In `quiet` and `chatty` mode the body simply behaves as it does in `dead` mode, and every scenario is written to pass in `dead` mode as well. The run ends "all passed".

The only trace is the `brain_log` record the window sends, and the simulator throws those away unless `TRACE=` names that NPC, and even then it prints only the trigger and the reply, not `error`:

    brainModule.setAct((action: string, payload: any) => {
      if (action === 'brain_log' && payload.kind === 'decision' && process.env.TRACE) {
        ...trace.push(`${stamp()} ${who.name}: ${String(payload.trigger)...}  ->  ${String(payload.reply)...}`);
      }
      if (action !== 'tool_call') return;

The same holds for `chooseJob` (`brain.ts:1213`) and `readOrder` (`brain.ts:1093`): their `try` covers `readChoice` and the reading code, and an exception there becomes "No answer, so the code's own order stands".

In the game this is worse than in the simulator: the owner sees a crew that talks less well and takes fewer orders, and there is no runtime error anywhere, only an `error` field in `crew_brain.log` that nobody greps for.

Concrete case, as the code stands: if any job's `afterSaying` threw for one job only (the head's, say), every line the head's model gave in a `quiet` run would be followed by the catch: the fallback is said a second time (`runTool(brain, { tool: 'say', text: mustSay })` runs after the model's own `say` already went out), `pending` is refilled, and `pumpAfterSaying` hooks run twice. `sim.ts quiet crew` would still pass if the checks only count lines that match.

I ran an instrumented copy of `sim.ts` (kept outside the repo, with `BRAIN=` pointed at the real window code) that collects every `brain_log` decision with a non-empty `error`, over `quiet qm`, `chatty crew`, `chatty warrant` and `quiet engine`. Each printed `ERRCOUNT 0`, so nothing is being hidden today. The finding is that the simulator would not notice if there were.

## Where

`tools/llm_crew/sim.ts:1058`, quoted above.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1337` opens the `try`; `brain.ts:1572` is the catch:

    } catch (error) {
      if (mySession !== session) {
        return;
      }
      decision.ms = Date.now() - started;
      decision.error = error instanceof Error ? error.message : String(error);
      // Nor must it leave the body deaf: a plain request for what its job provides is still taken.

## How it was found

Read from the code, then the instrumented copy described above was run once per scenario named (`bun simcount.ts quiet qm` and so on from the scratchpad folder, each printing `ERRCOUNT 0` and "all passed").

## How to fix it

1. In `sim.ts`, in the `setAct` handler, for every `brain_log` record of kind `decision` with a non-empty `error`, keep `{ at, npc, error }`. The stand-in's own failures are known strings: `'Ollama is not running'` in `dead` mode, and nothing else (the stand-in never times out or cuts a reply off). Anything else is a fault.
2. At the end, print each kept error with the NPC's name, and add `check('no window code threw while acting on a reply', unexpected.length === 0, ...)`.
3. In the window code, the owner may want the two kinds of failure told apart in the game too: catch the model call alone (`callOllama` and `isCompleteReply`) in the existing `catch`, and let the rest run outside it, or catch it separately and log it with a distinct prefix such as `BUG:` so a grep of `crew_brain.log` finds it. That is a change to `brain.ts`, so it belongs with whoever owns it; the simulator check in steps 1 and 2 is enough to stop it hiding in tests.

## How to test the fix

Throw on purpose in one hook in a scratch copy of the window code (with `BRAIN=` pointed at it) and see `sim.ts quiet crew` fail with the error printed. With the real tree, every scenario must still pass, and `dead` mode must still pass (its errors are all the stand-in's own).
