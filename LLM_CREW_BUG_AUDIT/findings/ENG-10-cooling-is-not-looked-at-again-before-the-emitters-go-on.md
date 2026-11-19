---
id: ENG-10
title: The engineer never looks again at the cooling it set before it switches the emitters on, though the server tells it how every machine in view stands
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/engine.ts:198, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:587, code/modules/llm_crew/crew_npc_engineering.dm:83
fix: Before each emitter step, take back out of engine.done any step whose machine is in view and seen not to be as it was set, so that it is done again before the emitters
---

## What is wrong

The plan promises: "The emitters are last, and are switched on only when every step before them has been seen done." What is built is weaker. A step is "done" once the server answered that one click went through. `engine.done` only grows. When the engineer reaches the emitters some minutes later, `nextLightingStep` looks only at `done`, not at the machines.

Lighting is 21 steps on 16 machines spread round the engine room and the chamber doors, and takes some minutes of walking. In that time a step can come undone:

- a player, or the Captain looking round, turns a pump off or sets it lower;
- a canister is unwrenched or swapped;
- the engine air alarm is reset by someone at it, or by the alarm's own handling when the room's air goes wrong;
- the engineer itself is pulled away (a forcing job, a stranger in Engineering, the shut-in rules) and comes back much later.

The engineer then switches on all three emitters with a broken loop. That is the one way the plan names for losing the engine room.

The server already gives what is needed. `engineering_state` sends each machine's state while it is in the body's view (`seen = crew_npc_machine_state(...)`: `on`, and `full` for a pump), and `brain.machines` holds it. Nothing in the window code reads `machine.seen`: a search for `.seen` in `CrewBrain` finds only other jobs' own `seen` variables.

The same holds after the engine is lit: the lit engine's machines are never looked at again (the plan chose to watch it only from the PDA, and the integrity floor is the safety net; see KNB-11 for when there is no reading).

One case: the engineer has done 17 steps. A player assistant, wandering the engine room, ctrl-clicks "Gas to Chamber" off. The engineer, standing at the first emitter with the pump in view, has `brain.machines` showing that pump `seen: { on: false, full: true }`. `nextLightingStep(steps, engine.done)` returns the emitter, since the pump's key is in `done`. It switches on all three. The chamber's gas is not going round.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engine.ts:198`, `nextLightingStep`: goes by `done` only.

    export function nextLightingStep(
      actions: EngineAction[],
      done: string[],
    ): EngineAction | null {
      const left = actions.filter((action) => !done.includes(action.key));
      return (
        left.find((action) => action.kind !== 'emitter') ??
        left.find((action) => action.kind === 'emitter') ??
        null
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:587`, `afterActing`: a step once in `done` stays there.

    if (!engine.done.includes(key)) {
      engine.done.push(key);
    }

`code/modules/llm_crew/crew_npc_engineering.dm:83`, `engineering_state`: the state is sent for every machine in view.

    if(can_look && machine.z == body.z && get_dist(body, machine) <= CREW_NPC_VISION_RANGE)
    	in_sight ||= view(CREW_NPC_VISION_RANGE, body)
    	if(machine in in_sight)
    		seen = crew_npc_machine_state(machine, entry["kind"])

## How it was found

Read from the code, server and window. Not seen in a round.

## How to fix it

1. In `jobs/engine.ts`, add `undone(actions, done)`: the keys in `done` whose machine has `seen` set and does not match the step (`how` of `on`/`connect`/`draw_all`/`charge`/`switch_on`: `seen.on` false; `off`/`switch_off`: `seen.on` true; `full`: `seen.full` false).
2. In `engineer.ts` `syncTasks`, while `lighting(engine)`, remove those keys from `engine.done`. Then `nextLightingStep` gives the undone step before any emitter, and the rule stays in one place. Do not count it as a failed try.
3. Optionally, while lit and in the engine room for any reason, do the same and, if a cooling step is seen undone, tell the Chief Engineer ("the Gas to Chamber has been turned off") rather than fixing it unasked. That needs a new word: the owner may prefer to leave the lit engine to the integrity floor, as the plan says.

## How to test the fix

- `tools/llm_crew/engine.ts`: steps with every non-emitter key in `done` and one pump's `seen.on` false: the next step must be that pump, not an emitter.
- Simulator `engine` scenario: have the sim turn one pump off after step 15 is done, and check the engineer turns it on again before the first emitter.
