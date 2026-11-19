---
id: TRB-07
title: A crew prisoner is set free the moment its cuffs come off inside the cell, before the officer is out and the timer started, because the arrest grace is counted from the start of the arrest
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1458, code/modules/llm_crew/crew_npc_security.dm:1393, code/modules/llm_crew/crew_npc_security.dm:1189, code/modules/llm_crew/crew_npc_security.dm:1199
fix: In custody_tick leave a crew prisoner held while the body that arrested it is next to it or the cell is being shut, or have put_in_cell call put_in_custody before it takes the cuffs off
---

## What is wrong

A crew NPC under arrest is held still by `custody_tick`, which looks once a second at what holds it: a hand on its arm, cuffs, or, with neither, a 20 second grace "while the arrest is still being made". In a cell the officer lets go of it and takes its cuffs off before it walks out and starts the timer (`put_in_cell`: stop pulling, `take_cuffs_off`, walk out, `work_timer(timer, "start")`). For those seconds the prisoner has no hand on it and no cuffs, so only the grace holds it.

The grace is counted from `arrested_at`, which is set once, when the arrest began, and never again: a second `being_arrested` by the same officer (which `hold_arrested` makes) only calls `hold_in_custody` and returns. By the time the prisoner is in the cell the arrest began well over 20 seconds before (the rounds show 27 seconds from "arrested" to "put in Cell 1" for the walk alone, `data/logs/2026/11/19/round-20.00.21`, game.log lines 701 and 715). So at the first tick after the cuffs come off, `held` is FALSE and `let_out_of_custody` runs: the hold is lifted at once (`talk_hold_until` set to now), the brain is told "You are free to go.", and the body may walk off while the officer is still stepping out of the open cell.

Then one of two things:

- The officer is quicker: it starts the timer, the door shuts, `put_in_custody` puts it back in custody. The prisoner's brain was told it was free and then that it is locked in, a second apart. Its voice may say either.
- The prisoner is quicker: its brain sends its next step (back to work), it walks to the open door. `put_in_cell` sees it out of the cell: "Dana Reyes walked out of Cell 1 before you could shut it", reason `got_away`. The window pushes a `lost` outcome ("I lost Dana Reyes in the Brig") and goes after her again. She stands for the arrest again (she is a crew NPC), is cuffed, walked in, uncuffed, and the same race is run again, each time with a "lost" message to the Head of Security.

Only crew NPCs are uncuffed in the cell, so this touches only them, which is every arrest of a crew member.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1448`, in `custody_tick`:

    if(CREW_CUSTODY_ARREST)
        var/mob/living/carbon/human/by = arrested_by?.resolve()
        if(!QDELETED(by) && body.pulledby == by)
            held_at = world.time
            held = TRUE
        else if(body.handcuffed)
            // In cuffs with nobody's hand on it. Whoever arrested it may be back for it.
            held = world.time - held_at < CREW_NPC_CUFFED_ALONE
        else
            // No cuffs and no hand: the arrest is still being made, or has come to nothing.
            held = world.time - arrested_at < CREW_NPC_ARREST_GRACE && world.time - held_at < CREW_NPC_ARREST_GRACE

`crew_npc_security.dm:1393`, in `being_arrested`: a second call from the same officer does not touch `arrested_at`.

    if(custody_phase == CREW_CUSTODY_ARREST && arrested_by?.resolve() == by)
        hold_in_custody()
        return

`crew_npc_security.dm:1189`, in `put_in_cell`, the order of things:

    body.stop_pulling()
    var/datum/ai_controller/crew_npc/their_controller = prisoner.ai_controller
    if(istype(their_controller))
        take_cuffs_off(prisoner)
    // Out, and the timer started at once.
    if(!walk_steps(outside))
        ...
    if(QDELETED(prisoner) || !(get_turf(prisoner) in cell.turfs))
        ...
        return list(FALSE, "[prisoner_name] walked out of [cell.name] before you could shut it.", got_away_details(prisoner, prisoner_name))

`crew_npc_security.dm:1485`, `let_out_of_custody`, which lifts the hold at once:

    // It may move again. The loop that kept it still sees this at its next turn and lets it go.
    talk_hold_until = min(talk_hold_until, world.time)
    ...
    emit_sense(CREW_SENSE_KNOWLEDGE, "You are free to go.", list("set_free" = TRUE))

## How it was found

Read from the code. Not seen in a round: the rounds with a jailing in `game.log` (`round-19.33.50`, `round-20.00.21`) jailed Pun Pun, who is not a crew NPC and is left in cuffs. `likely` and not `sure` because which side wins the race depends on how soon the prisoner's brain sends its next step, which I did not time.

## How to fix it

1. Simplest: in `put_in_cell`, call `their_controller.put_in_custody(cell, jail_minutes, body)` before `body.stop_pulling()` for a crew prisoner, so that from the moment it is let go of inside the cell it is held by the cell. `custody_tick` in the `CELL` phase holds while `timer.timing`, so the hold has to allow for the timer not yet started: add a `cell_closing_until` (a few seconds) to the controller, set it there, and have the `CELL` branch hold while `timer.timing || world.time < cell_closing_until`.
2. Also mend the grace itself: in `being_arrested`'s early return, set `held_at = world.time`, and in the `ARREST` branch count the grace from `held_at` alone (the last time anything held it), not from the start of the arrest. Then "the arrest is still being made" means the last 20 seconds, as the comment says.
3. If `put_in_cell` fails after step 1, call `let_out_of_custody()` or `being_arrested(body)` again so the prisoner is not left held by a cell that never shut.

## How to test the fix

- Server compile.
- Simulator: it plays the server and cannot show this; the window side is unchanged.
- In a round, have the Captain declare a warrant on a janitor. In `game.log` the janitor's "is free to go" line must come after the cell's timer runs out, not seconds after "put ... in Cell". Grep for "walked out of" and "is free to go".
