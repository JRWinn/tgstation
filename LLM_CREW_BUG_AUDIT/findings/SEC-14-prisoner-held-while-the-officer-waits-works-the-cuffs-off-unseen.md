---
id: SEC-14
title: A player held by the arm while the officer stands waiting works the cuffs off in a minute and walks away, and the officer never sees it start
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: code/modules/mob/living/carbon/carbon.dm:206, code/modules/mob/living/living.dm:1151, code/modules/llm_crew/crew_npc_security.dm:1027, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:671
fix: While the body holds someone it arrested, listen on them for COMSIG_MOB_REMOVING_CUFFS, tell the brain what any onlooker sees, and have the officer break the attempt by a step or a tighter grip
---

## What is wrong

The officer holds its prisoner with a plain pull (`hold_arrested`, `start_pulling`, a passive grab). In cuffs, a player cannot shake a passive pull: `execute_resist` only tries the grab when the mob is not restrained. But resist does something else for a restrained mob that is standing still: `resist_restraints`, a one minute `do_after` on themselves (`cuff_resist`, `breakouttime = 1 MINUTES` for handcuffs), which any movement of theirs breaks. Being pulled along a hallway breaks it. Being held still does not.

Once the cuffs are off, the next resist goes to the grab, and a passive grab is broken at once ("GRAB_PASSIVE is equal to 0, so ... we can break free immediately on resist").

The officer stands still with its prisoner for long stretches, by design:

- every cell in use, or every timer dead: "You are waiting for one to come empty", 30 seconds at a time, for ever when the brig has no power (SEC-08, ARR-04; the owner's test rounds lose power about fifteen minutes in);
- every cell refused: 90 seconds standing in the brig (`CELL_AGAIN_DS`);
- a jail step that keeps failing, held back by the driver (ARR-01, up to two minutes).

The game tells everyone in view: "Dana Reyes attempts to remove the handcuffs!" (`visible_message` in `cuff_resist`). A player officer sees that and takes one step, which ends the attempt, or tightens the grip. The crew body hears nothing of it: no sense is sent, and the window has no idea a minute is running. So the player waits out the minute, steps away, and the officer is left with its cuffs on the floor and, by ARR-10, no way of fetching them while the person is in sight.

Crew NPC prisoners never resist (they stand for it), and the monkey AI has no resist behaviour, so today this is only a player's way out. But every prisoner who is a player can use it, every time the brig is full or dark.

One concrete case:

1. Station power is out (the usual state after fifteen minutes). A warrant on a player. The officer cuffs them and walks them to the brig.
2. `tool_jail`: `free_cell` passes over every dead timer and returns null. "Every cell is in use", `no_cell`. The window: "You have X by the arm, and every cell in the brig is in use. You are waiting for one to come empty." It stands.
3. The player presses resist. `cuff_resist` starts: "X attempts to remove the handcuffs!". Sixty seconds of standing still. Nothing in the officer's code or the window reacts.
4. Cuffs off; resist again; the pull breaks. The player walks off. `security.holding` goes null; the window finds them in sight, not cuffed, and wants cuffs it does not have (`has_cuffs` false: the cuffs are on the floor).

## Where

`code/modules/mob/living/carbon/carbon.dm:206`, `cuff_resist`:

    if((cuff_break != INSTANT_CUFFBREAK) && (SEND_SIGNAL(src, COMSIG_MOB_REMOVING_CUFFS, cuffs) & COMSIG_MOB_BLOCK_CUFF_REMOVAL))
        return
    ...
    if(!cuff_break)
        visible_message(span_warning("[src] attempts to remove [cuffs]!"))
        ...
        if(do_after(src, breakouttime, target = src, timed_action_flags = IGNORE_HELD_ITEM|HIDE_INTERACTION, interaction_key = REF(cuffs) ))
            . = clear_cuffs(cuffs, cuff_break)

`code/modules/mob/living/living.dm:1151`, `execute_resist`: a restrained mob does not resist the grab, it works at the cuffs:

    if(!HAS_TRAIT(src, TRAIT_RESTRAINED) && pulledby)
        ...
        resist_grab()
        return
    ...
    else if(mobility_flags & MOBILITY_MOVE)
        ...
        else if(last_special <= world.time)
            resist_restraints() //trying to remove cuffs.

`code/modules/llm_crew/crew_npc_security.dm:1033`, `hold_arrested`, the only hold there is:

    arrested = WEAKREF(person)
    body.start_pulling(person)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:671`, the wait:

    if (
      warrant.noCellAt !== undefined &&
      brain.now - warrant.noCellAt < NO_CELL_WAIT_DS
    ) {
      return {
        ready: false,
        wait: true,
        step: `You have ${name} by the arm, and every cell in the brig is in use. You are waiting for one to come empty.`,

## How it was found

Read from the code: the base resist procs and the waits on the window side. Not seen in a round: the prisoners so far were Pun Pun, whose AI never resists.

## How to fix it

1. Server: in `hold_arrested`, after the hold is taken, `RegisterSignal(person, COMSIG_MOB_REMOVING_CUFFS, PROC_REF(prisoner_works_cuffs))`, and unregister it wherever `arrested` is cleared (`put_in_cell`, `set_free`, and when the hold is found lost). The signal fires exactly where the game shows its "attempts to remove" line to everyone in view, so this is a sense, not a hidden channel. The handler is a `SIGNAL_HANDLER`: it must not sleep and must not return `COMSIG_MOB_BLOCK_CUFF_REMOVAL` (that would be the body stopping it by magic).
2. In the handler, `emit_sense(CREW_SENSE_KNOWLEDGE, "[person.name] is trying to work the cuffs off.", list("prisoner_resisting" = person.name))`, and set a short flag on the controller.
3. What the body does about it, the player's way, coded and not left to the model: take one step and back (a bare `Move` to a free adjacent tile, with the prisoner in tow, which moves them and breaks their `do_after`), or upgrade the grab (a second grab click on someone already pulled raises it to aggressive, which a player does with ctrl-click). The step is simpler and enough. Do it from a timer a moment later, only if the body is still pulling them and is fit to move (SEC-01's check).
4. Window, `jobs/arrests.ts`: on `prisoner_resisting`, nothing more is needed for the work. The voice may say something ("Stop that.").
5. Question for the owner: should a prisoner who tries this count as resisting (`warrant.resisted`, five more minutes), as hitting the officer does? It is resisting arrest in the plain sense.

## How to test the fix

- Server compile on a side copy.
- In a round, as a player: be arrested with the brig's APC off, and press resist while the officer stands with you. `game.log` should show the new sense line and the officer's step within a second or two; the minute never completes.
- With power on, the same while the officer waits for a cell the Captain has filled.
