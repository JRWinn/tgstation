---
id: CHEAT-07
title: The Quartermaster writes its order book by putting text straight onto the paper, so it writes in the dark, without the pen in its writing hand, and leaves no paper log
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: quartermaster
files: code/modules/llm_crew/crew_npc_quartermaster.dm:174, code/modules/paperwork/paper.dm:705, code/modules/mob/mob.dm:1312, code/modules/tgui/tgui.dm:36
fix: Send each line through the paper's own add_text handler as the body, the way work_timer does for a cell timer, with the pen in the active hand or on the clipboard, and say why when nothing was added
---

## What is wrong

`tool_note` gets the sheet and a pen into hand (`ready_to_write`) and then writes each line with `sheet.add_raw_text("[line]\n\n")`. That puts the text on the paper directly. The game's own way of writing, the paper window's `add_text` action in `/obj/item/paper/ui_act`, runs checks first, and every one is skipped:

- `user.can_write(holding)`: the thing in the **active** hand (or the clipboard's pen) must be a writing tool; the writer must be literate; and there must be light ("It's too dark in here to write anything!"), or night vision; and some pens need gravity.
- the paper on a noticeboard the writer may not use;
- the length limit (`MAX_PAPER_LENGTH`), checked against what is being added;
- it writes in the pen's own font and colour, plays the writing sound, and writes `log_paper("[key_name(user)] wrote to ...")`, which is what admins read.

Already listed as known in the change log of 2026-11-18 (Quartermaster, "Short of the no-cheats rule: taking the sheet from the bin, clipping it to the clipboard and writing a line are done by direct code, under the same conditions as a player's clicks"). It is not "the same conditions": the light test alone makes a difference most rounds. GAP-07 lists `take_paper` and `ready_to_write` but not the writing. This finding is for the writing, with the fix, which is small.

Concrete case: the station's power fails about fifteen minutes into a test round (the owner's own note, "Station power fails early"). The lights go to emergency power on their own cells (`low_power_mode` in `code/modules/power/lighting/light.dm`), and when those run down, or in a room whose bulbs are broken, the Quartermaster's office is dark (`has_light_nearby`, lumcount under `LIGHTING_TILE_IS_DARK`). A head asks for an order; the Quartermaster writes "Order 3. Janitorial Supplies for ..." in its book in the dark. A player in its place would be refused, and would have to find a light. The paper also gets no `log_paper` line, so the admin paper log never shows the order book being written.

A second case: with a loose sheet (no clipboard) `ready_to_write` puts the sheet in one hand and the pen in the other, but nothing makes the pen's hand the active one. A player would have to swap hands to write: `add_text` takes `user.get_active_held_item()`, and `can_write` on the sheet itself fails with "You can't write with the paper!".

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
2. Replace `sheet.add_raw_text(...)` with a call to the paper's handler as the body, the same stand-in `work_timer` uses for a cell timer (a `/datum/tgui` that is never opened, `world.push_usr(body, CALLBACK(sheet, TYPE_PROC_REF(/datum, ui_act), "add_text", list("text" = "[line]\n\n"), window, window.state))`, then `qdel(window)`). A small shared proc `work_paper(sheet, text)` beside `work_window` keeps it in one place. Mind that a stand-in window's `status` starts at `UI_INTERACTIVE` (`tgui.dm:36`) and nothing runs `process_status()` on it, so the paper's own `ui_status` (`paper.dm:367`: in range, not blind, `can_read`, which also wants light) is skipped. Do not call `process_status()` to mend that: for a body with no client it ends in `/mob/proc/shared_ui_interaction` (`states.dm:64`), which returns `UI_CLOSE` for anyone mindless, so nothing would ever be written. Make the paper's own tests by hand before sending: `in_range(body, sheet)`, `!body.is_blind()`, `body.can_read(sheet)`, and the sheet in a hand or on the clipboard in a hand.
3. Tell whether it took by the paper's length before and after (`sheet.get_total_length()`). If nothing was added, return the real reason: test `body.can_write(holding)` first (with `holding` the clipboard's pen or the active-hand item, as `add_text` picks it), and say "It is too dark here to write in your order book." when `has_light_nearby()` is false, or "You have nothing in your hand to write with." otherwise. Stop at the first line that does not take, so lines are never written out of order.
4. Leave `log_game` as it is, but only for lines that took; the paper handler adds `log_paper`. `order_book_lines` reads `raw_text` only, so the pen's font and colour do not change what the window is told.
5. The window side needs no change. No window code reads `no_paper` (a search of `tgui/packages/tgui/interfaces/CrewBrain/` finds it nowhere). A failed `note` leaves the lines in `ledger.toWrite` (`afterActing` in `jobs/quartermaster.ts` splices them only when `ok`), the WRITE task stays open while `brain.book` is not null, and the driver's own back-off (`fail` in `driver.ts`, `RETRY_MS` times the count) spaces the next try. So in the dark the Quartermaster holds the lines and writes them when it has light. Do not send `no_paper` for the dark case, so the reason reads true.

## How to test the fix

- Server compile.
- `tools/llm_crew/book.ts` covers the book's lines, not the writing: run it to check nothing there changed.
- A round: put out the lights in the Quartermaster's office (break the bulbs; cutting the APC leaves emergency light for a while) and ask for an order. `game.log` must not show "wrote in its order book"; the window must show the dark reason, and the note must be tried again later, not every tick. Put the lights back: the held lines must be written in order. With the lights on, the admin paper log must show each line.
- A loose sheet with the pen in the inactive hand: the line must still be written (the hand swap in step 1).

## Check

Checked by Opus 5.5, read from the code. The quote at `crew_npc_quartermaster.dm:174` is as the code says: `sheet.add_raw_text("[line]\n\n")` after `ready_to_write(sheet)`. `/obj/item/paper/ui_act` `"add_text"` (`paper.dm:705`) is as quoted: active-hand item or the clipboard's pen, `can_write`, the noticeboard and length tests, the pen's font, the sound and `log_paper`. `can_write` (`mob.dm:1312`) refuses a non-writing tool, an illiterate writer, darkness and a gravity pen in zero gravity. None of that runs for the body. `ready_to_write` never swaps hands, so the loose-sheet case is real. The change log's 2026-11-18 Quartermaster entry (line 1097) lists the writing as "Short of the no-cheats rule" but says it is done "under the same conditions as a player's clicks", which is not so (no light, literacy or tool test); no entry accepts or fixes it. GAP-07's table has `take_paper` and `ready_to_write` but not the writing in `tool_note`, so this is not a duplicate. I mended three things: the dark case (power failure first gives emergency light, so it is dark later, not at once), fix step 5 (no window code reads `no_paper`; the window already holds the lines and the driver backs off, so no window change and no owner question are needed), and step 2 (the stand-in window skips the paper's own `ui_status`, and `process_status()` cannot be used to run it because `shared_ui_interaction` closes every window of a mob with no client, so its tests are made by hand). Severity stays high by FORMAT.md (the no-cheats rule), though in play it shows only in the dark. Effort stays small: server only, one proc and a helper. Nothing was run.
