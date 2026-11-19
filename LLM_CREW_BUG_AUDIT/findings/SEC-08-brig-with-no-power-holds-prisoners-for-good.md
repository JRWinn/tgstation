---
id: SEC-08
title: When the brig loses power a prisoner is never let out, a pardon is dropped without a word, and a new prisoner is held by the arm for ever
kind: gap
severity: medium
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1081, code/modules/llm_crew/crew_npc_security.dm:1333, code/modules/llm_crew/crew_npc_security.dm:1459, code/game/machinery/doors/brigdoors.dm:65, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1213
fix: Tell the brain a cell is dead (reason no_power), have security say so to its head and the Captain, and give it a player's way to open a dead cell door
---

## What is wrong

The security work was written for a brig that has power. The owner's test rounds lose station power about fifteen minutes in and do not get it back (nobody runs the engine). After that, three things go wrong and none of them is told to anyone in true words.

**1. A prisoner whose time is up stays shut in.** The game's cell timer stops counting when it has no power (`process()` returns `PROCESS_KILL`), `timing` stays TRUE, and the door stays shut. Nothing on the crew's side looks at the cell again: the window drops its `beat.jailed` entry when its own clock says the time is up and takes it that the door opened. A crew NPC in the cell goes by the timer alone (`held = !QDELETED(timer) && timer.timing`), so it stands in the cell for the rest of the round, its tools refused with "You are in Cell 1 until your time is up."

**2. A pardon is dropped.** `set_free` at a dead timer: `work_timer` returns FALSE (`timer.can_interact(body)` fails), and the answer is "You cannot get at the timer of Cell 1. It may have no power.", reason `timer`. The window tries three times (`FREE_TRIES`), then takes the name off `toFree`, deletes it from `beat.jailed`, and reports nothing: an outcome is pushed only `if (ok && !details.nothing)`. The Captain pardoned someone; they are still locked in; the list no longer shows them.

**3. A new prisoner cannot be put anywhere.** `free_cell` passes over a timer with no power. With every timer dead it returns null, and `tool_jail` answers "Every cell is in use.", reason `no_cell`. The window waits 30 seconds and tries again, for ever, saying "every cell in the brig is in use. You are waiting for one to come empty." The cells are empty. The prisoner is held by the arm in cuffs for the rest of the round.

A player officer in the same spot would see the dark timers, say on the radio that the brig has no power, pry the dead glass door open with a crowbar to let someone out (the game allows that on a door with no power), and keep a new prisoner in cuffs somewhere or let them go on the Captain's word.

## Where

`code/game/machinery/doors/brigdoors.dm:65`, the game's timer:

    /obj/machinery/status_display/door_timer/process()
        if(machine_stat & (NOPOWER|BROKEN))
            // No power, no processing.
            update_appearance()
            return PROCESS_KILL

and `timer_end`, which is also what "stop" calls:

    /obj/machinery/status_display/door_timer/proc/timer_end(forced = FALSE)
        if(machine_stat & (NOPOWER|BROKEN))
            return 0

`code/modules/llm_crew/crew_npc_security.dm:1081`, in `free_cell`:

    if(isnull(timer) || timer.timing || timer.z != body.z || (timer.machine_stat & (NOPOWER|BROKEN)))
        continue

and in `tool_jail`, the one answer for "none":

    action_result(CREW_TOOL_JAIL, FALSE, "Every cell is in use.", list("reason" = "no_cell", "prisoner" = prisoner.name))

`code/modules/llm_crew/crew_npc_security.dm:1333`, in `set_free`:

    if(timer.timing && !work_timer(timer, "stop"))
        return list(FALSE, "You cannot get at the timer of [cell?.name || "the cell"]. It may have no power.", list("reason" = "timer", "freed" = freed))

`code/modules/llm_crew/crew_npc_security.dm:1459`, in `custody_tick`:

    if(CREW_CUSTODY_CELL)
        var/obj/machinery/status_display/door_timer/timer = custody_timer?.resolve()
        held = !QDELETED(timer) && timer.timing

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1213`:

    free.tries += 1;
    if (!ok && free.tries < FREE_TRIES) {
      return;
    }
    beat.toFree = beat.toFree.filter((it) => it !== free);
    for (const name of Object.keys(beat.jailed)) {
      if (sameName(free.name, name)) {
        delete beat.jailed[name];
      }
    }
    // Nothing was holding them: there is nobody to say is free.
    if (ok && !details.nothing) {
      beat.outcomes.push({ what: 'freed', name: free.name });

Also `jobs/arrests.ts:439`, "Those whose time is up are no longer in a cell", which goes by the window's own clock.

`LLM_CREW_PLAN_SECURITY.md` section 3.9 says "When the time is up it looks in at the cell and collects its cuffs if they are there." That look was not built: `cuffsLeft` is stored in `beat.jailed` and nothing reads it.

## How it was found

Read from the code and from the game's timer. Not seen in a round. The power failing early in test rounds is on record in the owner's notes and in the README of this folder ("check that station power had not failed").

## How to fix it

In order of size. The first two are small and should be done whatever is decided about the third.

1. **True words.** In `tool_jail`, when `free_cell` returns null, look at why: if any cell on the level has `timer.machine_stat & (NOPOWER|BROKEN)` and is otherwise empty and stopped, answer "The cells have no power." with `"reason" = "no_power"`. In `set_free` and `put_in_cell`, use the same reason when the timer is unpowered, in place of `timer`. The body can see this: a dead timer is dark, and `security_state` could carry `"dead" = TRUE` for a cell in view.
2. **Somebody is told.** In `beatAfterActing`, on `no_power` push an outcome of the `cannot` kind once (`cannot(name, 'the brig has no power')`), so the Head of Security's list and the Captain hear it. A `free` that failed three times must push an outcome too ("could not let X out: ..."), and must not delete `beat.jailed[name]`.
3. **The look at time-up (plan 3.9), built as a general step.** When `beat.jailed[name].until` passes, the entry becomes "to look in on" and is not deleted. The officer goes to the brig; with the cell in view `security.cells` tells it whether the timer still runs and who is inside. Door open and nobody in: delete the entry, and pick up cuffs lying there (`get_kit` does that already). Timer still "running" past its time, or the prisoner still inside: that is a cell that did not open.
4. **Opening a dead cell.** The owner decides how. The player's way is a crowbar on a windoor with no power. The engineering staff already have a forcing errand (`crew_npc_forcing.dm`) for airlocks; the general build is to let that errand take a glass door too, and to have security ask engineering for it by PDA, as it already asks to be let into locked rooms. Until that is built, steps 1 to 3 at least put the truth in front of the Captain, who can open the cell.
5. **The crew member inside.** In `custody_tick`, a body in `CREW_CUSTODY_CELL` whose cell door stands open with the timer dead may walk out: check the cell's `door()` density as well as `timing`, so a pried door frees it.

What a prisoner held by the arm with no cell to go to should have done with them is the owner's to say (wait in the brig, as now; or ask the Captain by PDA).

## How to test the fix

- `tools/llm_crew/security.ts`: cases for `beatAfterActing` with `reason: 'no_power'` on `jail` and on `free`, and for a `free` that fails three times (an outcome is pushed, the jailed entry stays).
- `tools/llm_crew/sim.ts`: a scenario with the brig's timers dead: one prisoner inside past time, one pardon, one new arrest. The Head of Security's report must name the power.
- Server compile on a side copy.
- In a round: cut the brig's APC with someone in a cell and watch `pda.log` for the word to the Captain, and `game.log` for "The cells have no power".
