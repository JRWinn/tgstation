---
id: PLAY-15
title: The Sent from my PDA ending the game adds to some PDA messages is read as part of them, so a warrant is declared on Pun Pun Sent from
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 06c92d97a5c
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_cargo.dm:1055, code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:605, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:470
fix: In on_pda_message strip a trailing Sent from my PDA, UNIX Laptop, Desktop or crystal PDA from the message before it is passed on as a sense
---

## What is wrong

The base game adds an ending to some PDA messages on its own: "Sent from my PDA" (or "Sent from my UNIX Laptop", "Sent from my Desktop", "Sent from my crystal PDA"). The chance grows with the sender's age, about 0.25% at 25 and 10% at 85. Nobody typed those words. Our crew are handed the message with the ending in it, and every reader takes it as part of what was said.

In the round below the Captain sent the Head of Security "Put a warrant on Pun Pun". The game sent it as "Put a warrant on Pun Pun Sent from my PDA". The warrant reader cut the name at four words, so the warrant was on "Pun Pun Sent from". Then:

1. 16:38:03 `pda.log`: "Captain, I have that: a warrant for Pun Pun Sent from. 5 minutes. I do not know that name yet."
2. 16:38:06 to 16:38:25: three "Security notice. Wanted: Pun Pun Sent from" PDAs to the heads, and at 16:38:15 "Kaleb, warrant: Pun Pun Sent from. Bring them in".
3. 16:39:27, 16:48:07, 16:49:03, 16:50:35: every staff meeting said aloud "Security is looking for Pun Pun Sent from".
4. 16:43:05 the Captain sent the officer "Pun Pun is in the Starboard primary hallway". The officer's warrant was on another name, so nothing was done with it: no answer, and at 16:44:11 its brain still says "There is a warrant on Pun Pun Sent from, and you have no fresh word of where they are", and it went on walking the hallways for him until the round ended.

The same ending can land on an order to a head ("order 2 crates of paper Sent from my PDA"), a room named last in a line, or a name answered by a keeper, wherever a reader takes the last words of a message.

## Where

`code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:605`, in the base messenger (not ours, but what our code reads):

    	if (computer && prob(sent_prob))
    		message = "[message] [computer.get_messenger_ending()]"

`code/modules/llm_crew/crew_npc_cargo.dm:1055`, in `on_pda_message`, which passes the message on as it came:

    	var/message = html_decode("[signal.data["message"]]")
    	var/sender = "[sender_name || "Someone"]"

and at 1064:

    	emit_sense(CREW_SENSE_PDA_MESSAGE, "Your PDA buzzes with a message from [sender][sender_job ? ", [sender_job]" : ""]: \"[message]\"", list(
    		"speaker" = sender,
    		"job" = "[sender_job]",
    		"message" = message,
    	))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:470`, in `readWarrant`, for a name it does not know: nothing in the cut stops at "Sent" or "from", so up to four words are taken:

    const raw = cut === -1 ? rest : rest.slice(0, cut);
    const every = raw.split(/\s+/);
    const words = every.slice(0, 4);
    name = tidyName(words.join(' '));

`grep -rn "Sent from" code/modules/llm_crew tgui/packages/tgui/interfaces/CrewBrain` finds nothing: no reader strips it.

## How it was found

Seen in a round log, `data/logs/2026/11/20/round-10.31.34`, `pda.log` 16:38:03: "Put a warrant on Pun Pun Sent from my PDA". The second warrant, sent 16 seconds later without the ending ("Put a warrant on Nehemiah Knapp"), was read right. The ending was then found in the base messenger. Checked on master: `on_pda_message` and `readWarrant` are as quoted. Not checked: every other reader; they were not tried with the ending.

## How to fix it

1. In `on_pda_message` (`crew_npc_cargo.dm`), after the `html_decode`, cut the ending off the end of the message: the four strings are what `get_messenger_ending()` returns on `/obj/item/modular_computer`, `/laptop`, `/processor` and `/pda/clear`. Best is to ask the sending computer for its own ending (`signal.source` is the sender's computer, if it is a `/obj/item/modular_computer`, call `get_messenger_ending()` on it) and strip exactly that, with a space before it, only at the very end. Fall back to a regex on `Sent from my [^.!?]*$` if the source is gone.
2. Do the same in the missed-messages path (`keep_missed_pda` in `crew_npc_senses.dm`), which is fed from the same variable, so step 1 before both covers it.
3. This is not a cheat: a player reading the message knows the ending is not part of it.
4. Separately, and smaller: SECT-03's fix proposed preferring a run of capitalised words for an unknown name. That would not have helped here ("Sent" has a capital), so step 1 is the fix.

## How to test the fix

- Server compile (`dm.exe -DCBT` on a copy of the .dme, as README says).
- In a round, as an old Captain or with a PDA message sent by an admin with the ending typed in: "Put a warrant on Pun Pun Sent from my PDA" should give "a warrant for Pun Pun" in `pda.log`.
- Next round, grep `pda.log` for "Sent from" in any crew NPC's message: there should be none.
