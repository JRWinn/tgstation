---
id: PLAY-01
title: The officer cannot step out of a MetaStation cell after uncuffing a crew prisoner, because its few steps out are planned with a diagonal past the prisoner, and it then takes her to the next cell
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:449, code/modules/llm_crew/crew_npc_security.dm:1322, code/modules/llm_crew/crew_npc_security.dm:1285, code/__HELPERS/paths/navmap.dm:621, code/modules/mob/living/living.dm:219, code/game/atoms_movable.dm:818, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1252
fix: Pass diagonal_handling = DIAGONAL_REMOVE_ALL to get_path_to in walk_steps and close_with, so every step out of a cell is head-on and swaps with the prisoner
---

## What is wrong

See also: TRB-07 (the prisoner is told she is free the moment her cuffs come off; that is why she has to be arrested again each time). CHEAT-01 (fixed in b5b2daa9750; its fix made crew routes straight-only, but missed `walk_steps`). SEC-04 (a refused cell is picked again; here the marking works, which is why it moves on to the next cell).

An officer puts a crew prisoner in a cell like this: walk in to the tile furthest from the door with her by the arm, let go, take her cuffs off, walk back out to the timer, start it. On MetaStation every cell fails at the walk back out. The officer says "You cannot get back out of Cell 1 to its timer", and the window takes this as the cell refusing her. It goes to the next cell with her, which has the same shape and fails the same way.

Why it cannot get out. A MetaStation cell is four tiles. For Cell 1 (from `_maps/map_files/MetaStation/MetaStation.dmm`):

    (96,163) floor, flasher       (97,163) floor          <- the glass door stands on (97,164) and shuts its south edge
    (96,162) bed                  (97,162) brig locker (dense, anchored)

1. `put_in_cell` picks the "deep" tile, the clear tile furthest from the door at (97,164). The locker tile is skipped as blocked. The bed at (96,162) is 2 away; the other two are 1 away. So the officer walks to the bed.
2. The prisoner, pulled, ends on the tile it came through: (96,163). The round log shows exactly this: officer at (96,162), prisoner at (96,163).
3. The officer lets go and takes her cuffs off.
4. `walk_steps(outside)` plans with `get_path_to`, which by default keeps diagonals (`DIAGONAL_REMOVE_CLUNKY`) and does not count people as in the way. The planner is the navmap A* (`SSpathfinder.pathfind`); with `DIAGONAL_REMOVE_CLUNKY` it keeps a diagonal unless only the east-west-first way round is open (`navmap.dm:572` and `:621`), and a diagonal costs 14 against 20 for the two straight steps, so it is chosen. The way out from the bed is a diagonal step north-east to (97,163), then north through the door. The diagonal is kept, because the north tile (96,163) is open floor to the planner.
5. `body.Move` splits the diagonal. North first: into the prisoner. `MobBump` will not swap places on a diagonal ("no mob swap during diagonal moves"). Then east: into the anchored locker. Both fail.
6. `walk_steps` tries that step for 3 seconds (`CREW_NPC_STEP_WAIT`), then gives up. The officer has not moved.

A straight step north would have swapped the two of them (neither has a client, she is not in cuffs or held, neither is in combat mode), and she would have been left on the bed inside. Since CHEAT-01's fix took PASSMOB off crew bodies, the only way past a person is that head-on swap. The crew movement datum was changed to straight steps for that reason. `walk_steps`, which plans its own route, was not.

Then the second fault. The window is told `no_way`. `beatAfterActing` counts it as a cell that refused her and sends the next jail at once: "The cell would not take them, and it still has them by the arm: the next cell, at once." But the officer does not have her by the arm. It let go and took the cuffs off in step 3, and she is standing inside the cell, one tile from where she needs to be. The officer arrests her again (she is now "free to go", TRB-07), walks her out of a good cell, and into the next one, where steps 1 to 6 repeat. All three MetaStation cells have the locker on the east side of the bed, so all three fail. After the third, the window waits `CELL_AGAIN_DS` (90 seconds) standing in the brig, then tries again.

In the round it got her in on the fourth arrest, two and a half minutes after the first. The log does not show why that try worked. It started the same way as the failed ones: officer on (99,162), she on (99,163) at "free to go". She was next heard from (99,162), the bed tile, 20 seconds later, so they did swap at some point. The walk out took about 5.9 seconds from the cuffs coming off, against about 5.1 for the three that failed, which fits her having stepped off (99,163) part way through: a freed crew prisoner does try to walk off (at 22:05:07 she tried to go to her office from (99,163) and found no route). It may also be that the officer's "outside" tile gave a different route. It is luck either way. The fourth try used Cell 2, not Cell 1, because the player stood inside Cell 1 at (97,163) from 22:05:27 on, so `occupants()` counted Cell 1 as in use.

