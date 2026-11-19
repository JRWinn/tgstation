---
id: TRUST-08
title: A PDA message the crew send by name goes to the first PDA with that name, so a second PDA renamed to a head's name takes all the head's word
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_cargo.dm:741, code/modules/llm_crew/crew_npc_cargo.dm:708, code/modules/modular_computers/computers/item/computer.dm:810
fix: Have messenger_named pick, among the PDAs aboard with that name, the one whose job the window expects, and refuse with a reason when two fit
---

## What is wrong

Every PDA message a crew member sends names its addressee by name only (`tool_message(person_name, text)`). The server sends it to the first PDA in `GLOB.pda_messengers` whose `saved_identification` is that name, ignoring the job, and ignoring whether the PDA is even aboard:

    for(var/messenger_ref in GLOB.pda_messengers)
    	var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
    	if(candidate == own_messenger || isnull(candidate.computer))
    		continue
    	if(LOWER_TEXT(candidate.computer.saved_identification) == wanted)
    		return candidate

A PDA's name is whatever the last ID card put in it said (`imprint_id`, `computer.dm:810`: `saved_identification = name || stored_id?.registered_name`). An agent card takes any name; the Head of Personnel's console can rename a card. `GLOB.pda_messengers` is in the order the PDAs were made, and the crew NPCs are spawned ten seconds into the round, after every player who joined at the start. So a player's PDA, renamed to a crew NPC's name, comes **before** that NPC's own PDA in the list.

From then on every PDA message any crew member sends that NPC goes to the player instead. The sender's window is told "You send Ray Hoss a PDA message." and goes on as though it was delivered.

One concrete case:

1. The crew's Head of Security is the NPC Ray Hoss. A traitor who joined at round start sets an agent card to "Ray Hoss", job "Assistant", puts it in their own PDA and presses "Imprint ID".
2. The officer catches someone and sends "Ray, Bob Hale is in Cell 2, 5 minutes." `messenger_named("ray hoss")` finds the traitor's PDA first. The traitor gets it; the Head of Security never does, and its list still has Bob Hale on it.
3. The same for every sighting, every forcing reply, each head's "I have the notice" back to the desk's PDA list, and every crate notice to a head. The heads' lists and the Captain's copies stop matching what happened, and nothing in either window can tell.

The same happens with no foul play when two people aboard share a name (a dead crewman's PDA lying in a locker, or a second player with the same random name), and with a PDA on another z-level: `messenger_named`, unlike `people_on_pda`, does not check the PDA is on a station level.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:741`, `messenger_named`, quoted above.

`code/modules/llm_crew/crew_npc_cargo.dm:708`, in `tool_message`:

    var/datum/computer_file/program/messenger/target = messenger_named(wanted, own_messenger)

`resend_unsent` uses `messenger_named` the same way.

## How it was found

Read from the code, ours and the base game's. Not seen in a round.

## How to fix it

1. Let the window say which person it means, the way the PDA list shows them: `tool_message` takes an optional `job` along with `person`. The window has it for every name it sends to (`pdaPeople` gives name and job), so `runTool` adds it.
2. `messenger_named(wanted, own_messenger, wanted_job)`: collect every PDA on a station level (the same test `people_on_pda` uses) whose name matches. If one, that one. If more than one, the one whose `saved_job` equals `wanted_job`. If that still leaves more than one, or none, do not send: `action_result(CREW_TOOL_MESSAGE, FALSE, "Your PDA lists more than one [name]. You cannot tell which is meant.", list("ambiguous" = TRUE))`. A player sees the same two entries in their messenger and would have to choose.
3. The window, on `ambiguous`, should treat the message as not sent (the driver already handles a failed `message`).
4. The same check in `resend_unsent`, with the job kept in `unsent_messages`.

This does not stop a player who copies both the name and the job (an agent card set to "Ray Hoss, Head of Security"): then step 2 refuses, and at least the crew stop sending to the wrong one and the logs show why. Telling the real one from a copy is HOLE-01's part.

## How to test the fix

- Server compile.
- In a round, with an admin: spawn the test crew, set a second PDA's name to the Head of Security's with View Variables, and have the officer send a word. `game.log` should show the refusal line, not "was told by its brain to PDA".
- `pda.log` of a normal round: every crew message still goes out as before.
