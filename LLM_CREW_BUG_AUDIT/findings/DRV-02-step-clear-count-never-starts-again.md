---
id: DRV-02
title: Having stepped clear twice in a room, a body never steps clear in that room again, on any later visit
kind: bug
severity: low
effort: small
confidence: sure
status: found
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:105, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198
fix: Start the count again when the body leaves the room, and clear the map in stopSession
---

## What is wrong

The cap of two step-clears is meant for one stay in one room ("some rooms have a door by every tile it can stand on"). The count is kept in a map outside the brain, by NPC id, as `{ place, count }`, and it is only started again when the body next tries to step clear in a different room. Leaving the room does not reset it. Nor does time.

One concrete case: at the first staff meeting in the Bar a janitor steps clear twice (or, with DRV-01, has both tries used up without moving). Twenty minutes later the second meeting is called in the Bar. It has not tried to step clear anywhere else in between, so the map still says `{ place: 'Bar', count: 2 }`. It stops in the doorway and `mayStepInside` says no at once. It waits the whole meeting in the doorway, pushed in and out of the room by everyone who comes through, which is what the step clear was built to stop. Staff meetings are held in the same room every time, so this is every meeting after the first.

A second, smaller fault in the same place: the map is module state and `stopSession` does not clear it. NPC ids are reused by position (`npc1`, `npc2`) for a new set of NPCs after the window is closed and opened again in the same client, so a new body can start with another's count.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:105`:

    const stepInsideTries = new Map<string, { place: string; count: number }>();
    ...
    function mayStepInside(brain: NpcBrain): boolean {
      const tries = stepInsideTries.get(brain.id);
      const count = tries && tries.place === brain.location ? tries.count : 0;
      if (count >= STEP_INSIDE_MAX) {
        return false;
      }
      stepInsideTries.set(brain.id, { place: brain.location, count: count + 1 });
      return true;
    }

Nothing else writes to `stepInsideTries`. `brain.ts:198`, `stopSession`, clears `brains`, the queues, `clearExpected()` and `clearRounds()`, and not this map.

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. Move the count onto the brain (`brain.steppedInside: { place: string; count: number } | null`), so that it goes when the brain goes and `stopSession` needs no extra line. Add the field to `NpcBrain` in `types.ts`, to the new-brain block in `ingest` (`brain.ts`), and to `makeBrain` in `tools/llm_crew/fixtures.ts`.
2. In `ingest`, in the block that already runs when `brain.location !== npc.location`, set it to null. A body pushed a tile out of the room and straight back would then get two more tries each time, which is the loop the cap was made for, so only clear it when the body has been out of the room for longer than the nudge window: use `leftPlace` (`stillIn` in `tasks.ts` already treats 10 seconds out as not having left), or simply clear it when the waiting task that asked for the step is done.
3. Do this together with DRV-01, which changes the same function.

## How to test the fix

A table test with the fixture brain: step clear twice in the Bar, move the brain to the hallway for more than 10 seconds, bring it back to the Bar doorway with a waiting task, and `nextStep` must offer `step-inside` again.
