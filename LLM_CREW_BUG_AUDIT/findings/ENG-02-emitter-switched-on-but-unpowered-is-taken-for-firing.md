---
id: ENG-02
title: An emitter that is switched on but has no power is taken for a firing one, so a dead engine is reported lit and sent to be relit every five minutes for ever
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: code/modules/llm_crew/crew_npc_machines.dm:330, code/modules/llm_crew/crew_npc_machines.dm:165, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:301, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:603
fix: Have switch_emitter and the machine state count an emitter as firing only when it is active and powered, and give the relight a reason word back so the Chief Engineer stops sending it and tells the Captain the emitters have no power
---

## What is wrong

In the base game an emitter has two flags: `active`, which is the switch, and `powered`, which is whether the grid under it can feed it. An emitter that loses power keeps `active = TRUE` and simply stops firing (`process_early` in `code/modules/power/singularity/emitter.dm`). Switching one on, by `interact()`, sets `active` whatever the power: it checks only that it is welded, on a wire, and unlocked.

The crew code reads only `active`:

- `switch_emitter` answers "You switch the emitter on" (or "is on already") from `emitter.active`.
- `crew_npc_machine_state` tells the brain an emitter is "on" (the type's comment says "an emitter firing") from `emitter.active`. This one does no harm today: it reaches the brain as `machines[].seen`, and no brain code reads `seen` (only `tools/llm_crew/sim.ts` fills it). It will mislead whoever first reads it.

So the two cases that matter most are both misread:

1. **Power gone before the engine is lit.** The plan's own warning: "with the batteries flat the emitters have nothing to fire with, so the engine has to be lit before the batteries run out." If they are flat, or the engine room's grid is cut, the engineer switches the three emitters on, each switch "takes", and it tells the Chief Engineer "the engine is lit". The Chief Engineer's meeting closes with "The engine is lit." and the Captain's report says the same. Nothing is firing.
2. **The emitters stop later because their power went.** The Chief Engineer sees energy at nothing and integrity sound (`syncTasks`, the `relight` branch) and sends "the emitters have stopped. Switch them on again, please." The engineer walks to each emitter, each is "on already" (`switch_emitter` returns TRUE without a click), all three count as switched, and it reports "the emitters are on again". The Chief Engineer sets `litAt = brain.now` and after `RELIGHT_EVERY_DS` (five minutes) sends the engineer again. For the rest of the round, every five minutes, the engineer walks into the engine room and back, and says the emitters are on. The Captain is never told the engine is dark, and the true cause, no power to the emitters, is never named.

The second is a loop with no way out: nothing counts the relights, and the word back cannot say anything but "on again". It ends only if power comes back. A switched-on emitter that gets power again starts firing by itself, the reading shows energy, and the relight branch stops. So a grid check that passes ends the loop, and the loop lasts for ever only when the engine room's grid stays dead.

One case: a grid check event, or the station batteries running flat in a round where the engine was lit late, leaves the engine room's emitters without power. `reading.energy` falls to 0, `reading.integrity` is 100. Two minutes after `litAt` the Chief Engineer orders the relight. `work_machine` on m-emitter 1, 2 and 3 each answers TRUE, "The emitter is on already." The engineer says "Ada, the emitters are on again." `chief.litAt = brain.now`. Five minutes later the same again, and again.

## Where

`code/modules/llm_crew/crew_npc_machines.dm:330`, `switch_emitter`:

    var/wanted = on ? "on" : "off"
    if(!!emitter.active == on)
    	return list(TRUE, "The emitter is [wanted] already.", FALSE)
    ...
    if(!!emitter.active != on)
    	return list(FALSE, "The emitter will not switch [wanted]: ...", FALSE)
    return list(TRUE, "You switch the emitter [wanted].", TRUE)

`crew_npc_machines.dm:165`, `crew_npc_machine_state`:

    if(CREW_MACHINE_EMITTER)
    	var/obj/machinery/power/emitter/emitter = machine
    	return list("on" = !!emitter.active)

`code/modules/power/singularity/emitter.dm`, `process_early` (base game): losing power does not clear `active`.

    if(power_usage && surplus() < power_usage)
    	if(powered)
    		powered = FALSE
    		update_appearance()
    		investigate_log("lost power and turned OFF at [AREACOORD(src)]", INVESTIGATE_ENGINE)
    		log_game("[src] lost power in [AREACOORD(src)]")
    	return

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:301`, the relight with no cap:

    if (
      reading &&
      !chief.shut &&
      !chief.order &&
      chief.litAt !== null &&
      reading.energy <= ENERGY_NOTHING &&
      brain.now - chief.litAt > LIT_GRACE_DS &&
      brain.now - chief.relitAt > RELIGHT_EVERY_DS
    ) {
      chief.order = { what: 'relight', givenAt: null, sent: false };
      chief.relitAt = brain.now;
    }

`jobs/chiefengineer.ts:603`, in `hearEngineer`: "on again" is believed and starts the clock over.

    if (ON_AGAIN_WORDS.test(text)) {
      heardIt();
      // Give the crystal time to take the beams before reading it as stopped again.
      chief.litAt = brain.now;
    }

## How it was found

Read from the code, base game included (`emitter.dm` `interact` and `process_early`). Not seen in a round: no round log has had the emitters stop.

## How to fix it

1. Server, `switch_emitter`: for `on`, after the switch (or when it is on already), look at `emitter.powered` as a player looks at the emitter. A player sees an orange beam overlay instead of green (`update_overlays`), and on examine "Its status display is glowing faintly." (`icon_state_underpowered` is declared but never used, so it is not the sign). If it is switched on and not powered, answer FALSE with the reason "The emitter is switched on, but it has no power: it is not firing." and a `details.reason = "no_power"`. For `off`, `active` alone is right. A powered check needs a moment after the switch. `process_early` returns before touching `powered` while the emitter is off, so just after switching on, `powered` still says what it was when the emitter was last on, and that can be TRUE long after the grid died. Wait at least one `SSmachines` tick (`wait = 2 SECONDS` in `code/controllers/subsystem/machines.dm`) before looking, the way `force_door_open` waits for the door. One more thing to settle: an emitter left switched on with no power will fire by itself once power comes back. Either switch it off again before answering FALSE, or make the stuck cue and line say it is switched on (today's stuck cue says "You have not switched the emitters on", which would then be false). Ask the owner. I would switch it off: emitters last, on an order, is the plan's rule.
2. Server, `crew_npc_machine_state`: send `"on" = emitter.active && emitter.powered` for an emitter, or a separate `"powered"` key. The type comment in `types.ts` already says "an emitter firing".
3. Window, `jobs/engineer.ts`: with step 1, a lighting step that fails for `no_power` is stuck at once (not tried twice), and the stuck line names it: "the emitters have no power". The relight is the case ENG-01 covers: after the failures it owes a word "I cannot switch the emitters on again: they have no power."
4. Window, `jobs/chiefengineer.ts`: on that word, stop relighting (do not let the `relight` branch fire again until a reading shows energy), and tell the Captain "The engine has stopped: the emitters have no power." Also cap relights: after two in a row with no energy seen between them, stop and tell the Captain, whatever the engineer said.
5. Owner's question: who restores power to the emitters? That is stage 2 of the engineering plan (GAP-19). Until it is built, the honest end is to say so to the Captain.

## How to test the fix

- `tools/llm_crew/engine.ts`: a Chief Engineer brain with `litAt` set, a reading of energy 0 and integrity 100, and the engineer answering "the emitters are on again" each time. After two relights it should stop and owe the Captain a line.
- Simulator: give the toy emitters a "no power" state in `sim.ts` in which switching on succeeds and the crystal gains nothing, and check the Captain is told within ten minutes, not relit for ever.
- In a round, grep `game.log` for "lost power in" next to "emitter", then for "worked the emitter" after it.

## Check

Checked by Opus 5.5. Confirmed. Severity lowered to medium and effort raised to large.

- Every quote matches the code today: `switch_emitter` and `crew_npc_machine_state` in `crew_npc_machines.dm`, the relight branch at `chiefengineer.ts:301`, and `ON_AGAIN_WORDS` in `hearEngineer` at `chiefengineer.ts:603`.
- Base game read: `emitter/interact()` checks only `welded`, `powernet` and `locked`/`allow_switch_interact`, then flips `active`. `process_early` sets `powered = FALSE` when `surplus()` is short and returns, leaving `active` alone. It also returns before touching `powered` while `!active`, so `powered` goes stale while the emitter is off. The write-up now says so, because the fix has to wait a tick before reading it.
- Ran a throwaway script (bun, outside the repo). A Chief Engineer was told "the engine is lit", read integrity 100 and energy 0, and was answered "the emitters are on again" after each order. It sent the relight at 3050, 6100, 9150, ... 36600 deciseconds, every five minutes for an hour, and owed the Captain nothing.
- `machines[].seen` is never read by brain code, so the `crew_npc_machine_state` half of the fault does nothing today. The write-up now says so. The harm all comes from `switch_emitter` and the Chief Engineer believing "on again".
- Nothing in the change log or `LLM_CREW_PLAN_ENGINEERING.md` covers it. The plan's "at most once in five minutes" sets how often, not a cap, and its section 1 warning about flat batteries is the case here.
- Severity medium, not high. The loop needs the engine room's grid to stay starved. A lit, working engine should keep it fed, and a grid check that passes ends the loop when the emitters fire again by themselves. Case 1 needs the batteries flat within the first few minutes. Both are real, and the Captain is told something false, but neither will come up in most rounds. Effort large: the fix needs both the server (`switch_emitter`) and the window (the engineer's word and the Chief Engineer's cap), and the relight half leans on ENG-01's fix.
