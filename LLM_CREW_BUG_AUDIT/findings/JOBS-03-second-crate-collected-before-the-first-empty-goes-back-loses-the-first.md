---
id: JOBS-03
title: Sent for two crates, a body that hauls the second before taking the first empty back leaves the first empty crate where it was unpacked for good
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:157, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:166, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:115, code/modules/llm_crew/crew_npc_held.dm:419, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:371
fix: In planPickups, while another collect task of this body is unpacked and an empty is still to go back, a crate not yet hauled waits, so take_back runs first
---

## What is wrong

The server remembers one empty crate per body to take back: `crate_to_return` is a single weak reference, set by `crate_collected` each time a collected crate is tipped out (`crew_npc_held.dm:419`). The window sees only whether it is set (`brain.crateToReturn`).

Each crate errand is its own task. An unpacked task sends `take_back` while `brain.crateToReturn` is TRUE, and finishes as soon as it is FALSE (`syncPickups`, `told && !brain.crateToReturn`). Nothing stops a second, not yet hauled, task from going first. If it does, its `collect_crate` overwrites `crate_to_return` with the second crate. The first empty is forgotten by the server. The next `take_back` fetches the second crate, `crateToReturn` goes FALSE, and **both** tasks finish. The first empty stays in the room.

Which goes first is decided by `workInOrder` (`tasks.ts:334`). Both tasks are `asked`, both are ready, both are "collecting" (`isCollecting`), both have the room the body is standing in as their `place` (`isRightHere`), so the last tie-breaker settles it: the older task first (`a.task.createdAt - b.task.createdAt`). If the older errand is the one not yet hauled, it wins over the younger one's message and take-back.

One concrete case: the Head of Personnel sends the only janitor for crate #9 and, a little later, for crate #12, both to the Custodial Closet (with one janitor, `sendFor` in `head.ts` sends every crate to it). At the counter the janitor asks for both (while #9's ask is waiting, #12's is the ready one). The technician brings out #12 first. The janitor hauls #12 to the closet and tips it out; `crate_to_return` is #12's crate. Back in the closet, #9 is now out in the lobby. #9's task is older, so `collect_crate` for #9 comes before #12's "is unpacked in" message and its `take_back`. The janitor hauls #9; `crate_to_return` becomes #9's crate. Then #12's message goes, `take_back` brings #9's empty to the lobby, `crateToReturn` is FALSE and both tasks are finished. #12's empty crate stays in the Custodial Closet.

The same happens whenever an older errand's crate comes out while a younger one's empty is still to go back.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:157` and `:166`, in `planPickups`: the take-back and the haul are planned independently of each other:

    return brain.crateToReturn
      ? {
          ready: true,
          step: `You have unpacked crate #${number} in the ${room}. You are taking the empty crate back ...`,
          act: { tool: 'take_back' },
        }
    ...
    if (crateOf(brain, task)?.out) {
      return {
        ready: true,
        ...
        act: { tool: 'collect_crate', number: Number(number), place: room },
      };
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:114`, in `syncPickups`: every unpacked task finishes on the one flag:

    const told = task.toldUnpacked || !brain.hasPda || !task.askedBy;
    if (told && !brain.crateToReturn) {

`code/modules/llm_crew/crew_npc_held.dm:419`, in `crate_collected`:

    crate_to_return = WEAKREF(hauled)

## How it was found

Read from the code: `planPickups`, `syncPickups`, `workInOrder` in `tasks.ts`, `crate_collected` and `tool_take_back` on the server. The order in which cargo brings two crates out was not checked against `cargo.ts`, so how often the second comes out first is a guess; hence `likely`.

## How to fix it

1. In `planPickups`, before the `crateOf(brain, task)?.out` branch, add: if `brain.crateToReturn` and some other COLLECT task of this brain is `unpacked` and not done, return `{ ready: false, step: 'You are taking the empty crate back to cargo first. You will collect this one on the way.' }`. The unpacked task's `take_back` is then the only ready step; it ends in the lobby, where the next crate is waiting.
2. Only wait when such an unpacked task exists. If the task that owned the empty has gone (see JOBS-02), waiting on `crateToReturn` alone would hold the errand for good.
3. Larger alternative, if the owner prefers it: make `crate_to_return` a list on the server, have `tool_take_back` haul the nearest, and send `crate_to_return` as TRUE while the list is not empty. That also covers a crate errand that some other job adds later.

## How to test the fix

- Simulator: a scenario with two crates sent to one janitor, where the server puts out the younger first. After both are unpacked there must be two `take_back` results, and the window must not finish the second task until both empties are back.
- In a round, count "You bring the empty crate back" lines in `game.log` against "unpack it there" lines for the same body.
