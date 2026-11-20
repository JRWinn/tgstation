---
id: TRB-07
title: A crew prisoner is set free the moment its cuffs come off inside the cell, before the officer is out and the timer started, because the arrest grace is counted from the start of the arrest
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: b1daef4a07e
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1458, code/modules/llm_crew/crew_npc_security.dm:1393, code/modules/llm_crew/crew_npc_security.dm:1189, code/modules/llm_crew/crew_npc_security.dm:1199
fix: In custody_tick count the no-cuffs no-hand grace from held_at alone, not from arrested_at, and set held_at in being_arrested's early return, so the prisoner stays held for the seconds between uncuffing and the timer
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

Read from the code. Not seen in a round: the rounds with a jailing in `game.log` (`round-19.33.50`, `round-20.00.21`) jailed Pun Pun, who is not a crew NPC and is left in cuffs. The release itself is sure: it follows whenever the cuffs come off more than 20 seconds after `make_arrest` began, which is every walk to the brig but one made from beside the cell. Which side then wins the race (the prisoner walking out, or the officer starting the timer) depends on how soon the prisoner's brain sends its next step, which was not timed. The officer has the cuffs to pick up (`pick_up_kit`), a few `walk_steps` and the timer's half-second gaps to get through, so it probably wins most times; the wrong "You are free to go." then a lock-in a second later happens either way.

## How to fix it

1. Do this one: mend the grace. In `custody_tick`'s `ARREST` branch, the no-cuffs-no-hand line becomes `held = world.time - held_at < CREW_NPC_ARREST_GRACE` (drop the `arrested_at` clause). In `being_arrested`'s early return, set `held_at = world.time` before `hold_in_custody()`. `held_at` is already refreshed every tick the officer has it by the arm, so after `stop_pulling` the prisoner has 20 seconds from that moment: the four seconds of `take_cuffs_off`, the steps out and the timer fit well inside. When the cell shuts, `put_in_custody` moves it to the `CELL` phase as now. If `put_in_cell` fails after the uncuffing, the prisoner is let go within 20 seconds, which is right: nobody has hold of it. `arrested_at` is then unused and can go. One small file, a few lines.
2. Not needed with step 1, and heavier: call `put_in_custody` before `stop_pulling`. It tells the prisoner "has put you in Cell 1" before the door is shut, and the `CELL` branch would let it go at once (the timer is not yet running) unless a `cell_closing_until` is added, and every failure path after it must undo it. Take this only if the owner wants the prisoner told it is in the cell as it walks in.

## How to test the fix

- Server compile.
- Simulator: it plays the server and cannot show this; the window side is unchanged.
- In a round, have the Captain declare a warrant on a janitor. In `game.log`, as the code stands, the janitor's "is free to go at ... (Brig)" line comes a few seconds after "took the cuffs off" and before "put ... in Cell". After the fix there must be no "is free to go" between "took the cuffs off" and "put ... in Cell"; the first one must come after the cell's timer runs out. Grep for "took the cuffs off", "is free to go", "walked out of" and "put .* in Cell".
- Also check a failed cuffing still lets go: an arrest that comes to nothing (the officer called off mid-arrest) must log "is free to go" about 20 seconds after the last hold.

## Check

Confirmed. Read `custody_tick` (crew_npc_security.dm:1442-1482), `being_arrested` (1391), `hold_in_custody`, `put_in_custody` (1416), `let_out_of_custody` (1485), `stand_still`/`keep_still` (crew_npc_doors.dm:14), `put_in_cell` (1145-1230), `take_cuffs_off` (1232), and the two callers of `being_arrested`: `make_arrest` (874, before the cuffs go on) and `hold_arrested` (1039, after). `arrested_at` is written only at 1403, on the first call; the second call from the same officer returns early at 1393 without touching it or `held_at`. While the officer pulls, `held_at` is refreshed each tick; once it lets go in the cell and the cuffs come off, neither of the first two branches holds and the third fails on `world.time - arrested_at < 20 SECONDS`. `let_out_of_custody` then sets `talk_hold_until` to now, so `keep_still` drops `TRAIT_AI_MOVEMENT_HALTED` within half a second, and the brain is told "You are free to go." `put_in_custody` later starts a fresh tick (`was_held` is FALSE), so the re-hold when the officer is quicker works as written. The 27 seconds is real: `round-20.00.21/game.log` lines 701 and 715, "arrested ... Pun Pun" at 02:16:26 and "put ... in Cell 1" at 02:16:53. No round has jailed a crew NPC yet (grepped all three rounds of 2026-11-19 for "in Cell" and "is free to go"), so it is not seen. Nothing in the change log covers it; its custody entry says the cell holds by the timer, which is what this breaks for the seconds before it starts.

Confidence raised to sure for the release; the walk-off is the uncertain half, said in the body. Severity stays medium: every jailing of a crew NPC, but the officer most likely wins the race and the work still gets done. The fix line now names the one-line grace mend as the way to take: it needs no new state and no new failure handling, and it keeps every rule.
