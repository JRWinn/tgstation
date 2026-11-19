---
id: JAN-09
title: A pump, filter or emitter is looked at a second before the click that toggles it, so if anyone sets it in that second the body sets it back, an emitter switched off is switched on again
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: code/modules/llm_crew/crew_npc_machines.dm:309, code/modules/llm_crew/crew_npc_machines.dm:330, code/modules/llm_crew/crew_npc_machines.dm:259, code/modules/power/singularity/emitter.dm:183, code/modules/atmospherics/machinery/components/binary_devices/pump.dm:37
fix: Do the click gap first and look at the machine after it, just before the click, in turn_machine and switch_emitter, and never click a toggle on a machine already as wanted
---

## What is wrong

A pump's or filter's ctrl-click, and an emitter's plain click, are toggles: the game flips `on` or `active` whatever it was (`set_on(!on)`, `if(active) active = FALSE else active = TRUE`). So the body must only click when the machine is not already as it wants it.

`turn_machine` and `switch_emitter` look first, and then call `click_as_body`, which sleeps `CREW_NPC_CLICK_GAP` (1 second) before it clicks. `switch_emitter` also calls `empty_clicking_hand` in between, which can put something in the bag. Anything that sets the machine in that second (another engineer, the Chief Engineer, a player, a second tool call for the same body) is undone by the click. The body then looks again, sees the machine is not as wanted, and reports it "will not turn on. It may have no power" or "will not switch off: it does not answer" - a reason that is not the real one, and the brain acts on it (ENG-01: an emitter that will not switch off is tried again for ever, now flipping it each time).

The worst case is the shut-down. When the crystal is losing integrity the Chief Engineer orders the emitters off. If two bodies go for the same emitter (two engineers given the order, ENG-03 shows orders are not kept to one engineer; or an engineer and a player), the first switches it off and the second, which looked while it was still on, switches it on again a moment later.

Concrete case:

1. Emitter 2 is firing. Engineer A and engineer B both have "switch_off" for it, and B reaches it a moment after A.
2. A: `switch_emitter` sees `active`, sleeps 1 s, clicks: `active = FALSE`.
3. B: `switch_emitter` looked while A was in its sleep, saw `active`, and is now in its own sleep. It clicks: `interact` sees `active` FALSE and sets it TRUE. The emitter fires again.
4. B looks: `!!emitter.active != on` is TRUE, so it reports "The emitter will not switch off: it does not answer." A has reported it switched off.
5. Usually it rights itself: B's brain sends the step again after the driver's 20-second hold (`RETRY_MS` in `driver.ts`), B looks, sees it on, and switches it off. So the harm is the emitter firing again for about 20 seconds while the crystal is losing integrity, a false failure in the log, and, on the lighting path, a failure counted towards `STEP_TRIES` (two of them stop the lighting, see TRC-04).

The case most likely to come up is not the shut-down but the lighting: every NPC engineer starts the same lighting list by itself after `STANDING_DS` (`syncTasks` in `jobs/engineer.ts`, "Nobody has given it the engine"), so two NPC engineers walk the same steps in the same order at about the same time.

## Where

`code/modules/llm_crew/crew_npc_machines.dm:309`, `turn_machine`:

    	if(!!machine.on == on)
    		return list(TRUE, "The [machine_name] is [wanted] already.", FALSE)
    	if(!click_as_body(machine, "ctrl=1") || QDELETED(machine))

`code/modules/llm_crew/crew_npc_machines.dm:330`, `switch_emitter`:

    	if(!!emitter.active == on)
    		return list(TRUE, "The emitter is [wanted] already.", FALSE)
    	if(!empty_clicking_hand())
    		return list(FALSE, "You have no free hand to switch the emitter [wanted] with.", FALSE)
    	if(!click_as_body(emitter) || QDELETED(emitter))

`code/modules/llm_crew/crew_npc_machines.dm:259`, `click_as_body`, which waits before it clicks:

    	if(gap > 0)
    		sleep(gap)
    	if(QDELETED(body) || QDELETED(target) || QDELETED(src))
    		return FALSE

`code/modules/power/singularity/emitter.dm:183`, the toggle:

    	if(active)
    		active = FALSE
    	else
    		active = TRUE

`code/modules/atmospherics/machinery/components/binary_devices/pump.dm:37`:

    	if(is_operational)
    		set_on(!on)

## How it was found

Read from the code and the base game's emitter and pump. Not seen in a round. `set_pump_full` (alt-click) and `connect_canister` are not toggles that matter here: alt-click only ever sets full, and a second wrench on a connected canister would disconnect it, which `connect_canister` guards against only before its clicks too (see step 3).

## How to fix it

1. Give `click_as_body` an optional `datum/callback/still_wanted`, checked after the sleep and before `ClickOn`. If it returns FALSE, return a value meaning "nothing to do" (say `CREW_CLICK_NOT_NEEDED`, distinct from FALSE "could not reach").
2. In `turn_machine`, pass a check that `!!machine.on != on`; in `switch_emitter`, `!!emitter.active != on`. When the click is not needed, answer `list(TRUE, "The [name] is [wanted] already.", FALSE)`.
3. Do the same in `connect_canister` before the click with the wrench: if `canister.connected_port` is set by then, put the wrench back and answer "connected already". A wrench on a connected canister disconnects it.
4. Simpler alternative if the callback is unwanted, and the one I would take: sleep the gap in the caller (after `empty_clicking_hand`, which can itself put things away), then look, then call `click_as_body(target, modifiers, gap = 0)`. Either way the look must come after the last sleep. Nothing between the look and `ClickOn` sleeps (`can_perform_action` and `face_atom` do not), so in DM no other proc can run in between and the race is closed, not just narrowed.
5. Keep the second look after the click: with the fix it still tells a machine with no power from one that took.

## How to test the fix

- Server compile to a side copy.
- In a round: have an NPC engineer go to switch off an emitter, and switch it off yourself as it reaches it. It should report it off already and leave it off. Grep `game.log` for "worked the emitter (emitter) ... switch_off" and for the emitter's own "turned ON by" line from `emitter.dm`: there should be no ON after the OFF.

## Check

Opus 5.5, 2026-11-19. Read `crew_npc_machines.dm` today: `click_as_body`, `empty_clicking_hand`, `turn_machine`, `set_pump_full`, `switch_emitter`, `connect_canister`, `work_machine`, `tool_work_machine`. The quotes are as the code is. Read the base game: `emitter.dm` `interact` flips `active` whatever it was; `pump.dm` and `filter.dm` `click_ctrl` both do `set_on(!on)`; `portable_atmospherics.dm` `wrench_act` disconnects a connected canister. So the look-then-sleep-then-toggle order is real in all three procs, and no guard between the look and the click checks again. The change log and plans say nothing of it.

How often it comes up is the weak part: it needs a second hand on the same machine inside about a second. Two NPC engineers lighting at once (each starts by itself) or a player working the engine beside the NPC make it possible but not common, and the body's own retry usually puts the machine right within about 20 seconds (added as step 5 above). Severity medium kept, at the low end: a machine is set the wrong way, visibly, in a rare case, and the false failure feeds TRC-04's stop. Effort small kept: three procs in one file. Fix judged: the caller-sleeps variant closes the race fully and keeps the no-cheats rule (it is still the body's own click). Nothing run.
