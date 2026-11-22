---
id: SEC-07
title: A crew member left in cuffs burns its three tries in three seconds, is told it is free to go, and works the rest of the shift in handcuffs
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1462, code/modules/llm_crew/crew_npc_security.dm:1485, code/modules/mob/living/living.dm:1151, code/modules/mob/living/carbon/carbon.dm:180
fix: Count a try only when the cuff do_after really started, never end custody while the cuffs are on, and keep trying as a player would (asking for help is a later step for the owner)
---

## What is wrong

A crew NPC left in cuffs with nobody coming works them off itself (`CREW_CUSTODY_CUFFS`). `custody_tick` runs once a second. Whenever the body has nothing in progress it adds one to `cuff_tries` and calls `execute_resist`. After three tries it gives up.

It takes that every call to `execute_resist` starts a try. The game does not:

- `execute_resist` returns at once if `next_move > world.time`, and it sets `next_move` two seconds on each time it does run (`CLICK_CD_RESIST`, 20).
- It calls `resist_restraints` only `if(last_special <= world.time)`, and `resist_restraints` sets `last_special` ten seconds on (`resist_cooldown`, `CLICK_CD_BREAKOUT`, 100).

So if the first try (a 60 second stand-still) is broken within its first ten seconds, the next ticks each count a try that the game refuses to start. Tries two and three are gone in two seconds. On the tick after, `held` is FALSE and `let_out_of_custody()` runs: "is free to go" in `game.log`, "You are free to go." to the brain.

It is then free in handcuffs. `custody_phase` is null, so nothing looks at the cuffs again. Its hands are blocked: every click it makes is the slow cuffed kind and does nothing, so every errand it is sent on fails for the rest of the round. Nobody is told. The same end comes, more slowly, after three honest tries that were each broken.

What breaks a try: the body being moved. `cuff_resist` is a `do_after` on itself with only `IGNORE_HELD_ITEM`, so one tile of movement ends it. Anyone who walks into it and swaps places with it does that (the player, any animal, another crew member without `PASSMOB` logic), and so does anyone who pulls it.

One concrete case:

