---
id: HAND-10
title: A crate jammed in a doorway is moved when it shuts a walk, but never when it shuts an errand, so a held crate behind it is written off as one nobody can get to
kind: gap
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:405, code/modules/llm_crew/crew_npc_tools.dm:420, code/modules/llm_crew/crew_npc_grip.dm:427, code/modules/llm_crew/crew_npc_held.dm:65
fix: When an errand's walk finds no way, try clear_the_way as walk_finished does before giving the errand up, with the errand kept in after_clearing to be taken up again
---

## What is wrong

The grip code's promise (`crew_npc_grip.dm`, header): "a body whose own way is shut by a crate someone left in a doorway moves it, as anyone would." It is kept only for walks. `walk_finished` calls `clear_the_way` when a walk ends with no way through. An errand is walked to by a different leaf (`crew_npc_reach`), and when that walk finds no way, `crew_npc_fail_errand` runs instead, which never looks for a crate in the way. The errand is simply reported as "You could not get to it."

Errands are most of the work: fetching and hauling crates (`release`, `collect`, `take_back`, `unload`, `recycle`, `stow`), picking things up, going to a console or a machine, cleaning a mess, holding a door, resetting an alarm, tidying. For all of them a crate in a doorway on the way is the end of the errand.

The worst of it is with held crates. `crew_npc_fail_errand` counts each errand that could not get to a held crate (`entry.unreachable++` for `check_held`, `release` and `stow`), and `crew_npc_crate_lost` calls the crate lost, "nobody can get to it", after `CREW_NPC_LOST_AFTER` (2). Whoever ordered it is then told by PDA it is lost.

One concrete case. Crate #12 of janitorial supplies is held in the Warehouse. Another crate has been left in the Warehouse airlock (dropped there on a lost grip and not stowed yet). The janitor comes to the counter for #12.

1. The technician's brain sends `release 12`. `tool_release` starts an errand to crate #12.
2. `crew_npc_reach` finds no path into the Warehouse: the airlock tile is blocked by the crate. The leaf fails.
3. `crew_npc_fail_errand`: `entry.unreachable++` (1). "You could not get to it."
4. A second try a while later, the same. `entry.unreachable` is 2.
5. `crew_npc_crate_lost` now returns "nobody can get to it". The crate is struck from the held list and whoever ordered it is told it is lost.

Had the technician been sent on a plain `go_to Warehouse` it would have found the crate in the airlock with `crate_in_the_way`, pulled or pushed it clear, and gone on.

The same holds for a janitor outside the Custodial Closet with a crate in its doorway, told to `pick_up mop` from the locker inside: "You could not get to it.", and for HAND-02, the mess is written off for good.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:417`, `walk_finished`, where a walk gets the crate moved:

    	if(!succeeded)
    		log_walk_failed(target, tool, goal, why)
    		// A loose crate jammed in a doorway may be all that shuts the way. Anyone would move it and go on.
    		if(reason == CREW_NPC_NO_WAY && clear_the_way(target, tool, goal))
    			return

`code/modules/llm_crew/crew_npc_hands.dm:407`, `crew_npc_fail_errand/perform`, where an errand does not:

    	// A crate being held for collection that nobody can get to is, after a try or two, not one cargo can hand over.
    	if(istype(target, /obj/structure/closet/crate) && (crew_controller.errand_tool == CREW_TOOL_CHECK_HELD || crew_controller.errand_tool == CREW_TOOL_RELEASE || crew_controller.errand_tool == CREW_TOOL_STOW))
    		var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(target)
    		if(entry)
    			entry.unreachable++
    	crew_controller.finish_errand(list(FALSE, "You could not get to it."))

`code/modules/llm_crew/crew_npc_held.dm:65`, `crew_npc_crate_lost`:

    	if(entry.unreachable >= CREW_NPC_LOST_AFTER)
    		return "nobody can get to it"

## How it was found

Read from the code. Not seen in a round. The cargo `stow` routine moves crates left by doors in cargo's own rooms, which may clear the airlock first in many rounds; that is why the confidence is "likely" and not "sure". It does not help outside cargo's rooms, or when the release comes first.

## How to fix it

1. `crew_npc_fail_errand` does not know why the walk failed. Have `crew_npc_reach` keep the reason as `crew_npc_walk` does (`movement_failed` means no way; the time limit means too long), and pass it on (a var on the controller, `errand_fail_reason`, set by the leaf before it fails).
2. In `crew_npc_fail_errand/perform`, before anything is written down: if the reason is no way, and `clear_the_way` can be called for an errand, call it, and if it returns TRUE return without failing the errand.
3. `clear_the_way` and `go_back_to` need to know how to take an errand up again. Add a third shape to `after_clearing`: `list("errand" = WEAKREF(target), "tool" = errand_tool, "item" = errand_item)`. `go_back_to` then calls `start_errand(target, tool, item)` after the 0.2 second timer, as `walk_again` does for walks. Keep `clean_queue` in it for a cleaning run.
4. Keep `way_cleared_at` as the guard, so a crate that cannot be shifted is not gone at again and again; on that second go the errand fails as now.
5. Only when the errand finally fails does `entry.unreachable` go up.

Keeps the rules: the body moves the crate by pulling or pushing it, as now.

## How to test the fix

- Server compile to a side copy.
- In a round: leave a crate in the Warehouse airlock and ask a technician at the counter for a held crate in the Warehouse. `game.log` must show "found no way ... and is moving the ... clear" and then the release, not "could not get to it" twice and the crate written off.
