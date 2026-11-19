---
id: DRV-06
title: One thrown error anywhere in the window code, for any one NPC, stops every brain for good and then costs all their memory
kind: gap
severity: high
effort: medium
confidence: sure
status: found
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/index.tsx:95, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:219, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1162, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1273, tgui/packages/tgui-setup/helpers.js:395, code/modules/tgui/tgui.dm:103
fix: Catch errors per NPC in ingest and round the whole of think, chooseJob and readOrder, log them through brain_log, and always free the LLM turn in a finally
---

## What is wrong

All of the crew's thinking runs in one tgui window, and tgui windows are opened in strict mode (`code/modules/tgui/tgui.dm:103`, `strict_mode = TRUE`). In strict mode the page's own error handler treats any uncaught error, and any promise that is rejected with nobody catching it, as fatal: it shows the blue "fatal exception" screen and replaces `window.update` with an empty function, so the window never hears from the server again.

The Crew Brain code has no guard of its own between that handler and about 25,000 lines of job code:

- `ingest` is called from a React effect and loops over every NPC, running each one's `observe`, the job's `readsMessage`, `overhears` and `meets`, `syncTasks`, and `drive` (which runs every job's `plan`). Nothing in the loop is in a `try`. An error thrown for the third NPC means the fourth to the last are not driven on that update, and the error leaves the effect. React 19 with no error boundary (there is none in `tgui/packages/tgui`) unmounts the whole tree and reports the error, which reaches `window.onerror`. Unmounting also runs the effect clean-up `stopSession`, which empties every brain.
- `think`, `chooseJob` and `readOrder` are started with `void` and never awaited. Each has a `try` round the LLM call, but a good deal of code is outside it or inside the `catch` itself: `buildTalk` (every job's `cues` and `whenAsked`), `buildChoice` (every job's `weighs`), `deskRead`, `logDecision`, and in the `catch` of `think` the job's `hears`, `fills`, `workInWords` and all six after-saying hooks. An error there rejects the promise, nobody catches it, and `window.onunhandledrejection` calls `window.onerror`. The same error also leaves `running` true for ever, so even without strict mode no NPC would ever get another LLM turn, and every body whose work then calls for a line would stand with `mustSay` set for the rest of the round (`drive` returns null while it is).

So the cost of any ordinary bug that throws (a field the server did not send, a regular expression built from a name, a null where a task was expected) is not one NPC doing one wrong thing. It is: every NPC stops being driven that instant, the owner sees a blue screen in the Crew Brain window if they are looking at it, and when they close it and open it again every brain starts from nothing (see HOLE-02 for what that loses).

This reviewer did not find a throw in `driver.ts`, `index.tsx`, `Details.tsx` or `colors.ts` themselves. Any throw another reviewer finds anywhere under `CrewBrain/` (CHK-01 is one, in a test) becomes this fault in the game. One concrete case to show the path: suppose a job's `plan` reads `brain.security.cells` for an officer whose `security` state the server sent as null for one update (the body's ID was taken, so `works_in_security()` is false, while `brain.job` is kept as "Security Officer" by `brain.job = npc.job || brain.job`). `plan` throws a TypeError inside `drive`, inside `ingest`, inside the effect at `index.tsx:95`. The janitors, the cargo staff and the heads all stop with it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:95`:

      useEffect(() => {
        setStationPlaces(data.places ?? []);
        ingest(data.npcs ?? [], data.now);
      }, [data]);

`brain.ts:219`, `ingest`: `for (const npc of npcs) { ... }` runs to `brain.ts:784` with no `try`.

`brain.ts:1162`, `brain.ts:1068`, `brain.ts:1173`:

      running = true;
      void think(brain);

`brain.ts:1273`, `think`: `buildTalk` is called at `brain.ts:1308`, before the `try` at `brain.ts:1337`. The `catch` at `brain.ts:1572` calls `jobFor(brain.job).hears`, `fills`, `workInWords`, `afterSaying` and the rest, and `running = false` comes after it at `brain.ts:1635`, not in a `finally`.

`tgui/packages/tgui-setup/helpers.js:395` (built into `tgui/public/helpers.min.js`):

    window.onerror = function (msg, url, line, col, error) {
      ...
      if (Byond.strictMode) {
        Byond.sendMessage({type:"log",fatal:1,message:stack})
      }
      ...
      if (Byond.strictMode) {
        window.update = function(){};
        window.update.queue = [];
      }
      return true;
    };
    window.onunhandledrejection = function (e) {
      ...
      window.onerror(msg, null, null, null, e.reason);
    };

`code/modules/tgui/tgui_window.dm:341`: the server marks the window `fatally_errored`, which is why it is made afresh, with empty brains, when next opened.

## How it was found

Read from the code: the window code, tgui's setup script, and the server's `tgui.dm` and `tgui_window.dm`. Not seen in a round. No error was thrown on purpose in a running game to watch it happen, so the unmounting on an effect error is taken from how React 19 is documented to behave with no error boundary.

## How to fix it

1. In `ingest` (`brain.ts`), wrap the body of the `for (const npc of npcs)` loop in `try { ... } catch (error) { reportError(brain ?? npc, error) }`. One NPC's error must not stop the others being driven. Keep `notify()` and `pump()` after the loop.
2. Write `reportError`: send one `brain_log` record through `act` (`kind: 'decision'`, `trigger: 'ERROR in the window code'`, `error:` the message and the first lines of the stack), at most once per NPC per distinct message per minute so that an error on every update does not flood the log (the server already caps records at 40 in 10 seconds). Keep the last error on the brain (`brain.lastError`) and show it on the NPC's card in red, so the owner sees which body has stopped thinking and why.
3. In `think`, `chooseJob` and `readOrder`, put the whole body in `try { ... } finally { ... }` so that `running = false`, `brain.status = 'idle'`, `brain.sayingNow = false` and `pump()` always happen, and add a `.catch(reportError)` where each is started (`void think(brain).catch(...)`), so no rejection is left uncaught.
4. In `think`, if the error came after `brain.mustSay` was taken, say the plain line (the `catch` already does this for LLM errors: make sure an error thrown by a job hook inside that `catch` cannot stop the line being said, by saying the line first and running the hooks after).
5. Add a React error boundary round `NpcCard` and `NpcDetails` in `index.tsx`, so that a rendering error for one card shows "could not draw this card" and does not unmount the window and run `stopSession`.
6. Do not turn strict mode off for the window: it is set for every tgui window in base code, and the errors are better caught and logged than hidden.

## How to test the fix

- A table test (bun, with the fixture brain): give `ingest` two NPCs, the first with a job whose `plan` is made to throw (a stub job registered for the test), and check that the second NPC is still driven and that one `brain_log` record with `ERROR` was sent.
- The same for `think`: stub `buildTalk`'s job `cues` to throw, and check that `running` is false afterwards and that a second NPC's talk still starts.
- Type check from `tgui/`.
- In a round, grep `crew_brain.log` for `ERROR in the window code`. Any line there is a bug that before this fix would have stopped the whole crew.
