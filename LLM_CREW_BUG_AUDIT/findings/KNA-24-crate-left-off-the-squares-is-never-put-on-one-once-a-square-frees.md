---
id: KNA-24
title: A crate cargo once left off the marked squares is never put on one, even after a square comes free, and the log never says where a hauled crate ended
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: code/modules/llm_crew/crew_npc_freight.dm:216, code/modules/llm_crew/crew_npc_freight.dm:485, code/modules/llm_crew/crew_npc_freight.dm:501
fix: Clear crew_npc_left_on when a square comes free that was not free when the crate was left, and name the tile in the log line for every haul
---

## What is wrong

Listed in the change log entry of 2026-11-18, 18:05 to 19:12, "Seen and left alone": "Crates the owner pushed about were hauled again, but the logs do not say where to. ... Nothing records the tile a crate ended on. Read in the code, not seen: a crate trails a step behind whoever hauls it, the last step that draws it onto the square is skipped when the tile beyond is taken, and a crate cargo has once left on a tile is never gone at again, on a square or not (`freight_hauled`, `misplaced_crates` in `crew_npc_freight.dm`)." No later entry changes either part.

Two faults:

1. **The mark that stops a crate being hauled about for ever never wears off.** Each crate a technician hauls and lets go of is marked with the tile it was left on (`crew_npc_left_on`). `misplaced_crates` then passes over a bay crate that still stands on that tile, whether or not it is on a square. That is meant for when every square is taken: the crate is where it could best go, and walking it round again gets nowhere. But it is never cleared. When a square comes free later, the crate is still where it was left, so it is still passed over, and it stands loose in the bay for the rest of the round. The owner's alteration 17 in the 15:00 entry ("A crate loose in the bay, off the squares, is put on one") does not happen to any crate that was ever hauled once while the squares were full.
2. **The log does not say where a crate ended.** The success line to the brain and the log is "You haul the X out of the way and leave it in Cargo Bay, where a crate belongs." It names the room only. Whether it is on a square, a tile short of one, or by a door cannot be read back.

The case for 1: the shuttle brings six crates and the bay has four marked squares. A technician unloads them. Four go onto the squares. The fifth and sixth go to `storage_spot`, the nearest clear tile, and are marked left there. Ten minutes later two crates are collected from the lobby and their squares are empty. `free_square()` now finds one, so the loop in `misplaced_crates` runs, but for the fifth and sixth crates `crate.crew_npc_left_on == get_turf(crate)` is true, and they are skipped. They stay in the middle of the bay floor.

## Where

`code/modules/llm_crew/crew_npc_freight.dm:485`, `freight_hauled`:

    var/obj/structure/closet/crate/stood = hauled
    if(succeeded && istype(stood) && tool != CREW_TOOL_RECYCLE)
        stood.crew_npc_left_on = get_turf(stood)

`crew_npc_freight.dm:216`, `misplaced_crates`:

    if(post_turf && free_square())
        ...
            if(get_area(crate) == bay)
                // Nor one that stands where cargo last left it: with every square taken, or no room
                // to draw it onto one, that is the best that could be done, and it is not gone at again.
                if(!(get_turf(crate) in squares) && !entry?.collected_by && !crate.opened && crate.crew_npc_left_on != get_turf(crate))
                    crates += crate

`crew_npc_left_on` is written in that one place and read in this one; nothing else sets it back (`grep crew_npc_left_on code/modules/llm_crew` finds three lines: the var, the read, the write).

`crew_npc_freight.dm:501`, the words that go to the brain and the log:

    else if(tool == CREW_TOOL_STOW)
        action_result(tool, TRUE, "You haul the [hauled_name] out of the way and leave it in [place], where a crate belongs.", list("place" = place))

## How it was found

Read from the code. Not seen in a round: no round has had more crates in the bay than squares, as far as the logs read for the change log say.

## How to fix it

1. When a crate is left, also note whether a square was free at that moment (`stood.crew_npc_left_full = isnull(free_square())`, a second var beside `crew_npc_left_on`).
2. In `misplaced_crates`, skip a crate on its left-on tile only when it was left there with a square free (that is, the haul itself failed to reach the square: the onward step was blocked) or when no square is free now. A crate left off the squares because all were full is taken again as soon as `free_square()` finds one. That keeps the loop guard for the case it was written for, a crate that cannot be drawn onto the square it was taken to.
3. To stop a crate that keeps failing the last step being tried for ever, keep the existing mark for that case and clear it after some minutes (a time on the crate, as `tidy_skipped` keeps for things).
4. In `freight_hauled`, write a `log_game` line for every successful haul with `AREACOORD(stood)` and whether that tile is a marked square: "left crate #N at Cargo Bay (x,y), on a marked square" or "a tile short of a marked square" or "off the squares, none free". That answers the log half of the change log item.

## How to test the fix

Server compile to a side copy. The simulator does not run this code. Next round, `game.log`: after the shuttle brings more crates than there are squares and some are collected, the new "left crate" lines should show the loose ones moved onto squares within a minute or two of the squares coming free.
