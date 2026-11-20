---
id: LOGA-07
title: A call the janitor's code has just turned down (needs soap or a rag, and it has neither) is taken on all the same when the model answers work, and the janitor sets off for a locked room it cannot get into
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1449, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:823, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:185
fix: Note the room of a call the janitor turned down, and have takeToldWork refuse a CLEAN task for that room from the model until the janitor holds something that scrubs
---

## What is wrong

The rule is "code does the work, the model is only the voice". Here the model's `work` answer undoes a decision the code has just made.

A cargo technician sends a janitor a call to a mess that only scrubbing shifts ("There is a mess in the Bitrunning Den: cobweb. Reuben could not shift it: it needs scrubbing with soap or a rag. Could you come and clean it up if you have one, please?"). The janitor's `readsMessage` sees it has no soap or rag, sends back "I have no soap or rag, so I cannot shift the mess in the Bitrunning Den.", and by design adds no task: "staying where you are".

But the same message is in the next thing the model is asked, with "work" on offer. The model answers `work: {what: "a mess that needs cleaning", where: "Bitrunning Den"}`, and `brain.ts` passes that to `takeToldWork`, which adds a CLEAN task, told by the technician. That task has no `via` (only `readsMessage` sets it, for a call from cargo), so the plan is a plain `go_to` into a room locked to the janitor. The walk fails ("no route"), the room goes on the list of places it "could not find a way in, and will try again later", and it tries again later from across the station. If it ever got in, it could not shift the cobweb anyway: `wantsScrub` is not set on this task either.

Concrete case, `data/logs/2026/11/19/round-19.33.50`, Penelope Alekseev (janitor, holding space cleaner):

