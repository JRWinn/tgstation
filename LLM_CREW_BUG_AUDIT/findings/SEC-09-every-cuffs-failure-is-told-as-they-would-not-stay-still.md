---
id: SEC-09
title: Every way the cuffs fail is told as they would not stay still, so someone who cannot be cuffed is batoned again every half minute for good
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1001, code/modules/llm_crew/crew_npc_security.dm:919, code/modules/llm_crew/crew_npc_security.dm:926, code/game/objects/items/handcuffs.dm:87, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1124
fix: Have put_cuffs_on say why it failed (cannot_cuff, no_hand, moved) and send that reason back, and have the window give up on cannot_cuff and not set force for anything but moved
---

## What is wrong

See also: SEC-01 (the officer itself knocked down) and HAND-01 (a click lost to the click cooldown). Both are one more cause that lands in the same wrong answer described here. This finding is about the answer, and about the causes those two do not cover.

`put_cuffs_on` returns only TRUE or FALSE. `make_arrest` turns every FALSE, whatever its cause, into the same answer: "You could not get the cuffs on X: they would not stay still", with reason `moved` if the person is in sight. The window takes `moved` at its word (`beatAfterActing`): `warrant.force = true`, so the next go is with the baton, and a try is counted. After three tries it rests 30 seconds, tells whoever keeps the list "they will not stand still for the baton or the cuffs" (the first time only: `beat.cannotTold` keeps it to once per name), resets the count, and goes again. Nothing in that loop ever ends it.

`put_cuffs_on` fails for many reasons that are not the person moving:

- **The person cannot be cuffed at all.** `attempt_to_cuff` refuses at once, with no wait, if `!victim.canBeHandcuffed()` (a human with fewer than two hands: `num_hands < 2`, an arm lost in a fight or to surgery) or if a signal prevents it (the heretic buff in `heretic/status_effects/buffs.dm`). A player officer sees the balloon "can't be handcuffed!" and stops. The body sees nothing.
- **It has no hand to draw the cuffs into.** `draw_item(cuffs)` fails with "it had no hand it could empty" when both hands hold trade tools (a baton it could not stow because its bag is full, and a flash, say). On a quiet arrest there is no `drop_for_weapon` first. `draw_stopped` is set and never logged or sent.
- **The officer is moved, not the person**: shoved by a third party during the four seconds, or pulled. The `do_after` in `attempt_to_cuff` is on the officer (`do_after(user, ..., victim)`) and fails if either of them moves.

One concrete case, the one that never ends:

1. A warrant is declared on a crew member who lost an arm in a fight earlier in the round. The officer finds them. They stand still.
2. Quiet arrest. `put_cuffs_on`: `click_as_body(person, ...)` with the cuffs. `attempt_to_cuff` returns at once at `canBeHandcuffed()`. The person is on their feet, so `put_cuffs_on` returns FALSE on the first go.
3. `make_arrest` line 926: "they would not stay still", reason `moved`. Window: `warrant.force = true`, `tries = 1`.
4. Next go is `force`: two baton hits on someone standing still for it, then `put_cuffs_on` on someone down: refused twice. Line 919: reason `moved` again. `tries = 2`, then `3`.
5. Rest 30 seconds, "will not stand still" to the Head of Security (once), `tries = 0`, and back to step 4. While they are still down from the last hits, the `force` go skips the baton and fails at the cuffs alone; once they are up, it hits them again. Each round of this costs two baton hits; the baton is flat after about ten (GAP-16), and the officer then goes to the lockers again and again for a baton that will be used up the same way.

The person was batoned perhaps ten times, never moved, and the Captain was told they would not stand still.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1001`, `put_cuffs_on`, which knows none of the reasons:

    if(QDELETED(cuffs) || !draw_item(cuffs))
        return FALSE
    ...
        if(click_as_body(person, null, CREW_NPC_STRIKE_GAP))
            var/waited = 0
            while(waited < CREW_NPC_CUFF_WAIT && ... && isnull(person.handcuffed) && length(body.do_afters))
                sleep(0.5 SECONDS)
                waited += 0.5 SECONDS
        ...
        if(!isnull(person.handcuffed))
            return TRUE
        if(!crew_npc_person_down(person))
            return FALSE

`code/modules/llm_crew/crew_npc_security.dm:917` and `:922`, `make_arrest`, the one answer for all of them:

    if(!cuffed)
        stow_in_bag(cuffs)
        return list(FALSE, "You could not get the cuffs on [person_name]: they would not stay still.", list("handle" = handle, "reason" = (!QDELETED(person) && (person in view(CREW_NPC_VISION_RANGE, body))) ? "moved" : "lost", "hits" = hits))
    ...
    if(!put_cuffs_on(person, cuffs))
        ...
        return list(FALSE, "You could not get the cuffs on [person_name]: they would not stay still.", list("handle" = handle, "reason" = (person in view(CREW_NPC_VISION_RANGE, body)) ? "moved" : "lost", "hits" = 0))

`code/game/objects/items/handcuffs.dm:87`, the refusal that happens before any wait:

    if(!victim.canBeHandcuffed())
        victim.balloon_alert(user, "can't be handcuffed!")
        return

and `code/modules/mob/living/carbon/human/human_helpers.dm:2`:

    /mob/living/carbon/human/canBeHandcuffed()
        if(num_hands < 2)
            return FALSE

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1124`, which believes it:

    // Would not stand still for the cuffs. The baton comes first from now on.
    if (reason === 'moved') {
      warrant.force = true;
    }

