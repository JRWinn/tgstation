---
id: SUP-16
title: A PDA message refused because the body is cuffed or down, or because one went less than a second ago, is reported as the PDA not working and is sent again later on its own
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: supply
files: code/modules/llm_crew/crew_npc_cargo.dm:719, code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:577, code/modules/llm_crew/crew_npc_cargo.dm:755
fix: Before send_message_signal, test body.can_perform_action(computer, ALLOW_RESTING) and the messenger's own cooldown, and answer each with its own reason without keeping the message to resend
---

## What is wrong

`tool_message` takes any FALSE from `send_message_signal` to mean the network is down. It tells the brain "Your PDA would not send the message. You will try it again when your PDA is working.", logs "its PDA would not send it", keeps the message and starts the resend timer.

`send_message_signal` returns FALSE for other reasons first, before it ever tries the network:

    	if(ismob(source))
    		sender = source
    		if(!sender.can_perform_action(computer, ALLOW_RESTING | ALLOW_PAI))
    			return FALSE

    	if(!COOLDOWN_FINISHED(src, last_text))
    		return FALSE

- `can_perform_action` fails when the body is cuffed, stunned, knocked down hard, in crit or unconscious (`INCAPACITATED_IGNORING`, `IS_UNCONSCIOUS_OR_CRIT`). The body is not told it cannot use its hands; it is told its PDA is broken. `handle_tool_call` refuses a body that cannot sense, and one being walked out by the arm, but a body that is in cuffs in a brig cell, and not held by the arm, gets through to here.
- `last_text` is a one-second wait between messages, started by every message sent. A second message in the same second is refused. `resend_unsent` sends kept messages three seconds apart, so a fresh `tool_message` in between can meet the wait.

What follows from the wrong reason:

1. The brain is told the PDA is not working. The Chief Engineer's and the desk's plans take a message that "would not send" to mean the word must go on foot (`chiefengineer.ts:729`, `desk.ts:1127`). A cuffed body is sent walking, and refused again.
2. The message is kept and sent again on its own, up to eight minutes later, when the cuffs are off. By then its content can be stale: "I am shut in the brig, let me out" arrives after the body is out, or a crate notice arrives twice.
3. The notice owed for it was struck off at the first try (`tool_message` does that before sending), so the brain has nothing left to say it is still owed.

A concrete case:

1. A cargo technician is arrested and put in a cell in cuffs. Its window still owes the Head of Personnel a "waiting" notice and sends `message`.
2. `can_perform_action` fails on the cuffs. The body is told "Your PDA would not send the message. You will try it again when your PDA is working." The game log says the PDA would not send.
3. Four minutes later the officer takes the cuffs off. Twenty seconds after that `resend_unsent` sends the reminder, though the body has said nothing new.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:719`, in `tool_message`:

    	if(!own_messenger.send_message_signal(body, text, list(target)))
    		// Kept, and tried again until it goes. ...
    		...
    		action_result(CREW_TOOL_MESSAGE, FALSE, "Your PDA would not send the message. You will try it again when your PDA is working.")

and the same test in `resend_unsent` at :775, where any FALSE stops the queue ("Still not working: the rest will not go either").

`code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:577` and :580, quoted above, and :657, `COOLDOWN_START(src, last_text, 1 SECONDS)`.

## How it was found

Read from the code, with `send_message_signal` and `/mob/living/can_perform_action` read. Not seen in a round.

## How to fix it

1. In `tool_message`, before sending, test `body.can_perform_action(own_messenger.computer, ALLOW_RESTING | ALLOW_PAI)`. If it fails, answer "You cannot use your PDA just now: your hands are not free." (or "you are down") and do not keep the message. Put the notice back if one was struck (or strike notices only after a send that went, as SUP-07's fix moves it anyway).
2. If `!COOLDOWN_FINISHED(own_messenger, last_text)`, wait the second out: `addtimer` a retry of the same call in 1.1 seconds instead of keeping it as unsent.
3. Only then call `send_message_signal`, and keep the "would not send ... when your PDA is working" answer for what is left, which is the network.
4. In `resend_unsent`, make the same two tests first; a body that cannot use its hands keeps its queue but does not count the time against the eight minutes, or drops it, as the owner prefers. Question for the owner: should a message that could not be sent while the body was cuffed be sent at all once it is free?

## How to test the fix

Compile. The simulator's stand-in PDA always sends (SIM-01), so this needs the server. In a round, cuff a crew technician that owes a notice and check `game.log`: it should not say "its PDA would not send it", and no "sent ... the PDA message that would not go before" line should follow when the cuffs come off.
