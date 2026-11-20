---
id: CHEAT-14
title: Crew bodies send PDA messages with the PDA switched off, broken or with its sending turned off, while blind, to someone with receiving off, and without ever drawing its battery
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: b2802ed8b07
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:719, code/modules/llm_crew/crew_npc_cargo.dm:771, code/modules/llm_crew/crew_npc_cargo.dm:683, code/modules/modular_computers/computers/item/computer.dm:567, code/modules/modular_computers/computers/item/computer_ui.dm:47, code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:474
fix: Before sending, require what the PDA's screen requires - switched on by turn_on, not broken, a body that can read it, sending enabled - say which failed, and send through the messenger's send_message rather than send_message_signal; reading needs no change
---

## What is wrong

See also: SUP-08

`tool_message` finds the messenger program on a PDA the body carries (`pda_messenger()`, which only looks for the program in `stored_files`) and calls `own_messenger.send_message_signal(body, text, list(target))`. That proc is the network half of sending. The half a player goes through first is the PDA's screen, and none of it is asked:

- The PDA has to be on. `interact` turns it on with `turn_on(user)`, which refuses a PDA that is broken (`atom_integrity <= integrity_failure * max_integrity`, "fails to boot up") and one with no power (`use_energy`), and once on it draws power from its cell for as long as it runs.
- The screen will not show to someone who cannot read it: `ui_interact` closes for `!user.can_read(src, READING_CHECK_LITERACY)`, which is false for the blind and the illiterate.
- The messenger's own send action refuses when the owner has turned sending off: `if(!sending_and_receiving) ... "ERROR: This device has sending disabled."`.

