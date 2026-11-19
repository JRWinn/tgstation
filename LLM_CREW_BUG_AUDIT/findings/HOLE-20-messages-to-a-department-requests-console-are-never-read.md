---
id: HOLE-20
title: A message sent to Janitorial, Security or Engineering at a wall requests console is never read, the console says aloud only who it is from, and the crew take that for machine chatter
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/game/machinery/requests_console.dm:450, code/datums/request_message.dm:36, code/modules/llm_crew/crew_npc_senses.dm:418, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:957
fix: When a crew body hears its own department's requests console announce a message, have it go to the console, read the newest message the way its screen shows it, and hand the text to the same readers a PDA message goes to
---

## What is wrong

Every department on a station has a requests console on the wall, and players use them to ask a department for help: "Request Assistance" to Janitorial, "there is blood all over Medbay"; an emergency call to Security; "the Bar's lights are out" to Engineering. MetaStation has one for Janitorial (in the Custodial Closet), six for Security, two for Engineering, one each for the Bridge and the Bar (counted from the `department = "..."` lines in `_maps/map_files/MetaStation/MetaStation.dmm`).

When a message comes in, the receiving console lights up, beeps, and says aloud only who sent it:

	if(!silent)
		playsound(src, 'sound/machines/beep/twobeep_high.ogg', 50, TRUE)
		say(new_message.get_alert())

and `get_alert` is `"Message from [sender_department][authenticated]"`. The text is on the console's screen, for whoever walks up and reads it. For some departments the console also notifies a radio channel, which the crew do not hear.

What a crew body makes of it:

1. It hears "Message from Medbay" if it is in earshot, as speech from a `device` (`on_pre_hear`: the console is not living, so `source` is "device").
2. The window keeps device speech as context and never acts on it: `shouldWake` returns false for any speech whose source is not a person ("Machines chatter constantly; their words are kept for context only"), and no job reader looks at device lines.
3. Nothing in `code/modules/llm_crew/` knows what a requests console is. A search for `requests_console` finds nothing.

So the game's standard way of asking a department for something does not reach the crew, though the janitor's own console is on the wall of the room the janitors start in.

One concrete case. A player finds vomit all over Medbay. On any server he would press the Medbay requests console's "Request Assistance", pick Janitorial and type "vomit in medbay". The console in the Custodial Closet beeps and says "Message from Medbay." A janitor standing beside it hears that, as a machine talking, and goes back to the hallway it was mopping. The player waits. Nobody tells him the janitors never saw it; there is nothing to tell.

This is beside HOLE-19 (the supply request console, a different machine with its own list).

## Where

`code/game/machinery/requests_console.dm:450`, `create_message`, the receiving end (quoted above at its `say`).

`code/datums/request_message.dm:36`:

	/datum/request_message/proc/get_alert()
		...
		return "Message from [sender_department][authenticated]"

`code/modules/llm_crew/crew_npc_senses.dm:409`, how the console's voice is filed:

	var/mob/living/living_speaker = isliving(speaker) ? speaker : null
	var/someone = living_speaker && (ishuman(living_speaker) || issilicon(living_speaker) || living_speaker.client)
	...
		"source" = someone ? "person" : (living_speaker ? "animal" : "device"),

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:957`, in `shouldWake`:

	case 'speech_heard':
	  // Machines chatter constantly; their words are kept for context only.
	  if (event.details.source !== 'person') {
	    return false;
	  }

## How it was found

Read from the code: the requests console's send and receive procs, the request message datum, the crew's hearing, and the window's wake rule. Counted the consoles on MetaStation with grep. Not seen in a round.

## How to fix it

1. Server: pass the speaker's type along for device speech. In `on_pre_hear`, when the speaker is a `/obj/machinery/requests_console`, add `console_department` (its `department`) and `console_ref` handle to the event details. That is no more than a person standing there knows: the console is on the wall in front of them and says whose it is.
2. A new tool, `read_console`, that walks the body to a requests console it knows (by handle, or the one of its department's rooms it last heard), and at the console returns the newest unread messages as the screen shows them: sender department, priority, text. Mark them read the way the console's own "read" does, so the light goes off. Each message becomes a sense event of a new kind, `console_message`, with `speaker` set to the sender department.
3. Window: a body that hears its own department's console (`console_department` matches its job's department: `Janitorial` for janitors, `Security` for security, `Engineering` for engineering, `Bridge` for heads) takes a task to read it, urgency `asked`. When the message comes back, hand its text to the same readers a PDA message goes to (`readsMessage` for the job), with the sender being the department rather than a person. For the janitor that is the existing mess-call reader, so "vomit in medbay" becomes a task in Medbay.
4. A message the readers make nothing of is left on the console, read; the model is not woken for it.
5. Owner's question: should a crew member answer the sender, by walking to the sender department's console and replying, or by PDA to whoever is in that department? The base console lets a reply go back to the sender department.

## How to test the fix

- Simulator: a `console_message` event in a janitor scenario, "Request Assistance: vomit in medbay". Pass when the janitor takes a task for Medbay.
- DM compile, and the type check.
- In a round: from the Medbay console, send Janitorial "vomit in medbay". Grep `game.log` for the janitor reading the Janitorial console and walking to Medbay.
