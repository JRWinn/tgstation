---
id: KNB-11
title: With no engineer free to do it nobody lights the engine, and with no PDA reading the Chief Engineer never orders the emitters off
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:210, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:279, code/modules/llm_crew/crew_npc_engineering.dm:105
fix: Let the Chief Engineer take the engineer's lighting list itself when no engineer has taken the order, and go and look at the crystal when the monitor has told it nothing for some minutes
---

## What is wrong

Two things the 2026-11-18 11:00 entry ("a Chief Engineer and a station engineer who light the engine") lists under "Known and not fixed", which nobody came back to:

- "With no engineer aboard nothing lights the engine. The Chief Engineer does not do it itself."
- "The Chief Engineer does not go to the engine room to see for itself. With the power gone it has no reading and knows nothing." And in the list above it: "that the PDA gives a reading at all. If it never does, the Chief Engineer never orders the emitters off".

Why it matters: the engine is the reason engineering was built ("rounds go dark at about fifteen", and PDA messages stop with the power). The whole of it hangs on one body. The one engineer is also the body that is sent to force doors for security (18:50 entry), can be arrested on a warrant, can be shut in a room, and may question or put out a stranger in Engineering in the first minutes (the 11:00 entry's own worry). Later work already made the Chief Engineer step in for a door: "With no engineer, the Chief Engineer goes." Nothing made it step in for the engine.

1. **No engineer, no engine.** The order to light it is given only to an engineer who is standing at the staff meeting: `lightStep` finds one among `present(brain, meeting)` and returns `null` when there is none. The engineer's own two-minute start (`syncTasks` in `jobs/engineer.ts`) needs an engineer's brain. So with the engineer dead, in a cell, or simply not spawned ("Spawn Crew NPC" lets the owner make a Chief Engineer alone), the engine is never lit and the Chief Engineer reports "The engine is not lit" every ten minutes until the batteries run out.
2. **No reading, no watch.** The Chief Engineer's only knowledge of the crystal is `brain.engineReading`, which the server fills from `engine_reading`: null unless its PDA has the monitor program **and** `computer.get_ntnet_status()` is true. Every safety step tests `reading &&` first. So when the network is down (a Communications Blackout, as in the 15:09 round from 15:41:45 to 15:46:50, or the power failing) the integrity can fall to nothing and no order goes out. The one case where the order matters most is the one where it cannot be given.

Concrete case for 2: the engine is lit, a blackout event starts, the crystal starts to lose integrity for any reason. `engine_reading` returns null at `if(!computer.get_ntnet_status()) continue`. In `syncTasks`, `if (reading && !chief.shut && reading.integrity < INTEGRITY_FLOOR)` is false. The Chief Engineer stands in its office. Its voice is told "You have no reading of the engine just now" and that is all.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:220`, in `lightStep`:

      const name = present(brain, meeting).find((it) =>
        isEngineer(jobOf(brain, it)),
      );
      if (!name) {
        return null;
      }

`jobs/chiefengineer.ts:279`, in `syncTasks`:

      if (reading && !chief.shut && reading.integrity < INTEGRITY_FLOOR) {

`code/modules/llm_crew/crew_npc_engineering.dm:110`, `engine_reading`:

    	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
    		if(!(locate(/datum/computer_file/program/supermatter_monitor) in computer.stored_files))
    			continue
    		if(!computer.get_ntnet_status())
    			continue
    		return list("integrity" = round(crystal.get_integrity_percent(), 0.1), "energy" = round(crystal.internal_energy))
    	return null

## How it was found

Read from the code, starting from the two lines of the 11:00 entry. Not seen in a round: every round so far has had an engineer, and the engine was lit in the 12:23 round and after.

## How to fix it

Both are the owner's to approve, since the 11:00 entry records the owner's choice that the Chief Engineer "works nothing in the engine room" and "delegates".

1. **The Chief Engineer lights it when nobody else will.** The lighting list and its stepping are data and one function (`nextLightingStep` in `jobs/engine.ts`) and already take any brain with `engineMachines`. Add a task to the Chief Engineer, open when: the engine is not lit, it is not `stuck` or `shut`, and either it has no engineer on its PDA or in sight, or the order has been given twice with no "The engine, right away." and five minutes have gone. The task's plan is the engineer's: the same `work_machine` steps. The server tool already allows any engineering staff (`works_in_engineering()` in `tool_work_machine`). The Chief Engineer must know the engine room's machines by name, which `engineering_state` sends to engineering staff already.
2. **It goes and looks.** When `brain.engineReading` has been null for some minutes while `chief.litAt` is set, a task "see the engine for yourself": walk to the engine room's door (not in: the radiation ruling stands) and take the reading the way an engineer in the room gets machine states, by sight. The server would send integrity only while the crystal is in view (`engineering_state` already sends machine states "only while it is in view"). From there the existing "emitters off" order follows, said to the engineer's face or done by the Chief Engineer if it has none.
3. Until 2 is built, make the silence loud: when the reading has been null for two minutes with the engine lit, the Chief Engineer tells the Captain once, by PDA and failing that aloud when in sight: "Captain, I have no reading of the engine." Today only its voice is told.

Questions for the owner:

- Should the Chief Engineer light the engine itself when it has no engineer, as it already forces a door itself when it has none?
- With no reading from its PDA, should it walk to the engine room to look, given the radiation decision for stage 1?

## How to test the fix

- `tools/llm_crew/engine.ts` (the table of cases): a Chief Engineer brain with no engineer steps through the same 21 steps; an emitter is never next while another step is undone.
- Simulator: the `engine` scenarios with the engineer removed, and one with `engineReading` forced to null after lighting. Checks: the engine is lit by the Chief Engineer; the Captain is told there is no reading.
- A round with only a Chief Engineer spawned: `game.log` "worked the emitter ... switch_on" by the Chief Engineer.
