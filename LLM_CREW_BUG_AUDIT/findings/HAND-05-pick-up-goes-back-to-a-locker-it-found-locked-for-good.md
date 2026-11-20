---
id: HAND-05
title: A locker found locked or welded on a fetch is still remembered as holding the thing, so every later pick up walks back to it and fails, and the janitor never asks for supplies
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:56, code/modules/llm_crew/crew_npc_hands.dm:276, code/modules/llm_crew/crew_npc_storage.dm:150, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:231
fix: In tool_pick_up skip a container whose last look found it shut to the body, and in the window leave a locked container's items out of allKnownItems
---

## What is wrong

When `take_from_container` cannot open the locker it went to, it reports the locker as locked and fails the pick up. Neither side forgets what the locker was last seen to hold:

- On the server, `report_storage` only rewrites `storage_memory` when the state is not `"locked"`. The entry from the earlier look, with its list of items, stays.
- In the window, `recordStorage` sets `memory.locked = true` and returns before it touches the items, so they are all still marked present, and `allKnownItems` (which ignores `locked`) still offers them.

So the next `pick_up` of that thing chooses the same locker again: `tool_pick_up` takes the nearest container whose memory names the thing, and does not look at `storage_checked_at` or at whether the last try found it shut. The window's plan still says "you know where there is a mop" (`knownSupply` is built on `allKnownItems`). The driver's backoff spaces the tries out, but nothing ever changes: the body walks to the locker, is told "The janitorial closet is locked.", and some time later does it again.

For a janitor with nothing to clean with this is the end of its work. Its `SUPPLIES` step takes `knownSupply` first, before telling its head it needs supplies, so it never asks, and no crate is ordered.

One concrete case. A janitor saw a mop and soap in a locker in a maintenance storeroom on its first explore. Its own mop has since gone (dropped in a fight, taken by someone). Meanwhile a player has welded that locker shut, or locked it (any secure locker can be locked by anyone, `togglelock` only checks access to unlock).

1. The janitor's plan: `SUPPLIES` task, `knownSupply` finds "mop". Step: `pick_up mop`.
2. `tool_pick_up("mop")`: nothing in sight; the storeroom locker is the nearest container whose memory holds "mop". Errand to it.
3. `take_from_container`: `container.open(body)` fails (`can_open`: `if(welded || locked) return FALSE`). `report_storage(container, "locked", null)`. Pick up fails: "The locker is locked."
4. The server's memory of the locker still lists the mop and soap; the window's too.
5. After the backoff, step 1 again. And again, for the rest of the round. The janitor's head is never told it needs supplies.

A second locker somewhere else that holds a mop is never gone to either, if the shut one is nearer.

## Where

`code/modules/llm_crew/crew_npc_hands.dm:56`, `tool_pick_up`:

    	for(var/container_ref in storage_memory)
    		var/list/memory = storage_memory[container_ref]
    		var/datum/weakref/container_weakref = memory["container"]
    		var/obj/structure/closet/container = container_weakref?.resolve()
    		if(QDELETED(container) || container.z != body.z)
    			continue

`code/modules/llm_crew/crew_npc_hands.dm:275`, `take_from_container`:

    	var/was_open = container.opened
    	if(!was_open && !container.open(body))
    		storage_checked_at[REF(container)] = world.time
    		report_storage(container, "locked", null)
    		return list(FALSE, "The [container_name] is locked.")

