---
id: SEC-01
title: An officer that is stunned, out cold or dead keeps stepping after its target and across a cell
kind: bug
severity: high
effort: small
confidence: sure
status: fixed
fixed_in: 17e1289d25e
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:373, code/modules/llm_crew/crew_npc_security.dm:410, code/modules/mob/living/living.dm:1046
fix: Before every body.Move in close_with and walk_steps, stop unless the body has MOBILITY_MOVE, is not dead and is not buckled, the check the wander already makes
---

## What is wrong

See also: LIFE-07 (the same bare `body.Move` with no look at the body, in `push_clear` in `crew_npc_grip.dm`; one `can_step()` helper can serve both, but each loop needs its own call).

See also: SEC-03 (the same loops run on after the errand is called off, a different cause; both fixes add a check at the top of the same loop turns and can be built together).

`close_with` (the steps after someone it means to hit or cuff) and `walk_steps` (the steps into and out of a cell) move the body with a bare `body.Move(next, dir)` in a loop with a `sleep` between steps. Neither looks at the state of the body before a step. The only checks are that the body, the controller and the target still exist and stand on a floor.

`/mob/living/Move` does not refuse a mob that cannot move. Being unable to move is enforced by whoever asks for the step: the player's key press (`/client/Move`), and the AI walk loop. A bare `Move` on a paralysed, unconscious, cuffed-and-buckled or dead human goes through, at the same pace as a run.

So a body that is knocked out or killed in the middle of a chase goes on sliding along the floor after its target, a tile every 0.2 seconds, for up to 12 steps and for each of up to 8 swings. No player could do that. It is a cheat by the project's own rule, and it is what a player watching would call a bug at once.

One concrete case, from the kind of fight round-19.33.50 had (the officer "bitten and tackled ten times" by Pun Pun):

1. The officer is in `baton_hits`, in the `while` loop, and calls `close_with(person, CREW_NPC_CHASE_STEPS)`. Pun Pun is three tiles off.
2. During the `sleep(max(movement_delay, 0.2 SECONDS))` between steps the monkey tackles it a second time. `human_defense.dm` `attack_paw`: `Paralyze(40)`. The officer is on the floor and cannot move for four seconds.
3. `close_with` wakes, sees that the officer and the monkey both exist and are on turfs, and calls `body.Move(next, get_dir(body, next))`. The paralysed officer slides a tile. And again, until it is next to the monkey.
4. The swing itself does fail (`click_as_body` asks `can_perform_action`), so `baton_hits` goes round its loop, and each time `close_with` slides the body after the monkey again.

The same holds if the officer is beaten unconscious or dies mid-chase: `QDELETED(body)` is false for a corpse, `view()` still works from it, and it follows.

`walk_steps` has the same hole: an officer stunned on the way into a cell keeps being moved toward the far tile for 3 seconds a step.

A second thing wrong in the same loops: `baton_hits` reports the wrong reason for it. A stunned officer's swings all fail in `click_as_body`, so `baton_stopped` is set to "they stepped out of reach of every swing", the arrest comes back with reason `moved`, and the brain (`arrests.ts`, `beatAfterActing`) sets `warrant.force = true` and counts a try against someone who never moved.

## Where

`code/modules/llm_crew/crew_npc_security.dm:373`, in `close_with`:

    for(var/taken in 0 to most)
        if(QDELETED(person) || QDELETED(body) || QDELETED(src) || !isturf(person.loc) || !isturf(body.loc))
            return FALSE
        if(can_reach_target_now(person))
            body.face_atom(person)
            return TRUE
        ...
        var/turf/next = get_step_towards(body, person)
        if(!isnull(next) && crew_npc_safe_turf(next))
            body.Move(next, get_dir(body, next))

and further down the same loop:

            body.Move(next, get_dir(body, next))
            if(get_turf(body) == from)
                return FALSE
        sleep(max(movement_delay, 0.2 SECONDS))

`code/modules/llm_crew/crew_npc_security.dm:410`, in `walk_steps`:

    while(get_turf(body) != next && world.time - tried_from < CREW_NPC_STEP_WAIT)
        body.Move(next, get_dir(body, next))
        sleep(max(movement_delay, 0.2 SECONDS))
        if(QDELETED(src) || QDELETED(body))
            return FALSE

The base proc, `code/modules/mob/living/living.dm:1046`. Nothing in it, or in `/mob/living/carbon/Move` or `/mob/living/carbon/human/Move`, looks at `mobility_flags`, `stat` or `TRAIT_IMMOBILIZED`:

    /mob/living/Move(atom/newloc, direct, glide_size_override)
        if(lying_angle != 0)
            lying_angle_on_movement(direct)
        if (buckled && buckled.loc != newloc) //not updating position
            ...
        . = ..()

The crew's own wander does make the check before its bare `Move` (`code/modules/llm_crew/crew_npc_motor.dm:22`, `can_move(living_pawn)`), which is why the rest of the crew do not do this.

## How it was found

Read from the code. Not seen in a round: nobody has looked for it, and the log would only show the officer's position changing while `attack.log` says it was pinned.

## How to fix it

