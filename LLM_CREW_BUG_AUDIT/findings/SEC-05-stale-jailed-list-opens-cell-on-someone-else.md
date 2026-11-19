---
id: SEC-05
title: Letting someone go by name can open a cell that now holds somebody else
kind: bug
severity: medium
effort: small
confidence: likely
status: found
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1289, code/modules/llm_crew/crew_npc_security.dm:1320, code/modules/llm_crew/crew_npc_security.dm:1214
fix: At the timer, stop it only if someone of that name is standing in the cell, forget a jailed entry that is no longer true, and look for the person in sight before going by memory
---

## What is wrong

The server keeps `jailed`: the name of everyone this body has put in a cell, with the cell. An entry is added in `put_in_cell` and taken away only when this same body lets them out (`set_free`) or finds nothing holding them (`tool_free`'s last lines). It is not taken away when the cell's time runs out, or when anyone else stops the timer. So after a prisoner's time is up the entry stays for the rest of the round, pointing at a cell that is then given to the next prisoner.

`tool_free` goes by that entry before it looks at who is in front of it, and `set_free` then stops the timer of that cell whoever is inside:

- `tool_free`, cell loop: a cell whose timer is running and which has a `jailed` entry matching the name asked for is "theirs". It does not ask whether they are still in it.
- `set_free`, at the timer: it looks for someone of that name among the occupants only to fill in the words. With nobody of that name there, `prisoner` is null and the timer is stopped all the same. The answer is "You stop the timer of Cell 1, and its door opens for Pun Pun", `ok`, and the window records "freed".

One concrete case:

1. The officer puts Pun Pun in Cell 1 for 2 minutes. `jailed["Pun Pun"] = Cell 1`. Pun Pun is not one of the crew, so it is left in cuffs (by design). The time runs out, the door opens, the monkey wanders off still in cuffs. `jailed` still says Cell 1.
2. Later the officer puts Marisol Burris in a cell. `free_cell` gives the first empty one: Cell 1. Its timer is running again.
3. The Captain declares on Pun Pun again and then withdraws it, or pardons it, while the monkey is in the officer's sight in its cuffs. In the window `dropWarrant` sees `had && cuffed` and queues `free` for "Pun Pun".
4. `tool_free("Pun Pun")`: `arrested` is not the monkey. The cell loop reaches Cell 1: timer running, `jailed["Pun Pun"] == Cell 1`, the name matches. `jail_cell = Cell 1`, `start_errand(timer, CREW_TOOL_FREE, ...)`. The check further down, "standing about in cuffs, in sight", which is the true one, is never reached.
5. `set_free`: nobody named Pun Pun in Cell 1. `work_timer(timer, "stop")`. Marisol Burris walks out. The monkey keeps its cuffs. The Head of Security's list says Pun Pun was freed and Marisol Burris is in Cell 1.

The same happens with no monkey in sight if anyone else (the Head of Security, the player) let the first prisoner out early and the window still holds its own `beat.jailed` entry for them (it is kept until the time it worked out for itself, `until`).

A second, smaller fault in the same lines: names are matched by `findtext`, so "an" lets out "Joanna" and "Dan". The window sends whole names today, so this only bites if that changes.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1289`, in `tool_free`:

    for(var/datum/crew_npc_brig_cell/cell as anything in crew_npc_brig_cells())
        var/obj/machinery/status_display/door_timer/timer = cell.timer_ref?.resolve()
        if(isnull(timer) || !timer.timing)
            continue
        var/theirs = FALSE
        for(var/name in jailed)
            if(jailed[name] == cell && findtext(LOWER_TEXT(name), wanted))
                theirs = TRUE
        ...
        if(theirs)
            jail_cell = cell
            start_errand(timer, CREW_TOOL_FREE, person_name)
            return
    // Standing about in cuffs, in sight.
    for(var/mob/living/carbon/human/person in in_sight)

`code/modules/llm_crew/crew_npc_security.dm:1320`, in `set_free`:

    var/mob/living/carbon/human/prisoner
    for(var/mob/living/carbon/human/person as anything in cell?.occupants())
        if(is_named(person, wanted))
            prisoner = person
            freed = person.name
            break
    if(timer.timing && !work_timer(timer, "stop"))
        return list(FALSE, ...)

`code/modules/llm_crew/crew_npc_security.dm:1214`, the only place an entry is made:

    arrested = null
    jailed[prisoner_name] = cell

The window's own list is cleared on time (`jobs/arrests.ts:439`, "Those whose time is up are no longer in a cell"); the server's is not.

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `tool_free`, move the two checks that go by sight ahead of the one that goes by memory: first `arrested`, then "in a cell it can see them in", then "standing about in cuffs, in sight", and only then a `jailed` entry.
2. In `set_free`, at the timer, with the cell in front of it: if `prisoner` is null (nobody of that name is in the cell), do not touch the timer. Remove the stale entries for that name from `jailed` and return `list(TRUE, "[freed] is not in [cell.name] any more.", list("freed" = freed, "nothing" = TRUE))`. The window already treats `nothing` as "nobody to say is free". This keeps to the senses rule: the body learns the cell's state by walking up and looking, as `security_state` says it must.
3. In `put_in_cell`, when an entry is made for a cell, drop any other name still listed against the same cell: one cell, one prisoner.
4. Make the name test whole-name: compare `LOWER_TEXT(name) == wanted` first and fall back to `findtext` only if nothing matched exactly.

What must keep working: letting out someone who is out of sight in a cell the body put them in (the walk to the timer is still made on memory), and letting go of someone by the arm.

## How to test the fix

- Server compile on a side copy.
- `tools/llm_crew/sim.ts`: make the simulator's `free` handler answer `nothing` when the named person is not in the cell it remembers, and add a scenario: jail A, time runs out, jail B in the same cell, free A. B must still be in the cell.
- In a round: the same four steps. Grep `game.log` for "stopped the timer of": it must not appear for the freed name while another prisoner is in that cell.
