---
id: GAP-10
title: Carrying water, the cart is never pulled or filled, cargo cannot order one, and a janitor short of a bucket tells nobody (no-cheats plan 4.4 and 4.1, half built)
kind: gap
severity: medium
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: janitor
files: code/modules/llm_crew/crew_npc_cargo.dm:27, code/modules/llm_crew/crew_npc_cleaning.dm:110, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:579, LLM_CREW_PLAN_NO_CHEATS.md:126
fix: Add the cart crate to orderable_crates, tell the head of a missing bucket as a need that does not stop work, then build pulling and filling a cart on the crate-hauling code
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.4 and its decisions table. The owner decided: "janitors may carry water in any of three ways: the mop alone, a hand bucket, or the janitorial cart", "Which water carrier comes first? A free cart, then a bucket, then the mop alone", "Should cargo be able to order the cart crate (800 credits)? Yes, added to what it can order", "Does a janitor stop cleaning to ask for a bucket? No. It asks at the next meeting, or when its head is in view", "How full is a cart filled? Full, or until the tank is empty."

Built (13:30 change log entry, item 7): honest wetting at the sink, the hand bucket fetched, filled and carried, and a mop bucket or cart with water in it used where it stands.

Not built:

1. **The cart is not pulled, and not filled.** A janitor uses a cart's water only if the cart happens to be in sight with water in it. On MetaStation the cart starts empty, so it is never used at all. The change log says why: "Pulling it needs what crates have: taking hold again when it catches, and parking it clear of doors."
2. **Cargo cannot order the cart crate.** `orderable_crates` lists three packs and `/datum/supply_pack/service/janitor/janicart` is not one.
3. **Being short of a bucket is told to nobody.** `wantsBucket` only sends the janitor for a bucket it already knows of. With none known, it walks back to a sink every two messes for the rest of the shift and its head never hears. The plan wants it told as a need "like something to clean with", that does not stop the cleaning and waits for the meeting unless the head is in view.
4. **The server does not send what water it has.** The plan: "the server sends each janitor what water it has: in the mop, in the bucket, in the cart." Today it sends `water_from` (a name), `bucket_to_fill` and `wants_bucket`, no amounts, so the brain cannot plan a refill before the mop runs dry in a locked room.
5. **A dry sink.** The server says "it has run dry", but nothing has the janitor wait a little or go to another sink or tank it knows. It is a failed step and the driver's 20-second back-off.
6. **Section 4.1's leftover:** "where a way round the tile costs only a few steps, the route takes it." The plan's own Status line: "Not built: the route taking a way round." Bodies walk across.

One case for 3: `round-00.56.30`, 1:02:06, in the plan: the janitor's mop ran dry after two messes in the Cargo Bay and it asked to be let out with the mess still there. With three janitors and one hand bucket in the Custodial Closet, two of them are in that state all round, and the Head of Personnel, who could order three buckets for 400 credits, is never told.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:27`:

    /datum/ai_controller/crew_npc/proc/orderable_crates()
        ...
        for(var/pack_type in list(/datum/supply_pack/service/janitor, /datum/supply_pack/service/lightbulbs, /datum/supply_pack/misc/paper))

`code/modules/llm_crew/crew_npc_cleaning.dm:116`, `water_to_hand`, only a tub in sight that already holds water:

    for(var/obj/structure/mop_bucket/tub in in_sight)
        if(tub.reagents?.total_volume >= 1 && get_dist(pawn, tub) < nearest_distance)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:582`:

    if (brain.wantsBucket && task.place !== brain.location) {
      const bucket = allKnownItems(brain).find((item) => /^bucket$/i.test(item));
      if (bucket) {
        ...
        act: { tool: 'pick_up', item: bucket },

with no `else`: a janitor that knows of no bucket goes on as it is.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:60` has the one need a janitor reports, `const NEED = 'something to clean with';`.

## How it was found

