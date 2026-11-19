---
id: TRUST-02
title: A PDA message with a made-up sender, from the message monitor or a virus disk, is taken as from the Captain or any head it names
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_cargo.dm:803, code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:669, code/game/machinery/telecomms/computers/message.dm:241, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:579
fix: Have on_pda_message say whether the message came from a real PDA that can be answered, and have the window take no warrant, pardon, approval, order or summons from one that cannot
---

## What is wrong

See also: HOLE-01. That finding is about the job text on a card, and its fix (5b) is to look the sender's name up on the crew manifest. This one is a way to send a PDA message as **any name and any job at all**, with no card, which a manifest check does not catch, and which the server can tell apart.

The game has two ways to send a PDA message whose sender is typed in:

- The message monitor console: with the decryption key (a paper printed beside the console at round start), "Send fake message" asks "What is the sender's name?" and "What is the sender's job?" and sends it to any PDA (`code/game/machinery/telecomms/computers/message.dm:241`).
- A traitor's virus disk (Detomatix) sends a "rigged" message with a typed name and job (`code/modules/modular_computers/computers/item/disks/virus_disk.dm:79`).

The receiving PDA treats both as from a "fake user": `receive_message` sets `is_fake_user` when the signal has no `ref` or is rigged, and passes the typed name and job on the same signal our body listens to (`messenger_program.dm:669-702`). `on_pda_message` hands them to the window as `speaker` and `job`, with nothing to say they were typed in. The window then reads the message exactly as it would one from that person's own PDA: `readSummons`, `readPickup`, `readWanted`, then the job's `readsMessage` (`deskTakes`, the Quartermaster's `readAnswer` and `takeOrder`, the meeting order).

So whoever has the monitor key can, from the telecomms room:

1. Send the Head of Security "Warrant for Jordan Vale, for theft, 15 minutes", as "<the real Captain's name>", job "Captain". `deskTakes` gets `fromJob` "Captain": `declarer` and `captain` are true, so the warrant is taken, and a warrant on a head is allowed. The officer is sent to baton and cuff Jordan Vale. The reply goes by PDA to the real Captain's name, so the real Captain gets "Warrant taken: ..." for an order they never gave, but nothing undoes it.
2. Send "Pardon Bob Hale" as the Captain: anyone in a cell is let out.
3. Answer the Quartermaster's "Captain, order 7: ... Yes or no?" with "Yes" as the Captain.
4. Send a janitor "Collect crate #1779 from cargo" as its head, or call a staff meeting as any head.

With the real Captain's name, the manifest check proposed in HOLE-01 passes, and so does any check that the name is on the PDA list.

A player can tell the difference: a message from a fake user opens a conversation with no contact behind it, and a rigged one has a reply link that blows up. The PDA list shows the real person's PDA as a separate contact. The server knows it outright.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:803`, `on_pda_message`:

    /datum/ai_controller/crew_npc/proc/on_pda_message(obj/item/modular_computer/computer, datum/signal/subspace/messaging/tablet_message/signal, sender_job, sender_name)
    	SIGNAL_HANDLER
    	if(!can_sense() || get_atom_on_turf(computer) != pawn)
    		return
    	var/message = html_decode("[signal.data["message"]]")
    	var/sender = "[sender_name || "Someone"]"
    	emit_sense(CREW_SENSE_PDA_MESSAGE, "Your PDA buzzes with a message from [sender][sender_job ? ", [sender_job]" : ""]: \"[message]\"", list(
    		"speaker" = sender,
    		"job" = "[sender_job]",
    		"message" = message,
    	))

`code/modules/modular_computers/file_system/programs/messenger/messenger_program.dm:667` (base game):

    	var/is_rigged = signal.data["rigged"]
    	var/is_automated = signal.data["automated"]
    	var/is_fake_user = is_rigged || is_automated || isnull(signal.data["ref"])
    	var/fake_name = is_fake_user ? signal.data["fakename"] : null
    	var/fake_job = is_fake_user ? signal.data["fakejob"] : null
    	...
    	SEND_SIGNAL(computer, COMSIG_MODULAR_PDA_MESSAGE_RECEIVED, signal, fake_job || sender_messenger?.computer.saved_job , sender_name)

`code/game/machinery/telecomms/computers/message.dm:274`:

    			var/datum/signal/subspace/messaging/tablet_message/signal = new(src, list(
    				"fakename" = "[sender]",
    				"fakejob" = "[job]",

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:579`, where every PDA message is read by `details.job` alone.

## How it was found

Read from the code, base game and ours. Not seen in a round, and the message monitor was not used.

## How to fix it

1. In `on_pda_message`, work out what a person holding the PDA would see: `var/answerable = !isnull(signal.data["ref"]) && !signal.data["rigged"] && !signal.data["automated"]`. Send it in the details as `"answerable" = answerable`. Add `answerable?: boolean` to the PDA message details in `types.ts`.
2. Also pass, for an answerable one, the sender's PDA as the PDA list shows it: the name and job are already the sender PDA's own, so nothing more is needed there.
3. In `brain.ts`, where PDA messages are read (line 579 on): for a message with `answerable === false`, pass `theirJob` as `''` to `readSummons`, `readPickup`, `readWanted` and `readsMessage`. Every rank test in the window then fails as it does for a stranger, and the message is still in the report for the model to talk about.
4. The prompt should say so, since the model reads the line: in `describeEvent`, add "(from no PDA you can reply to)" to such a message, so that it does not answer as though the Captain wrote.
5. Keep: automated messages (security citations, the officer announcement) were never orders and stay ignored.

This does not stop a forged card in a real PDA (HOLE-01). Both are needed.

## How to test the fix

- Server compile.
- A simulator scenario where the sim sends the Head of Security a `pda_message` with `speaker` the Captain's name, `job` "Captain", `answerable: false`, and the words of a warrant: no warrant is taken (`brain.desk.warrants` empty) and no `message` back to the Captain. The same with `answerable: true` takes it.
- In a round: from the message monitor, send the Head of Security a warrant as the Captain. `pda.log` should show no "Warrant taken" message from the Head of Security, and `game.log` no arrest.
