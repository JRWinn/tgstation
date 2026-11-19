---
id: SEC-04
title: A cell the officer cannot walk to, or whose timer will not work, is picked again every time and the other cells are never tried
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: security
files: code/modules/llm_crew/crew_npc_security.dm:748, code/modules/llm_crew/crew_npc_security.dm:1075, code/modules/llm_crew/crew_npc_security.dm:1157, code/modules/llm_crew/crew_npc_security.dm:1202, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1195
fix: Call cell_refuses for the cell in jail_cell whenever a jail errand ends in no_way or timer, including the walk that never reached the timer
---

## What is wrong

`free_cell` hands out the first empty cell in name order, and passes over one only if `cell_refuses` has marked it in the last two minutes. `cell_refuses` is called from three places, all inside `put_in_cell` and all about the walk into the cell itself. Every other way a jailing can fail leaves the cell unmarked:

- The walk to the timer never arrives (`crew_npc_fail_errand`, "You could not get to it.").
- The body arrives within a tile of the timer and cannot touch it (`do_errand`: `!can_reach_target_now(target)`, the same words).
- The timer will not take the time, or will not start (`"reason" = "timer"`).

In each of these the window is told `no_way` or `timer`. `beatAfterActing` counts one more refused cell (`warrant.cellTries`) and, by design, sends `jail` again at once: "The cell would not take them, and it still has them by the arm: the next cell, at once." But the server has no memory of the refusal, so `free_cell` returns the same cell. After as many tries as the brig has cells, the window reports "I cannot get them into a cell", having tried one.

One concrete case: a locker or a crate has been left on the tile in front of Cell 1's timer (or the timer hangs where the planner's "within one tile" is the far side of a window).

1. `tool_jail`: `jail_cell = free_cell(prisoner)` is Cell 1. `start_errand(timer, CREW_TOOL_JAIL, ...)`.
2. The walk fails or stops a tile short. `finish_errand(list(FALSE, "You could not get to it."))`.
3. `security_details(CREW_TOOL_JAIL, outcome)` builds `list("reason" = "no_way")`. Nothing else is done for a jail.
4. Window: `cellTries = 1`, and `jail` is sent again with `attempt: 2`.
5. `free_cell` again: Cell 1 has no entry in `cell_refused`, so it is returned again. Steps 2 to 4 repeat.
6. On MetaStation's brig (several cells) after that many tries: `cannot(warrant.name, 'I cannot get them into a cell')`, and the officer stands in the brig for 90 seconds (`CELL_AGAIN_DS`) with Cells 2 and 3 empty beside it. Then the count is reset and it does the same again.

## Where

`code/modules/llm_crew/crew_npc_security.dm:748`, `security_details`. It marks a locker for `get_kit` and does nothing for `jail`:

    // It never got there.
    var/list/details = list("reason" = (tool == CREW_TOOL_ARREST ? "lost" : "no_way"))
    ...
    if(tool == CREW_TOOL_GET_KIT)
        details += kit_details()
        var/atom/target = kit_target?.resolve()
        if(!QDELETED(target))
            kit_skipped[REF(target)] = world.time
    return details

`code/modules/llm_crew/crew_npc_security.dm:1075`, `free_cell`, the only reader of `cell_refused`:

    var/last_refused = cell_refused[cell.name]
    if(isnull(last_refused) || world.time - last_refused >= CREW_NPC_CELL_SKIP)
        return cell

`code/modules/llm_crew/crew_npc_security.dm:1157` and `:1202`, in `put_in_cell`, the timer failures that return without marking the cell:

    if(timer.timer_duration != wanted && !work_timer(timer, "time", list("adjust" = "[wanted - timer.timer_duration]")))
        return list(FALSE, "You cannot get at the timer of [cell.name]. It may have no power.", list("reason" = "timer", "prisoner" = prisoner_name, "cell" = cell.name))
    if(QDELETED(timer) || timer.timer_duration != wanted)
        return list(FALSE, "The timer of [cell.name] will not take the time.", list("reason" = "timer", ...))
    ...
    if(!work_timer(timer, "start") || QDELETED(timer) || !timer.timing)
        return list(FALSE, "The timer of [cell.name] will not start.", list("reason" = "timer", ...))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1195`, which takes it that the next try will be at another cell:

    // The cell would not take them, and it still has them by the arm: the next cell, at once.
    if (reason === 'no_way' || reason === 'timer') {
      warrant.cellTries = (warrant.cellTries ?? 0) + 1;
      warrant.cellFailedAt = brain.now;
      return;
    }

## How it was found

Read from the code. Not seen in a round. The round-14.28 fault "You cannot get into Cell 1, six times running" (C2 in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`) was this shape and was mended for the walk into the cell (`cell_refuses`, `CREW_NPC_CELL_SKIP`). The ways out listed here were not covered.

## How to fix it

1. In `security_details`, in the "it never got there" part, add for the jail what is there for the kit:

       if(tool == CREW_TOOL_JAIL && !isnull(jail_cell))
           var/mob/living/carbon/human/prisoner = arrested?.resolve()
           cell_refuses(jail_cell, prisoner?.name || "its prisoner", "it could not get to the cell's timer")
           details["cell"] = jail_cell.name
           details["prisoner"] = prisoner?.name

   `security_details` is reached for both the failed walk and the `do_errand` reach check, since both return a two-item list.
2. In `put_in_cell`, call `cell_refuses(cell, prisoner_name, "...")` before each of the three `"reason" = "timer"` returns, with words that say which step it was (the time would not set, the timer would not start).
3. Leave `free_cell`'s fallback as it is: when every cell has been refused it hands out the one refused longest ago, so nothing is locked out for good.
4. Do not call `cell_refuses` for `no_cell` (someone else is in it) or for `got_away`.

The stunned-officer case in SEC-01 must not mark a cell either: check the body's own state first, as that finding says.

## How to test the fix

- Server compile on a side copy.
- `tools/llm_crew/sim.ts` plays the server, so its jail handling should be made to do the same: a `jail` that fails `no_way` on Cell 1 is answered at Cell 2 on the next try. Look for the security scenarios listed at the top of `sim.ts` and add one where the first cell cannot be reached.
- In a round: block the tile in front of one cell's timer with a locker and have someone arrested. `game.log` should show one "could not put X in Cell 1: it could not get to the cell's timer" and then "put X in Cell 2".
