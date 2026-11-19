---
id: GAP-03
title: A door held for someone is opened by code and its auto-close is switched off (no-cheats plan 4.8, approved, not built)
kind: gap
severity: high
effort: medium
confidence: sure
status: duplicate
duplicate_of: KNB-04
found_by: Fable 5.2
checked_by: Opus 5.5
area: doors
files: code/modules/llm_crew/crew_npc_doors.dm:592, code/modules/llm_crew/crew_npc_doors.dm:796, LLM_CREW_PLAN_NO_CHEATS.md:168
fix: Open the door with a click from beside it, leave autoclose alone, click it open again if it shuts early, and click it shut when they are through
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.8 says: the body opens the door by the code a click reaches, standing beside it. The door's auto-close is left alone. It stays beside the door, opens it again if it shuts before the person is through, and clicks it shut once they are. The plan's table lists `hold_door_for` as a cheat. The change log's 18:05 entry repeats it: "holding a door is one of the cheats still to be taken out".

`hold_door_for` still sets a var on the door and calls its `open()` directly, and `let_door_close` sets the var back and calls `close()` from a timer, wherever the body has got to by then. Half a second after opening, `step_away_from_door` walks the body back to its post, so the door is in fact held by nobody: it stays open because `autoclose` is FALSE.

One case: a technician opens the Cargo Bay door for a janitor at 00:10:00 and walks back to the counter eight tiles away. The door stands open for up to `CREW_NPC_DOOR_HELD` plus three extensions (30 seconds by the change log) with nobody at it. A player could not do that: an airlock shuts itself after 8 seconds unless someone stands in it. Anyone can walk in behind, which is the thing the plan's "clicks the door shut so that nobody walks in behind them" was for.

## Where

`code/modules/llm_crew/crew_npc_doors.dm:592`, in `hold_door_for`:

    door.autoclose = FALSE
    if(door.density && !door.open())
        door.autoclose = TRUE
        return list(FALSE, "The door will not open for you.")

`code/modules/llm_crew/crew_npc_doors.dm:603`:

    addtimer(CALLBACK(src, PROC_REF(step_away_from_door)), 0.5 SECONDS)

`code/modules/llm_crew/crew_npc_doors.dm:796`, `let_door_close`:

    door.autoclose = TRUE
    if(!door.density)
        INVOKE_ASYNC(door, TYPE_PROC_REF(/obj/machinery/door, close))

## How it was found

Read from the code against the plan. Not a fault a round would show: the door opens and people get through.

There is a second fault in the same lines. If the controller is deleted while a door is held (the body is gibbed, or an admin deletes it), `watch_door` is a timer on the controller and dies with it, and the door is left with `autoclose = FALSE` for the rest of the round. Read from the code, not seen.

## How to fix it

1. In `hold_door_for`, keep the checks (`door.locked`, `welded`, `hasPower()`, `allowed(body)`). Replace `door.autoclose = FALSE` and `door.open()` with a click on the door as the body: `click_as_body(door)` (`crew_npc_machines.dm:259`). An airlock clicked by someone it allows opens (`/obj/machinery/door/attack_hand` to `try_to_activate_door`). Do not touch `autoclose`.
2. Do not call `step_away_from_door` at once. The body steps one tile to the side of the doorway (off the door's tile and off the line through it) and stays there while `watch_door` runs. `crew_npc_doors_of(room, z)[door]` already gives the two tiles either side: pick a tile beside one of those.
3. In `watch_door`, where it finds the person not through and the door shut again (`door.density`), click it again, as long as the body is still next to it and `until` has not passed. This replaces holding by a var.
4. When they are through or time is up, `let_door_close` becomes: if the body is next to the door and it is open, `click_as_body(door)` (a click by someone with access shuts an open airlock). If the body has left, do nothing: the door shuts itself. Remove both lines that set `autoclose`.
5. Then walk back to the post (`step_away_from_door`).
6. `GLOB.crew_npc_door_holds` can stay as the note of who is holding which door, so two holders do not shut it on each other's visitor.
7. The brain side needs one thing: while a door is being held the body is busy for up to 30 seconds. Check `jobs/cargo.ts` (`afterActing` for `open_door`, and the `DOOR` task) does not offer the next step until the server says the hold is over, or the body will walk off and the door will shut on the visitor.

Question for the owner: holding a door now costs the technician up to 30 seconds standing at it. That is what the plan says ("for as long as it holds doors today"). If that is too long, the number to change is `CREW_NPC_DOOR_HELD`.

## How to test the fix

- Server compile to a side copy.
- Simulator: the door scenarios (`door`, `nested`, `knock` and the like listed at the top of `tools/llm_crew/sim.ts`) must still pass, and the plan's scenario "a door shuts before the person is through" should be added: the fake door needs to shut itself after 8 seconds.
- In a round: `grep -n "opened .* to let" game.log`, then watch one. The technician should stand beside the door until the janitor is through, and the door should shut behind them.
- `grep -n "autoclose" code/modules/llm_crew/` should print nothing.
