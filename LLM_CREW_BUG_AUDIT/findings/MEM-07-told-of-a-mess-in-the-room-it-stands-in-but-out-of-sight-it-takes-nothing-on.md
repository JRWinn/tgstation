---
id: MEM-07
title: Told of a mess in the room it is standing in but cannot see from where it stands, a janitor takes nothing on, even from its head
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:205, code/modules/llm_crew/crew_npc_cleaning.dm:240
fix: In takeToldWork take the work in the room it stands in as told work like any other, and let the janitor's look-about rule close it if there is nothing there
---

## What is wrong

`takeToldWork` refuses work of the NPC's own kind in the room it is standing in unless it already has that task:

    // Work in the room it is standing in is work it can see for itself. If it sees none, there is
    // none to take on

That is not true of a big room. The body sees seven tiles (`CREW_NPC_VISION_RANGE`, through `oview`), and the server only knows a mess once the body has had it in sight (`remember_messes` in `crew_npc_cleaning.dm`). Hallways, the Bar, the Cargo Bay, Medbay and Engineering are all wider than that, and walls, counters and doors inside a room hide parts of it. So a janitor standing at one end of the Central Primary Hallway, told of blood at the other end, refuses the work.

It refuses it on every path:

- Its head's order, made out by code: `workInWords` → `takeToldWork` → null, so `ordered` is null.
- The model's `work` answer: `takeToldWork` again → null.
- The model is still told by the janitor's `whenAsked`: "If they tell you of a mess somewhere, tell them you will see to it." So it says it will, and does nothing.

Concrete case, run (script below): janitor Tolly Field in the Central Primary Hallway holding soap, no mess in sight, its head Zim Fire (Head of Personnel, `superior`) beside it says "Tolly, there is blood all over the Central Primary Hallway down by the Bridge, clean it up." `buildTalk` gives `ordered: null`; `takeToldWork(b, 'a mess that needs cleaning', 'Central Primary Hallway', 'Zim Fire', true)` gives null; the task list stays empty. The prompt asks the model for "work" and tells it to say it will see to it.

The comment's other half, "if it does, it has the task already, and this only says who is waiting on it", is the only case it covers.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:205`, in `takeToldWork`:

    if (
      own &&
      where === brain.location &&
      !findTask(brain, kind, { place: where })
    ) {
      return null;
    }

`code/modules/llm_crew/crew_npc_cleaning.dm:240`, `remember_messes`: a mess is remembered only from `in_sight`.

`jobs/janitor.ts`, `syncTasks`: a told-of clean task with no remembered mess is closed once the janitor "has gone there, looked about, and seen none" (`lookedAbout`: standing in the room for `LOOK_ABOUT_DS`). Standing in the room already, it would close after that wait, not after walking the room.

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts`, `CrewBrain/talk.ts` and `CrewBrain/tasks.ts`, set up `janitor()` in the Central Primary Hallway with its head in view, and printed `buildTalk(...).ordered`, the result of `takeToldWork`, and `brain.tasks`. All empty. Not seen in a round log.

## How to fix it

1. In `takeToldWork`, drop the early return. Take the work on as told work (`source: 'told'`, `askedBy`), as for any other room.
2. Then the janitor's own closing rule needs to mean "looked about": in `jobs/janitor.ts` `syncTasks`, a told-of clean task in the room it is in should not close on `LOOK_ABOUT_DS` of standing still alone. Have it walk the room first. The simplest general way: give the task a `via`-like note of what was said ("down by the Bridge" names another room: walk towards that room's door, `go_to_door`), or, simpler still, use the server's `explore` tool limited to the current room, and close the task when the body has stood at a few spots of it and seen no mess. If that is too much for now, step 1 alone still helps: the janitor at least shows the task, and if the mess is within sight of anywhere it walks in the next minute the server remembers it.
3. A question for the owner: should "where" carry a hint inside a big room ("by the Bridge")? A room name is all the window has today.

## How to test the fix

- A table of cases: the case above gives an open `clean` task in the Central Primary Hallway with `askedBy` Zim Fire and urgency `emergency`.
- Simulator: a scenario with a long hallway where the mess is more than seven tiles from where the janitor is told of it; the janitor walks to it and cleans it.
- In a round: stand at one end of a hallway with a janitor, have a mess at the far end, tell the janitor of it.