- `send_message_signal` also skips what `send_message` (the proc the screen's send action calls, `messenger_program.dm:474`) does first: it refuses a target whose owner has turned receiving off ("ERROR: Recipient has receiving disabled."), cleans the text with `sanitize_pda_message` (SUP-08), and records the message in the sender's own chat.

(Checker's correction.) `on_pda_message`, the reading side, is **not** a fault. In the base game a message reaches a player's chat whatever state the PDA is in: `receive_message` (`messenger_program.dm:664`) is called by the message server for every target messenger, with no test that the computer is on, whole or powered, and it `to_chat`s the carrier unless they are unconscious or illiterate. A blind player reads it too. The crew's `can_sense()` covers the unconscious; the only gap is an illiterate body (a rare brain trauma), which a player would not be shown.

The crew's PDAs are never switched on, so they never draw their cells. A player who sends a dozen messages and leaves the PDA open pays for it in charge; the crew never do.

Concrete cases:

1. A security officer is blinded by a flash or wears a blindfold. Its brain still sends the Head of Security a PDA report word for word. (Reading the reply is honest, see above. A blind player can also answer a message by the "Reply" link in chat, which turns the PDA on but does not need the screen; starting a new message needs the screen.)
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

`:771`, in `resend_unsent`, the same call:

    		if(!own_messenger.send_message_signal(body, text, list(target)))

What `send_message_signal` itself checks (`messenger_program.dm:573`) is only that the sender is conscious, not incapacitated and within reach (`can_perform_action(computer, ALLOW_RESTING | ALLOW_PAI)`), the one second cooldown, jammers and whether the network carried it.

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

Read from the code and the base modular computer and messenger code. Not checked: how fast a switched-on PDA's cell drains in a real round. Cases 1 and 2 do not depend on that.

## How to fix it

1. A helper on the controller, `pda_usable(obj/item/modular_computer/computer)`: returns null if a player could use it now, else the reason in words.
   - broken: `computer.atom_integrity <= computer.integrity_failure * computer.max_integrity` -> "Your PDA is broken."
   - off: if `!computer.enabled`, call `computer.turn_on(pawn, open_ui = FALSE)`, which is the power button; if it stays off -> "Your PDA will not turn on."
   - `!pawn.can_read(computer, READING_CHECK_LITERACY)` -> "You cannot see your PDA's screen."
   - the messenger's `sending_and_receiving` off -> "Your PDA has sending turned off."
   - Fold in SUP-16's two tests (`can_perform_action(computer, ALLOW_RESTING)` and the cooldown) so every refusal has its own words in one place.
2. In `tool_message` and `resend_unsent`, call it first and return its reason as the action result. For "will not turn on" and "broken", keep the message in `unsent_messages` as for a network failure, so it goes when the PDA is mended or charged (it is dropped after `CREW_NPC_UNSENT_KEPT` as now). For "cannot see" and "sending turned off", do not keep it: return the failure so the job falls back to saying it aloud.
3. Send with `own_messenger.send_message(body, text, list(target))` instead of `send_message_signal`. That is the proc the screen's send button calls after its own `sending_and_receiving` test. It refuses a target with receiving off, sanitizes the text (fixes SUP-08 too), writes the chat, and calls `send_message_signal` itself. Its FALSE means either a refused target or a network failure; tell them apart by checking `target.sending_and_receiving` first and answering "[name] has their PDA set not to receive messages." without keeping it.
4. Leave the PDA switched on after use: that is what makes it draw power. Whether the body should switch it off again to save the cell is the owner's call; a player usually leaves it.
5. Leave `on_pda_message` as it is, but for `!body.is_literate()` give only "Your PDA buzzes." with no text, as `receive_message` does for an illiterate player.
6. `has_pda` in `ui_data` (`crew_brain_link.dm:146`) should also say false for a broken PDA, so the brain does not plan on it. Do not call `turn_on` from `ui_data` (it runs every update and would switch every PDA on): use a test with no side effect, the integrity line and `can_read` only.
7. The engine monitor (`crew_npc_engineering.dm:111`), budget (`crew_npc_quartermaster.dm:311`) and custodial locator (`crew_npc_cleaning.dm:549`) are read only on the screen, with no chat path, so for them all of `pda_usable` applies, blindness included.

## How to test the fix

- Server compile.
- Simulator: the sim stands in for the PDA; add a case where `tool_message` comes back "You cannot see your PDA's screen." and check the job falls back to saying it aloud or waiting.
- The simulator's stand-in PDA always sends (SIM-01); that finding's PDA-down switch is the place to add these refusals.
- A round: blindfold a janitor and have it report a cleaned room: it must say it aloud or wait, and `game.log` shows no "was told by its brain to PDA" line. Send the blindfolded janitor a message: it still reads it, as a player would. Break a technician's PDA (an admin can set its integrity below half) and see the "would not send it. Kept to send again" line, then the "gave up" line. Turn a head's receiving off and see the message refused with its own words, not kept. Check the PDA shows as on (`enabled`) in View Variables after the first message.

## Check

Checked by Opus 5.5. The quotes are what the code says: `pda_messenger` at `crew_npc_cargo.dm:683-689` only looks for the program, and `tool_message` (:719) and `resend_unsent` (:771) call `send_message_signal` straight. Read `send_message_signal` (`messenger_program.dm:573`): it tests reach, consciousness, cooldown, jammers and the network, and nothing about the computer being on, whole, powered or readable, or `sending_and_receiving` on either end. The screen's send action (:260) tests the sender's `sending_and_receiving`, and `send_message` (:474) the target's; `ui_interact` (`computer_ui.dm:47`) needs `enabled` and `can_read`; `turn_on` (`computer.dm:567`) refuses a broken or unpowered PDA. PDAs start with `enabled = FALSE` (`computer.dm:62`) and no crew code turns one on, so every crew message goes from a PDA that is off. The four other program uses (cargo :686, cleaning :549, engineering :111, quartermaster :311) only test that the program is installed. Nothing in the change log or plans chose this; the line "PDA messages stop when station power goes" (entry "2026-11-18, morning: fixes from the first round with a Quartermaster") is the network side only. Refuted part: the reading side. `receive_message` (:664) shows the message to the carrier with no test of the PDA's state or the reader's sight, so `on_pda_message` is honest except for illiteracy; step 4 of the old fix (blind hears a buzz only) would have made the crew worse off than a player and is replaced. Added: the target's receiving-off test and SUP-08's cleaning, both fixed by sending through `send_message`. Effort raised to medium: a helper and calls in five files. Confidence raised to sure for the sending side.

## Fix notes

Built on branch `fix-supply`. One correction found while fixing: a blind body is **not** kept from its PDA's screen in the base game. `can_read` (`mob.dm:1360`) tests literacy and light only, and `computer_ui.dm` asks it for literacy only; tgui windows have no blindness test (`shared_ui_interaction`, `states.dm:62`). So the fix refuses an illiterate body ("You cannot make out the words on your PDA's screen."), not a blind one, and case 1 above is not a fault. Steps 6 (`has_pda` in `crew_brain_link.dm`) and 7 for the engine monitor (`crew_npc_engineering.dm`) and the custodial locator (`crew_npc_cleaning.dm`) were not built: those files belong to other workers in this sitting. The budget program (`has_budget_program`, `crew_npc_quartermaster.dm`) is gated on a broken PDA and literacy, with no switching on.

Steps 6 and 7, second round (branch `r2-server`). `has_pda` in `ui_data` (`crew_brain_link.dm`) is now `pda_readable()` of the messenger's PDA: false for a broken PDA or a body that cannot read, with nothing switched on. Two helpers in `crew_npc_engineering.dm`: `pda_readable()` (no side effect) and `pda_screen_usable()` (that, and the power button pressed if the PDA is off, as `pda_unusable` does). The engine monitor (`engine_reading`) uses `pda_screen_usable()`; since `engine_reading` is called from `ui_data`, an engineer's PDA with the monitor is switched on at the first update of its window and draws on its cell from then on, as a player watching the monitor would. The custodial locator: `has_custodial_locator()` (in `ui_data`) is gated on `pda_readable()` only, and `tool_locate` presses the power button too, answering "Your PDA will not turn on: it has no charge." if it stays off. A PDA off with a flat cell still shows as `has_pda` true: that is found when a message is tried. Compile-checked only.
