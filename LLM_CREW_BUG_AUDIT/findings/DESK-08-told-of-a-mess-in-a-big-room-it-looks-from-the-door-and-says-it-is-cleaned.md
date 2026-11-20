---
id: DESK-08
title: Told of a mess in a room bigger than it can see, a janitor stands inside the door five seconds, sees none, and tells the caller it is cleaned up
kind: bug
severity: medium
effort: medium
confidence: likely
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:423, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:592, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:933, code/modules/llm_crew/_defines.dm:2
fix: Before a told mess task is finished with no mess seen, send go_to with middle true for that room once, and say it found no mess rather than that the mess is cleaned up
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

1. No new server step is needed for the first look: `tool_go_to(place, middle)` already walks the body to `middle_of` the room (`crew_npc_tools.dm:208`, `crew_npc_cargo.dm:245`), and `jobs/meetings.ts` and `jobs/head.ts` send it as `{ tool: 'go_to', place, middle: true }`. `safe_spot_in`, which the let-in walk uses for a room the body has never stood in, picks the nearest of 40 random safe tiles: near the door it came in by, so it is the wrong helper here. Each sense tick on the way refreshes `remember_messes`. A second spot on the far side of a room wider than 15 tiles would need a new server helper; leave that unless a round shows the middle is not enough.
2. Window: in `plan`, for a told task in the room it is in, with no mess in sight and none remembered there, and not yet looked round (`task.lookedRound` unset), send `{ tool: 'go_to', place: task.place, middle: true }` ("You were told of a mess here and see none from where you stand. You are walking into the middle of the room to look.").
3. In `syncTasks`, finish a told task with no mess seen only once `task.lookedRound` is set (set it in `afterActing` when that `go_to ... middle` comes back, ok or not, as `jobs/meetings.ts:661` does for its walk to the middle) and the body has stood there `LOOK_ABOUT_DS` since, not after five seconds from the door.
4. When it finishes that way, it did not clean anything. Mark it (`task.foundNone = true`) and have `sayDone` say "I found no mess in the Cargo Bay." for such a task, so the caller knows to say where. Keep "is cleaned up" for a task where it cleaned (`task.cleanedSome`).
5. Make the not-ready step in point 3 above say "There is no mess in sight here." when `cleanableMesses` is empty and nothing is remembered, rather than that the tool will not shift it.
6. The look-and-report order in `jobs/orders.ts` uses the same five-second look (`LOOK_ABOUT_DS` there): the same look-round step would serve it.

## How to test the fix

- Simulator: a told mess in a room where the mess is not in the first view. The janitor must take the look-round step before finishing, and if it then sees the mess, clean it.
- Type check from `tgui/` (no server change if the existing `middle` walk is used). A table case: a told CLEAN task, body in that room, no `messPlaces`, `inPlaceSince` 60 ds ago, no `lookedRound`: the task must still be open and `plan` must give the `go_to ... middle` step; with `lookedRound` set and nothing seen, it is finished and `sayDone` says it found no mess.
- Next round: grep `game.log` for "is cleaned up" said by a janitor and check `work_area_messes` for that room (or the technician calling again) after it.

## Check

Read `syncTasks`, `plan`, `letInStep`, `readsMessage`, `afterActing` and `sayDone` in `jobs/janitor.ts`; the done-word in `driver.ts:486-497` (said to `askedBy` once in view, with `sayDone`); `finishTask` in `tasks.ts`; `observe` in `memory.ts` and `brain.ts:415` (`inPlaceSince` is set the moment the room name changes); `tool_go_to`, `place_spot`, `safe_spot_in` and `middle_of` on the server; `tool_clean` (falls back only to a mess the body remembers in that room); and cargo's TIDY sync in `jobs/cargo.ts` (`CALL_AGAIN_DS` 6000, ten minutes). Every quote matches.

The case holds. A call from cargo makes a CLEAN task with `source: 'told'`. Let in, the body walks to `place_spot`, which for a room it has never stood in is `safe_spot_in` from where it stands: a tile near the door. Nothing in the janitor's steps walks it further while no mess is in sight. Five seconds after the room name changed, `syncTasks` finishes the task (the oil is not in `mess_places` because the body never saw it), and the driver says "Victor, the mess in the Cargo Bay is cleaned up." once Victor is in view. Cargo's TIDY task stays open while the mess is still in its `areaMesses`, and calls again after ten minutes. The not-ready step "Your ... will not shift it" is also said with nothing in sight.

Not measured: the size of MetaStation's Cargo Bay against 7 tiles of sight, or how often a told mess lies out of view from the door. Hence `likely` stays. Nothing in the change log or plans covers this. The fix is window-only with the existing `middle` walk, and keeps the rules (it walks, it sees with its own eyes).
