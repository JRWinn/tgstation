---
id: CHEAT-14
title: Crew bodies send and read PDA messages with the PDA switched off, broken or with its sending turned off, while blind, and without ever drawing its battery
kind: bug
severity: high
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:692, code/modules/llm_crew/crew_npc_cargo.dm:803, code/modules/modular_computers/computers/item/computer.dm:567, code/modules/modular_computers/computers/item/computer_ui.dm:47, code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:260
fix: Before sending or reading, require what the PDA's own screen requires - switched on (turn_on, which draws power), not broken, a body that can read it, sending enabled - and say which failed
---

## What is wrong

`tool_message` finds the messenger program on a PDA the body carries (`pda_messenger()`, which only looks for the program in `stored_files`) and calls `own_messenger.send_message_signal(body, text, list(target))`. That proc is the network half of sending. The half a player goes through first is the PDA's screen, and none of it is asked:

- The PDA has to be on. `interact` turns it on with `turn_on(user)`, which refuses a PDA that is broken (`atom_integrity <= integrity_failure * max_integrity`, "fails to boot up") and one with no power (`use_energy`), and once on it draws power from its cell for as long as it runs.
- The screen will not show to someone who cannot read it: `ui_interact` closes for `!user.can_read(src, READING_CHECK_LITERACY)`, which is false for the blind and the illiterate.
- The messenger's own send action refuses when the owner has turned sending off: `if(!sending_and_receiving) ... "ERROR: This device has sending disabled."`.

`on_pda_message`, the reading side, is the same: a message landing on the PDA is read into the brain if the body can sense at all, with no test that the PDA is on, that the body can see, or that the PDA is whole.

The crew's PDAs are never switched on, so they never draw their cells. A player who sends a dozen messages and leaves the PDA open pays for it in charge; the crew never do.

Concrete cases:

1. A security officer is blinded by a flash or wears a blindfold. Its brain still sends the Head of Security a PDA report word for word, and reads the reply.
2. A janitor's PDA is broken by a fire or an explosion (its integrity below the failure line). It goes on sending "Hedley, the Cargo Bay is clean" as if nothing had happened.
3. An EMP or a long round leaves a PDA with a flat cell. A player's PDA will not turn on; the crew's goes on working.

`unsent_messages` (kept and retried) only covers a refusal from the network, so none of these produce a "would not send".

The same holds for the other PDA programs the crew read, each of which only tests that the program is installed: the engine monitor (`engine_reading` in `crew_npc_engineering.dm`, which does test the network but not that the PDA is on, whole and readable), the budget program (`cargo_budget` and `crate_costs` in `crew_npc_quartermaster.dm`), and the custodial locator (`tool_locate` in `crew_npc_cleaning.dm`). The same helper should gate them.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:683`, `pda_messenger`:

    	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
    		var/datum/computer_file/program/messenger/messenger = locate() in computer.stored_files
    		if(messenger)
    			return messenger

`:719`, in `tool_message`:

    	if(!own_messenger.send_message_signal(body, text, list(target)))

`:803`, `on_pda_message`:

    	if(!can_sense() || get_atom_on_turf(computer) != pawn)
    		return

The player's way, `code/modules/modular_computers/computers/item/computer.dm:571`, in `turn_on`:

    	if(atom_integrity <= integrity_failure * max_integrity)
    ...
    		return FALSE
    	if(use_energy(base_active_power_usage)) // checks if the PC is powered

and `computer_ui.dm:48`:

    	if(!enabled || !user.can_read(src, READING_CHECK_LITERACY))
    		ui?.close()
    		return

## How it was found

Read from the code and the base modular computer and messenger code. Marked `likely`, not `sure`, because I did not check how fast an idle PDA's cell drains in a real round; cases 1 and 2 do not depend on that.

## How to fix it

1. A helper on the controller, `pda_usable(obj/item/modular_computer/computer)`: returns null if a player could use it now, else the reason in words.
   - broken: `computer.atom_integrity <= computer.integrity_failure * computer.max_integrity` -> "Your PDA is broken."
   - off: if `!computer.enabled`, call `computer.turn_on(pawn, open_ui = FALSE)`, which is the power button; if it stays off -> "Your PDA will not turn on."
   - `!pawn.can_read(computer, READING_CHECK_LITERACY)` -> "You cannot see your PDA's screen."
   - the messenger's `sending_and_receiving` off -> "Your PDA has sending turned off."
2. In `tool_message` and `resend_unsent`, call it first and return its reason as the action result. For "will not turn on" and "broken", keep the message in `unsent_messages` as for a network failure, so it goes when the PDA is mended or charged.
3. Leave the PDA switched on after use: that is what makes it draw power. Whether the body should switch it off again to save the cell is the owner's call; a player usually leaves it.
4. In `on_pda_message`, skip the message for a broken PDA, and for a body that cannot read the screen (`can_read`) note only "Your PDA buzzes." with no text: a player hears it and cannot read it.
5. `has_pda` in `ui_data` should go by `pda_usable` as well, so the brain does not plan on a PDA that cannot be used.

## How to test the fix

- Server compile.
- Simulator: the sim stands in for the PDA; add a case where `tool_message` comes back "You cannot see your PDA's screen." and check the job falls back to saying it aloud or waiting.
- A round: blindfold a janitor and send it a PDA message: it should get "Your PDA buzzes." only. Break a technician's PDA (an admin can set its integrity) and see `game.log` show no "was told by its brain to PDA" lines going out.
