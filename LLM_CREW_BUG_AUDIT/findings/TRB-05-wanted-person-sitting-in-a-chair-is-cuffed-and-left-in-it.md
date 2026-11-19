---
id: TRB-05
title: Someone wanted who is sitting in a chair or lying in a bed is cuffed, the walk to the brig leaves them behind, and they are reported lost, sat in cuffs where nobody will report them
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 793709c33c0
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1027, code/modules/llm_crew/crew_npc_security.dm:1103, code/modules/llm_crew/crew_npc_security.dm:1150, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1200, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:280
fix: In hold_arrested unbuckle a buckled prisoner by an empty-hand click on what they are buckled to, as a player does, before the hold is taken, and answer no_hold if they are still buckled
---

## What is wrong

Sitting down in /tg/station is being buckled to the chair, and chairs are anchored. Someone buckled to an anchored chair or bed cannot be pulled away from it: the puller's step breaks the pull. Nothing in the arrest looks at `buckled`. So the officer cuffs a seated person (they did not move, so the cuffs go on), "takes them by the arm", sets off for the brig, and arrives without them.

A player officer clicks the chair (or the person) to unbuckle them first. The crew officer never does.

The case:

1. Warrant on a player, Dana Reyes, who is sitting on a chair in the Bar, perhaps away from the keyboard.
2. The officer comes, says the arrest line, and sends `arrest` (`quiet`). `put_cuffs_on` works: she does not move. `hold_arrested` calls `body.start_pulling(person)`, which succeeds (`can_be_pulled` looks at her `anchored`, not her chair's), and answers `ok` with `cuffed: TRUE`. The Head of Security is told "I have Dana Reyes in cuffs", and the Captain is told the same.
3. The window sees `holding` and sends `jail`. `tool_jail` passes (`body.pulling == prisoner` still) and starts the walk to a cell timer.
4. On the first step `/mob/living/Move` for a mob buckled to something anchored returns without moving (`living.dm:1049`), and `check_pulling` stops the pull once they are two tiles apart.
5. At the timer, `put_in_cell`: `body.pulling != prisoner`, so "Dana Reyes got away from you on the way to the cell", `reason = got_away`, with `place` the Brig if she is out of sight.
6. `beatAfterActing`: `lastSeen` is set to where the officer stands (the Brig), `lookedAt = null`, and a `lost` outcome goes to the Head of Security: "Joan, I lost Dana Reyes in the Brig." The desk passes the Brig back as the last sighting.
7. The officer looks about the Brig for twenty seconds and then walks the primary hallways. Dana sits in the Bar in cuffs. Nobody reports her: `syncWanted` skips anyone in cuffs ("not someone security already has in cuffs"). `desk.cuffed` was cleared by the `lost` outcome, so the list now says she is wanted and was last seen in the Brig.
8. If the officer passes the Bar again it sees her cuffed by its own cuffs (`cuffedByMe`), takes hold again, and the same walk leaves her behind again, with another "I lost" message.

The same holds for someone lying buckled in a plain bed (`/obj/structure/bed`, anchored) or on an operating table, and for a crew NPC sitting down, if any ever do. A rolling medical bed (`/obj/structure/bed/medical`) is not anchored, so its rider is moved with it (`living.dm:1050`, `buckled.Move`) and is not left behind by this path.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1027`, `hold_arrested`, which takes the hold with no look at `buckled`:

    arrested = WEAKREF(person)
    body.start_pulling(person)
    if(body.pulling != person)
        ...
        return list(FALSE, "[person.name] is in cuffs, but you cannot get a hold of them.", list("handle" = handle, "reason" = "no_hold", "cuffed" = TRUE, "hits" = hits))

`code/modules/mob/living/living.dm:1049`, base game, a buckled mob moves only with what it is buckled to:

    if (buckled && buckled.loc != newloc) //not updating position
        if (!buckled.anchored)
            ...
            . = buckled.Move(newloc, direct, glide_size)
        ...
        return

`code/game/objects/structures/beds_chairs/chair.dm:6`: `anchored = TRUE`, `can_buckle = TRUE`.

`code/modules/llm_crew/crew_npc_security.dm:1150`, `put_in_cell`, where the loss is found:

    if(QDELETED(prisoner) || body.pulling != prisoner)
        ...
        return list(FALSE, "[prisoner_name || "Your prisoner"] got away from you on the way to the cell.", got_away_details(prisoner, prisoner_name))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1200`, the window takes it as lost where the officer stands:

    warrant.toldAt = null;
    warrant.lastSeen = { place: brain.location, at: brain.now };
    warrant.lookedAt = null;
    if (reason === 'got_away') {
      beat.outcomes.push({ what: 'lost', ... place: brain.location });

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:280`, nobody reports someone in cuffs:

    if (!entry || person.name === brain.name || person.cuffed) {
      continue;
    }

## How it was found

Read from the code and from the base `Move` and `check_pulling` (`code/game/atoms_movable.dm:669`). Not seen in a round. `likely` because I did not trace the errand walk step by step to the timer; any walk of more than one tile breaks the pull, so I expect the result above.

## How to fix it

1. In `hold_arrested`, before `start_pulling`: if `person.buckled`, unbuckle them the way a player does, by a click with an empty hand on the thing they are buckled to: `empty_clicking_hand()` (`crew_npc_machines.dm`), then `click_as_body(person.buckled)`. That click runs `/atom/movable/attack_hand` (`code/game/objects/buckling.dm:20`), which calls `user_unbuckle_mob` at once for someone else. A click on the person themselves does not unbuckle them: on a human it is a help-intent touch (`human_defense.dm:119`). Then look again at `person.buckled`.
2. If they are still buckled after that (an alien nest, whose `user_unbuckle_mob` is its own and slow, `alien_nest.dm:56`), answer `no_hold` with a reason the window can say: "They are strapped to the X and I cannot get them loose". Write a `log_game` line for the unbuckle either way, so a round shows it.
2a. Do the same in `tool_jail` (`crew_npc_security.dm:1103`) where it takes hold again of a prisoner it let go of: put the unbuckle in a small proc, `unbuckle_for_hold(person)`, and call it from both places. Step 1 alone covers both of `make_arrest`'s ways in, since both end in `hold_arrested`.
3. In `put_in_cell`, when `body.pulling != prisoner` and the prisoner is still in view where it left them, give `place` as their room, not the officer's, so a lost prisoner is looked for where they are (`got_away_details` already does this when they are in view; the trouble is they are out of view by the time it reaches the timer, so also record where the hold was lost: set a `lost_at` turf in `check_pulling`'s place, or check `body.pulling` every step of the walk).
4. Do not change `syncWanted`: someone sitting in security's cuffs is security's business. The mend is that security does not leave them there.

## How to test the fix

- Server compile.
- Simulator: the simulator does not model buckling; a case would need `sim.ts` to fail the walk with `got_away` when the prisoner is marked seated. Better tested in a round.
- In a round: sit on a chair in the Bar, get a warrant declared on yourself, and do not move. `game.log` should show the officer unbuckling you, "arrested", and "put ... in Cell", and no "reached ... without its prisoner". Do it once more lying in a dormitory bed.

## Check

Checked by Opus 5.5. The quotes match today's code. Traced the base game:

- A chair is `anchored = TRUE`, `can_buckle = TRUE` (`chair.dm:6`), and `buckle_prevents_pull` is FALSE for it (only the guillotine, mulebot and a ninja module set it). So `/mob/living/can_be_pulled` (`living.dm:1957`) lets the pull be taken, and `hold_arrested` answers ok with the person in cuffs.
- When the officer steps, `/atom/movable/Move` moves what it pulls with `move_from_pull` (`atoms_movable.dm:885`, `915`); `/mob/living/Move` (`living.dm:1046`) returns without moving a mob whose `buckled` is anchored; `check_pulling` (`atoms_movable.dm:669`) then stops the pull at two tiles apart.
- Nothing in our code reads `buckled`: a grep of `code/modules/llm_crew/` finds no use. The jail errand walks straight to the timer (`crew_npc_hands.dm:201`) and only `put_in_cell` (`crew_npc_security.dm:1150`) notices the prisoner is gone, giving the officer's own room as the place when she is out of sight (`got_away_details`). The window then sets `lastSeen` to `brain.location` and sends `lost` with that place (`arrests.ts:1200`), and `syncWanted` skips anyone cuffed (`wanted.ts:280`).

So the walk from any room but the brig itself leaves the prisoner behind. Confidence raised to sure. Nothing in the change log or the security plans mentions buckling. Fix step 1 was mended: a click on the person does not unbuckle them, only a click on what they are buckled to; the helper `empty_clicking_hand` exists for the empty hand. Added the `tool_jail` re-hold, and noted that a rolling medical bed is not anchored and so is not this fault. Severity left at medium (players sit at the Bar and in the dorms often, but a warrant on one who is sitting still is not most rounds); effort small, one proc in one server file.
