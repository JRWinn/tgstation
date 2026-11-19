---
id: DESK-08
title: Told of a mess in a room bigger than it can see, a janitor stands inside the door five seconds, sees none, and tells the caller it is cleaned up
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:423, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:592, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:933, code/modules/llm_crew/_defines.dm:2
fix: Before a told mess task is finished with no mess seen, have the body walk the room once (a look-round step), and say it found no mess rather than that the mess is cleaned up
---

## What is wrong

A mess task the janitor was told of is finished "once it has gone there, looked about, and seen none". Looking about is only standing in the room for `LOOK_ABOUT_DS` (50 ds, five seconds) wherever the walk put it. Nothing walks it round the room. The body sees `CREW_NPC_VISION_RANGE` (7) tiles, and less round crates and walls. A room larger than that, or one the body enters at a corner, can hold the mess out of sight.

The task is then done, and the caller is owed word. The word is `sayDone`: "Victor, the mess in the Cargo Bay is cleaned up." It cleaned nothing.

Cargo watches its own rooms (`work_area_messes`), so its tidy task stays open, and after a while it calls a janitor again. The same thing happens, and goes on happening.

Concrete case, MetaStation's Cargo Bay (about 20 tiles across, full of crates):

1. Victor sends "There is a mess in the Cargo Bay: pool of oil. Could you come and clean it up, please? Come to the Cargo Lobby and I will let you in." The oil is by the shuttle dock, on the far side of the bay.
2. The janitor is let in through the lobby side. `mess_places` has no remembered mess in the Cargo Bay, since it has never seen one there.
3. `plan`: in the room, no `cleanableMesses`, the room not in `workablePlaces`: "Your mop will not shift it.", not ready.
4. Five seconds in: `syncTasks` finds `lookedAbout` TRUE and `messy` without the Cargo Bay, and finishes the task.
5. Victor is in view, so the driver says "Victor, the mess in the Cargo Bay is cleaned up." The janitor asks to be let out.
6. Victor's tidy task is still open, since the oil is still there. He calls again later.

The plan step in point 3 also says "Your mop will not shift it", which is not true: there is nothing in sight to shift.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:423`, in `syncTasks`:

    // A mess it saw for itself is done with once the body has seen every spot of it clean. One it
    // was only told of is done with once it has gone there, looked about, and seen none.
    const lookedAbout =
      brain.location === task.place &&
      brain.now - brain.inPlaceSince >= LOOK_ABOUT_DS;
    if (task.source !== 'told' || lookedAbout) {
      finishTask(brain, task);
    }

`janitor.ts:592`, in `plan`, what it does meanwhile:

    if (task.place === brain.location) {
      // A mess it remembers further off in the room counts: the body walks over to it.
      return brain.cleanableMesses.length > 0 ||
        brain.workablePlaces.includes(brain.location) ||
        brain.doing?.startsWith('cleaning')
        ? { ... act: { tool: 'clean' } }
        : { ready: false, step: `Your ${brain.cleaningTool} will not shift it.` };
    }

`janitor.ts:933`:

    sayDone: (task) =>
      task.kind === CLEAN ? `the mess in the ${task.place} is cleaned up` : null,

`code/modules/llm_crew/_defines.dm:2`:

    #define CREW_NPC_VISION_RANGE 7

## How it was found

Read from the code. Not seen in a round, and the Cargo Bay's size and where the janitor stands after being let in were not measured: hence `likely`. The rule is the same for any big room: Medbay, the Bar with its lounge, Arrivals.

## How to fix it

1. Server: add a look-round step, or reuse an existing walk, that takes the body to the middle of a named room and, if the room is bigger than its sight, to a second spot on the far side. `safe_spot_in` already picks a spot in a room. Each spot it stands on refreshes `remember_messes`.
2. Window: in `plan`, for a told task in the room it is in, with no mess in sight and none remembered there, and not yet looked round (`task.lookedRound` unset), send that step.
3. In `syncTasks`, finish a told task with no mess seen only once `task.lookedRound` is set (set it in `afterActing` when the step comes back), not after five seconds.
4. When it finishes that way, it did not clean anything. Mark it (`task.foundNone = true`) and have `sayDone` say "I found no mess in the Cargo Bay." for such a task, so the caller knows to say where. Keep "is cleaned up" for a task where it cleaned (`task.cleanedSome`).
5. Make the not-ready step in point 3 above say "There is no mess in sight here." when `cleanableMesses` is empty and nothing is remembered, rather than that the tool will not shift it.
6. The look-and-report order in `jobs/orders.ts` uses the same five-second look (`LOOK_ABOUT_DS` there): the same look-round step would serve it.

## How to test the fix

- Simulator: a told mess in a room where the mess is not in the first view. The janitor must take the look-round step before finishing, and if it then sees the mess, clean it.
- Server compile to a side copy for the new step.
- Next round: grep `game.log` for "is cleaned up" said by a janitor and check `work_area_messes` for that room (or the technician calling again) after it.
