---
id: SIM-08
title: In the simulator a mop never dries, spray never runs out, a dry mop is wetted with no water in sight, and the bucket fields are never sent
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:628, tools/llm_crew/sim.ts:494, tools/llm_crew/sim.ts:1100, code/modules/llm_crew/crew_npc_cleaning.dm:427, code/modules/llm_crew/crew_brain_link.dm:108
fix: Give the stand-in's mop and spray a store of water and cleaner that each clean uses up, fail a clean with a dry mop and no water in sight in the server's words, and send water_from, bucket_to_fill, wants_bucket and beyond_kinds
---

## What is wrong

Running out is what a janitor's tools do in every real round. The stand-in has none of it:

1. **A mop is wet for good.** `mopWet` is set true and never set false again. In the game a mop holds a little water and loses some on every mess it is used on (`can_clean_with`: `tool.reagents?.total_volume >= 0.1`), so it is dry again after a few messes.
2. **A dry mop is wetted anywhere.** The stand-in's `clean` case sets `mopWet = true` for a dry mop whether or not there is a sink, then cleans. The real `tool_clean` looks for water in sight (a bucket held, a mop bucket or cart, a sink) and, finding none, fails: "Your mop is dry, and there is no sink in sight to wet it at." (or, with a rag in the other hand, cleans only what the rag will shift).
3. **Spray never runs out.** `toolOf` returns `'space cleaner'` for as long as it is held. The real spray is a tool while `total_volume > 0`.
4. **The bucket and the "what is left" fields are never sent.** `uiData` has no `water_from`, `bucket_to_fill`, `wants_bucket`, `beyond_kinds` or `at_door_label`. The window reads them with defaults (`brain.ts:452-459`), so in every scenario `waterFrom` is null, `bucketToFill` and `wantsBucket` are false and `beyondKinds` is empty.

So these window branches cannot run in any scenario:

- `jobs/janitor.ts:557`, filling a bucket that is low;
- `jobs/janitor.ts:565` with water other than a sink, and its wording;
- `jobs/janitor.ts:582`, going for a bucket before setting off;
- `jobs/janitor.ts:187` `whatIsLeft`, and the "needs scrubbing" lines at `:372` and `:459` with kinds named;
- `doorCalled` (`jobs/janitor.ts:709`) for a room with more than one door.

And these faults, written up by other reviewers against the window code, are hidden by it:

- `DESK-03`: a janitor with a dry mop and a rag and no sink in sight never goes to a sink. In the simulator the `clean` it sends wets the mop and works.
- `DESK-10`: mop and soap in hand with a bucket known, it never sets off for a mess.
- `JAN-04`: water seen through a window is walked at again and again (no window, no water anywhere but the closet's sink).
- `JAN-14`: a dry sink still taken as water.

The change log's 13:30 and 15:00 entries built the water work ("wetting honest and a bucket carried") and the 13:32 round's `beyondKinds`. None of it has been through a scenario, and the simulator's "every mess a janitor can get to is cleaned" check passes in part because the janitors' tools never run out.

Concrete case: `sim.ts quiet solo`. The janitor picks up the mop beside the closet's sink (wet) and the space cleaner, and cleans its way round the hallways and the Bar for nine minutes without once being short of water or spray. In the game the mop is dry again after a few messes and the spray empties as it is used; what the janitor does then is the part of its job the simulator does not test.

## Where

`tools/llm_crew/sim.ts:628`, the stand-in's `clean`:

    if (!cleaningTool(body)) return result(body, 'clean', false, 'You have nothing to clean with.');
    if (body.holding.includes('mop') && !toolOf(body) && !body.mopWet) body.mopWet = true;

`tools/llm_crew/sim.ts:494`:

    const mopWorks = (body: Body) => body.holding.includes('mop') && (body.mopWet || rooms[body.room].sink);

`code/modules/llm_crew/crew_npc_cleaning.dm:427`, the real one:

    if(isnull(proper_tool()) && dry_mop())
        // A dry mop cleans nothing. Wet it first: from the bucket it carries, at a mop bucket or a
        // cart with water in it, or at the nearest sink in sight.
        var/atom/water = water_to_hand(around)
        ...
        action_result(CREW_TOOL_CLEAN, FALSE, "Your mop is dry, and there is no sink in sight to wet it at.")

`code/modules/llm_crew/crew_brain_link.dm:108`, the fields the stand-in leaves out:

    "beyond_kinds" = npc.beyond_kinds_here(),
    ...
    "water_from" = npc.water_from,
    "bucket_to_fill" = npc.bucket_to_fill,
    "wants_bucket" = !isnull(locate(/obj/item/mop) in body.held_items) && isnull(npc.held_bucket()),

## How it was found

Read from the code: the stand-in's `clean`, `pick_up`, `toolOf`, `mopWorks` and `uiData`, against `tool_clean`, `can_clean_with`, `dry_mop` and `ui_data` on the server. The list of `ui_data` keys the stand-in does not send was made by comparing the two key lists by script: `at_door_label beyond_kinds bucket_to_fill card_color inventory wants_bucket water_from` (the last two besides `card_color` and `inventory`, which only the window shows).

## How to fix it

1. Give each body `mopWater` (0 to 4 messes' worth: the real `CREW_NPC_MOP_DIPS` is 4) and `spray` (say 25 messes' worth). Wetting at a sink sets `mopWater` to 4; each mess cleaned with the mop takes one; each with the spray takes one. `toolOf` returns the spray only while `spray > 0`.
2. In `clean`, with a dry mop and no proper tool: if there is water in the room (a sink, or a bucket held with water in it), walk to it and wet the mop, answering as the real errand does; if not, answer `ok: 0` with the server's words, or clean what a rag in the other hand will shift.
3. Add a bucket: an item in the Custodial Closet that holds water for 5 wettings (`CREW_NPC_BUCKET_FILLS`), filled at a sink by `clean` when low. Send `water_from` ('sink' or 'bucket'), `bucket_to_fill` and `wants_bucket` as the server works them out.
4. Send `beyond_kinds`: the names of the messes in the room that nothing held will shift (the stand-in already knows this: `!canShift(body, m)`).
5. Send `at_door_label` for the room the body is at the door of (the stand-in's rooms have one door each, so the room's own name, which `doorCalled` drops; give the bay a second door to test the label).
6. Then a scenario, `dry`: one janitor, a mop and a rag, no spray, messes in three rooms, one sink. Checks: it goes back to the sink when the mop is dry and never sends `clean` with a dry mop away from water more than twice; every mess is cleaned. Expect it to fail on `DESK-03` today.

## How to test the fix

`sim.ts quiet solo`, `quiet crew` and `quiet nested` must still pass, more slowly. The new `dry` scenario must fail on today's window code in the way `DESK-03` says, and pass once that is fixed.