## Where

`code/modules/llm_crew/crew_npc_security.dm:449`, in `walk_steps`. No `diagonal_handling` is passed, so the default `DIAGONAL_REMOVE_CLUNKY` is used:

    var/list/path = get_path_to(body, destination, max_distance = CREW_NPC_CELL_PATH, mintargetdist = near, access = get_access())
    ...
    for(var/turf/next as anything in path)
        // A door walked into opens, and is not open yet: the step is tried until it has had time to be.
        var/tried_from = world.time
        while(get_turf(body) != next && world.time - tried_from < CREW_NPC_STEP_WAIT)
            if(!can_step())
                return FALSE
            body.Move(next, get_dir(body, next))

`code/modules/llm_crew/crew_npc_motor.dm:60`, what the rest of the crew walking already does, and why:

    /datum/ai_movement/navmap_astar/crew_npc
    	maximum_length = CREW_NPC_MAX_PATH_LENGTH
    	// Straight steps only. People are got past by swapping places with them, and the game swaps
    	// only head-on: a diagonal step into someone just stops.
    	diagonal_flags = DIAGONAL_REMOVE_ALL

`code/modules/llm_crew/crew_npc_security.dm:1280`, in `put_in_cell`, the deep tile (the bed, in the corner beside the locker):

    // In, to the tile furthest from the door, so that whoever trails a step behind is inside too.
    ...
    for(var/turf/spot as anything in cell.turfs)
        if(spot.is_blocked_turf(exclude_mobs = TRUE))
            continue
        var/distance = get_dist(spot, door)
        if(distance > deep_distance)

`:1315` to `:1330`, the hold let go and the cuffs off before the walk out, and the walk out's failure told as `no_way`:

    body.stop_pulling()
    var/datum/ai_controller/crew_npc/their_controller = prisoner.ai_controller
    if(istype(their_controller))
        take_cuffs_off(prisoner, serial)
    ...
    if(!walk_steps(outside, 0, serial))
        ...
        cell_refuses(cell, prisoner_name, "it could not walk back out to the timer")
        return list(FALSE, "You cannot get back out of [cell.name] to its timer.", list("reason" = "no_way", "prisoner" = prisoner_name, "cell" = cell.name))

`code/modules/mob/living/living.dm:219`, in `MobBump`, base game:

    if(moving_diagonally)//no mob swap during diagonal moves.
        return TRUE

