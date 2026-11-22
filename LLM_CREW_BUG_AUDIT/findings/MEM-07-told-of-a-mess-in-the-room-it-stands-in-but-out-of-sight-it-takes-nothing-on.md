---
id: MEM-07
title: Told of a mess in the room it is standing in but cannot see from where it stands, a janitor takes nothing on, even from its head
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:205, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:423, code/modules/llm_crew/crew_npc_cleaning.dm:240
fix: Drop the early return in takeToldWork for the room it stands in, but only together with DESK-08's look-round, or the task closes at once and the janitor tells its head the mess is cleaned up
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

`jobs/janitor.ts`, `syncTasks`: a told-of clean task with no remembered mess is closed once the janitor "has gone there, looked about, and seen none" (`lookedAbout`: `brain.now - brain.inPlaceSince >= LOOK_ABOUT_DS`). `inPlaceSince` is when it came into the room, so a janitor that has been standing there five seconds or more would have the task closed at the very next sync, and the driver would then owe its head word (`sayDone`: "the mess in the Central Primary Hallway is cleaned up"). That is why the early return cannot simply go.

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts`, `CrewBrain/talk.ts` and `CrewBrain/tasks.ts`, set up `janitor()` in the Central Primary Hallway with its head in view, and printed `buildTalk(...).ordered`, the result of `takeToldWork`, and `brain.tasks`. All empty. Not seen in a round log.

## How to fix it

1. In `takeToldWork`, drop the early return. Take the work on as told work (`source: 'told'`, `askedBy`), as for any other room.
2. Then the janitor's own closing rule needs to mean "looked about": in `jobs/janitor.ts` `syncTasks`, a told-of clean task in the room it is in should not close on `LOOK_ABOUT_DS` of standing still alone. Have it walk the room first. The simplest general way: give the task a `via`-like note of what was said ("down by the Bridge" names another room: walk towards that room's door, `go_to_door`), or, simpler still, use the server's `explore` tool limited to the current room, and close the task when the body has stood at a few spots of it and seen no mess. This is the same look-round DESK-08 asks for (a told mess in a big room closed after five seconds at the door, with "it is cleaned up" said); build MEM-07 with DESK-08 or after it, not before. Step 1 alone is worse than today: checked by script, a told clean task in the room the janitor has stood in for a while is `done` at the next `syncTasks` and `wordOwed` holds its head, so it would say at once, to its head's face, that a mess it never saw is cleaned up.
2a. Until the look-round exists, leave the early return as it is, but stop the model being told to promise: the janitor's `whenAsked` line "If they tell you of a mess somewhere, tell them you will see to it." could say instead, for its own room, that it sees no mess from here and will look about. That is wording only, and optional.
3. A question for the owner: should "where" carry a hint inside a big room ("by the Bridge")? A room name is all the window has today.

## How to test the fix

- A table of cases: the case above gives an open `clean` task in the Central Primary Hallway with `askedBy` Zim Fire and urgency `emergency`; after one more `syncTasks` with the janitor long in the room and no mess seen, the task is still open and `wordOwed(brain)` is empty (today's look-about rule fails this row).
- Simulator: a scenario with a long hallway where the mess is more than seven tiles from where the janitor is told of it; the janitor walks to it and cleans it.
- In a round: stand at one end of a hallway with a janitor, have a mess at the far end, tell the janitor of it.

## Check

Checked by Opus 5.5. The guard quoted at `tasks.ts:205` is what the code says today, and has been since the first crew commit (82810bef671). It applies only to the job's own kinds (`own &&`), so a superior's look order is not touched. `remember_messes` (`crew_npc_cleaning.dm:240`) keeps only messes from `in_sight`, and `view(CREW_NPC_VISION_RANGE, ...)` is what it is fed; MetaStation's `Central Primary Hallway` area (`hallway.dm:27`) is far longer than seven tiles. The janitor's `whenAsked` (`jobs/janitor.ts:763`) does tell the model to say it will see to it. Nothing in the change log or the plans speaks of the guard.

Ran a throwaway script (bun, in the scratchpad): `janitor()` in the Central Primary Hallway with Zim Fire in view; `takeToldWork(b, 'a mess that needs cleaning', 'Central Primary Hallway', 'Zim Fire', true)` gave null, `workInWords` on the quoted line gave null, and `b.tasks` stayed empty, while the same call for the Bar gave `clean Bar emergency`. Confirmed.

Then checked the proposed fix by adding the told task by hand (`addTask` with `source: 'told'`, `askedBy: 'Zim Fire'`) to a janitor that had been in the hallway 50 seconds: at the next sync the task was `done` and `wordOwed` returned Zim Fire. So step 1 on its own turns "takes nothing on" into "tells its head the mess is cleaned up", which is worse. The fix line and step 2 now say it must come with DESK-08's look-round, and effort is raised to medium for that reason. Severity medium stands.

## Fix so far

The janitor's side (step 2) is built with DESK-08 on branch `m-janitor`: a told CLEAN task in the room the janitor stands in is no longer closed after five seconds of standing; it walks into the middle of the room first, and if it then sees none it says "I found no mess in the X", not that it is cleaned up. The table `tools/llm_crew/janitor-lookround.ts` checks a told task in the room it has stood in for a minute stays open, owes nobody word, and plans the walk.

Held, needs `tgui/packages/tgui/interfaces/CrewBrain/tasks.ts` (step 1): in `takeToldWork`, the early return
`if (own && room === brain.location && !findTask(brain, kind, { place: room })) return null;`
must go for the janitor. Safest: keep it for other jobs and skip it when the job cleans, i.e. add `!jobFor(brain.job).cleans &&` to its condition (other jobs have no look-round, and their own kinds in the room they stand in were not looked at). With that in, the head's order, the model's `work` and `workInWords` all give an open told task. Step 3 (a hint inside a big room, "by the Bridge") is the owner's question and not built.

Round M2 (g-tasks): step 1 built in `tasks.ts` (`takeToldWork`): the early return for work in the room the NPC stands in no longer applies to a job that `cleans`, so the told task is made and DESK-08's look-round walks the room. Table: `tools/llm_crew/janitor-lookround.ts` (told by its head in the Central Primary Hallway: taken, still open 50 s on with nobody owed word, walk to the middle planned). Step 3 (a hint inside a big room) is still the owner's.