1. Add one small proc beside `close_with`, for example `/datum/ai_controller/crew_npc/proc/can_step()`, that returns FALSE when the body is `QDELETED`, `!(body.mobility_flags & MOBILITY_MOVE)`, `body.stat == DEAD`, or `body.buckled`. `MOBILITY_MOVE` is the core of it: it is what `/client/Move` (`mob_movement.dm`) and `can_move` in `code/datums/ai/generic_behaviors/random_walk.dm` both test, and it is cleared by `TRAIT_IMMOBILIZED` (`init_signals.dm`), which stun, paralyse, immobilise and the knocked-out status all add, and unconsciousness and death bring in through `TRAIT_KNOCKEDOUT`. `stat == DEAD` is there because `/client/Move` tests it apart. `body.stat != STABLE` would also stop a body in soft crit, which a player can crawl in; that is allowed, not needed. Also stop when `body.pulledby && body.pulledby.grab_state > GRAB_PASSIVE`: a player held in an aggressive grab has to resist first (`Process_Grab` in `/client/Move`). Do not use `can_move` itself: it refuses any pull at all, and a passive pull does not stop a player.
2. In `close_with`, call it at the top of the loop, next to the `QDELETED` line, and return FALSE if it fails. A body knocked to the floor (`TRAIT_FLOORED` only) can crawl, as a player can: let that through, but then wait the crawling pace, not 0.2 seconds. `movement_delay` already follows `cached_multiplicative_slowdown`, so `sleep(max(movement_delay, 0.2 SECONDS))` is right once the stunned case is out.
3. In `walk_steps`, call it inside the `while`, before `body.Move`, and return FALSE.
4. In `baton_hits`, when `close_with` or `click_as_body` fails and `can_step()` is false (or the body `INCAPACITATED_IGNORING(body, INCAPABLE_RESTRAINTS|INCAPABLE_GRAB)`), set `baton_stopped = "it was knocked down itself"` and `break`, so the loop does not burn its 8 swings in 1.6 seconds. In `make_arrest`, send that back with a reason of its own (for example `"down"`), not `moved`. The window then needs one line in `beatAfterActing` (`arrests.ts`) so that `down` does not set `warrant.force` or count as a try. Until the window knows the new reason, sending `lost` is wrong too (it posts "I lost them"): leave the reason out and it falls to the plain "one try" count, which is the least harm.
5. Do the same check in `put_in_cell` after each `walk_steps` that fails: "You were knocked down" is not "the cell will not take them", and `cell_refuses` should not be called for it.

Keep: a body that is only cuffed or held by the arm must still be able to take these steps if it otherwise could (it cannot arrest anyone cuffed, so this hardly matters). Do not use `forceMove` or change the pace.

## How to test the fix

- Server compile on a side copy (see README).
- No simulator scenario covers this: the simulator does not run server code.
- In a round: have a monkey or the player shove an officer down against a wall, or slip it on a wet floor, while it is chasing someone on a warrant. It must stay where it fell. In `game.log` the "hit ... with its baton 0 times" line should give the new reason, and there should be no "could not put X in Cell N" line from a fall inside a cell.

## Check

Checked by Opus 5.5. Confirmed.

- The quotes are what the code says today: `close_with` (`crew_npc_security.dm:373`, bare `body.Move` at 386 and 397, only `QDELETED` and `isturf` tests) and `walk_steps` (`:410`, bare `body.Move` at 423). Callers: `make_arrest` (`:877`), `baton_hits` (`:966`), `put_cuffs_on` (`:1011`), `put_in_cell` (`:1173`, `:1184`, `:1194`) and `set_free` (`:1346`, `:1348`).
- Base game: `/mob/living/Move` (`living.dm:1046`), `/mob/living/carbon/Move` (`carbon_movement.dm:9`) and `/mob/living/carbon/human/Move` (`human_movement.dm:27`) test neither `stat` nor `mobility_flags`; a buckled body moves its buckle. There is no `/mob/Move`. The refusal lives in `/client/Move` (`mob_movement.dm`: `stat == DEAD`, `Process_Grab`, `buckled`, `MOBILITY_MOVE`), which a body with no player never goes through.
- Traits: `Paralyze`, `Stun`, `Immobilize` and the knocked-out status add `TRAIT_IMMOBILIZED`, which clears `MOBILITY_MOVE` (`init_signals.dm`). Death and hard crit add `TRAIT_KNOCKEDOUT` (`living.dm`, stat traits), which applies the knocked-out status. So the one `MOBILITY_MOVE` test covers stunned, out cold and dead. `Knockdown` alone (the monkey's first tackle, `human_defense.dm`, `Knockdown(30)`) only floors: a player can crawl, and the crawl slowdown reaches `movement_delay` through `update_movespeed`, so that case is not a cheat. The second tackle while still down is `Paralyze(40)`, as the write-up says.
- Nothing else stops the loop: `get_able_to_run` makes the controller unable to run when incapacitated (`crew_npc_controller.dm:313`), but that only stops the controller's own movement; `make_arrest` is a sleeping proc and runs on.
- Change log and plans: `close_with` and `walk_steps` are named only for the 12-step chase and the 3-second cell step. Nothing says a downed body should keep moving.
- Not run: this is server code and the simulator does not run it. Not seen in a round.
- Mended "How to fix it" step 1: `MOBILITY_MOVE`, `stat == DEAD` and `buckled` are the test, with an aggressive grab added and a note that `can_move` itself is too strict (it refuses a passive pull). `IS_UNCONSCIOUS` and `TRAIT_IMMOBILIZED` are already inside `MOBILITY_MOVE`. Severity stays high (the no-cheats rule is broken), effort small (one file, under 20 lines for steps 1 to 3; step 4's window line is one more).
