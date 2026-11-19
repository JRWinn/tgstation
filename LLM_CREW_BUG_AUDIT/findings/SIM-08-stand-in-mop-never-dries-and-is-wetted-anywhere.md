---
id: SIM-08
title: In the simulator a mop never dries, spray never runs out, a dry mop is wetted with no water in sight, and the bucket fields are never sent
kind: bug
severity: low
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:628, tools/llm_crew/sim.ts:494, tools/llm_crew/sim.ts:1100, code/modules/llm_crew/crew_npc_cleaning.dm:427, code/modules/llm_crew/crew_brain_link.dm:108
fix: Give the stand-in's mop and spray a store of water and cleaner that each clean uses up (15 and about 50 messes when full), stop a dry mop being wetted from nothing when a rag is held, add a bucket, send water_from, bucket_to_fill, wants_bucket, beyond_kinds and at_door_label, and add a scenario that starts the janitor short
---

## What is wrong

Running out is what a janitor's tools do in every real round. The stand-in has none of it:

1. **A mop is wet for good.** `mopWet` is set true and never set false again. In the game a mop holds 15 units (`mop.dm:21`) and loses about 1 on every mess it cleans (`apply_reagents`, `mop.dm:72-75`), and it cleans only while `total_volume >= 0.1` (`can_clean_with`), so it is dry again after about 15 messes.
2. **A dry mop held with a rag is wetted from nothing.** With a dry mop alone away from a sink, the stand-in's `cleaningTool` is null and `clean` fails at line 627 ("You have nothing to clean with.", not the server's words, but `ok: 0` all the same). With a rag in the other hand, `cleaningTool` is the rag, line 627 passes, and line 628 sets `mopWet = true` with no water anywhere; the mop then cleans as a wet mop. The real `tool_clean` looks for water in sight (a bucket held, a mop bucket or cart, a sink) and, finding none, cleans only what the rag will shift, or with no rag fails: "Your mop is dry, and there is no sink in sight to wet it at."
3. **Spray never runs out.** `toolOf` returns `'space cleaner'` for as long as it is held. The real spray holds 100 units at 2 a spray (`spray.dm:184-190`) and is a tool while `total_volume > 0`: about 50 messes.
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

Concrete case: any scenario in which a janitor holds a dry mop and a rag (a mop from a supplies crate is dry: `pick_up` wets it only beside a sink, `sim.ts:623`). Away from the closet, `uiData` sends `mop_needs_water: 1` and no `water_from`, so `jobs/janitor.ts:565` says "there is a sink right here" (its default) and sends `clean`; the stand-in wets the mop from nothing and the mess goes. In the game the same `clean` cleans only with the rag and the mop stays dry (`DESK-03`).

(Checker's correction: the first version gave `quiet solo` as the case, the janitor "cleaning for nine minutes without being short". With the real amounts that would not run short in the game either: a scenario has about ten messes and the spray, which the janitor uses first, would spend about 20 of its 100 units. What the simulator cannot do is reach the short-of-water paths at all, nor a dry mop with a rag, which the game does reach.)

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

1. Give each body `mopWater` (messes left, 0 to 15: a mop holds 15 units and a clean takes about 1; `CREW_NPC_MOP_DIPS` = 4 is the number of clicks at a sink, 5 units each, not messes) and `spray` (messes left, 50 when full: 100 units at 2 a spray). Wetting at a sink sets `mopWater` to 15; each mess cleaned with the mop takes one; each with the spray takes one. `mopWet` becomes `mopWater > 0`. `toolOf` returns the spray only while `spray > 0`. A body or crate item can be given less than full, so a scenario can start a janitor short.
2. In `clean`, with a dry mop and no proper tool: if there is water in the room (a sink, or a bucket held with water in it), wet the mop there, answering as the real errand does; if not, never wet it (drop line 628's wetting when the room has no sink and no bucket is held), and clean only what a rag in the other hand will shift (`canShift` with `held = RAG`), or with no rag answer `ok: 0` with the server's words, "Your mop is dry, and there is no sink in sight to wet it at."
3. Add a bucket: an item in the Custodial Closet that holds water for 5 wettings (`CREW_NPC_BUCKET_FILLS`), filled at a sink by `clean` when low. Send `water_from` ('sink' or 'bucket'), `bucket_to_fill` and `wants_bucket` as the server works them out.
4. Send `beyond_kinds`: the names of the messes in the room that nothing held will shift (the stand-in already knows this: `!canShift(body, m)`).
5. Send `at_door_label` for the room the body is at the door of (the stand-in's rooms have one door each, so the room's own name, which `doorCalled` drops; give the bay a second door to test the label).
6. Then a scenario, `dry`: one janitor, a mop with 2 messes of water left and a rag, no spray, messes in three rooms (more than 15 between them, or the mop's store set low), one sink. Checks: it goes back to the sink when the mop is dry and never sends `clean` with a dry mop away from water more than twice; every mess is cleaned. Expect it to fail on `DESK-03` today. With full tools and today's ten or so messes nothing runs short, so the scenario must start the janitor short.

## How to test the fix

`sim.ts quiet solo`, `quiet crew` and `quiet nested` must still pass (with real amounts nothing should run short in them; if one fails, look for a mess counted twice before blaming the window). The new `dry` scenario must fail on today's window code in the way `DESK-03` says, and pass once that is fixed. Run all scenarios with janitors in them once, four at a time at most.

## Check

Read the stand-in: `sim.ts:493-499` (`toolOf`, `mopWorks`, `cleaningTool`, `canShift`), `:622-633` (`pick_up` wets a mop only beside a sink; `clean`), `:1093-1103` (`uiData`). `mopWet` is only ever set true (`:472`, `:623`, `:628`). `uiData` sends `cleaning_tool`, `mop_needs_water`, `sink_in_view` and `dry_mop`, but none of `water_from`, `bucket_to_fill`, `wants_bucket`, `beyond_kinds` or `at_door_label`, and the stand-in has no bucket at all. Read the server: `tool_clean` (`crew_npc_cleaning.dm:410-450`), `can_clean_with`, `dry_mop`, `working_tool`, `wet_mop`, and `crew_brain_link.dm:100-136`, `:190`. Read the base game: `mop.dm:21` (15 units), `apply_reagents` (`mop.dm:68-75`, about 1 unit a mess), `spray.dm:184-190` (100 units, 2 a spray). Read the window: `brain.ts:452-459` and `:499`, `jobs/janitor.ts:186-190`, `:458-459`, `:550-590`, `:709-711`. The fields' defaults leave the branches named unreachable, as stated.

The change log's 13:31 entry (line 656) already says the simulator "knows nothing of buckets, door names or crates in doorways", so the gap is known in outline; no entry fixes it or chooses it, and this finding adds how to model it. Confirmed, with three corrections: a dry mop is wetted from nothing only when a rag is held (alone it fails, in other words); a mop lasts about 15 messes, not "a few", and `CREW_NPC_MOP_DIPS` counts clicks, not messes; and the `solo` case would not run short in the game either, so the new scenario must start the janitor short. Severity lowered to low: a test tool that misleads, by FORMAT.md; the faults it hides (`DESK-03`, `DESK-10`, `JAN-04`, `JAN-14`) carry their own. Effort stays medium: all in `sim.ts`, under about 100 lines with the scenario.
