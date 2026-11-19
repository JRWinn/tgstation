---
id: GAP-04
title: Janitors are still given galoshes at spawn, and no body walks across a floor wet from a mop (no-cheats plan 4.5 and 4.1, half built)
kind: gap
severity: high
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: janitor
files: code/modules/llm_crew/crew_npc_spawn.dm:15, code/modules/llm_crew/crew_npc_senses.dm:46, LLM_CREW_PLAN_NO_CHEATS.md:142
fix: Teach knows_slippery to see a wet floor tile, see it work in a round, then delete the shoe swap in create_crew_npc
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.5: "nothing is swapped at spawn. A janitor starts in the shoes its job gives it. It does not slip on its own wet floor, because it walks across wet tiles (4.1)." The plan's table lists the swap as a cheat, and its section 5 step 8 says to remove it "only after step 2 is seen working in a round". It also breaks the owner's rule "supplies come through cargo, never at spawn".

The swap is still there. And the thing it waits on is only half built: step 2 (`mind_its_step`) slows the body for a slippery *thing lying on a tile* (oil, a peel, soap, foam), and says in its own comment that a floor wet from a mop is not known to it:

    A floor that is only wet from a mop it does not: there is nothing lying there to see, and it
    slips on that like anyone, unless its shoes grip.

So two things are wrong today:

1. Janitors have shoes that code made for them.
2. Every other body (technicians, heads, security, engineers) runs onto a freshly mopped floor and slips. A janitor let into the Cargo Bay mops the oil by the counter, the technician at the counter steps onto the wet tile at a run, falls, and drops what it is holding. If the swap were removed today, janitors would do the same on their own floors, which is the fault the swap was put in to hide.

## Where

`code/modules/llm_crew/crew_npc_spawn.dm:15`, in `create_crew_npc`:

    if(ispath(outfit_type, /datum/outfit/job/janitor))
        var/obj/item/ordinary_shoes = npc.get_item_by_slot(ITEM_SLOT_FEET)
        if(ordinary_shoes)
            qdel(ordinary_shoes)
        npc.equip_to_slot_or_del(new /obj/item/clothing/shoes/galoshes(npc), ITEM_SLOT_FEET)

`code/modules/llm_crew/crew_npc_senses.dm:46`, `knows_slippery`, looks only at movables on the tile:

    for(var/atom/movable/thing as anything in spot)
        var/datum/weakref/seen_ref = slippery_seen[REF(thing)]
        ...
        if(!crew_npc_slippery_thing(thing))
            continue

A mopped floor is not a movable. It is a `/datum/component/wet_floor` on the turf itself (`code/datums/components/wet_floor.dm`), which draws a shine on the tile that a player can see.

## How it was found

Read from the code against the plan. The plan's Status line for 4.1 says what was built and does not mention wet floors. No round log was read for slips.

## How to fix it

1. In `knows_slippery(turf/spot)`, before the loop, treat the tile itself as slippery when it is an open turf that is wet and in sight: `var/datum/component/wet_floor/wet = spot.GetComponent(/datum/component/wet_floor)`, and it counts when `wet` exists and its `highest_strength` is water (`TURF_WET_WATER`) or stronger. The shine is visible, so a tile in `oview(1, pawn)` (the test already used there) is honestly known. Keep the galoshes test in `mind_its_step` as it is: a body that finds and wears a pair needs no care.
2. Lube and ice slip a walker too. The plan leaves those out (section 7). Do not walk for them: walking does not help. Leave a comment.
3. Server compile, then a round with a janitor mopping. Count slips: `grep -c "slipped" game.log` for crew bodies (the game logs slips in `attack.log` as well).
4. Only when that round shows janitors not slipping, delete the five lines in `create_crew_npc`, and `/obj/item/clothing/shoes/galoshes` can stay in the list in `crew_npc_inventory.dm:59`, which is only what a body recognises.
5. Update the comment above the swap and add the change log entry.

Wearing a pair it finds or is sent is "left for later" in the plan: it needs an action to change shoes. That is its own piece of work and not part of this.

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code, so this needs a round: a janitor mops a hallway tile, a technician or head is sent across it. Look in `game.log` for the body's steps and in `attack.log` for "slipped". Then spawn a janitor after the swap is removed and check its shoes are the job's own.
