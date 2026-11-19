---
id: MULTI-04
title: A locker that a workmate has open at that moment is taken for empty, and what it holds is struck from memory for five minutes, so janitors who search one closet together forget its mop and bucket
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: c9e163d5e77
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_storage.dm:105, code/modules/llm_crew/crew_npc_hands.dm:284, code/modules/llm_crew/crew_npc_storage.dm:150, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:235
fix: Read what lies on the tile of a locker found open as its contents and report it as looked, in look_inside and take_from_container
---

## What is wrong

Opening a locker tips what it holds onto its tile, and shutting it takes the things on the tile back in. Both procs that look into a locker work out "what was inside" as whatever is on the tile now that was not there before they opened it. A locker that is already open when the body gets there has nothing new on its tile, so both report it empty:

- `look_inside` (a search) returns state `open` with no contents. `report_storage` writes that over the body's memory of the locker ("standing open with nothing left inside"), and the window's `recordStorage` marks every item it remembered there as gone.
- `take_from_container` (picking up something it remembers in there) skips every item on the tile because the locker was open (`was_open`), finds nothing, and says "There is no mop in the closet any more". It writes the same empty memory.

Neither notices that the locker is open only because a workmate opened it a second ago and is in its own 0.8 second look. The workmate then shuts it, the things go back inside, and the body believes it empty. `storage_checked_at` is set, so the locker is not looked in again for `CREW_NPC_STORAGE_RECHECK` (5 minutes).

This is the usual case at round start. The standing test crew spawns all three janitors on the same tile of the Custodial Closet (`crew_npc_spawn_turf` returns the first free tile, and `spawn_test_crew` puts every body of a job on it). Each has nothing to do but search the storage there, `storage_to_search` sorts the closet's lockers nearest first from the same tile, so all three go for the same locker in the same order, a second or two apart.

One concrete case:

1. Janitors Ann, Bo and Cy spawn on one tile. Each window's driver picks `search` within a few seconds of the others.
2. Ann reaches the janitorial locker first, opens it (mop, bucket, soap, a spray tip onto its tile) and sleeps 0.8 seconds.
3. Bo arrives in that time. `look_inside`: `container.opened` is TRUE, so `list("state" = "open", "contents" = list())`. Bo's memory of the locker: empty. Bo's window: everything there marked gone.
4. Ann shuts the locker. Everything is back inside.
5. Bo, with nothing to clean with, has a SUPPLIES task. `allKnownItems` knows of no mop. If its locator was used and the closet is in `supplyPlacesSearched`, it tells its head it needs supplies (as in DESK-09), and the Head of Personnel orders a crate while the mop is in the locker two tiles away.

The same happens to Cy if Cy arrives while Bo has it open, and to an officer and the Head of Security at one security locker, and to anyone who meets a locker a player has left standing open (where the things lying in front of it are its contents, plainly in view).

## Where

`code/modules/llm_crew/crew_npc_storage.dm:104`, `look_inside`:

    	// Already standing open: whatever it held is lying about in plain view.
    	if(container.opened)
    		return list("state" = "open", "contents" = list())

`code/modules/llm_crew/crew_npc_hands.dm:284`, `take_from_container`:

    	for(var/obj/item/thing in spill)
    		if(was_open || already_there[thing])
    			continue

`crew_npc_storage.dm:150`, `report_storage`, which replaces the memory with what it was handed:

    	if(state != "locked")
    		...
    		storage_memory[REF(container)] = list("container" = WEAKREF(container), "items" = item_names)

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:235`, `recordStorage`:

    // Whatever was here before and is not now has been taken out, but this is still where it goes.
    for (const item of memory.items.keys()) {
      memory.items.set(item, false);
    }

## How it was found

Read from the code. Not seen in a round log: the log does not record storage looks. Not checked: how often three janitors in a real round reach one locker inside the same second; the spawn on one tile and the nearest-first order make it likely at round start, hence `likely`.

## How to fix it

1. In `look_inside`, for a locker already open, take everything lying on `container.drop_location()` as what it holds (the same loop as for a shut one, without the `already_there` filter), and report it as `looked`. That is what a person sees: the things in front of an open locker are what is in it.
2. In `take_from_container`, when `was_open`, do the same: look for the wanted item among everything on the tile.
3. Belt and braces, optional: in `report_storage` and `recordStorage`, never mark remembered items gone on an `open` look; only add what was seen. Steps 1 and 2 alone fix the fault and stay on the server; step 3 is the window side.
4. Leave an open locker open when the body did not open it (`take_from_container` already does this through `was_open`; `look_inside` returns before it would close it).
5. Things lying on the tile that were there before the locker was opened will be counted as in it. That is what a person standing there would take them for, and the next shut look puts it right.

## How to test the fix

- Compile to a side copy. In a round with the standing crew, grep the Crew Brain log at round start for "standing open with nothing left inside" against a janitorial locker; with the fix it should not appear while the locker has things in it.
- Simulator: the sim does not run the server, but a scenario can send one janitor a `storage_seen` with state `open` and empty contents after a `looked` one with a mop, and check that the window still knows of the mop (step 3).
- In a round, the change shows in what the Crew Brain window lists for the Custodial Closet's lockers for each of the three janitors after the first minute: all three should list the same things.

## Check

Checked by Opus 5.5. The four quotes are what the code says today (`crew_npc_storage.dm:104-106`, `crew_npc_hands.dm:284-286`, `crew_npc_storage.dm:150-154`, `memory.ts:235-237`). Traced the case: `spawn_test_crew` (`crew_npc_spawn.dm:107`, `:115-119`) puts all three janitors on the one tile `crew_npc_spawn_turf` returns; `storage_to_search` (`crew_npc_storage.dm:10`) sorts nearest first from where each stands and skips only lockers this body checked (`storage_checked_at` is per body), so nothing keeps two bodies off one locker. `look_inside` sleeps `CREW_NPC_LOOK_TIME` with the locker open, which is the window in which a second body gets "open" with no contents. `report_storage` then overwrites `storage_memory`, `storage_done` sets `storage_checked_at` (5 minutes), and `recordStorage` marks every remembered item false. Tried to save it through sight: `allKnownItems` (`memory.ts:293`) reads only `thingsInView` and storage memory, not the room's `things`, so once the first body shuts the locker the mop is known to nobody but it. Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions an open locker read as empty. Not checked: how often the two looks land inside the same 0.8 seconds in a real round, so confidence stays likely. Severity medium, effort small (steps 1 and 2 are about 10 lines of DM in two procs). Added step 5 and marked step 3 optional.
