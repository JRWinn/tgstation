---
id: JAN-08
title: The engine room's machines are worked out once a round, so a canister swapped onto a connector, or an emitter welded later, is never known, and the old one is walked to wherever it went
kind: gap
severity: low
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: code/modules/llm_crew/crew_npc_machines.dm:56, code/modules/llm_crew/crew_npc_machines.dm:116, code/modules/llm_crew/crew_npc_machines.dm:219, code/modules/llm_crew/crew_npc_engineering.dm:77, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:186
fix: Work the canister and emitter entries out again when looked at - by the connector, not the canister - or rebuild the list when an entry no longer fits, keeping ids stable for the machines that did not change
---

## What is wrong

`crew_npc_engine_machines` is built the first time anyone asks and kept for the round (`GLOB.crew_npc_engine_machines_built`). It takes a canister only if it stands on a connector at that moment, and an emitter only if it is welded at that moment. Each entry holds a weak reference to that one machine, and a "place" worked out then.

So:

1. **A canister swapped.** Engineers use up a nitrogen canister and wrench a full one onto the same connector. The list still points at the old canister. `engineering_state` reports the old one (wherever it now stands) as `canister` nth 1, not connected. A relight's "connect canister 1" step sends the engineer to the old canister, in storage or the hallway, and `work_machine` then answers "That is not a machine you know how to work", because `crew_npc_engine_machine_kind` returns null for a canister not on a connector. The new canister on the connector is never known.
2. **A machine deleted.** If any listed machine is destroyed, its weak reference fails and `engineering_state` leaves it out. `lightingSteps` in `jobs/engine.ts` then matches nothing (every step must find its machine), and the engineer sticks the "unknown engine" note for the rest of the round, even after the machine is rebuilt.
3. **Emitters welded later.** On a map where the engine's emitters start loose, they never enter the list. DeltaStation's four engine-room emitters are plain `/obj/machinery/power/emitter`, which starts unwelded and unanchored. Engine steps exist only for MetaStation now (`ENGINES = [METASTATION]`), so this matters when a second engine is added; but the list rule would still leave those emitters out after they are welded.

Concrete case (1), MetaStation: the engine was lit at 10 minutes with the two nitrogen canisters. At 40 minutes a player engineer unwrenches canister 1 (empty) and wheels it to Engineering storage, then wrenches a full one onto the connector. At 50 minutes the Chief Engineer orders a relight. The engineer NPC's first step is `work_machine` m-id of "nitrogen canister" nth 1, `connect`. It walks to Engineering storage, reaches the empty canister, and `work_machine` returns "That is not a machine you know how to work." (logged as nothing: `work_machine` returns before its log lines when `what` is null).

## Where

`code/modules/llm_crew/crew_npc_machines.dm:56`:

    /proc/crew_npc_engine_machines()
    	if(GLOB.crew_npc_engine_machines_built)
    		return GLOB.crew_npc_engine_machines
    	GLOB.crew_npc_engine_machines_built = TRUE

`code/modules/llm_crew/crew_npc_machines.dm:110` and `:116`:

    		// One that is not fixed down is spare, not part of the engine.
    		return emitter.welded ? list("emitter", CREW_MACHINE_EMITTER) : null
    	...
    		// Only one standing on a connector is there to be connected.
    		if(isnull(locate(/obj/machinery/atmospherics/components/unary/portables_connector) in canister.loc))
    			return null

`code/modules/llm_crew/crew_npc_machines.dm:219`, in `work_machine`:

    	var/list/what = crew_npc_engine_machine_kind(machine)
    	...
    	if(isnull(what))
    		return list(FALSE, "That is not a machine you know how to work.")

## How it was found

Read from the code; DeltaStation's emitters counted from `_maps/map_files/Deltastation/DeltaStation2.dmm` (four `/obj/machinery/power/emitter` in `/area/station/engineering/supermatter/room`, none `/welded`). Not seen in a round.

## How to fix it

1. Key a canister entry by its connector, not by the canister: store a weak reference to the `portables_connector`, and resolve "the canister" each time as whatever canister stands on that connector's turf. The id and nth stay the same; the machine behind them is the one there now. `engineering_state`, `tool_work_machine` and `work_machine` all go through one helper, `crew_npc_engine_machine(entry)`, that does this.
2. For emitters, list every emitter in the engine room, welded or not, and give the brain a `fixed` flag in `seen` (welded and anchored). Leave it to the brain to treat a loose emitter as not ready. Whether an engineer should then wrench and weld it is a question for the owner (it is part of setting up an engine on other maps, engineering plan stage 2).
3. For a deleted machine: when an entry's reference fails, look again on its turf (keep the turf, not just the weak reference) for a machine of the same kind and name, and take that one.
4. Do not rebuild the whole list with new ids mid-round: the brain keeps `engine.done` by machine id.

## How to test the fix

- Server compile to a side copy. `bun tools/llm_crew/engine.ts` for the window side if the `seen` shape changes.
- In a round on MetaStation: swap a nitrogen canister on its connector for a full one and order a relight. The engineer should connect the new one. Grep `game.log` for "worked the nitrogen canister (canister) ... connect".
