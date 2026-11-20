---
id: KNA-16
title: Janitors do not question or put out someone who has no business in the Custodial Closet, because guarding is tied to having a post
kind: gap
severity: medium
effort: medium
confidence: sure
status: duplicate
duplicate_of: GAP-14
found_by: Fable 5.2
area: janitor
files: code/modules/llm_crew/crew_npc_guarding.dm:145, code/modules/llm_crew/crew_npc_guarding.dm:24, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:343
fix: Guard any locked room of the body's own department that it is standing in, not only a post it is stationed at
---

## What is wrong

Listed in the change log entry of 2026-11-18, 14:15, Known and not fixed: "Trespass warrants can only start with staff who put people out of their rooms: cargo, engineering and now security. Janitors do not." The owner asked for it on 2026-11-18 after Pun Pun got into the Custodial Closet: janitors should put out trespassers as cargo staff do. It is not built.

Everything about a visitor who should not be there (asking "why are you in here?", taking them by the arm, telling the head, the head declaring a trespass warrant) hangs on the body having a post: one room with a spot to stand at (`post_turf`, `post_place`). Janitors have none: they roam (`keepsPost: false` in `jobs/janitor.ts:751`). So the server refuses the tool, the server never marks anyone in view as "in_post" or "belongs", and the window never opens a task for them.

This breaks the project's own rule that a behaviour described for one job is built as a general rule: "anyone with a post behind a locked door" was the example, and what was meant is anyone whose department has a room locked to the crew at large.

The case: Pun Pun walks into the Custodial Closet behind a janitor. Two janitors are in there fetching mops. Neither says a word, and Pun Pun wrecks the closet. No "I could not put Pun Pun out of" reaches the Head of Personnel, so no trespass warrant is declared.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:145`, `tool_throw_out`:

    if(isnull(post_turf))
    	action_result(CREW_TOOL_EVICT, FALSE, "You have no room of your own to put anyone out of.")
    	return

`crew_npc_guarding.dm:24`, `belongs_in_post`: goes by `post_doors()`, the doors of the post only.

`code/modules/llm_crew/crew_npc_senses.dm:191`, where people in view are described: both flags need a post.

    "in_post" = !isnull(post_turf) && get_area(person) == get_area(post_turf), "belongs" = !isnull(post_turf) && belongs_in_post(person),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:343`, `syncGuarding`, and `:504`, `planGuarding`: written against `brain.post`.

The server already knows the wider set for every body: `closed_rooms` ("those of its rooms, its post among them, that every door into is locked to the crew at large", `crew_npc_controller.dm:202`), built from `work_area` and `look_in_rooms`.

## How it was found

Read from the code.

## How to fix it

1. Server: give every body a list of rooms that are its to guard: `closed_rooms` if it has any, and for a body with no post, the locked rooms of its department that its own ID opens (for a janitor on MetaStation that works out as the Custodial Closet). Work it out the way `closed_rooms` is worked out now, for jobs without a post as well. Do not name the closet or the job.
2. Server: replace the three post tests with "the room the body is standing in is one of those": `in_post` becomes "in a room of mine that I am in"; `belongs` asks whether any door of that room opens to the person (`crew_npc_doors_of(room)` and `door.allowed(person)`, as `locked_out_of` does for the body itself); `tool_throw_out` walks them out by the nearest door of that room to a room that is not locked.
3. Window: `syncGuarding` and `planGuarding` use `brain.location` when it is in `brain.closedRooms`, in place of `brain.post`, for a body with no post. A body with a post behaves as now.
4. The limits already built stay: nobody lays a hand on the Captain or a head (`why_not_put_out`), someone sent for or let in is left alone, and a body that cannot put them out tells its head (`wantedAfterActing`), who declares the trespass.
5. A janitor is in the closet only now and then, so this guards it only while someone is there. **Question for the owner:** is that enough, or should a janitor who sees someone go in, or finds the closet wrecked, send word as well?

## How to test the fix

- `tools/llm_crew/sim.ts`: there are scenarios for a stranger in the Cargo Bay. Add one with a janitor in its closet and a monkey that walks in: pass when the janitor asks why, then takes it by the arm, and on failure tells the Head of Personnel.
- Server compile.
- Next round, `game.log`: "walk failed (evict" or "put ... out of Custodial Closet" lines with a janitor's name.
