---
id: SIM-02
title: A crash in the window code after the model answers is caught as a dead model, and the simulator still says all passed
kind: bug
severity: low
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:1058, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1337, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1572
fix: Have the stand-in's fetch keep every error it throws itself, have act() keep every brain_log decision whose error is not one of those (and not the two known no-answer outcomes of a CHOICE or READING record), count unhandled rejections too, print them all and fail the run if there are any
---

## What is wrong

`think` in `brain.ts` wraps everything from the model call to the end of acting on the reply in one `try`. That includes far more than the network call: `parseReply`, `withRemark`, `takeToldWork`, every job's `agrees` and `fills`, `runTool`, `workInWords`, and the six `...AfterSaying` hooks that each job module adds. Any exception thrown in any of them lands in the `catch`, which is the dead-model path: the error text goes into `decision.error`, the plain fallback line is said, `hears` is tried, and the brain carries on as if Ollama had not answered.

So a TypeError in, say, `takeToldWork` or a job's `agrees` (a field read off a brain that lacks it, as `CHK-01` found with `beyondKinds`) does not stop anything. (Not in an after-saying hook such as `meetingsAfterSaying`: the `catch` calls those again, and the second throw stops the whole crew, which is `DRV-06`.) In `quiet` and `chatty` mode the body simply behaves as it does in `dead` mode, and every scenario is written to pass in `dead` mode as well. The run ends "all passed".

The only trace is the `brain_log` record the window sends, and the simulator throws those away unless `TRACE=` names that NPC, and even then it prints only the trigger and the reply, not `error`:

    brainModule.setAct((action: string, payload: any) => {
      if (action === 'brain_log' && payload.kind === 'decision' && process.env.TRACE) {
        ...trace.push(`${stamp()} ${who.name}: ${String(payload.trigger)...}  ->  ${String(payload.reply)...}`);
      }
      if (action !== 'tool_call') return;

The same holds for `chooseJob` (`brain.ts:1213`) and `readOrder` (`brain.ts:1093`): their `try` covers `readChoice` and the reading code, and an exception there becomes "No answer, so the code's own order stands".

In the game this is worse than in the simulator: the owner sees a crew that talks less well and takes fewer orders, and there is no runtime error anywhere, only an `error` field in `crew_brain.log` that nobody greps for.

Concrete case, as the code stands: suppose `withRemark` (`jobs/reports.ts:213`) threw, or `takeToldWork`, or a job's `agrees`. None of these is called again in the `catch`. So the turn ends quietly on the fallback path: the plain `mustSay` line is said, `hears` and `workInWords` are tried, `pending` is refilled with the report, and the brain carries on. Every turn that reaches the throw behaves as in `dead` mode, and the scenarios pass in `dead` mode. Nothing in the output says why.

(Checker's correction: the first version of this case used `ordersAfterSaying`. A throw in any of the six after-saying hooks is not hidden. The `catch` says `mustSay` plainly and calls the same hooks again (`brain.ts:1615-1622`), the second throw leaves `think`, `running` stays true, and the whole crew stops talking. That is `DRV-06` (and `CHK-09`, which ran it: 19 checks fail in `quiet crew`). What this finding is about is the throws the `catch` does not meet a second time, and the parsing in `chooseJob` and `readOrder`.)

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

1. In `sim.ts`, in the `setAct` handler, for every `brain_log` record of kind `decision` with a non-empty `error`, keep `{ at, npc, trigger, error }`. Not every such error is a fault. Known and expected: `'Ollama is not running'` (thrown by the stand-in's `fetch` at `sim.ts:87`, `:97`, `:105` in `dead` mode); and two outcomes that are not exceptions at all, which `chooseJob` and `readOrder` write into `error` when the reply named nothing usable: "The reply named none of the jobs." (`brain.ts:1230`) and "The reply was no warrant or pardon on anyone the message names." (`brain.ts:1110`; the stand-in gives this whenever the order does not name Pun Pun). Best: have the stand-in's `fetch` push each message it throws into a `standInErrors` set, and treat as a fault any error in a record whose trigger does not start `CHOICE` or `READING` and is not in that set. If `SIM-07` later makes the stand-in send bad JSON, its "The LLM's reply was not valid JSON" errors go in the set the same way.
2. Also keep `process.on('unhandledRejection', ...)`: a throw that leaves `think` (the `DRV-06` path) is printed by bun but does not fail the run by itself.
3. At the end, print each kept error with the NPC's name, and add `check('no window code threw while acting on a reply', unexpected.length === 0, ...)`.
4. In the window code, the owner may want the two kinds of failure told apart in the game too: catch the model call alone (`callOllama` and `isCompleteReply`) in the existing `catch`, and let the rest run outside it, or catch it separately and log it with a distinct prefix such as `BUG:` so a grep of `crew_brain.log` finds it. That is a change to `brain.ts` and goes with `DRV-06`'s fix (a guard round the whole of `think` that logs through `brain_log` and frees the turn in a `finally`), so build it there; the simulator check in steps 1 to 3 is enough to stop it hiding in tests.

## How to test the fix

Throw on purpose at the top of `withRemark` (`jobs/reports.ts:213`) in a scratch copy of the window code (with `BRAIN=` pointed at it) and see `sim.ts quiet qm` fail with the error printed. Today it passes: see the Check below. Do not plant it in an after-saying hook to test this: that path already stops the crew (`DRV-06`). With the real tree, every scenario must still pass, `dead` mode must still pass (its errors are all the stand-in's own), and `quiet loose` and `quiet warrant` must pass (they make READING records, which may carry the no-warrant outcome in `error`).

## Check

Read `think` (`brain.ts:1273-1640`): the `try` at `:1337` runs from `callOllama` through `parseReply`, `withRemark`, `takeToldWork`, the job's `agrees` and `fills`, `runTool`, `workInWords` and the after-saying hooks; the `catch` at `:1572` stores the message in `decision.error` and runs the dead-model fallback. Read `chooseJob` and `readOrder`: their `try` covers `readChoice` and `readReading` too. Read the stand-in's `fetch` (`sim.ts:80-128`) and `setAct` (`sim.ts:1058`): the brain_log records are dropped unless `TRACE=` is set, and `error` is never printed. The only exceptions the window code throws on purpose are in `callOllama` and `parseReply`; the stand-in throws only "Ollama is not running".

Ran it: copied `CrewBrain/` to the scratchpad, put `throw new Error("planted fault in withRemark")` at the top of `withRemark` with a counter, and ran `bun tools/llm_crew/sim.ts quiet qm` and `quiet crew` with `BRAIN=` at the copy. `qm`: the planted throw fired 17 times and the run ended "all passed"; `crew` also "all passed". So the fault is real and the simulator does not see it.

Corrected: the concrete case (an after-saying hook is the `DRV-06` path and is loud, not hidden) and step 1 of the fix (`chooseJob` and `readOrder` put two expected non-exception outcomes in `error`, so "only `Ollama is not running`" would fail good runs). Severity lowered to low: a test tool that misleads, by FORMAT.md. Effort stays small: about 15 lines in `sim.ts`.
