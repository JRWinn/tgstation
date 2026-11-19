---
id: SEC-11
title: A pardon whose cuffs would not come off is reported to the Captain as freed and never tried again, leaving the person in security's cuffs
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1213, code/modules/llm_crew/crew_npc_security.dm:1358, code/modules/llm_crew/crew_npc_security.dm:1346
fix: In beatAfterActing for free, treat ok with cuffs_left as not done, keep the toFree entry for another try, and say so in the outcome after the last try
---

## What is wrong

Letting someone go has two halves: letting go of them (or opening their cell), and taking the cuffs off. `set_free` does both and answers `ok = TRUE` even when the second half failed, with `cuffs_left = TRUE` in the details. Its words say so: "You let go of X, but could not get the cuffs off them."

The window never reads `cuffs_left` for `free`. On `ok` it takes the name off `toFree`, deletes it from `beat.jailed`, pushes a `freed` outcome (the Head of Security and the Captain are told X has been let go), and tells X they are free to go. Nothing tries the cuffs again. A player officer would have another go, or tell the person to hold still.

`take_cuffs_off` fails for ordinary reasons: the person is not right next to the body after the half-second wait (`can_reach_target_now`), or either of them moves during the four seconds of the strip (`start_unequip` is a `do_after` that ends on movement). A player who has been told nothing yet, standing in cuffs, often steps about.

One concrete case:

1. The officer has Dana Reyes (a player) in Cell 1 in cuffs. The Captain pardons her.
2. `tool_free("Dana Reyes")` finds Cell 1, `set_free(timer)`: the timer stops and the door opens. She is in cuffs, so the officer waits a second and walks in to her.
3. She has seen the door open and steps toward it. `walk_steps(get_turf(prisoner), 1)` gets there, `take_cuffs_off` starts, she moves, the strip fails. `cuffs_left = TRUE`.
4. Answer: `ok`, "You stop the timer of Cell 1, and its door opens for Dana Reyes", `cuffs_left: TRUE`.
5. Window: `freed` is pushed; the Captain hears she is free. The officer says "You are free to go" to someone in its own cuffs and walks off. She works them off over a minute herself, or goes about the station in cuffs. The pair is lost to security as well (GAP-16, one pair of cuffs).

The same for someone let go of by the arm (`from: 'hold'`).

## Where

`code/modules/llm_crew/crew_npc_security.dm:1358`, `set_free`, person path:

    var/cuffs_left = !take_cuffs_off(person)
    ...
    return list(TRUE, cuffs_left ? "You let go of [freed], but could not get the cuffs off [person.p_them()]." : "You take the cuffs off [freed] and let [person.p_them()] go.", list("freed" = freed, "from" = "hold", "cuffs_left" = cuffs_left))

and `:1346`, the cell path:

    cuffs_left = !walk_steps(get_turf(prisoner), 1) || !take_cuffs_off(prisoner)
    ...
    return list(TRUE, "You stop the timer of [cell?.name || "the cell"], and its door opens for [freed].", list("freed" = freed, "from" = cell?.name, "cuffs_left" = cuffs_left))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1213`, which reads only `ok` and `nothing`:

    free.tries += 1;
    if (!ok && free.tries < FREE_TRIES) {
      return;
    }
    beat.toFree = beat.toFree.filter((it) => it !== free);
    ...
    if (ok && !details.nothing) {
      beat.outcomes.push({ what: 'freed', name: free.name });

`cuffs_left` is read only for `jail` (`arrests.ts:1176`, stored and never used afterwards).

## How it was found

Read from the code on both sides of the line. Not seen in a round: no pardon has been played.

## How to fix it

1. In `beatAfterActing`, `free` branch: if `ok && details.cuffs_left` and `free.tries < FREE_TRIES`, return without removing the entry, so the next step is another `free` for the same name. `tool_free` will find them: by the arm (`arrested`), or "standing about in cuffs, in sight", which already starts an errand to them.
2. The cell is open by then, so the second try is the plain one by name. Nothing changes on the server for that.
3. On the last try, push the outcome with the truth: a new `what: 'freed_in_cuffs'`, or `freed` with a flag, so the line to the Head of Security says "let go, but still in cuffs", and the pardon line to the person is not "free to go" while they are cuffed.
4. Optional, small, server side: in `set_free`, when `cuffs_left`, have the body say nothing new but log it (`game.log` already says "but could not get the cuffs off" for the hold path; add the same words to the cell path's log line, which today says only "stopped the timer").

## How to test the fix

- `tools/llm_crew/security.ts`: a case for `beatAfterActing` with `act.tool = 'free'`, `ok = true`, `details.cuffs_left = true`: the `toFree` entry stays, no `freed` outcome; on the third such answer the outcome is pushed with the in-cuffs flag.
- `tools/llm_crew/sim.ts`: let the stand-in server answer `cuffs_left` once for a pardon; the officer must send `free` again.
- Window type check.
- In a round: pardon someone in a cell and step about while the officer takes the cuffs off. `game.log` should show a second "let ... go" line for them.
