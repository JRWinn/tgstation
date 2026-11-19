---
id: GAP-07
title: The read-through for cheats and the check script that fails on new ones were approved and never done (no-cheats plan 4.9), a list of what is left
kind: gap
severity: high
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: tools
files: LLM_CREW_PLAN_NO_CHEATS.md:174, code/modules/llm_crew/crew_npc_cargo.dm:283, code/modules/llm_crew/crew_npc_quartermaster.dm:238, code/modules/llm_crew/crew_npc_hands.dm:308, code/modules/llm_crew/crew_npc_freight.dm:590
fix: Add tools/llm_crew/cheats.ts that greps the crew code for a short list of calls against an allowed list, and put the list below to the owner
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.9, accepted by the owner ("A check script that fails on new cheats? Yes."):

- "one pass through every tool proc in `code/modules/llm_crew/`, top to bottom, against the rule. What turns up is listed for the project owner before it is touched."
- "a small check script in `tools/llm_crew/` that fails when crew code contains a call from a short list (adding reagents, moving by `forceMove`, creating items, calling the shuttle system) outside a short allowed list. It is run with the simulator."
- "the rule goes at the top of `LLM_CREW_BRIEF.md`."

None of the three was done. `tools/llm_crew/` holds `addressing.ts`, `book.ts`, `choose.ts`, `engine.ts`, `fixtures.ts`, `reports.ts`, `security.ts`, `sim.ts`, `voice.ts` and no check. The brief does not mention the rule. Since the plan was written, code that breaks the rule has gone on being added (the order book, the label, the kit, the cuffs), each noted in its own change log entry under "Short of the no-cheats rule" and never brought together.

This finding is the list. It is from a pattern search plus reading the procs named, not from the full top-to-bottom pass the plan asks for, so it is a floor, not the whole.

