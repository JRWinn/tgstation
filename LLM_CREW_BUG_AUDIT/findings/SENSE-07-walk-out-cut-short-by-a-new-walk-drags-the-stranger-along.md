---
id: SENSE-07
title: A walk out by the arm that is cut short by a new order drags the stranger along on the new walk, and a crew stranger stays held for forty seconds though nobody holds it
kind: bug
severity: medium
effort: small
confidence: sure
status: duplicate
duplicate_of: SUP-06
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_tools.dm:411, code/modules/llm_crew/crew_npc_guarding.dm:183, code/modules/llm_crew/crew_npc_guarding.dm:213, code/modules/llm_crew/crew_npc_tools.dm:20, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:726
fix: Have start_walk and start_errand call put_out when they replace a throw_out walk, and make in_hand end as soon as the body is no longer pulled by the one who took hold of it
---

## What is wrong

See also: SUP-06, which finds the same hole for crates: a haul replaced by a new walk never ends, because `walk_finished` returns at once for a walk that is no longer the one on the blackboard. This finding is the walk out of a room by the arm (`throw_out`), which goes through the same hole and has its own harm, because what is being pulled is a person and, often, another crew body.

`take_hold_of` starts a walk with `CREW_TOOL_EVICT`. Only `walk_finished` → `put_out` lets go of the person, clears `evicting`, and calls `let_go_of` on the person's controller. If the window sends any tool that starts a walk or errand before the walk out ends, `start_walk` replaces the target, the old walk's end is ignored ("A newer walk has replaced this one; it will report for itself."), and so:

1. **The body is still pulling the stranger.** Nothing calls `stop_pulling`. The stranger is dragged along to wherever the new walk goes: to the Captain on the bridge, to the meeting room.
2. **A crew stranger is still "in hand".** `taken_hold_of` set `in_hand_until = world.time + CREW_NPC_EVICT_HOLD` (40 s) and `stand_still(40 s)`. Nobody calls `let_go_of`, so for the rest of the 40 s every tool but `say` and `hold` is refused with "[name] has you by the arm and is walking you out." and the window shows `in_hand` and does nothing (`driver.ts`: "Someone has it by the arm. It goes where it is taken."). That is true while it is being dragged; it is still said after the pull has broken, because nothing looks at `pulledby`.
3. **The keeper's brain is told nothing** about the walk out, and `evicting` is left set.

The same "held though nobody holds it" happens when the keeper dies or is knocked out mid-walk: its controller stops, `put_out` never runs, and the stranger stands still for the rest of the 40 s.

The window does cut a walk short: `driver.ts:726` drops what the body is doing for an order from someone it answers to (`orderToDrop`), for being told to leave (`dropToLeave`), and for being asked to step aside (`dropToMove`, asked by anyone).

One concrete case. A cargo technician is walking a janitor out of the Cargo Bay by the arm. Someone in the bay says "excuse me, could you step aside" to the technician. `dropToMove` is true, the window sends `step_aside`, `tool_step_aside` starts a walk of a tile or two. The `throw_out` walk is replaced and never reports. The technician steps aside with the janitor still in tow, and goes on to whatever its next step is with the janitor still pulled behind it, inside the bay. The janitor's window is told for up to 40 s that it is being walked out, and it stands still. When the 40 s run out the janitor is free to act but still being pulled; the technician's brain thinks the matter is open, asks again, and sends `throw_out` again.

## Where

`code/modules/llm_crew/crew_npc_tools.dm:411`, in `walk_finished`:

    	// A newer walk has replaced this one; it will report for itself.
    	if(blackboard[BB_CREW_NPC_WALK_TARGET] != target)
    		return

`code/modules/llm_crew/crew_npc_tools.dm:397`, `start_walk`, which ends a search or an errand but not a walk out:

    	cancel_search()
    	cancel_errand()
    	set_blackboard_key(BB_CREW_NPC_WALK_TARGET, target)

`code/modules/llm_crew/crew_npc_guarding.dm:213`, in `taken_hold_of`, a hold that runs on the clock:

    	in_hand_until = world.time + CREW_NPC_EVICT_HOLD
    	in_hand_of = by.name
    	stand_still(CREW_NPC_EVICT_HOLD, by)

`code/modules/llm_crew/crew_npc_tools.dm:20`, the refusal that trusts that clock:

    	if(world.time < in_hand_until && tool != CREW_TOOL_SAY && tool != CREW_TOOL_HOLD)
    		action_result(tool, FALSE, custody_words() || "[in_hand_of] has you by the arm and is walking you out.")

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `start_walk` and `start_errand`, before setting the new target: if `walk_tool == CREW_TOOL_EVICT` and the walk target key is set (a walk out is under way), call `put_out(FALSE, "you were called away")`. That lets go, clears `evicting`, tells the stranger's controller (`let_go_of`), and gives the brain a result. Do it in one helper shared with SUP-06's fix for crates (`end_haul_in_hand()`), so both are mended in one place.
2. In `taken_hold_of`, keep a weak reference to `by` (`in_hand_by`). In `look_around` (once a second), if `world.time < in_hand_until` and the body's `pulledby` is not `in_hand_by`, call `let_go_of(by, place, FALSE)` and clear it: the hold is over when the hand is gone, not when the clock says so. Leave security's custody (`custody_phase`) to its own code.
3. Keep the 40 s as the upper bound.

## How to test the fix

- Sim: a scenario with a technician walking a janitor out, and a step-aside request in the middle. After the fix the technician's window gets a `throw_out` result ("you were called away"), and the janitor's window gets "lets go of you" at once.
- Compile. In a round, grep `game.log` for `took hold of` and check each is followed by `walked ... out of` or a fail for the same pair.
