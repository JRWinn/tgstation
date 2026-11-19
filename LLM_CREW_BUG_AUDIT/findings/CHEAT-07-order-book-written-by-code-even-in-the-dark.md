---
id: CHEAT-07
title: The Quartermaster writes its order book by putting text straight onto the paper, so it writes in the dark, without the pen in its writing hand, and leaves no paper log
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: code/modules/llm_crew/crew_npc_quartermaster.dm:174, code/modules/paperwork/paper.dm:705, code/modules/mob/mob.dm:1312
fix: Send each line through the paper's own add_text handler as the body, the way work_timer does for a cell timer, with the pen or the clipboard's pen as the active writing tool
---

## What is wrong

`tool_note` gets the sheet and a pen into hand (`ready_to_write`) and then writes each line with `sheet.add_raw_text("[line]\n\n")`. That puts the text on the paper directly. The game's own way of writing, the paper window's `add_text` action in `/obj/item/paper/ui_act`, runs checks first, and every one is skipped:

- `user.can_write(holding)`: the thing in the **active** hand (or the clipboard's pen) must be a writing tool; the writer must be literate; and there must be light ("It's too dark in here to write anything!"), or night vision; and some pens need gravity.
- the paper on a noticeboard the writer may not use;
- the length limit (`MAX_PAPER_LENGTH`), checked against what is being added;
- it writes in the pen's own font and colour, plays the writing sound, and writes `log_paper("[key_name(user)] wrote to ...")`, which is what admins read.

Already listed as known in the change log of 2026-11-18 (Quartermaster, "Short of the no-cheats rule: taking the sheet from the bin, clipping it to the clipboard and writing a line are done by direct code, under the same conditions as a player's clicks"). It is not "the same conditions": the light test alone makes a difference most rounds. GAP-07 lists `take_paper` and `ready_to_write` but not the writing. This finding is for the writing, with the fix, which is small.

Concrete case: the station's power fails about fifteen minutes into a test round (the owner's own note, "Station power fails early"). The Quartermaster's office goes dark. A head asks for an order; the Quartermaster writes "Order 3. Janitorial Supplies for ..." in its book in the dark. A player in its place would be refused, and would have to find a light. The paper also gets no `log_paper` line, so the admin paper log never shows the order book being written.

A second case: with a loose sheet (no clipboard) `ready_to_write` puts the sheet in one hand and the pen in the other, but nothing makes the pen's hand the active one. A player would have to swap hands to write.

## Where

`code/modules/llm_crew/crew_npc_quartermaster.dm:174`, in `tool_note`:

    	for(var/line in to_write)
    		// Each line is its own paragraph: paper runs lines together otherwise.
    		sheet.add_raw_text("[line]\n\n")
    		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) wrote in its order book: [line]")

The player's way, `code/modules/paperwork/paper.dm:705`, `ui_act`, `"add_text"`:

    			var/obj/item/holding = user.get_active_held_item()
    			// Use a clipboard's pen, if applicable
    			if(istype(loc, /obj/item/clipboard))
    ...
    			if(!user.can_write(holding))
    				return TRUE
    ...
    			add_raw_text(paper_input, writing_implement_data["font"], writing_implement_data["color"], writing_implement_data["use_bold"], check_rights_for(user?.client, R_FUN))
    			log_paper("[key_name(user)] wrote to [name]: \"[paper_input]\"")

`code/modules/mob/mob.dm:1325`, in `can_write`:

    	if(!has_light_nearby() && !has_nightvision())
    		to_chat(src, span_warning("It's too dark in here to write anything!"))
    		return FALSE

## How it was found

Read from the code and the base paper code.

## How to fix it

1. In `tool_note`, after `ready_to_write(sheet)`: if the sheet is loose, make the hand holding the pen the active one (`hand_to(pen)` in `crew_npc_security.dm`).
2. Replace `sheet.add_raw_text(...)` with a call to the paper's handler as the body, the same stand-in `work_timer` uses for a cell timer (a `/datum/tgui` that is never opened, `world.push_usr(body, CALLBACK(sheet, TYPE_PROC_REF(/datum, ui_act), "add_text", list("text" = "[line]\n\n"), window, window.state))`). A small shared proc `work_paper(sheet, text)` beside `work_window` keeps it in one place. Check before it that the sheet is in the body's hand or on the clipboard in its hand (the window's own range test).
3. Tell whether it took by the paper's length before and after (`sheet.get_total_length()`). If nothing was added, return the real reason: test `body.can_write(holding)` first, and say "It is too dark here to write in your order book." when `has_light_nearby()` is false, or "You have nothing in your hand to write with." otherwise.
4. Leave `log_game` as it is; the paper handler adds `log_paper`.
5. The window side: a failed `note` already comes back as an action result with `no_paper`. For the dark case send `dark = TRUE` instead, so the job does not go off to fetch more paper (`jobs/supply.ts` reads `no_paper`). The Quartermaster can still keep the order in mind and write it when there is light.

Question for the owner: in the dark, should the Quartermaster hold the order until it can write it, or go on without writing it?

## How to test the fix

- Server compile.
- `tools/llm_crew/book.ts` covers the book's lines, not the writing: run it to check nothing there changed.
- A round: put out the lights in the Quartermaster's office (break the APC or the bulbs) and ask for an order. `game.log` must not show "wrote in its order book"; the window must show the dark reason. With the lights on, the admin paper log must show the line.
