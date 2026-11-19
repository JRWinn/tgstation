---
id: GAP-02
title: A collected crate is unpacked by moving its contents in code, without opening it (no-cheats plan 4.6, approved, not built)
kind: gap
severity: high
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:558, code/modules/llm_crew/crew_npc_held.dm:418, LLM_CREW_PLAN_NO_CHEATS.md:148
fix: Open the crate by the click a player uses, leave everything on its tile, pull the open crate one tile clear, shut it, and take it back
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.6 (accepted: "Unpacked things all on one tile? Yes. That is what the game does.") says unpacking is opening the crate, by the code a click reaches, and that nothing is spread over the tiles round it by code.

`tip_out` still does the opposite. It never opens the crate. It takes each thing out of the shut crate with `forceMove` and deals them round the eight tiles beside it. A locked or welded crate would be emptied the same way, and things land on tiles the body is not next to.

One case: a janitor hauls crate #12 (Janitorial Supplies) to the Custodial Closet. `crate_collected` in `crew_npc_held.dm` calls `tip_out(hauled)`. The crate stays shut (`crate.opened` is never set), and its mop, three buckets, signs and bottles appear one a tile on up to eight tiles round the crate. The body is then told "You haul the crate to Custodial Closet and unpack it there".

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:558`:

    /datum/ai_controller/crew_npc/proc/tip_out(obj/structure/closet/crate/crate)
        var/turf/here = get_turf(crate)
        var/list/spots = list()
        for(var/turf/open/spot in orange(1, here))
            if(get_area(spot) == get_area(here) && crew_npc_safe_turf(spot) && !spot.is_blocked_turf(exclude_mobs = TRUE))
                spots += spot
        ...
        for(var/obj/item/thing as anything in crew_npc_crate_holds(crate))
            index++
            thing.forceMove(spots[((index - 1) % length(spots)) + 1])

The one caller, `code/modules/llm_crew/crew_npc_held.dm:418`:

    var/list/names = tip_out(hauled)
    crate_to_return = WEAKREF(hauled)

## How it was found

Read from the code against the plan. Listed as a cheat in the plan's section 3 table. No change log entry builds 4.6. The plan's **Unknown** ("whether an open crate can be pulled one tile aside and closed there empty") has not been tried in the game either: nothing in the change log says so.

## How to fix it

1. In the collect path (`crew_npc_held.dm`, where `tip_out` is called), replace the call with: release the pull, click the crate as the body (`click_as_body` in `crew_npc_machines.dm`; `take_mail` at `crew_npc_freight.dm:523` and `crew_npc_quartermaster.dm:380` already open crates with `crate.open(body)`: use the click, or at least `crate.open(body)`, which runs the game's lock and weld checks). If it will not open, fail with the game's reason.
2. Read the names of what came out from `crew_npc_crate_holds(crate)`, which already knows that an open crate's contents lie on its tile.
3. Pull the open crate one tile clear (`start_pulling`, one step with the body's own `Move`, as hauling does), then `crate.close(body)`. Base `/obj/structure/closet/proc/close` takes in whatever lies on the crate's own tile, so it must be shut on a tile with nothing loose on it. If no tile beside it is clear, leave the crate open where it is and take the things out by hand before shutting it: the plan's fallback.
4. Delete `tip_out`.
5. Check the two things that read where unpacked things are: `crew_npc_crate_spent` and the janitor's search for a mop "where the cleaning gear is kept". Both look at tiles, so one tile is fine.
6. The change log's 15:00 entry says a loose crate that "is open, with its contents on the floor round it" is not put on a marked square (`misplaced_crates`). Keep that guard: it now covers the moment between opening and shutting.

First try the Unknown in a round by hand (open a crate, pull it, shut it). The base code suggests it works: `open()` drops contents at `drop_location()` and a crate can be pulled open or shut.

## How to test the fix

- Server compile to a side copy.
- The simulator does not run server code, so this is a watched round: collect a crate, then `grep -n "unpack" game.log`. Everything should be on one tile and the crate should go back empty and shut.
- `grep -n "forceMove" code/modules/llm_crew/crew_npc_cargo.dm` should print nothing.