`code/modules/llm_crew/crew_npc_storage.dm:149`, `report_storage`:

    	// The body's own memory of the container, used when it is later asked to fetch something.
    	if(state != "locked")
    		...
    		storage_memory[REF(container)] = list("container" = WEAKREF(container), "items" = item_names)

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:231`, `recordStorage`:

    	memory.locked = state === 'locked';
    	if (state === 'locked') {
    	  return;
    	}

## How it was found

Read from the code, both sides. Not seen in a round. To look for it: in `crew_brain.log`, the same `pick_up` step answered "is locked" more than once.

## How to fix it

1. In `report_storage`, when the state is `"locked"`, keep the item list but add `"shut_at" = world.time` to the `storage_memory` entry (and clear it on any other state).
2. In `tool_pick_up`'s loop over `storage_memory`, skip an entry with `shut_at` less than `CREW_NPC_STORAGE_RECHECK` (5 minutes) ago. The next nearest container that holds one is then gone to, or the tool fails with "You cannot see one, and you do not remember where one is kept." which is what the window needs to hear to ask for supplies.
3. In `memory.ts`, `allKnownItems` should leave out the items of a container whose `locked` is set, so the plan does not offer them. Keep them in `describeStorage` (the prompt), where "locked; holds mop" is true and useful.
4. The 5 minute wait in step 2 lets the body try once more later, in case the locker was opened again. Note that with step 3 the window stops offering the thing, so that later try only comes when a search or an explore of the room looks at the locker again (`storage_to_search` rechecks after `CREW_NPC_STORAGE_RECHECK`) and a `looked` report clears `locked`. That is enough; do not add a timer in the window for it.
5. Build it with HAND-06 (search and fetch call any locker that will not open "locked", and never unlock one the body's card opens). With HAND-06, a locker the janitor's own card opens is unlocked and never reaches this path; without it, the janitor's own locked closet would be written off for five minutes at a time by this fix, which is still better than today.

Keeps the rules: it only changes what the body remembers and where it walks.

## How to test the fix

- Server compile to a side copy, type check for the window change.
- Simulator: a janitor with no mop whose only remembered mop is in a locker the stand-in server answers `locked` for. After one failed `pick_up` the next step must be telling its head it needs supplies, not `pick_up mop` again. `tools/llm_crew/sim.ts` would need a locked container answer (SIM-04 lists failure paths the stand-in cannot give).
- In a round: weld a locker a janitor remembers its mop in and take its mop. `crew_brain.log` must show one "is locked" and then a PDA to its head.

## Check

Checked by Opus 5.5. Read `tool_pick_up` and `take_from_container` (`crew_npc_hands.dm`), `report_storage`, `storage_done` and `storage_to_search` (`crew_npc_storage.dm`), the base game's `/obj/structure/closet/proc/can_open`, `open` and `togglelock` (`code/game/objects/structures/crates_lockers/closets.dm`: `if(welded || locked) return FALSE`; locking checks no access, only unlocking does), and in the window `recordStorage` and `allKnownItems` (`memory.ts`), `knownSupply`, the `SUPPLIES` step and `needs` (`jobs/janitor.ts`), and the driver's backoff (`fail`, `inBackoff` in `driver.ts`: it spaces the tries out, up to `RETRY_MAX_MS`, and never stops them). The quotes are what the code says. `storage_checked_at` set on the failure is read only by the search (`storage_to_search`), not by `tool_pick_up`'s loop. Searched the change log and plans for `storage_memory`, `recordStorage`, `knownSupply` and locked lockers: nothing fixes it.

Ran a throwaway script (scratchpad, bun, `fixtures.ts` `janitor()`): `recordStorage` with `looked` (mop, soap) and then `locked` leaves `allKnownItems` as `["mop", "soap"]` with `locked` true, so `knownSupply` stays set and `needs` stays null. The server side was not run (the simulator stands in for it).

Confirmed. Medium stands: it needs the janitor to lose its tool and its remembered locker to be shut, not every round, but then it never asks for supplies again. Effort raised to medium: a few lines in two server files and one window file (FORMAT would call any change on both sides large; this is not a design change, so medium).

## Fix so far

Server, steps 1 and 2 (group m-hands): `report_storage` (`crew_npc_storage.dm`), on `"locked"`, keeps the remembered items and adds `"shut_at" = world.time` to the `storage_memory` entry (a new entry with no items if it was never seen inside); a later `looked` or `open` writes a fresh entry without it. `tool_pick_up` (`crew_npc_hands.dm`) skips a container whose `shut_at` is under `CREW_NPC_STORAGE_RECHECK` (5 minutes) old, so the next nearest is gone to, or the tool fails with "You cannot see one, and you do not remember where one is kept." HAND-06 is not built, so a locker the body's own card opens is still found "locked" and now passed over for five minutes.

Left (held): step 3, `memory.ts` `allKnownItems`: leave out the items of a container whose `locked` is set (keep them in `describeStorage`). Without it the window's `knownSupply` still names the thing, the server answers at once "You cannot see one, ...", and the janitor still does not tell its head it needs supplies.
