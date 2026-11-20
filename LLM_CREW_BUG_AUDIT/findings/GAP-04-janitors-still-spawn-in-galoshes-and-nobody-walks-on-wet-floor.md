---
id: GAP-04
title: Janitors are still given galoshes at spawn, and the plan's way to remove them clashes with the owner's ruling that a mopped floor is not seen (no-cheats plan 4.5 and 4.1)
kind: gap
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: janitor
files: code/modules/llm_crew/crew_npc_spawn.dm:15, code/modules/llm_crew/crew_npc_senses.dm:46, LLM_CREW_PLAN_NO_CHEATS.md:142
fix: Ask the owner whether a janitor may know the tiles it has just mopped, build that in knows_slippery, see it in a round, then delete the shoe swap in create_crew_npc
---

## What is wrong

See also: KNB-06 (this fault and the crate unpacking in one file), GAP-07 (lists this row).

**Correction by the checker:** the second point below is not a fault. That no body knows a floor wet from a mop was the owner's own choice. The 09:40 entry (`LLM_CREW_CHANGELOG.md:914`) says so: "A floor that is only wet from a mop it does not know of, and slips on like anyone, unless its shoes grip. The owner decided this." The owner thought the sheen could not be seen and wanted mopped floor to stay unknown. So the real gap is narrower. The plan (4.5) says the galoshes can go because the janitor "walks across wet tiles (4.1)". But 4.1 was built to the owner's later ruling and does not cover a mopped tile. The precondition the plan gives can never be met as written, and the owner has to choose another one.

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

**Owner question first.** The checker's reading: what was first proposed here (have `knows_slippery` read the `wet_floor` component of any tile in sight) goes against the owner's ruling in the 09:40 entry, so it must not be built without asking. Put these to the owner:

- (a) **The janitor knows the tiles it mopped itself** (KNB-06 step 6). It did the mopping, so this is within its own senses and does not touch the ruling for anyone else. This is the one I would ask for.
- (b) **Anyone who sees a wet floor sign walks near it.** The owner named this as the later step when making the ruling. The Janitorial Supplies crate holds three signs (`service.dm:37`), so a janitor could set one out. It is larger work: it needs putting a sign down and taking it up.
- (c) Read the sheen, as first proposed below. This reverses the ruling.

Then, for (a):

1. In `clean_mess` (and wherever else a mop is used on a floor), after the mop is used on a tile, note `mopped_tiles[REF(tile)] = world.time` on the controller. At the top of `knows_slippery(turf/spot)`, return TRUE if `spot` is in that list and noted within the last minute. Drop stale entries there. A mopped tile stays wet 10 to 60 seconds (`MakeSlippery(TURF_WET_WATER, 10 SECONDS, ...)` at `other_reagents.dm:162`). Do not put the turf into `slippery_seen`. That list is checked only against the movables on a tile, and pruned by a weakref going null, which never happens to a turf. Keep the galoshes test in `mind_its_step` as it is: a body that finds and wears a pair needs no care. Walking does prevent a water slip: `wet_floor.dm:92` sets `NO_SLIP_WHEN_WALKING` for `TURF_WET_WATER`.
   - Only if the owner chooses (c): `spot.GetComponent(/datum/component/wet_floor)`, counted when the tile is in `oview(1, pawn)`.
2. Lube and ice slip a walker too. The plan leaves those out (section 7). Do not walk for them: walking does not help. Leave a comment.
3. Server compile, then a round with a janitor mopping. Count slips. They are logged by `log_combat` (`carbon_movement.dm:5`) as "slipped on the", in `attack.log`, not `game.log`: `grep -n "slipped on the" attack.log`.
4. Only when that round shows janitors not slipping, delete the five lines in `create_crew_npc`, and `/obj/item/clothing/shoes/galoshes` can stay in the list in `crew_npc_inventory.dm:59`, which is only what a body recognises.
5. Update the comment above the swap and add the change log entry.

Wearing a pair it finds or is sent is "left for later" in the plan: it needs an action to change shoes. That is its own piece of work and not part of this. (A pair can be had honestly: the Janitorial Cart and Galoshes crate, `service.dm:48`, which the plan already wants cargo able to order.)

## How to test the fix

- Server compile to a side copy.
- The simulator runs no server code, so this needs a round: a janitor mops a run of hallway tiles and walks back over them. With (a), `attack.log` should show no "slipped on the" for the janitor; other bodies may still slip, which is the owner's ruling. Then spawn a janitor after the swap is removed and check its shoes are the job's own.

## Check

Checked by Opus 5.5. The galoshes block is at `crew_npc_spawn.dm:15-19` as quoted: `qdel` of the outfit's shoes and `new /obj/item/clothing/shoes/galoshes`. That is a cheat and it runs for every janitor. No change log entry removes it. `knows_slippery` (`crew_npc_senses.dm:46-59`) looks only at movables on a tile, so a mopped floor (a `wet_floor` component on the turf) is unknown to every body. Mopping does wet the floor: `mop.dm:71` exposes the turf, and water calls `MakeSlippery(TURF_WET_WATER, ...)`. So removing the swap today would make janitors slip on their own work.

The finding's point 2 and its fix step 1 were wrong to treat the unseen mopped floor as a fault to mend by reading the component. The 09:40 change log entry (`LLM_CREW_CHANGELOG.md:914`) records it as the owner's decision. I left point 2 as written and put the correction above it. I replaced fix step 1 with an owner question and the narrower option, the janitor knowing what it mopped itself. Also fixed: slips are logged in `attack.log` ("slipped on the", `carbon_movement.dm:5`), not `game.log`. The title and fix line now say what is left. Not a duplicate of KNB-06, which holds this fault and the crate one. Severity high (no-cheats, every janitor) and effort medium stand.