The `do_after` inside `attempt_to_cuff` runs inside `ClickOn`, so `click_as_body` does not return until the cuffing is over; the `length(body.do_afters)` wait after it never waits. That is harmless, but it means the cuffs are already on or already failed by the time the loop looks.

## How it was found

Read from the code, server and window, and the base handcuffs and `canBeHandcuffed` procs. Not seen in a round: no one-armed person has been arrested yet.

## How to fix it

1. Give `put_cuffs_on` a reason var beside `baton_stopped` (for example `cuffs_stopped`), set on each way out:
   - `"no_hand"`: `draw_item(cuffs)` failed. Copy `draw_stopped` into the log line.
   - `"cannot_cuff"`: before the click, test what the player would be shown: `!person.canBeHandcuffed()` (a player sees how many arms someone has). After the click, if `person.handcuffed` is still null and the click came back at once (no `do_after` was started, `world.time` barely moved), take it as refused too.
   - `"moved"`: the click was made, the wait was started, and the person is no longer adjacent or has moved tile.
   - `"knocked_down"`: the officer itself cannot act (SEC-01's check).
2. In `make_arrest`, send that reason (falling back to `lost` when the person is out of sight) in place of the fixed `moved`, and put it in the `log_game` line as the baton line does with `baton_stopped`.
3. Window, `beatAfterActing` in `jobs/arrests.ts`: set `warrant.force` only for `moved`. On `cannot_cuff`, stop trying: push a `cannot` outcome once ("they cannot be cuffed") so the Captain decides, and do not open another try on that warrant until the owner's answer below. On `no_hand`, treat it like `no_cuffs` (not a try at them; its kit or hands come next). On `knocked_down`, not a try.
4. Question for the owner: what should security do with someone wanted who cannot be cuffed? The game allows walking them by the arm with no cuffs (a pull), and a cell holds them as well as anyone. The smallest general rule: walk them to a cell by the arm, as `hold_arrested` already does, and tell the Head of Security they could not be cuffed.

## How to test the fix

- Server compile on a side copy.
- `tools/llm_crew/security.ts`: cases for `beatAfterActing` with each new reason: `cannot_cuff` sets no `force`, pushes one `cannot` outcome and is not tried again; `no_hand` counts no try; `moved` still sets `force`.
- `tools/llm_crew/sim.ts`: the simulator's `arrest` handler can answer `cannot_cuff` for a named person; the scenario must end with one outcome to the Head of Security and no second baton go.
- In a round: arrest someone with one arm removed (an admin can do it). `game.log` must show one "could not get the cuffs on" with the reason, not a run of "(force)" baton lines.

## Check

Checked by Opus 5.5. Read `make_arrest`, `baton_hits`, `put_cuffs_on` and `hold_arrested` (`crew_npc_security.dm` 865-1060), `draw_item` (302), `attempt_to_cuff` (`handcuffs.dm` 80-115), `canBeHandcuffed` (`human_helpers.dm:1`), and the arrest branch of `beatAfterActing` (`jobs/arrests.ts` 1092-1160). The quotes match today's code.

Traced the one-armed case: `attempt_to_cuff` returns at the `canBeHandcuffed()` test before any `do_after`; `put_cuffs_on` sees no cuffs and a person on their feet and returns FALSE; `make_arrest` sends `reason = moved` at 926; the window sets `warrant.force` and counts a try. On `force` gos the baton lands, `put_cuffs_on` fails twice on someone down, and 919 sends `moved` again. At three tries the window rests `REST_DS` (30 s), resets `tries` and goes on; nothing on either side ever stops it. `draw_item` failing (`no_hand`) lands in the same answer and is never logged. One correction made: the "will not stand still" outcome is pushed once per name (`beat.cannotTold`), not every cycle. Nothing in the changelog or plans covers it.

Severity kept at medium (an uncommon case, but endless baton hits on someone standing still and a false report up the line). Effort raised to large by FORMAT's rule, since the fix needs the server and the window both, though each part is small. The fix is sound and keeps the rules: testing `canBeHandcuffed()` before the click is what a player can see (how many arms someone has). Do not try to test the `COMSIG_CARBON_CUFF_ATTEMPTED` refusal by sending the signal: it has effects; the "click came back at once" test (compare `world.time` around the click against the cuffs' 4 seconds) is the right way to catch it.
