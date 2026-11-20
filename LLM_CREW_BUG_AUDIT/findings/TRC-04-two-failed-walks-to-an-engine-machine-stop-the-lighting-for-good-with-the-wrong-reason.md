---
id: TRC-04
title: Two lighting steps that fail for any reason, a blocked walk or a full hand included, stop the lighting for good, and the Chief Engineer and the Captain are told the machine will not take
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:579, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:125, tgui/packages/tgui/interfaces/CrewBrain/jobs/engine.ts:62, code/modules/llm_crew/crew_npc_hands.dm:405, code/modules/llm_crew/crew_npc_machines.dm:313
fix: Pass the server's reason for a failed work_machine to the brain, count towards the stop only a machine that would not take, retry a walk or hand failure after a back-off, and say the true reason when it does stop
---

## What is wrong

While it lights the engine the engineer counts every failed `work_machine` step, whatever the failure was. At the second failure of one step it stops the whole job (`engine.stuck`), leaves the emitters off, and tells the Chief Engineer that the machine "will not turn on" (or "will not go to full", "will not connect"): the fixed `fails` words of that step. The Chief Engineer passes the same words to the Captain. Nothing tries again unless someone the Chief Engineer answers to says "light the engine".

But most of the ways a `work_machine` step can fail have nothing to do with the machine:

- the walk to it came to nothing: `crew_npc_fail_errand` reports "You could not get to it." (the reach timed out, someone stood in the narrow way between the pipes, a door was shut, the body was knocked down on the way);
- the body was not fit to click when it got there: `click_as_body` refuses, and `turn_machine` says "You cannot reach the X to turn it on." (stunned, or pushed a tile off);
- its hands were full: "You have no free hand to switch the emitter on with." or "...to take your wrench out with." (`empty_clicking_hand` cannot free a hand when both hold trade tools);
- "You know of no such machine." (the entry's weak reference is gone: JAN-08).

Each of these is told to the brain as a plain FALSE. `afterActing` gets `ok`, the tool's arguments and `event.details`, which for `work_machine` hold nothing but `tool` and `ok` (`finish_errand` passes details only for security tools). It does not get the server's words (`event.text`), so it cannot tell them apart from "The Gas to Chamber will not turn on. It may have no power." A race with another hand on the same machine (JAN-09) also comes back as "will not turn on".

Concrete case. Ten minutes in, the engineer is on step 9 of 21, Gas to Chamber "on". A player engineer is fixing a pipe in the one-tile gap beside the pump (or Pun Pun is in the engine room, or the engineer is pushed aside on arrival). The walk times out: `ok = false`, `engine.tries["m7:on"] = 1`. The driver holds the step back 20 seconds and sends it again; the player is still there: `tries = 2 >= STEP_TRIES`. `stick(brain, engine, "Gas to Chamber will not turn on")`. The engineer tells the Chief Engineer "Fay, I cannot light the engine: Gas to Chamber will not turn on.", the Chief Engineer tells the Captain "The engine is not lit: Gas to Chamber will not turn on. The emitters have not been switched on.", and the engineer goes back to its post. Nobody lights the engine. The station batteries run flat a few minutes later (the change log's "station power fails early"), and the Captain has been told it is a fault in a pump that works.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:579`, in `afterActing`:

    if (!ok) {
      // A step that does not take is tried once more. After that the job stops here.
      engine.tries[key] = (engine.tries[key] ?? 0) + 1;
      if (engine.tries[key] >= STEP_TRIES) {
        stick(brain, engine, step.fails);
      }
      return;
    }

`engine.ts:62`, the words it stops with, fixed per step:

    const words = {
      on: ['turning on', 'will not turn on'],
      off: ['turning off', 'will not turn off'],
      full: ['setting to full', 'will not go to full'],
    };
    ...
      fails: `${name} ${words[how][1]}`,

`code/modules/llm_crew/crew_npc_hands.dm:405`, a walk that came to nothing, reported for `work_machine` as for any errand:

    crew_controller.finish_errand(list(FALSE, "You could not get to it."))

`code/modules/llm_crew/crew_npc_machines.dm:313`, a click the body was not fit to make:

    if(!click_as_body(machine, "ctrl=1") || QDELETED(machine))
    	return list(FALSE, "You cannot reach the [machine_name] to turn it [wanted].", FALSE)

ENG-01 is the same blindness on the switch-off and switch-on paths, where failures are not counted at all. This is the other side of it: on the lighting path they are counted, and counted wrong.

## How it was found

Read from the code, both sides. Not seen in a round: in `data/logs/2026/11/19/round-20.43.32` every step took the first time.

## How to fix it

0. A window-only way, smaller: `noteResult` in `driver.ts` already has `event.text` and passes it to `wantedAfterActing`. Add it as a seventh argument to `Job.afterActing` (`jobs/job.ts`) and in `engineer.ts` sort by the server's fixed words: "You could not get to it." and "You cannot reach" are unreached, "no free hand" and "no wrench" are hands, "You know of no such machine." is unknown, the rest are the machine. It ties the window to the server's wording, which step 1 avoids; I would take step 1 if the server is being touched anyway, step 0 otherwise.
1. Server: give `work_machine`'s failures a reason the brain can read, in the action result's details: `reason = "unreached"` for "You could not get to it." and "You cannot reach ...", `"hands"` for no free hand or no wrench to hand, `"unknown"` for "You know of no such machine.", and `"machine"` for "will not turn on/off/go to full/connect/switch" and "will not take the settings" (with `"no_power"` where ENG-02's fix tells that apart). `finish_errand` passes `security_details` only for security tools today; add a `machine_details` the same way, or have `work_machine` return the reason as a third list item.
2. Window, `engineer.ts` `afterActing`: count towards `STEP_TRIES` only `reason === 'machine'` (and `no_power`). For `unreached` and `hands`, leave it to the driver's back-off and count separately, with a larger cap (say 5). For `unknown`, stop at once with `UNKNOWN_ENGINE`.
3. When it does stop, say the true reason: a `stuckLine` for each reason ("I cannot get to Gas to Chamber", "my hands are full and I cannot free one"), so the Chief Engineer and the Captain hear what is wrong. `STUCK_WORDS` already takes whatever follows "I cannot light the engine:".
4. Owner's question: should a stop for a reason that is not the machine's (unreached, hands) be tried again by itself after a few minutes, without the Captain's word? The plan says the engine is not lit again unasked only after a shut-off for integrity; a stop that never touched the emitters is not that.

## How to test the fix

- `tools/llm_crew/engine.ts`: an engineer brain on step 9 gets two `work_machine` results with `ok: false, reason: 'unreached'`. `engine.stuck` stays null and the step is offered again after the back-off. With `reason: 'machine'` twice, it sticks, and the word owed names the machine.
- Simulator: have the stand-in server fail one lighting step twice with "You could not get to it." (SIM-04 notes the stand-in cannot give these failures yet).
- In a round, grep `game.log` for `could not work the` lines and check that a stuck line in `pda.log` names the same reason.

## Check

Opus 5.5, 2026-11-19. Read today: `afterActing`, `syncTasks`, `stick`, `startLighting` and `STEP_TRIES = 2` in `jobs/engineer.ts`; the `pump` step words in `jobs/engine.ts`; `noteResult` and `fail` (`RETRY_MS` 20 s) in `driver.ts`; the `afterActing` type in `jobs/job.ts`; `crew_npc_fail_errand` and `finish_errand` in `crew_npc_hands.dm`; `tool_work_machine`, `work_machine`, `turn_machine`, `switch_emitter`, `connect_canister` in `crew_npc_machines.dm`; the Chief Engineer's stuck reader and `lightAgain` in `jobs/chiefengineer.ts`. The quotes are as the code is. Traced: a walk that comes to nothing ends in `finish_errand(list(FALSE, "You could not get to it."))`, which sends `action_result` with no details for `work_machine`; `afterActing` counts it under the step's key exactly as a machine that would not take; at two it calls `stick` with the step's fixed `fails` words; `lighting(engine)` is then false and the two-minute start needs `!engine.told`, so nothing starts again until `lightAgain` or the engineer's own "light the engine" order. The Chief Engineer passes the words to the Captain as "The engine is not lit: ...". Nothing in the change log chose this. `round-20.43.32/game.log` has 24 "worked the" lines and no "could not work the" line, as the finding says.

Not checked: that a player standing in the one-tile gap does make the walk fail rather than wait (the reach and step-aside code was not traced), and that both hands can hold trade tools so `empty_clicking_hand` fails. The walk case alone is enough. Severity medium kept: rare, and the Captain can restart it with one order, but the engine is left dark with a false reason. Effort medium kept: step 0 is window-only and under 100 lines. Added step 0. Nothing run.
