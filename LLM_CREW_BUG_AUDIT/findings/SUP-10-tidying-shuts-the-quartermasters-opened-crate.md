---
id: SUP-10
title: The crate the Quartermaster opens for itself is shut again by a tidying technician, with the paper bin back inside where the Quartermaster cannot find it
kind: bug
severity: low
effort: small
confidence: likely
status: found
area: quartermaster
files: code/modules/llm_crew/crew_npc_quartermaster.dm:375, code/modules/llm_crew/crew_npc_tidying.dm:68, code/modules/llm_crew/crew_npc_quartermaster.dm:193
fix: Have the Quartermaster take what it ordered the crate for out of it before it leaves, and let nearest_paper_bin count a bin in a crate the body may open
---

## What is wrong

When the Quartermaster can find no paper it orders a Bureaucracy Crate for itself and opens the crate in the bay (`tool_open_own_crate`). The comment says what is meant: "What was in it is left out where it can be got at."

The bay is a technician's work area, and tidying has a rule for exactly this sight: "What has spilled out of an open crate or locker goes back in, by shutting it." `wants_shutting` is TRUE for any open crate with an item on its tile, and `tidy_step` shuts it.

So:

1. The Quartermaster opens crate #9. Two paper bins, pens, a labeler and a filing cabinet land on the crate's tile. The held entry is removed.
2. Its next step is `get_paper`. It takes one sheet and a pen from the bin, which stays on the floor.
3. When the technicians have nothing else to do, one of them tidies. `next_to_tidy` finds the open crate. `tidy_step` calls `container.close(body)` and reports "You shut the bureaucracy crate in Cargo Bay, with what had spilled out of it back inside."
4. The crate is now a shut, full crate in the bay that nobody is holding for anybody. It is not empty, so it is never sent back. Nobody opens it again.
5. Some ten orders later the Quartermaster's sheet is full and it needs another. `nearest_paper_bin` only counts a bin lying on a tile (`isturf(bin.loc)`). The two bins it paid for are in the crate. If the station had no other bin it could reach the first time, it has none now: "You cannot think where there is any paper to be had." It orders another Bureaucracy Crate (640 credits, which is over the big-purchase line early in a round, so the Captain is asked).

On MetaStation this is rare, because the Quartermaster usually finds a bin it can walk to and never orders the crate. It is certain on any station or in any round where it does order one and a technician then has a quiet minute.

## Where

`code/modules/llm_crew/crew_npc_quartermaster.dm:375`, `open_own_crate`:

    	if(!crate.opened && !crate.open(body))
    		return list(FALSE, "Crate #[entry.number] will not open.")
    	GLOB.crew_npc_held_crates -= entry
    	freight_changed()
    	return list(TRUE, "You open crate #[entry.number] in [get_area_name(crate, TRUE)]. What was in it is out where you can get at it.", list("number" = entry.number))

`code/modules/llm_crew/crew_npc_tidying.dm:68`:

    /datum/ai_controller/crew_npc/proc/wants_shutting(obj/structure/closet/container)
    	if(!container.opened || !isturf(container.loc))
    		return FALSE
    	var/skipped_at = tidy_skipped[REF(container)]
    	if(skipped_at && world.time - skipped_at < CREW_NPC_TIDY_GIVE_UP)
    		return FALSE
    	return !isnull(locate(/obj/item) in container.loc)

and in `tidy_step`:

    		if(container.opened && !container.close(body))
    ...
    		return list(TRUE, "You shut the [container_name] in [place], with what had spilled out of it back inside.")

`code/modules/llm_crew/crew_npc_quartermaster.dm:193`, in `nearest_paper_bin`:

    		if(!isturf(bin.loc) || bin.z != body.z)
    			continue

A side note on the last line of `open_own_crate`: the third element of the list (`"number"`) never reaches the brain. `finish_errand` in `crew_npc_hands.dm` passes on the details only for security's tools (`CREW_NPC_SECURITY_TOOL(tool) ? security_details(tool, outcome) : null`). The window does not use it today, so nothing breaks.

## How it was found

Read from the code: the two files side by side. Not seen in a round. No round so far had the Quartermaster order its own crate that I know of.

## How to fix it

Either of these ends it. I would do both, they are small.

1. **The Quartermaster carries off what it came for.** After `open_own_crate` succeeds, the window's next step for an UNPACK task is to pick up the paper bin (`pick_up` with `item: "paper bin"`), and it keeps it: put down on its desk in its office, or in its bag (a bin is normal-sized, a backpack takes it). That is what a player would do with a crate they ordered for their own office. `jobs/quartermaster.ts`, where `order.unpacked` is set, is the place: add one more step before the task is finished. No new server tool is needed.
2. **A bin in a crate the body may open is still a bin.** In `nearest_paper_bin`, allow `bin.loc` to be a crate (`istype(bin.loc, /obj/structure/closet/crate)`) that stands on a tile in a room the body is not locked out of, but only one the body has reason to know of: a crate it opened itself. Keep a weak reference to that crate on the controller in `open_own_crate` (`own_crate_ref`). `take_paper` then has to open it first (`crate.open(body)`), which the tidy rule will later undo again, harmlessly.
3. Do not change the tidy rule to leave the Quartermaster's crate alone by name or by owner: "an example is not the scope". If the owner wants a general rule instead of 1 and 2, the one I would put to them is: **a crate that someone opened on purpose is left open for a while** (say five minutes, noted on the crate as `crew_npc_opened_at` by whoever opens one through crew code), and tidied after that.

What must keep working: a crate the Captain leaves open with things round it is still shut by a tidying technician.

## How to test the fix

- Type check and the `qm` simulator scenario if step 1 is taken. A scenario where the simulated station has no paper bin already exists if the simulator covers `orderForItself`: check the list at the top of `sim.ts`, and add the pick-up to what it expects.
- Server compile to a side copy if step 2 is taken.
- In a round: remove the paper bins the Quartermaster can reach (or play a map without one), let it order and open its crate, then wait for a technician to tidy. After that, fill its sheet and see that it gets a second sheet without ordering a second crate.
