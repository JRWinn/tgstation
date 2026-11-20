---
id: HAND-04
title: Pick up goes for the nearest thing of that name in sight even when it cannot be got to, every time, and never for the closet it knows holds one
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: hands
files: code/modules/llm_crew/crew_npc_hands.dm:40, code/modules/llm_crew/crew_npc_hands.dm:405, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:898, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:293, code/modules/llm_crew/crew_npc_senses.dm:161
fix: Keep a short list of things pick up could not get to, with the time, skip them in tool_pick_up for a few minutes, and fall through to the remembered container; and leave them out of things_in_view so the window stops offering them
---

## What is wrong

`tool_pick_up` looks first for a thing of that name lying in sight, and only if there is none does it go to a container it remembers holding one. "In sight" is `oview(CREW_NPC_VISION_RANGE, body)`, which takes in everything seen through glass: a room on the far side of a window, a counter behind a windoor, the floor of a room locked to the body. Nothing asks whether the body can get there.

When it cannot, the errand's walk fails and `crew_npc_fail_errand` closes it with "You could not get to it." That proc remembers unreachable messes, fire alarms and things to tidy, but not a thing to pick up. So the next `pick_up` of the same name picks the same thing again, for as long as it stays in sight, and the closet the body knows holds one is never gone to.

What the window does with the failure makes it worse in the commonest case:

- A janitor that wants soap or a rag to scrub with (`task.wantsScrub`) gives up scrubbing at the first failed `pick_up` (`janitor.ts` `afterActing`: "The soap or rag it meant to scrub with was not to be had after all: someone has taken it."). It then goes to the mess with its mop and reports it cannot shift it, while its own closet holds soap.
- A janitor with nothing to clean with (`SUPPLIES` task, `knownSupply`) asks for the same `pick_up` again after each backoff, and fails the same way, for as long as it stands where it can see the thing.