Read from the code against the plan and the change log's 13:30 "Not built" list. Whether `/obj/structure/mop_bucket/janitorialcart` can be pulled through an airlock by a body, and whether pouring a bucket into it is a plain click, were not checked in the game: the plan's table says a cart is filled by pouring from a bucket and "not at a sink".

## How to fix it

In this order, smallest first. Each stands alone.

1. **Cart crate orderable** (small). Add `/datum/supply_pack/service/janitor/janicart` to the list in `orderable_crates`. Add its contents to `CRATE_HOLDS` in `jobs/cargo.ts` (used at line 1888) and to the Quartermaster's readers in `jobs/supply.ts`, which match crate kinds by name: check `tools/llm_crew/book.ts` still passes, since "Janitorial Supplies Crate" and "Janitorial Cart and Galoshes Crate" both start "Janitorial" and a loose match would confuse them. At 800 credits it falls under the Quartermaster's big-purchase rule early in a round, which the plan accepted.
2. **The bucket as a need** (medium, window only). In `jobs/janitor.ts`, a second need beside `NEED`: when `brain.wantsBucket`, no bucket is in `allKnownItems`, and it has been so for two minutes, report "a bucket to carry water in" through the same hook the meeting report uses for needs (`lacks` in `jobs/job.ts`, added for the officer's baton, is the general hook: use it). It must not create the "get something to clean with" task or stop cleaning. `jobs/head.ts` already turns a janitor's stated need into an order of Janitorial Supplies: find where it maps a need's words to a crate (search `jobs/head.ts` and `jobs/reports.ts` for "something to clean with"), make sure the new words map to the same crate, and that one order covers three janitors, as the plan says.
3. **Amounts** (small). `crew_brain_link.dm:117`: send `water` = `list("mop" = units, "bucket" = units or null, "cart" = units or null)` from the mop's and bucket's `reagents.total_volume`, and a cart in sight. Use it in `janitor.ts` to refill before leaving a room with water in it.
4. **Dry sink** (small). On the server reason "it has run dry" (`wet_mop`, `fill_bucket`), the brain notes the sink dry for a minute and plans the next nearest water it knows (a tank, another sink). `jobs/janitor.ts`, where `mopNeedsWater` is handled.
5. **The cart** (large, server and window). Model it on hauling a crate, which already has pulling, losing the grip, taking hold again and parking clear of doors (`crew_npc_grip.dm`, `crew_npc_freight.dm`). New server pieces: a claim on the cart ("a cart someone is pulling is taken"), `fill_cart` (fill the bucket at the tank, click the cart with it, repeat until the cart is full or the tank is empty), and pulling it on the walk to a mess room and parking it inside. `water_to_hand` then finds the cart it is pulling first. Window: a cart step in `plan` in `jobs/janitor.ts` (the water block that starts "Water comes before anything", about line 554) ahead of the bucket, per the decided order.
6. **Way round a slippery tile** (medium, server). In the walk's path request, give known slippery tiles (`slippery_seen`, and wet floor once GAP-04 is in) a cost, so a detour of a few steps wins and a long one does not. `code/datums/ai/movement/ai_movement_navmap_astar.dm` is what the brief says the walk uses: check whether it takes a per-tile cost before promising this.

Question for the owner: with the light replacer plan (`LLM_CREW_PLAN_LIGHTS.md`) decided as "the box in one hand; it wets its mop at a sink, or pulls the cart", the cart is what lets the light replacer carry water at all. Is the cart wanted before the lights, or after?

## How to test the fix

- `tools/llm_crew/book.ts` and `reports.ts` for the new crate kind and the new need.
- Simulator, from the plan's list: "a janitor with a bucket, with a cart, with neither and none to find" and "the sink runs dry with three janitors". The fake station needs a cart and water amounts.
- Server compile. In a round: `grep -n "filled its bucket\|cart" game.log`, and the Head of Personnel's meeting report should carry "a bucket to carry water in" once.
