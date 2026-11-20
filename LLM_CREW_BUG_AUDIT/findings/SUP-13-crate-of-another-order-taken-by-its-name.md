---
id: SUP-13
title: When one of an order's crates did not come, order_arrived takes another order's crate of the same kind for it by its name, and that order's technician then cannot find its own
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 3e1e5e758b6
found_by: Opus 5.5
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:487, code/modules/llm_crew/crew_npc_cargo.dm:479, code/modules/shuttle/mobile_port/variants/supply.dm:295
fix: In the by-name pass of order_arrived skip any crate that still has a manifest or whose name ends in another order's number, and read the number from the name when the manifest is gone
---

## What is wrong

`order_arrived` finds the crates of an order in two passes. The first matches the number on each crate's manifest. The second is for a crate "whose manifest has come off": any crate aboard, not yet held, whose name starts with the pack's crate name is taken for one of the numbers still unmatched.

The second pass does not check that the manifest has in fact come off. A crate of a different order, with its own manifest still on it, matches by name just as well. So whenever one of this order's crates did not come, a crate of the same kind belonging to someone else's order is taken in its place.

An order's crate does not come when `buy()` skips it because the budget ran out part way through the cart (see SUP-11): that is a `continue`, so a later order can still be paid. The pending order is the last one placed, so it can be loaded while an earlier one of the same order was not. (A full shuttle floor is not a way in: `if(!empty_turfs.len) break` stops the loop, so every order after the first one left out is left out too, the pending one with them.)

As with SUP-11, a Quartermaster's book would hold Maria's order below for money (`moneyFree` counts given orders), so the case needs technicians taking orders with no Quartermaster, or an order in the cart the book does not know of.

The base game already writes the number on the crate: `buy()` does `crate.name += " - #[spawning_order.id]"`. So even with the manifest gone a player can read which order a crate is, and the code could too. It reads only the start of the name.

A concrete case, with two technicians and no Quartermaster:

1. The cargo budget has 600 credits. Sam places order #4, a Janitorial Supplies Crate (400) for the Head of Personnel. The budget then has 600 credits, as nothing is paid until loading.
2. Maria places order #5 and #6 for the Captain: a Janitorial Supplies Crate (400) and Replacement Lights (200). Each check in `tool_order` passes (SUP-11).
3. At the far dock `buy()` pays #4 (200 left), cannot pay #5 and skips it, pays #6 (0 left).
4. The shuttle docks. Maria's `supply_run_step` happens to run first. Her pending order, #6, is aboard. `order_arrived`: the first pass finds #6. #5 is unmatched. The second pass finds Sam's crate "janitorial supplies crate - #4", which has no held entry yet and whose name starts with "janitorial supplies crate". It is held as #5, for the Captain.
5. Sam's `order_arrived`: the first pass finds the #4 crate by its manifest, but `crew_npc_held_entry(crate)` is set, so it is skipped. Sam is told "The supply shuttle has docked, but you cannot see what you ordered (the Janitorial Supplies Crate) aboard." The Head of Personnel is never told.
6. The Captain is sent "crates #5 and #6". Whoever comes for #5 is given the crate whose manifest and name both say #4, labelled "#5 for Zim Fire".

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:487`, in `order_arrived`:

    	// A crate whose manifest has come off is known by what it is: its name starts with the name of
    	// the pack one of the numbers still unaccounted for was ordered as.
    	for(var/obj/structure/closet/crate/crate as anything in aboard)
    		if(!length(unmatched))
    			break
    		if(found[crate] || crew_npc_held_entry(crate))
    			continue
    		for(var/number in unmatched)
    			var/datum/supply_pack/pack = SSshuttle.supply_packs[known[ordered_kinds["[number]"] || ordered_crate_name]]
    			if(pack && findtext(crate.name, pack.crate_name) == 1)

`code/modules/shuttle/mobile_port/variants/supply.dm:295`, in `buy()`:

    		if(!(spawning_order.pack.order_flags & ORDER_GOODY)) //we handle goody crates below
    			var/obj/structure/closet/crate = spawning_order.generate(pick_n_take(empty_turfs))
    			crate.name += " - #[spawning_order.id]"

## How it was found

Read from the code, with `buy()` and `generateManifest()` read. Not seen in a round. It needs two orders of the same kind on one trip and one of them unpaid, so it is not common; it is listed because when it happens the wrong person's crate is held and one asker is never told.

## How to fix it

1. In the second pass of `order_arrived`, skip a crate for which `crew_npc_manifest_number(crate)` is not null: its manifest is on, and the first pass has already said whose it is.
2. When the manifest is off, read the number off the name first: a regex `- #(\d+)` on `crate.name`, first match, not anchored to the end (a label stuck on by `stick_to_atom` or a hand labeler adds " (...)" after it through `apply_label`, so `$` would miss a labelled crate). If it gives a number, the crate is that order's and is matched only if the number is in `unmatched`. Only a crate with neither manifest nor number in its name is matched by kind, as now.
3. Tell the brain when some of an order did not come: after both passes, if `unmatched` is not empty, add to the success text "[crew_npc_numbers_written(unmatched)] did not come with it." The asker is owed that word too; SUP-02 and CARGO-01 cover how word of an order that did not come should be sent, and this case should use the same notice.

## How to test the fix

A table case in `tools/llm_crew/` cannot reach `order_arrived`; this is server-only. Compile, then in a round with two technicians order two crates of one kind on one trip with too little money for both, and check `game.log` for which technician was told "cannot see what you ordered", and the held crate's label against its manifest.

## Check

Checked by Opus 5.5. Read `order_arrived` and `place_order` (`crew_npc_cargo.dm`), `crew_npc_manifest_number` (`crew_npc_held.dm:127`), and in the base game `buy()`, `supply_pack/generate` (`_packs.dm:82`, the crate is named `crate_name`) and `generateManifest`. The second pass loops over `aboard`, skips only crates already `found` or held, and matches by `findtext(crate.name, pack.crate_name) == 1`, which is TRUE for "janitorial supplies crate - #4" against an unmatched #5 of the same pack. Nothing checks that the crate's manifest is gone. The pack costs (Janitorial Supplies Crate is `CARGO_CRATE_VALUE * 2`, 400) give the case as written: #4 paid, #5 skipped by `continue`, #6 paid. Sam's run then sees its #4 already held and reports nothing aboard.

Corrected: a full shuttle floor cannot cause it (`break` leaves out the pending order as well), and the case needs no Quartermaster, since `moneyFree` in `jobs/quartermaster.ts` counts given orders and would hold Maria's order. The regex in fix step 2 was anchored with `$`, which misses a labelled crate; changed to the first match. Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers it. Severity left at medium: the wrong asker's crate is held, but only when same-kind orders share a trip and one is unpaid. Not run.