One concrete case. A janitor stands in a hallway after cleaning. Through the hallway window it can see a bar of soap on the floor of a room whose doors are locked to it (a department's washroom, a locked office). It has a cobweb to scrub, and it remembers soap in the janitorial locker of its Custodial Closet.

1. The plan (`scrubberToHand`) gives `pick_up soap`.
2. `tool_pick_up("soap")`: nothing stowed; the loop over `oview` finds the soap behind the glass, 4 tiles off. `start_errand(soap, CREW_TOOL_PICK_UP, "soap")`. The locker is never looked at.
3. The walk finds no way in. `crew_npc_fail_errand` runs: the soap is not a mess, an alarm or a tidy target, so nothing is noted. `finish_errand` sends `pick_up` failed, "You could not get to it."
4. The window sets `task.wantsScrub = false`. The janitor goes to the cobweb with its mop, fails, and its head is told "The rest would not come off with my mop".

## Where

`code/modules/llm_crew/crew_npc_hands.dm:37`, `tool_pick_up`:

    	// Something lying in plain view comes first.
    	var/obj/item/nearest_item
    	var/nearest_distance = INFINITY
    	for(var/obj/item/candidate in oview(CREW_NPC_VISION_RANGE, body))
    		if(!isturf(candidate.loc) || candidate.anchored || (candidate.item_flags & ABSTRACT))
    			continue
    		if(!name_matches(candidate.name, wanted) || is_spent(candidate))
    			continue

`code/modules/llm_crew/crew_npc_hands.dm:407`, `crew_npc_fail_errand/perform`, which notes some targets it could not get to but not a thing to pick up:

    	if(crew_controller.errand_tool == CREW_TOOL_RESET_ALARM && !QDELETED(target))
    		crew_controller.fire_alarms_failed[REF(target)] = world.time
    	if(crew_controller.errand_tool == CREW_TOOL_TIDY && !QDELETED(target))
    		crew_controller.tidy_skipped[REF(target)] = world.time

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:898`, `afterActing`:

    	if (
    	  task?.kind === CLEAN &&
    	  task.wantsScrub &&
    	  act.tool === 'pick_up' &&
    	  !ok &&
    	  /soap|\brag$/i.test(String(act.item ?? ''))
    	) {
    	  task.wantsScrub = false;

## How it was found

Read from the code, both sides. Not seen in a round. To look for it: in `game.log` a "walk failed" line for an errand whose target is an item, followed in `crew_brain.log` by the same `pick_up` again, or by the scrub being given up.

## How to fix it

1. Add `var/list/pickup_unreached = list()` to the controller (`crew_npc_controller.dm`): `REF(item)` to `list(WEAKREF(item), world.time)`.
2. In `crew_npc_fail_errand/perform`, when `errand_tool == CREW_TOOL_PICK_UP`, write the target there, whether it is an item or a remembered container: a locker in a room the body cannot get into is gone for in the same way, every time, by the `storage_memory` loop. Do the same in `do_errand` when it returns "You could not get to it." for a pick up (the case of HAND-08, where the walk never ran).
3. In `tool_pick_up`'s loop over `oview`, and in its loop over `storage_memory`, skip a thing or container that is in `pickup_unreached` with the same object behind the weak reference and less than `CREW_NPC_TIDY_GIVE_UP` (5 minutes) ago. Drop older entries there.
4. Better still, also skip in that loop any item whose area the body is locked out of (`locked_out_of(get_area(candidate))`, the test `pick_somewhere_new` already uses). That saves the failed walk altogether. Keep step 3 for the counter and windoor cases, which `locked_out_of` does not see.
5. With the thing in sight skipped, the loop over `storage_memory` runs and the remembered locker is gone to, as meant.
6. `ways_reopened()` should empty `pickup_unreached`, as for the other lists of things not reached.
7. In the window, the "someone has taken it" test in `janitor.ts` could be kept as it is: with this fix a failed `pick_up` of soap means the soap really is not to be had anywhere the body knows.
8. The window needs to hear of it too, or the case with no locker known is not mended. `things_in_view` is built from the same `oview` (`crew_npc_senses.dm`, `notable_things(in_sight)`), and `allKnownItems` (`memory.ts`) offers every item in it, so `knownSupply` and `scrubberToHand` keep naming the thing behind the glass. With steps 1 to 5 the server then fails at once ("You cannot see one, and you do not remember where one is kept.") instead of after a walk, but the janitor's `SUPPLIES` step still asks for the same `pick_up` after every backoff, and `needs` stays null because `knownSupply` is set, so it never tells its head. Either leave out of `things_in_view` (or mark `unreached`) any item in `pickup_unreached` or in an area `locked_out_of`, or keep in the window a short list of item names whose `pick_up` failed lately and have `allKnownItems` skip those. The first keeps one truth on the server side and is the smaller change.

Keeps the rules: it only changes which thing the body walks to.

## How to test the fix

- Server compile to a side copy.
- The simulator plays the server, so this is server-only; a sim case cannot show it.
- In a round: put a bar of soap behind a window in a room locked to janitors, with the janitor's closet soap known, and leave a cobweb in the hallway outside. `game.log` must show the janitor walking to its closet for soap, not a "walk failed" for the soap behind the glass.
- In a round, for step 8: take the janitor's mop, make sure it knows of no locker with one, and put a mop behind a window in a room locked to it. `crew_brain.log` must show at most one failed `pick_up mop`, then a PDA to its head saying it needs supplies.
- For step 8 done in the window: a sim case with a janitor lacking a tool, a mop in `thingsInView`, and one failed `pick_up mop` result; the next plan step must not be `pick_up mop`.

## Check

Checked by Opus 5.5. Read `tool_pick_up`, `start_errand`, `do_errand`, `take_item` and `crew_npc_fail_errand` (`crew_npc_hands.dm`), the errand branch of `crew_npc.bt.json` (walk with `crew_npc_reach`, a 3 minute limit, and on failure `crew_npc_fail_errand`), `crew_npc_reach` (`crew_npc_storage.dm`), and the window's `afterActing`, `scrubberToHand`, `knownSupply` and `needs` (`jobs/janitor.ts`) with `allKnownItems` (`memory.ts`). The quotes are what the code says. The `oview` loop has no test of reach, access or a past failure; `fail_errand` notes messes, alarms, tidy targets and held crates, not a pick up; the `blocked_places` list is written only for `go_to` walks (`crew_npc_tools.dm`), not errands, so nothing else stops the same choice next time. `locked_out_of`, `ways_reopened` and `CREW_NPC_TIDY_GIVE_UP` exist as the fix says. Searched the change log and plans for `tool_pick_up` and things seen through glass: nothing fixes it.

Not run: server-only, the simulator stands in for the server. Confirmed from the code.

Added step 8: the window sees the same thing (`things_in_view` is the same `oview`), so with only the server fix a janitor that knows of no locker keeps asking for the same `pick_up` and never tells its head. Medium stands (the thing must lie in sight behind glass or a locked door, which is not every round). Effort raised to medium: the controller, the hands, `ways_reopened` and the senses, a few lines each.

## Fix so far

Server, `crew_npc_hands.dm` (group m-hands). Done, steps 1 to 5:

- `pickup_unreached` (REF to weak reference and time), `note_pickup_unreached`, `pickup_given_up` (5 minutes, `CREW_NPC_TIDY_GIVE_UP`; an entry whose ref names another object is dropped). Noted by `crew_npc_fail_errand` and by `do_errand`'s "You could not get to it." for a `pick_up`, whether the target was the thing or a remembered container. Logged: "could not get to the X at ... to pick up Y: passed over for a while."
- `tool_pick_up` skips, in its loop over things in sight, one in `pickup_unreached` and one in a room other than the body's own that is locked to it (`place_locked_to_body`, cached a minute), and in its loop over `storage_memory` a container in `pickup_unreached`. So the remembered locker is gone to, or the tool fails at once with "You cannot see one, and you do not remember where one is kept."
- `forget_unreached()` (added for HAND-02) empties `pickup_unreached` too.

Left (held):

- `crew_npc_cleaning.dm`: `ways_reopened()` should call `forget_unreached()` (the same line HAND-02 needs).
- Step 8, `crew_npc_senses.dm`: in `notable_things(in_sight)` / `things_in_view`, leave out (or mark `"unreached" = TRUE`) any item for which `pickup_given_up(item)` is TRUE, or that lies in a room other than the body's whose `place_locked_to_body(get_area_name(item, TRUE))` is TRUE. Then `allKnownItems` (`memory.ts`) stops offering it, so `knownSupply` and `scrubberToHand` in `jobs/janitor.ts` stop naming it and the janitor tells its head it needs supplies. If done in the window instead: `memory.ts` `allKnownItems` skips names whose `pick_up` failed in the last 5 minutes.