`code/game/atoms_movable.dm:818`, base `Move`: a diagonal is split into two straight steps, north (or south) first, then the other way round if that fails.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1252`, in `beatAfterActing`, which assumes the officer still holds her:

    // The cell would not take them, and it still has them by the arm: the next cell, at once.
    if (reason === 'no_way' || reason === 'timer') {
      warrant.cellTries = (warrant.cellTries ?? 0) + 1;
      warrant.cellFailedAt = brain.now;
      return;
    }

## How it was found

Seen in a round log, `data/logs/2026/11/19/round-15.44.36/game.log`. Casey Cooper, Security Officer, jailing Sunshine Langston, Head of Personnel:

    [22:04:33.451] Crew NPC (Casey Cooper) took the cuffs off (Sunshine Langston) at Brig (96,162,2).
    [22:04:33.890] Crew NPC (Sunshine Langston) is free to go at Brig (96,163,2).
    [22:04:38.609] Crew NPC (Casey Cooper) could not put Sunshine Langston in Cell 1: it could not walk back out to the timer. It stands at Brig (96,162,2).
    [22:04:45.498] Crew NPC (Casey Cooper) arrested (Sunshine Langston) at Brig (96,162,2).
    [22:05:02.616] Crew NPC (Casey Cooper) took the cuffs off (Sunshine Langston) at Brig (99,162,2).
    [22:05:07.616] Crew NPC (Casey Cooper) could not put Sunshine Langston in Cell 2: it could not walk back out to the timer. It stands at Brig (99,162,2).
    [22:05:25.353] Crew NPC (Casey Cooper) took the cuffs off (Sunshine Langston) at Brig (102,162,2).
    [22:05:30.627] Crew NPC (Casey Cooper) could not put Sunshine Langston in Cell 3: it could not walk back out to the timer. It stands at Brig (102,162,2).
    [22:07:10.504] Crew NPC (Casey Cooper) took the cuffs off (Sunshine Langston) at Brig (99,162,2).
    [22:07:16.379] Crew NPC (Casey Cooper) put (Sunshine Langston) in Cell 2 for 5 minutes.

Each time the officer is on the bed tile (x,162) and she is on (x,163), and "It stands at" is the same tile it uncuffed her on: it never moved. The gap from 22:05:38 to 22:07:10 is the 90 second wait after three refused cells. The player watching said "I think he just got caught in an arrest loop" (22:05:27). The Head of Security's report later counted "4 arrests made" for one prisoner. `pda.log` lines 109 to 113 show the officer's PDA messages for this, "I have Sunshine Langston in cuffs", "I cannot get them into a cell", "is in Cell 2", all sent within 7 seconds after she was already in.

Then read from the code: the cell layout from `MetaStation.dmm` (the four tiles above, the same for Cells 2 and 3 at x 99 to 100 and 102 to 103), `put_in_cell`, `walk_steps`, `get_path_to`, and the navmap planner's diagonal rule (`code/__HELPERS/paths/navmap.dm:572` and `:621`; `remove_clunky_diagonals` at `code/__HELPERS/paths/path.dm:162` is the JPS planner's copy of the same rule and is not the one used here; either way a diagonal is kept when the north or south tile is open to the planner, and people are not checked), `/atom/movable/Move`, `MobBump` and `can_mobswap_with`. The brig locker is `anchored = TRUE` (`code/game/objects/structures/crates_lockers/closets/secure/security.dm:192`), so it is not pushed either.

Not seen: which route the planner actually returned (nothing logs it), and why the fourth try worked. Not checked on other maps; any cell where the deep tile is reached past a corner will do the same.

## How to fix it

1. In `walk_steps`, pass `diagonal_handling = DIAGONAL_REMOVE_ALL` to `get_path_to`, the same rule as the crew movement datum. Every step in and out is then straight, and a straight step into the unheld, uncuffed prisoner swaps places with her as a player's would. She ends on the bed, inside. This also covers the other `walk_steps` callers (`set_free` at `:1531`, the way out after a prisoner who did not come all the way in). The `get_path_to` in `close_with` near `:422` (to a person, `mintargetdist = 1`) should get the same flag.
2. In `put_in_cell`, when the walk out fails, do not report `no_way`. The prisoner is already in the cell and the cuffs are off. Try the walk out again once after a short wait (a second or two: a crew prisoner who was in the way may have moved), then return a new reason such as `"stuck_inside"` with the words "You cannot get past [prisoner_name] to the door of [cell.name]." Do not call `cell_refuses`: the cell did not refuse her.
3. In `beatAfterActing` (`arrests.ts`), handle `stuck_inside` on its own: do not count a cell try and do not send `jail` to the next cell. Send the same jail again for the same cell, or a short step that only walks out and starts the timer if one is added. The comment "it still has them by the arm" is only true for the walk in; say so.
4. Keep: a prisoner in combat mode still blocks the swap (`can_mobswap_with`), as she would for a player officer. That case should come back as `stuck_inside` too, not as a lost prisoner.

Step 1 is the fix for what was seen, and it is what the `fix` line and `effort: small` cover: one argument in two calls in one file. Steps 2 and 3 stop the next unseen cause of a stuck walk out from turning into three arrests. They touch both the server and the window, so on their own they are `medium` effort; do them, but they need not wait for step 1. TRB-07 should be fixed alongside, so she is not "free to go" while the officer is still in the cell.

## How to test the fix

- Compile with the usual build.
- In `tools/llm_crew/`, add a jail scenario where the result of the jail is `no_way` after the cuffs came off (or the new `stuck_inside`), and check the window sends the same cell again and does not count `cellTries`.
- Next round with an arrest of a crew member on MetaStation, grep `game.log` for "could not walk back out to the timer": there should be none. Look for "took the cuffs off" followed within a few seconds by "put ... in Cell N", with the prisoner's later position on the bed tile (x,162). The Head of Security's report should count one arrest per prisoner.

## Check

Checked by Opus 5.5. Read from the code and the round log, nothing run. I tried to prove it wrong and could not.

- The code quotes are what the code says today: `walk_steps` at `crew_npc_security.dm:449` passes no `diagonal_handling`; `put_in_cell` lets go and takes the cuffs off at `:1315` to `:1318`, then reports the failed walk out as `no_way` through `cell_refuses` at `:1329` to `:1330`. `crew_npc_motor.dm:63` has `DIAGONAL_REMOVE_ALL` for ordinary walks. No `PASSMOB` is left anywhere in `code/modules/llm_crew/`, so the head-on swap is the only way past a person.
- The planner. `get_path_to` goes to `SSpathfinder.pathfind`, which is the navmap A*, not JPS. I read its diagonal rule (`navmap.dm:612` to `:625`, and the path build at `:567` to `:574`): with `DIAGONAL_REMOVE_CLUNKY` a diagonal is kept whenever the north-south-first way round is open, and mobs are not part of `nav_pass`. From (96,162) to (97,163) the north-first way is via (96,163), open floor to the planner, so the diagonal is kept at cost 14. I corrected the write-up, which named `remove_clunky_diagonals` (the JPS copy).
- The base game. `/atom/movable/Move` (`atoms_movable.dm:818` on) tries north first, then east, both with `moving_diagonally` set. `MobBump` returns before any swap while `moving_diagonally` (`living.dm:219`). The locker is a dense anchored closet. So both halves fail and the officer stays put, as the log shows.
- Guards I looked for and did not find: crew code never sets combat mode; walk intent is set only near something slippery (`mind_its_step`), not likely in the brig; no crew handler on `COMSIG_LIVING_PRE_MOB_BUMP` or `TRAIT_NOMOBSWAP`; after `stop_pulling` and the cuffs off she is neither pulled nor restrained. So a straight step north would pass `can_mobswap_with` (neither has a client) and swap.
- The map, read from `MetaStation.dmm` with a small script: Cells 1 to 3 are bed at (x,162), locker at (x+1,162), floor at (x,163) and (x+1,163), glass door on (x+1,164) facing south, for x = 96, 99, 102. The write-up said the door was on the north side of (97,164); it shuts the south edge. Corrected.
- The log matches every line quoted (`game.log` lines 914 to 1056). Two things I added. The player stood inside Cell 1 at (97,163) from at least 22:05:27, which is why the fourth try went to Cell 2. And the fourth try started from the same positions as the failed ones, so the layout is not the whole story for that try; the write-up already said this was luck, and I added the timing and her earlier attempt to walk off as the likely reason.
- The window. `beatAfterActing` at `arrests.ts:1252` is as quoted. After `no_way` the officer no longer holds her, so `serveStep` does not reach the jail step: it arrests her again, and `cell_refused` on the server sends the next jail to the next cell. After three, `CELL_AGAIN_DS` (900 tenths, 90 seconds) holds it. This matches the gap from 22:05:38 to 22:07:10.
- Not a duplicate. CHEAT-01 made ordinary walks straight-only and did not touch `walk_steps`. TRB-07 is why she is "free to go". PLAY-02 is the arrest count. SEC-04 is a refused cell being picked again. None names the diagonal step out.
- The fix. Step 1 works: with `DIAGONAL_REMOVE_ALL` the navmap planner puts in (96,163) as the middle tile, the step north is head-on, and she is swapped onto the bed, inside. The walk in is unchanged (it already went the straight way, because the south-first way round is the locker). Pulling a prisoner behind straight steps is fine. It keeps the rules: it is the game's own swap, as a player would do. I narrowed the `fix` line to step 1, which is the small change; steps 2 and 3 are kept as advice and touch both the server and the window.
- Severity stays high: on MetaStation every jailing of a crew prisoner hits this, each try is a fresh arrest the player sees, and it gets in only by luck.
- Not checked: other maps, the native pathfinder's tie-breaking (it was assumed to follow the DM A*'s costs), and the route the planner really returned, which nothing logs.

## Fix so far

Group p-server, commit 989ca2af638 (compile only, not played). Step 1 is done: `walk_steps` and `close_with` pass `diagonal_handling = DIAGONAL_REMOVE_ALL`. Part of step 2: a walk out of the cell that fails waits 1.5 seconds and is tried once more before `cell_refuses`. Left: the rest of step 2 (a new `stuck_inside` reason, no `cell_refuses`) and step 3 (the window handling it); they must go in together, since the window does not know a `stuck_inside` reason yet.

Group m-secsrv, commit 2f8a711b8ea (compile, tables and simulator; not played): steps 2 and 3 built together. A walk out that fails after the retry returns `stuck_inside` ("You cannot get past X to the door of Cell N."), with no `cell_refuses`, and keeps `jail_left_inside`. The next `jail` goes back to that cell's timer and only starts it (`tool_jail`, `put_in_cell` with `finishing`). The window counts no cell try for `stuck_inside` and sends the same jail again, twice at most within 20 seconds (`serveStep`, `beatAfterActing`). Table: `tools/llm_crew/arrests3-stuck.ts`. Left: nothing of this finding; a timer that will not start after the prisoner is let go still counts as the cell refusing them (`timer` reason), which is not this finding.
