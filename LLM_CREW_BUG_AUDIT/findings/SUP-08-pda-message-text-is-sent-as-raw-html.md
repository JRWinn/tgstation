---
id: SUP-08
title: A crew NPC's PDA message skips the game's cleaning, so its text reaches the other person's chat as raw HTML
kind: bug
severity: low
effort: small
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:701, code/modules/llm_crew/crew_npc_cargo.dm:719, code/modules/llm_crew/crew_npc_cargo.dm:775, code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:461
fix: Run the text through the messenger's own sanitize_pda_message before it is sent or kept for resending
---

## What is wrong

See also: CHEAT-14

When a player sends a PDA message the game goes through `send_message`, which first calls `sanitize_pda_message`: the text is trimmed and HTML-encoded (`sanitize`). Only then is `send_message_signal` called.

`tool_message` and `resend_unsent` call `send_message_signal` directly. The text they pass has had its line breaks taken out, been cut to 200 characters and been checked against the word filter. It has not been encoded. `send_message_signal` and the receiving side both take the message to be safe HTML already and paste it into chat:

    to_chat(messaged_mob, span_infoplain("... <b>PDA message from [sender_title], </b>\"[inbound_message]\"[photo_message] [reply]"))

So any `<`, `>` or `&` in what an NPC sends is read as markup by the receiver's chat window, and by the sender's own "PDA message sent to" line and the ghost feed.

Where the text comes from: the window. Most of it is fixed lines built in code, but they carry words that came from people and from the model: a reason "passed on word for word", the model's remark on a work report, the name a head gave for who an order is for. And the comment at the top of `crew_npc_tools.dm` is right that none of it can be trusted: "Tool calls come from a player's client, so every part of them is untrusted." The Crew Brain window is code running in a player's client. A player who owns a brain link can send a `tool_call` with any `text` they like.

Two cases:

1. Harmless but wrong. A report line the model wrote has "the <Captain> asked" or "x<y" in it. The chat panel sets the line with `innerHTML` (`tgui-panel/chat/renderer.tsx`, no sanitizing on a live message), so `<Captain>` is taken for a tag and the word is gone. (A `<` before a digit or a space, or a bare `&`, is shown as typed by an HTML5 parser, so "crates <12> & <13>" would come through whole: it takes a letter after the `<`.)
2. The owner of a brain link sends `tool_call` with `tool: "message"`, `person: "<another player's name>"`, `text: "<a href='byond://?...'>your crate is here</a>"`. The other player's chat shows a link of the sender's choosing, from a crew member they have no reason to doubt. Chat links run as the player who clicks them. But a brain link is owned only by an admin with `R_SPAWN`: `spawn_crew_npc`, `spawn_test_crew` and the round-start spawn all give the crew to such an admin (`crew_npc_spawn.dm`), and `ui_state` lets only that ckey act (`crew_brain_link.dm:68`). So this needs an admin to abuse it, not any player.

It also means an NPC's message is the one kind of PDA message that reaches a crew NPC un-encoded. `on_pda_message` calls `html_decode` on what arrives, which is right for a player's message and happens to do nothing for an NPC's.

Smaller things the same shortcut skips, all of which a player's send goes through:

- `send_message` will not send to a PDA whose owner has turned receiving off (`sending_and_receiving`). The NPC's message goes through anyway.
- `send_message` adds the message to the sender's own chat history. An NPC's PDA shows nothing it sent.
- `messenger_named` picks a PDA by `saved_identification` from every messenger in the world. `people_on_pda` leaves out PDAs that are off the station, but the send does not, so a PDA of the same name lying in a ruin can be the one that gets the message.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:701`, in `tool_message`:

    	var/static/regex/line_breaks = regex(@"[\r\n\t]+", "g")
    	text = trim(copytext_char(line_breaks.Replace(text, " "), 1, CREW_NPC_MESSAGE_MAX_LENGTH + 1))
    	if(!length(text) || is_ic_filtered(text))
    		action_result(CREW_TOOL_MESSAGE, FALSE, "You cannot think how to put the message.")
    		return
    ...
    	if(!own_messenger.send_message_signal(body, text, list(target)))

`:775`, in `resend_unsent`:

    		if(!own_messenger.send_message_signal(body, text, list(target)))

The game's own path, `code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:461`:

    /datum/computer_file/program/messenger/proc/sanitize_pda_message(message, mob/sender)
    	message = sanitize(trim(message, MAX_PDA_MESSAGE_LEN))
    ...
    /datum/computer_file/program/messenger/proc/send_message(atom/source, message, list/targets, everyone = FALSE)
    	var/mob/living/sender
    	if(isliving(source))
    		sender = source
    	message = sanitize_pda_message(message, sender)
    	if(!message)
    		return FALSE

and `send_message_signal` further down, which uses the message as it is given:

    	if(sender)
    		to_chat(sender, span_info("PDA message sent to [signal.format_target()]: \"[message]\""))

## How it was found

Read from the code. Not tried in a round: no message with a `<` in it was sent. `tool_say` is not affected: `say()` does its own encoding.

## How to fix it

The smallest change that keeps everything else as it is:

1. In `tool_message`, after the trim and the filter check and before `unsent_key` is built, encode the text with the game's own proc:

       text = own_messenger.sanitize_pda_message(text, null)
       if(!length(text))
       	action_result(CREW_TOOL_MESSAGE, FALSE, "You cannot think how to put the message.")
       	return

   Passing `null` for the sender skips the PDA word filter's pop-up, which is meant for a player at a keyboard. `is_ic_filtered` has already been applied. If the owner wants the PDA filter as well, `is_ic_filtered_for_pdas(text)` is the check to add beside it.
2. Because `unsent_messages` then holds the encoded text, `resend_unsent` needs no change, and the same words are never encoded twice. Its test `findtext(text, " now")` still works on encoded text.
3. The three `log_game` lines print the text. Encoded text in `game.log` is a little harder to read ("&#39;" for an apostrophe). Keep the raw text in a second variable for the log if that matters.
4. In `messenger_named`, skip a messenger that is not on a station level, as `people_on_pda` does (`is_station_level(get_turf(candidate.computer)?.z)`), and one with `sending_and_receiving` off. For the second, answer the brain "Their PDA is not taking messages."

The fuller change is to call `own_messenger.send_message(body, text, list(target))` in both places. That gets the encoding, the receiving-off check and the sender's chat history in one go, and is the code a player's send reaches, which is what the no-cheats rule asks for. It was not chosen above only because `send_message` also switches the PDA's open chat and handles photos. I read it and saw nothing that needs a client, so it should be safe: the engineer doing the fix should try it first and fall back to step 1 if anything misbehaves.

What must keep working: a message that will not send is still kept and tried again (`unsent_messages`), and `on_pda_message` on the receiving NPC still reads the words as written (its `html_decode` now has something to decode).

## How to test the fix

- Server compile to a side copy.
- No simulator case: the simulator does not run this.
- In a round, or with a debug call: have an NPC send a message whose text is `a <b>bold</b> & b`. The Captain's chat must show those characters as typed, not bold text. A receiving NPC's event list (Crew Brain window) must show the same characters. `pda.log` should be unchanged in shape.
