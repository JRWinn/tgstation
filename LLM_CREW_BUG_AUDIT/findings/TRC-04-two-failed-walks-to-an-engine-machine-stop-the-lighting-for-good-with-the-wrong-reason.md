---
id: TRC-04
title: Two lighting steps that fail for any reason, a blocked walk or a full hand included, stop the lighting for good, and the Chief Engineer and the Captain are told the machine will not take
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
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

Each of these is told to the brain as a plain FALSE. `afterActing` gets `ok` and the tool's arguments, not the server's words, so it cannot tell them apart from "The Gas to Chamber will not turn on. It may have no power."

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

1. Server: give `work_machine`'s failures a reason the brain can read, in the action result's details: `reason = "unreached"` for "You could not get to it." and "You cannot reach ...", `"hands"` for no free hand or no wrench to hand, `"unknown"` for "You know of no such machine.", and `"machine"` for "will not turn on/off/go to full/connect/switch" and "will not take the settings" (with `"no_power"` where ENG-02's fix tells that apart). `finish_errand` passes `security_details` only for security tools today; add a `machine_details` the same way, or have `work_machine` return the reason as a third list item.
2. Window, `engineer.ts` `afterActing`: count towards `STEP_TRIES` only `reason === 'machine'` (and `no_power`). For `unreached` and `hands`, leave it to the driver's back-off and count separately, with a larger cap (say 5). For `unknown`, stop at once with `UNKNOWN_ENGINE`.
3. When it does stop, say the true reason: a `stuckLine` for each reason ("I cannot get to Gas to Chamber", "my hands are full and I cannot free one"), so the Chief Engineer and the Captain hear what is wrong. `STUCK_WORDS` already takes whatever follows "I cannot light the engine:".
4. Owner's question: should a stop for a reason that is not the machine's (unreached, hands) be tried again by itself after a few minutes, without the Captain's word? The plan says the engine is not lit again unasked only after a shut-off for integrity; a stop that never touched the emitters is not that.

## How to test the fix

- `tools/llm_crew/engine.ts`: an engineer brain on step 9 gets two `work_machine` results with `ok: false, reason: 'unreached'`. `engine.stuck` stays null and the step is offered again after the back-off. With `reason: 'machine'` twice, it sticks, and the word owed names the machine.
- Simulator: have the stand-in server fail one lighting step twice with "You could not get to it." (SIM-04 notes the stand-in cannot give these failures yet).
- In a round, grep `game.log` for `could not work the` lines and check that a stuck line in `pda.log` names the same reason.
