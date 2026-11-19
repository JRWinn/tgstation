---
id: JAN-03
title: A rag grows filthy with blood and then cleans nothing, but is still counted as a tool, so every mess after is written off and the rag is never rinsed at a sink
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: cleaning
files: code/modules/llm_crew/crew_npc_cleaning.dm:34, code/modules/llm_crew/crew_npc_cleaning.dm:526, code/modules/reagents/reagent_containers/rag.dm:118, code/modules/reagents/reagent_containers/rag.dm:127, code/game/objects/structures/water_structures/sink.dm:196
fix: Count a rag with blood_level 10 or more as a spent tool in can_clean_with, and add a step that rinses it at a sink in sight the way a player does, by a plain click with the rag
---

## What is wrong

A rag gets dirtier with each bloody mess it wipes. In `rag.dm`, `on_cleaned` adds `round(bloodiness / 20)` to `blood_level` for each bit of blood it takes up, unless it holds water or space cleaner to soak it up (`remove_cleanable_reagents`). A fresh rag holds nothing: `create_reagents(5, OPENCONTAINER)` and no reagent added. Once `blood_level` reaches 10, `should_clean` refuses: the rag says "too dirty" and nothing is cleaned.

The body does not know. `can_clean_with` counts anything with a `cleaner` component as able to clean, so a filthy rag is still "what it cleans with" (`cleaning_tool`, `tool_for_mess`, `describe_cleaning_tool`). `clean_mess` clicks with it, nothing happens, it waits the full 8 seconds, and writes the mess off as one that "will not come off". The second miss of a kind in a room writes off every mess of that kind there (`stubborn_kinds`). Because the tool's type never changes, `mind_what_it_holds` never clears the list. The brain is told the mess "will not come off" and the janitor reports the room as done what it can.

A player would see "too dirty" and rinse the rag at a sink: a plain click on a sink with the rag, not in combat mode, washes it (`sink.dm`, the fall-through wash, 4 seconds, `tool.wash(CLEAN_WASH)`, which sets `blood_level = 0` in `/obj/item/rag/wash`). The crew never do. Clicking a sink with a rag only happens today through `wet_mop`, which is for mops, and only when the rag's `blood_level == 0` does a sink wet a rag at all.

The window plans for janitors who hold only a rag (it "still cleans what a rag will shift", `jobs/janitor.ts` about line 498), and a janitor who swaps its mop for a rag to scrub a cobweb keeps using that rag on everything else until it gets the mop back.

Concrete case, with the real numbers:

1. A janitor holds only a rag (`BLOOD_AMOUNT_PER_DECAL` is 50, so a fresh splatter has `bloodiness` 50).
2. It wipes up four blood splatters in Medbay. Each adds `round(50 / 20, 1)` = 3 (2.5 rounds up) to `blood_level`: 3, 6, 9, 12. One pool of blood (`bloodiness` up to 300) adds 15 in one go.
3. At 12, the fifth splatter: `should_clean` returns `CLEAN_BLOCKED`. No `do_after` starts.
4. `clean_mess` waits 8 seconds and marks the splatter stubborn. The sixth: the same, and now `stubborn_kinds["Medbay|.../blood/splatter"]` is 2, so every splatter the janitor remembers in Medbay is written off.
5. The brain is told "You clean up 4 messes in Medbay. What is left there will not come off with what you have."

## Where

`code/modules/llm_crew/crew_npc_cleaning.dm:34`, in `can_clean_with`:

    /datum/ai_controller/crew_npc/proc/can_clean_with(obj/item/tool)
    	if(istype(tool, /obj/item/mop))
    		return tool.reagents?.total_volume >= 0.1
    	if(istype(tool, /obj/item/reagent_containers/spray/cleaner))
    		return tool.reagents?.total_volume > 0
    	return !isnull(tool.GetComponent(/datum/component/cleaner))

`code/modules/reagents/reagent_containers/rag.dm:118`, the rag refusing:

    	if(blood_level >= 10)
    		// snowflakeeeee check to make it a bit more intuitive when cleaning the rag.
    		if(istype(atom_to_clean, /obj/structure/sink))
    			return CLEAN_BLOCKED|CLEAN_DONT_BLOCK_INTERACTION
    		atom_to_clean.balloon_alert(cleaner, "[name] is too dirty!")
    		return CLEAN_BLOCKED

`rag.dm:136`, the rag getting dirty:

    		if(length(all_cleaned[cleaned]))
    			var/how_dirty = get_blood_level_of_movable(cleaned)
    			if(!remove_cleanable_reagents(how_dirty))
    				blood_level += how_dirty

`code/game/objects/structures/water_structures/sink.dm:196`, how a player rinses it (a plain click, not in combat mode):

    	if(!user.combat_mode || (tool.item_flags & NOBLUDGEON))
    		...
    		busy = TRUE
    		if(!do_after(user, 4 SECONDS, target = src))
    		...
    		tool.wash(CLEAN_WASH)

## How it was found

Read from the code, with the base game's rag, sink and blood decal read for the numbers. Not seen in a round.

## How to fix it

1. Add `/datum/ai_controller/crew_npc/proc/rag_is_filthy(obj/item/rag/rag)` returning `rag.blood_level >= 10`. In `can_clean_with`, return FALSE for a filthy rag. Then `cleaning_tool`, `tool_for_mess` and `describe_cleaning_tool` all stop offering it, and `is_spent` in `crew_npc_hands.dm` should count it too, so `free_a_hand` puts it away first.
2. Rinsing, by a click: in `tool_clean`, before anything else, if the body holds a filthy rag (or one with `blood_level > 4`, when it starts to smear) and a sink is in sight, start an errand to the sink as the mop wetting does. In `do_errand`'s `CREW_TOOL_CLEAN` branch, a sink with a dirty rag in hand goes to a new `rinse_rag(sink)`: put the rag in the active hand, `click_as_body(sink)` once, then wait while `length(body.do_afters)` (the 4 second wash), then check `rag.blood_level == 0`. Answer with the three-item list `wet_mop` uses, so `finish_errand` goes on to look for messes.
3. Better still, wet the rag after rinsing it: with `blood_level == 0` a second click on the sink puts 5 units of water on it (`sink.dm`, the mop-or-clean-rag branch), and a rag with water in it soaks up blood instead of getting dirty (`remove_cleanable_reagents`). Do it in the same `rinse_rag`.
4. Tell the brain: add `rag_filthy` to what `crew_brain_link.dm` sends, next to `dry_mop`, so the janitor says "my rag is too dirty" rather than "it will not come off", and a janitor with only a filthy rag and no sink in sight goes for a sink or the closet the way one with a dry mop does.
5. This is the same family as the dry mop (`dry_mop`, `has_poor_tool`): keep the two side by side so a dry mop and a filthy rag read the same way to the brain.

## How to test the fix

- Server compile to a side copy.
- In a round: give a janitor only a rag and put five blood splatters in a room with a sink. It should rinse the rag when it reaches "too dirty" and clean all five. Grep `game.log` for the new rinse line (add one) and for no "will not come off" report.
- The simulator does not run the server code, so it will not show this.