| Where | What it does | A player would | Other finding |
| --- | --- | --- | --- |
| `supply_run_step` `crew_npc_cargo.dm:450,461`; `send_shuttle_back` `crew_npc_freight.dm:642,653` | `SSshuttle.moveShuttle` | press send at the console | GAP-01 |
| `tip_out` `crew_npc_cargo.dm:570` | `forceMove` out of a shut crate | open the crate | GAP-02 |
| `hold_door_for`, `let_door_close` `crew_npc_doors.dm:592,800` | sets `autoclose`, calls `open()` and `close()` | click the door | GAP-03 |
| `create_crew_npc` `crew_npc_spawn.dm:19` | makes galoshes | find or order a pair | GAP-04 |
| `crew_npc_alarm_was_pulled` `crew_npc_doors.dm:694`; `reset_fire_alarm` `:780` | reads why an alarm is on; calls `alarm.reset(body)` | not know; right-click the alarm | GAP-05 |
| `label_crate` `crew_npc_cargo.dm:283` | `new /obj/item/label(null, words)` stuck on the crate | need a hand labeler and use it | none: listed in the Quartermaster plan's "Known limits" as still open |
| `take_paper` `crew_npc_quartermaster.dm:248-300`, `ready_to_write` `:114` | pops the bin's `paper_stack`, sets `bin.bin_pen`, `board.top_paper`, `board.pen` and `forceMove`s sheet and pen | click the bin, click the clipboard with the sheet, click it with the pen | none: change log line "taking the sheet from the bin, clipping it ... done by direct code" |
| `nearest_paper_bin` `crew_npc_quartermaster.dm:192` | `for(var/obj/item/paper_bin/bin in world)`: knows every bin on the level | know the ones it has seen | none |
| `hand_over` `crew_npc_hands.dm:320-323`; `hand_mail_over` `crew_npc_freight.dm:600` | `person.put_in_hands(...)` on someone else, then `forceMove` to their feet | offer it and wait for them to take it (the game's give), or put it down | none |
| `take_item` `crew_npc_hands.dm:263`; `take_from_container` `:295` | `body.put_in_hands(item)` | click the item (`attack_hand`, which runs the item's own checks) | none: named in the 18:05 change log entry |
| `free_a_hand`, spawn | `equip_to_storage(..., indirect_action = TRUE)` | click the bag with the item | none: named in the 19:38 change log entry |
| `take_cuffs_off`, `work_timer`, `work_wires`, `work_window` | send a machine or strip window's payload as the body | use the window | allowed: the owner decided this for machine windows on 2026-11-18. The cuffs were never put to the owner |

One concrete case for a row with no finding of its own: a janitor NPC is told to give a player a mop. `hand_over` runs `person.put_in_hands(held)` on the player. The mop is in the player's hand with no offer and no accept. If the player's hands are full the mop is moved to the player's tile by `forceMove`, from wherever the janitor stands within reach.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:279`:

    /datum/ai_controller/crew_npc/proc/label_crate(obj/structure/closet/crate/crate, datum/crew_npc_held_crate/entry)
        ...
        var/obj/item/label/note = new(null, words)
        note.stick_to_atom(crate)

`code/modules/llm_crew/crew_npc_hands.dm:320`:

    if(person.put_in_hands(held))
        return list(TRUE, "You hand the [held_name] to [person.name].")
    // Their hands were full, so it ends up at their feet.
    held.forceMove(person.drop_location())

`code/modules/llm_crew/crew_npc_quartermaster.dm:247`:

    if(need_sheet)
        sheet = pop(bin.paper_stack) || bin.generate_paper()
        bin.total_paper -= 1

## How it was found

A grep of `code/modules/llm_crew/` for `forceMove`, `new /`, `SSshuttle`, `autoclose`, `.open(`, `.close(`, `put_in_hands`, `equip_to_storage`, `in world`, then reading each proc. The change log entries of 14:15, 15:40, 18:05 and 19:38 were searched for "cheat".

## How to fix it

1. **The check script** (small, do it first, it stops the list growing). `tools/llm_crew/cheats.ts`: read every `.dm` under `code/modules/llm_crew/`, and fail if a line matches one of `forceMove(`, `add_reagent(`, `new /obj`, `new /mob` (other than in `create_crew_npc`), `moveShuttle(`, `.autoclose =`, `put_in_hands(`, `equip_to_storage(`, `equip_to_slot`, ` in world)`, `qdel(` unless `file:proc` is on an allowed list kept at the top of the script with one line of reason each. Start the allowed list with today's hits, each marked with the finding that will remove it, so the script passes today and fails on anything new. Add it to the list of checks in `LLM_CREW_BUG_AUDIT/README.md` and in `CLAUDE.md`.
2. **The rule in the brief.** Add the three-part rule from the plan's section 4 ("standing where a player would stand; through the code a click reaches, with the body as the user; crew code creates, fills, moves and switches nothing") at the top of `LLM_CREW_BRIEF.md` section 2.
3. **The read-through.** One sitting: every proc reached from `handle_tool_call` and `do_errand` (the two switch statements in `crew_npc_tools.dm:27` and `crew_npc_hands.dm:198` are the whole list of entry points). For each, write one line: honest, stand-in the owner allowed, or cheat. Put the cheats to the owner before changing them.
4. **The rows above with no finding**, in the order I would take them:
   - `hand_over`, `hand_mail_over`: put the thing down beside the person (a click on the floor or a table, as `put_down_unasked_item` already does) for a player, and keep the hand-to-hand for a crew NPC, who has no accept button. Or use the game's offer and wait. Owner's choice.
   - `take_item`: `click_as_body(item)` and then check `item in body.held_items`.
   - `label_crate`: either drop the label (the manifest already carries the number) or have cargo use a hand labeler from the Delivery Office. Owner's choice: it is in the Quartermaster plan as open.
   - `take_paper`: click the bin with an empty hand (gives a sheet), click the clipboard with the sheet, alt-click or click the bin for its pen. `nearest_paper_bin` should look only among bins the body has seen (`things_in_view` history) and the room it knows paper is kept in, the way a janitor looks for a mop.

## How to test the fix

- `bun tools/llm_crew/cheats.ts` passes on today's tree with the allowed list, and fails when a line such as `thing.forceMove(get_turf(pawn))` is added to any crew file.
- For each row mended: server compile, and a watched round, since the simulator runs no server code.