1. 01:44:31, `pda.log`: Tamika Barrett to Penelope, "There is a mess in the Bitrunning Den: cobweb. Reuben could not shift it: it needs scrubbing with soap or a rag. Could you come and clean it up if you have one, please? Come to its door and knock, and I will let you in."
2. 01:44:47, `crew_brain.log`: "Tamika Barrett has called you to a mess in the Bitrunning Den that needs scrubbing with soap or a rag. You have neither, so you are sending Tamika Barrett a PDA message to say you cannot shift it, and staying where you are." `pda.log`: "I have no soap or rag, so I cannot shift the mess in the Bitrunning Den."
3. 01:45:11, `crew_brain.log`, the model's reply: `"think": "Tamika's message says there's a cobweb mess in the Bitrunning Den that needs scrubbing with soap."` and `"work": {"what": "a mess that needs cleaning", "where": "Bit...`.
4. 01:45:27: "You have a mess to clean up in Bitrunning Den (Tamika Barrett told you of it), and you are going there with your space cleaner." => `go_to("Bitrunning Den")`.
5. 01:45:41, `game.log`: "walk failed (go_to, to Bitrunning Den): there is no way through. Stopped at Cargo Lobby (80,146,2) ... no route could be found."
6. 01:46:48 onwards, every idle step: "Bitrunning Den: It is waiting: you could not find a way in, and will try again later."
7. 01:51:07, `game.log`: the same walk fails again, from the Arrival Shuttle Hallway, across the station.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:823`, in `readsMessage`: the decline, which leaves nothing behind.

      if (named && from && scrubOnly && !canScrub(brain) && !within) {
        brain.toTell.push({
          to: from,
          line: `I have no soap or rag, so I cannot shift the mess in the ${named}.`,
          ...
        });
        return;
      }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1449`: the model's `work` goes straight to `takeToldWork`.

          } else if (action.tool === 'work') {
            ...
            const task = takeToldWork(
              brain,
              action.what,
              action.where,
              toldBy,
              !!superior,
            );

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:185`, `takeToldWork`: no job is asked whether it has already turned this work down.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:604`: with no `via`, the plan for a locked room is a plain walk.

      if (task.via && task.place && task.place !== task.via) {
        return letInStep(brain, task, task.place, task.via);
      }
      return task.place && knowsPlace(brain, task.place)
        ? { ready: true, ..., act: { tool: 'go_to', place: task.place } }

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-19.33.50`, `pda.log` 01:44:31 and 01:44:47, `crew_brain.log` for Penelope Alekseev 01:44:47 to 01:51:07 (the model reply at 01:45:11 is a `decision` record with a `work` field), `game.log` 01:45:41 and 01:51:07. Then read from the code. DESK-06 covers the missing `via` for calls from anyone not in cargo; this is a call from cargo that arrives without `via` because the model, not `readsMessage`, made the task.

## How to fix it

1. In the janitor's `readsMessage`, when it declines a scrub-only call, note it: `brain.declinedRooms[named] = at` (a new map on the brain, cleared when the janitor next holds soap or a rag).
2. Give `Job` (`jobs/job.ts`) an optional hook, `refusesWork(brain, kind, place): boolean`, and call it in `takeToldWork` after `kind` is found and before `addTask`. The janitor's version answers TRUE for a CLEAN task in a declined room while `!canScrub(brain) && !scrubberToHand(brain)`. There is no such hook today (`agrees` covers only actions other than `work`). Call it from `workInWords` as well, which takes work from the words of a line when the model did not, so the same call cannot come in by that door either.
   The new map needs a field in `types.ts` and a default in `brain.ts` where the brain is made; let a declined room lapse after a few minutes too, so a later call to the same room for a new mess is not lost for the rest of the round.
3. Better still, and general: when a job's `readsMessage` has handled a message (taken it or turned it down), leave that message out of what the model is offered "work" for. That needs `readsMessage` to return whether it handled the message; today it returns nothing.
4. Keep: a call the janitor takes, from cargo, still gets `via = CARGO_LOBBY`; a model `work` for a mess the code did not already handle still goes on the list.

## How to test the fix

- Type check and lint.
- A table case (also with the second half fed through `workInWords` with the call's words) (`tools/llm_crew/`): a janitor with only a space cleaner gets the scrub-only call; then the model reply `{"work": {"what": "a mess that needs cleaning", "where": "Bitrunning Den"}}` is fed through. Pass if no CLEAN task for the Bitrunning Den is on its list.
- Next round, `game.log`: no "walk failed (go_to, to <room>)" from a janitor within a minute of its "I have no soap or rag, so I cannot shift the mess in the <room>".

## Check

Read `readsMessage` in `jobs/janitor.ts` (the decline at the "I have no soap or rag" line returns with no task and no note), the `work` branch in `brain.ts` (it passes the model's `what` and `where` straight to `takeToldWork`), `takeToldWork` and `workInWords` in `tasks.ts` (no job is asked about the work beyond `takes` and `knowsPlace`), the `Job` interface in `jobs/job.ts` (no hook that could refuse it), and the CLEAN plan's `via` and walk. Read Penelope Alekseev's records in `round-19.33.50/crew_brain.log` from 01:44:02 to 01:46:53 and `game.log` lines 700 to 910: the decline at 01:44:47, the model's `work` for the Bitrunning Den at 01:45:11 (the prompt's own instruction tells it to name any mess it is told of "whether or not you can see to it now"), the `go_to("Bitrunning Den")` at 01:45:27, and the failed walks at 01:45:41 and 01:51:07 with the door "locked to it". No change log or plan entry covers it.

Confirmed. The task the model made has neither `via` nor `wantsScrub`, so even let in it would try the cobweb with a space cleaner. Effort raised to medium: the fix touches `types.ts`, `brain.ts`, `jobs/job.ts`, `tasks.ts` and `jobs/janitor.ts`, though each by a few lines. Step 3 of the fix (leaving a handled message out of what the model may answer "work" for) is the general cure and keeps the rule that the code decides, but changes `readsMessage`'s return type for every job, so it is the larger piece. Severity medium kept: it needs a scrub-only call while the janitor has nothing to scrub with; the cost is a wasted walk and a task that sits blocked. Not run: nothing.

## Fix so far

Built on branch `m-janitor` in `jobs/janitor.ts` only (type check, tables, simulator `solo` and `crew` once each; not played). When `readsMessage` turns a scrub-only call down, it notes the room and the caller (`declinedCalls`, a note kept beside the brain like the water notes, so no new brain field). While that note stands (`DECLINED_DS`, five minutes) and the janitor still has no soap or rag to hand, a told CLEAN task for that room from that caller that the message itself did not make (`wantsScrub` unset: the model's `work`, or `workInWords`) is not planned (`plan` gives a not-ready step) and is dropped at the next `syncTasks`. Holding or knowing of soap or a rag clears the notes. A call to the same room from anyone else is taken as before. Table: `tools/llm_crew/janitor-declined.ts`.

Held (not needed for this case, but the general cure, step 3): `readsMessage` returning whether it handled a message, and `brain.ts` leaving such a message out of what the model may answer "work" for; or the `refusesWork` hook in `jobs/job.ts` and `tasks.ts` (`takeToldWork`, `workInWords`).

Round M2 (g-brain): step 3's type is in. `refusesWork?: (brain, kind, place) => boolean` is on `Job` (`jobs/job.ts`). `takeToldWork` (`tasks.ts`) still reads it through its own cast, which keeps compiling; g-tasks can drop the cast and call `jobFor(brain.job).refusesWork?.(brain, kind, room)` directly.
