---
id: TRUST-08
title: A PDA message the crew send by name goes to the first PDA with that name, so a second PDA renamed to a head's name takes all the head's word
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_cargo.dm:741, code/modules/llm_crew/crew_npc_cargo.dm:708, code/modules/modular_computers/computers/item/computer.dm:810
fix: Have messenger_named collect every visible PDA with that name and, when there is more than one, pick the one whose job the window names (it has it from pda_people), else the one aboard, else refuse as ambiguous
---

## What is wrong

Every PDA message a crew member sends names its addressee by name only (`tool_message(person_name, text)`). The server sends it to the first PDA in `GLOB.pda_messengers` whose `saved_identification` is that name, ignoring the job, and ignoring whether the PDA is even aboard:

    for(var/messenger_ref in GLOB.pda_messengers)
    	var/datum/computer_file/program/messenger/candidate = GLOB.pda_messengers[messenger_ref]
    	if(candidate == own_messenger || isnull(candidate.computer))
    		continue
    	if(LOWER_TEXT(candidate.computer.saved_identification) == wanted)
    		return candidate

A PDA's name is whatever the last ID card put in it said (`imprint_id`, `computer.dm:810`: `saved_identification = name || stored_id?.registered_name`). An agent card takes any name; the Head of Personnel's console can rename a card. `GLOB.pda_messengers` is in the order the PDAs were first imprinted (`add_messenger`, `messenger_data.dm:9`, on `COMSIG_MODULAR_PDA_IMPRINT_UPDATED`); imprinting again with a new name does not move a PDA in it, and the crew NPCs are spawned ten seconds into the round, after every player who joined at the start. So a player's PDA, renamed to a crew NPC's name, comes **before** that NPC's own PDA in the list.

From then on every PDA message any crew member sends that NPC goes to the player instead. The sender's window is told "You send Ray Hoss a PDA message." and goes on as though it was delivered.

One concrete case:

1. The crew's Head of Security is the NPC Ray Hoss. A traitor who joined at round start sets an agent card to "Ray Hoss", job "Assistant", puts it in their own PDA and presses "Imprint ID".
2. The officer catches someone and sends "Ray, Bob Hale is in Cell 2, 5 minutes." `messenger_named("ray hoss")` finds the traitor's PDA first. The traitor gets it; the Head of Security never does, and its list still has Bob Hale on it.
3. The same for every sighting, every forcing reply, each head's "I have the notice" back to the desk's PDA list, and every crate notice to a head. The heads' lists and the Captain's copies stop matching what happened, and nothing in either window can tell.

The same happens with no foul play when two people share a name (a second player with the same random name, or a PDA on another z-level: `messenger_named`, unlike `people_on_pda`, does not check the PDA is on a station level). A PDA marked `invisible`, which a player's messenger does not list (`messenger_program.dm:96`), can also be picked.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:741`, `messenger_named`, quoted above.

`code/modules/llm_crew/crew_npc_cargo.dm:708`, in `tool_message`:

    var/datum/computer_file/program/messenger/target = messenger_named(wanted, own_messenger)

`resend_unsent` uses `messenger_named` the same way.

## How it was found

Read from the code, ours and the base game's. Not seen in a round.

## How to fix it

1. Let the window say which person it means, the way the PDA list shows them: `tool_message` takes an optional `job` along with `person` (`crew_npc_tools.dm:113` passes `arguments["job"]`). The window has it for every name it got from `pdaPeople`, so the driver adds it where it builds a `message` act (`driver.ts` about lines 379, 393, 456) when it can find the name in `brain.pdaPeople`.
2. `messenger_named(wanted, own_messenger, wanted_job)`: collect every PDA whose name matches, skipping `invisible` ones as a player's list does. If one, that one, wherever it is: do not add the station-level test as a filter, because a player can message a miner off station and the crew can today. If more than one: keep those whose `saved_job` equals `wanted_job` (when given); if more than one still, keep those on a station level (the test `people_on_pda` uses). If exactly one is left, that one; else do not send: `action_result(CREW_TOOL_MESSAGE, FALSE, "Your PDA lists more than one [name]. You cannot tell which is meant.", list("ambiguous" = TRUE))`. A player sees the two entries in their messenger and would have to choose.
3. The window, on `ambiguous`, treats the message as not sent (the driver already handles a failed `message`; check the job then goes on foot or tells someone face to face, as it does for "cannot find that person").
4. The same in `resend_unsent`, with the job kept in `unsent_messages` beside `to`.

Step 2 alone, with no job passed, is small and server-only: it stops a renamed PDA taking the word silently, at the price of refusing while two share a name. Steps 1 and 3 let the crew still reach the right one. With all four the fix spans the server and the window, so effort is large by FORMAT.md, though it is under about 40 lines.

This does not stop a player who copies both the name and the job (an agent card set to "Ray Hoss, Head of Security"): then step 2 refuses, and at least the crew stop sending to the wrong one and the logs show why. Telling the real one from a copy is HOLE-01's part.

## How to test the fix

- Server compile.
- In a round, with an admin: spawn the test crew, set a second PDA's name to the Head of Security's with View Variables, and have the officer send a word. `game.log` should show the refusal line, not "was told by its brain to PDA".
- `pda.log` of a normal round: every crew message still goes out as before, including any to a shaft miner off station.

## Check

Checked by Opus 5.5. The quotes match the code today. `tool_message` (`crew_npc_cargo.dm:692`) takes only a name, and `crew_npc_tools.dm:113` passes only `person` and `text`. `messenger_named` returns the first entry of `GLOB.pda_messengers` whose `saved_identification` matches, with no job, station-level or `invisible` test. In the base game `add_messenger` (`messenger_data.dm:9`) adds a PDA once, when it is first imprinted, and returns early if it is already there, so a PDA renamed later keeps its early place; `imprint_id` (`computer.dm:810`) takes the name of the card in it, and an agent card can carry any name. The crew are spawned after the round starts (`CREW_NPC_AUTOSTART_DELAY`, `crew_npc_spawn.dm:70`), so a round-start player's PDA is ahead of theirs. The send then succeeds and the brain is told "You send Ray Hoss a PDA message." Nothing in the change log or plans covers it (the 2026-11-18 entry (25) on `messenger_named` is about resending). I changed the fix in one place: the write-up asked to filter by station level, which would stop the crew messaging anyone off station, a thing a player can do; it is now a tie-break only. Also added the `invisible` skip. Effort raised to large by FORMAT.md's rule for server-and-window changes. Severity stays medium: a renamed PDA takes foul play or a shared name. Not run.
