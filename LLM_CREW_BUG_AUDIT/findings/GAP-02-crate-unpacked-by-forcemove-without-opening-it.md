---
id: GAP-02
title: A collected crate is unpacked by moving its contents in code, without opening it (no-cheats plan 4.6, approved, not built)
kind: gap
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:558, code/modules/llm_crew/crew_npc_held.dm:418, LLM_CREW_PLAN_NO_CHEATS.md:148
fix: Open the crate by the click a player uses, leave everything on its tile, pull the open crate one tile clear, shut it, and take it back
---

## What is wrong

See also: KNB-06 (this fault and the galoshes in one file), KNA-04 and GAP-07 (lists of cheats that name this one).

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

1. In the collect path (`crew_npc_held.dm`, where `tip_out` is called), replace the call with: release the pull, click the crate as the body (`click_as_body` in `crew_npc_machines.dm`; `take_mail` at `crew_npc_freight.dm:523` and `crew_npc_quartermaster.dm:380` already open crates with `crate.open(body)`: use the click, or at least `crate.open(body)`, which runs the game's lock and weld checks). If it will not open, fail with the game's reason. If you use the click: the body's active hand must be empty (`empty_clicking_hand()` in `crew_npc_machines.dm:296`, then `click_as_body(crate)`), and the **first** click on a crate that still has its manifest does not open it. `/obj/structure/closet/crate/attack_hand` (`crates.dm:113`) tears the manifest off into the hand and returns. The second click then has the manifest in the active hand and goes to `item_interaction` (`closets.dm:695`), which does not open a closed crate. So with clicks it is: empty hand, click (manifest), put the manifest away or switch hands, click again (open). `crate.open(body)` is the same `open()` the click reaches through `toggle()` (`closets.dm:1042`), and its `after_open` drops the manifest on the floor; that is the simpler choice and the one I would take. One exception: a wooden **large crate** (`/obj/structure/closet/crate/large`, `crates/large.dm`) refuses a hand and opens only to a crowbar, after which it is deleted (`crowbar_act`, `large.dm:40-55`). `open()` has no crowbar check, so `crate.open(body)` would be a cheat on one. None is orderable today (`orderable_crates`, `crew_npc_cargo.dm:31`), but the Janitorial Cart and Galoshes crate the plan wants cargo to order is one (`service.dm:53`). Refuse a large crate ("It needs a crowbar to open") until a crowbar step is built, and expect no crate to take back after it.
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
- When the empty crate reaches the bay it must be shut: `crew_npc_crate_spent` reads an open crate's tile (`crew_npc_freight.dm:118`), so an open crate on a tile with anything loose on it is read as not empty and is never put aboard.

## Check

Checked by Opus 5.5. The quote is what the code says today (`crew_npc_cargo.dm:558-572`, the caller at `crew_npc_held.dm:418` in `crate_collected`). `tip_out` never calls `open()` and never sets `crate.opened`, so `can_open`'s lock and weld checks never run, and the contents go by `forceMove` to up to eight tiles in the same area. `crew_npc_crate_holds` reads the crate's contents while it is shut, so the loop sees what is inside. No change log entry builds plan 4.6, and the change log's last line lists the plan as not built. The plan's table (`LLM_CREW_PLAN_NO_CHEATS.md:80`) names it as a cheat and the owner accepted "Unpacked things all on one tile? Yes." (`:224`).

Checked the fix against base code: `open()` drops contents at `drop_location()`; `close()` (`closets.dm:613-617`) calls `take_contents()`, which takes in what lies on the crate's tile, so step 3's "shut it on a clear tile" is right and needed. Added the manifest on the first click, which would make a one-click fix silently fail, and the shut-before-aboard test. Not a duplicate of KNB-06, which holds this fault and the galoshes. Severity high (no-cheats, every collection) and effort medium stand.