1. An officer cuffs a janitor on a warrant and takes it by the arm. On the way a monkey attacks the officer, it turns to stop the monkey, is hurt and breaks off. The janitor stands in the hallway in cuffs.
2. Two minutes later (`CREW_NPC_CUFFED_ALONE`) `custody_tick` moves it to `CREW_CUSTODY_CUFFS`. Tick: `cuff_tries = 1`, `execute_resist`, the 60 seconds begin, `last_special = now + 10 s`.
3. Four seconds in the player walks through the janitor. They swap tiles. The `do_after` fails.
4. Next tick: nothing in progress, `cuff_tries = 2`, `execute_resist`: `last_special` is in the future, nothing starts. Next tick: `cuff_tries = 3`, nothing starts. Next tick: `cuff_tries = 4`, no call. Next tick: `held = (4 <= 3)` is FALSE. `let_out_of_custody()`.
5. The janitor is told it is free, goes back to its mop, and cannot pick it up.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1462`, in `custody_tick`:

    if(CREW_CUSTODY_CUFFS)
        held = !isnull(body.handcuffed) && cuff_tries <= CREW_NPC_CUFF_TRIES
        // Not at it just now: it starts, or starts again.
        if(held && !length(body.do_afters))
            cuff_tries++
            if(cuff_tries <= CREW_NPC_CUFF_TRIES)
                INVOKE_ASYNC(body, TYPE_PROC_REF(/mob/living, execute_resist))

and at the end of the same proc, with no look at the cuffs:

    if(held)
        hold_in_custody()
        addtimer(CALLBACK(src, PROC_REF(custody_tick)), 1 SECONDS)
        return
    let_out_of_custody()

`code/modules/mob/living/living.dm:1140` and `:1151`:

    /mob/living/can_resist()
        if(next_move > world.time)
            return FALSE
    ...
    /mob/living/proc/execute_resist()
        if(!can_resist())
            return
        changeNext_move(CLICK_CD_RESIST)
        ...
        else if(mobility_flags & MOBILITY_MOVE)
            if(on_fire)
                resist_fire() //stop, drop, and roll
            else if(last_special <= world.time)
                resist_restraints() //trying to remove cuffs.

`code/modules/mob/living/carbon/carbon.dm:180`:

    /mob/living/carbon/resist_restraints()
        var/obj/item/restraint = get_attached_restraint()
        if(restraint)
            change_next_special_move(restraint.resist_cooldown)
            cuff_resist(restraint)

## How it was found

Read from the code. Not seen in a round: no crew member has yet been left in cuffs in one.

## How to fix it

1. In `custody_tick`, in the `CREW_CUSTODY_CUFFS` branch, count a try only when one really began. The surest test is the game's own: `execute_resist` runs until the `do_after` in `cuff_resist` sleeps, so straight after `INVOKE_ASYNC(body, TYPE_PROC_REF(/mob/living, execute_resist))` returns, `DOING_INTERACTION(body, REF(body.handcuffed))` (`code/__DEFINES/mobs.dm:637`) is true only if the 60 seconds started. Call it, then `cuff_tries++` only if that is true. This also covers the other ways `execute_resist` does something else or nothing: the cooldowns (`next_move`, `last_special`), lying down (no `MOBILITY_MOVE`, as after the baton), `TRAIT_INCAPACITATED`, being buckled, being inside a locker, being on fire. Testing `next_move` and `last_special` alone, as first written here, misses those.
2. Raise nothing else: three real tries of a minute each is the design.
3. Never fall through to `let_out_of_custody()` while `body.handcuffed` is set. When the tries are spent, keep the body in a held state of its own (a fourth phase, or `CREW_CUSTODY_CUFFS` with a flag) in which it does not stand rooted: let it walk, since it cannot work. Tell the brain once, with a detail the window can act on, for example `emit_sense(CREW_SENSE_KNOWLEDGE, "You cannot get these handcuffs off by yourself.", list("stuck_in_cuffs" = TRUE))`.
4. In the window, give that a plain coded line with a fallback, said aloud to whoever is in sight and sent by PDA to its own head: "I am in handcuffs and cannot get them off. Can someone take them off?" That is a hand-off said aloud or by PDA, which the rules ask for. Code decides to ask; the model only words it.
5. Free it the moment the cuffs are seen to be off, whoever took them off: at the top of `custody_tick` (and for a body with no custody at all, see HOLE-11), `isnull(body.handcuffed)` in the cuffs phase is already what ends it.

Steps 1 and 3 alone (server, one file) stop the false "free to go". The simplest form of step 3 is to drop the cap: a player in cuffs presses Resist again and again until they are off, so with step 1 counting honestly the body can keep trying with no limit, standing still only while a try runs. Step 3's message and step 4 (the window asks for help) are a further change that needs the owner's word.

The question for the owner: who takes cuffs off a crew member that security has forgotten? Any crew member can do it from the strip window, as a player can. The smallest general rule is that whoever is asked and is standing next to them does it, with the same stand-in `take_cuffs_off` uses.

## How to test the fix

- Server compile on a side copy.
- `tools/llm_crew/sim.ts`: a scenario where a body is sent `working_off_cuffs`, then `stuck_in_cuffs`; it must say its line and send the PDA message once, and must not take up cleaning or hauling tasks.
- In a round: cuff a janitor with the player's own cuffs after an officer has arrested it and been called away, and walk into it while it resists. `game.log` must not show "is free to go" for it while it is still cuffed (check with the VV panel or by looking at it).

## Check

Checked by Opus 5.5. Read `custody_tick`, `let_out_of_custody`, `being_arrested`, `hold_in_custody` (`crew_npc_security.dm` 1370-1500) and `stand_still` (`crew_npc_doors.dm:14`), and the base procs: `can_resist` and `execute_resist` (`living.dm` 1140-1175), `resist_restraints` and `cuff_resist` (`carbon.dm` 180-225), `resist_cooldown` (`items.dm:242`, `CLICK_CD_BREAKOUT` 100), the bump and swap code (`living.dm` 185-305) and `DOING_INTERACTION` (`mobs.dm:637`). The quotes match.

Traced the case: a try broken at 4 s leaves `last_special` 6 s in the future, so the next two ticks count tries 2 and 3 with `resist_restraints` never called; the tick after counts 4 with no call, and the next has `held = (4 <= 3)` false and calls `let_out_of_custody()` with the cuffs on. `stand_still` only sets `TRAIT_AI_MOVEMENT_HALTED`, not `TRAIT_NOMOBSWAP`, and a restrained body not being pulled is swapped with by anyone not in combat mode (`can_mobswap_with`), so the break is easy to get. Nothing else on the server looks at the body's own cuffs once `custody_phase` is null, and the window has no handling for its own cuffs. The changelog's line "It will work the cuffs off, slowly" (Known and not fixed, Beepsky) is a claim, not a fix of this. A body lying down after the baton burns tries the same way, since `execute_resist` needs `MOBILITY_MOVE`.

Severity kept at medium: the body is useless for the rest of the round, but only after it was left in cuffs by its officer, which is not most rounds. Effort raised to medium and the fix line changed: the fix as first written spans server and window; steps 1 and 3 on the server alone stop the fault, and step 1 is made sturdier by testing `DOING_INTERACTION` after the call rather than the two cooldowns. The cross-reference to SEC-09 was wrong (SEC-09 is about why cuffs fail to go on); the body with no custody at all is HOLE-11.

## Fix so far

Group m-secsrv, commit cdaebf183ee (compile only; not played). Steps 1 and 3 in their simplest form: held while the cuffs are on, a try counted only when `execute_resist` left a `do_after` running, and no cap (`CREW_NPC_CUFF_TRIES` removed). Left: the "cannot get these handcuffs off" sense line and the window's ask for help (steps 3 and 4), which need the owner's word.

## Fix so far (owner's answer B, security's window part)

Built on branch `a-secwin` (the server's `stuck_in_cuffs` event is a-secsrv's; the crew member's own line is the job's/a-brain's). `stuckInCuffsAsk` in `jobs/arrests.ts`, called first from `readsMessage` and `overhears` in `jobs/officer.ts` and `jobs/headofsecurity.ts`: a crew member saying they are in handcuffs and cannot get them off ("I am in handcuffs and cannot get them off", or "stuck in cuffs") is taken as an ask to an officer or the Head of Security. Not when it has a warrant on them, holds them, or put them in a cell. In sight and still cuffed, they go on `toFree` (marked `stuck`) and the usual let-go step sends `free` on that name; sent from out of sight, the ask stands ten minutes (`CUFF_ASK_DS`) and is acted on once they are seen still in cuffs (`freeStuck`, run from `syncBeat`). The officer does not go looking for them. Table `tools/llm_crew/secwin-answers.ts`. Not played.
