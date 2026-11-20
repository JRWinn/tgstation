---
id: HOLE-15
title: The crew never see an emote, a point, or any of the game's "X does Y" lines, so a player who points at a mess, waves someone over or nods yes is not seen at all
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/mob/mob.dm:296, code/modules/llm_crew/crew_npc_senses.dm:380, code/modules/mob/emote.dm:40, code/modules/mob/living/emote.dm:335, code/datums/components/pet_commands/pet_command.dm:44
fix: When a person comes into view register for COMSIG_MOB_EMOTE and COMSIG_MOVABLE_POINTED on them, and emit a seen sense event with what they did and at what, for the window to keep as context and for the readers to use
---

## What is wrong

A crew body has two senses for other people: it sees who is in view (`look_around`, which gives each person's name, job, place, distance and a few flags), and it hears speech (`on_pre_hear`). It sees nothing anyone *does*. In SS13 a great deal is said that way:

- **Pointing.** Shift-middle-click, or `*point`, puts "Alex points at the blood." in the chat of everyone in view. Players point at the mess they want cleaned, at the door they want opened, at the person they mean when they say "arrest him".
- **Emotes.** `*nod`, `*shake`, `*wave`, `*salute`, and the free-text `*me`. A player asked "Shall I order it?" who nods has said yes.
- **The game's own lines of what someone is doing**: "Bob is trying to put handcuffs on Alex!", "Bob starts prying open the airlock.", "Bob drops the toolbox.", "Bob shoves Alex!".

All three go to people by `visible_message` (or `audible_message`), and both skip any mob with no client before doing anything:

	for(var/mob/hearing_mob as anything in hearers)
		if(!hearing_mob?.client)
			continue

A crew body has no client, so it is passed over. Nothing in `code/modules/llm_crew/` listens for emotes or points on anyone else: a search for `COMSIG_MOB_EMOTE`, `COMSIG_MOVABLE_POINTED` and `visible_message` in the crew's code finds only the crew's own `visible_message` calls (their knock, their arrests).

On the hearing side `on_pre_hear` drops even a say-emote on purpose ("Custom emotes are not speech"), and nothing picks it up elsewhere.

So, today:

1. **A player points through a doorway at a mess in the next room and says "clean that".** The janitor hears "clean that" and nothing else: no room is named. `takeToldWork` (`tasks.ts:200`) needs `where` to be a room the NPC knows, so the order can only be taken if the model happens to fill in a room, and the one it can know of is the room it is standing in. There, `takeToldWork` takes nothing it does not already see for itself (`where === brain.location && !findTask(...)` returns null). So the mess pointed at is cleaned only if the janitor would have got to it anyway. (Pointing at a mess in the same room matters less: the janitor sees it and cleans it in its own order.)
2. **A yes-or-no question put to a player face to face is answered with a nod.** Players answer with `*nod` or `*shake` as often as with words. The model's own "Shall I start with the Bar?" nodded at is never known to have been answered, and its next line asks again. Where code asks, the nod is no answer: the keeper of a room asking a workmate whether they sent for a stranger (`jobs/guarding.ts`, the `voucher` branch) asks again, and when the wait is out takes the stranger as sent for, whatever the head shake said.
3. **"Arrest him", with a point.** The words name nobody. Nobody is arrested, which is the right outcome by accident, and the Head of Security is never told who was meant.
4. **"Bob is trying to put handcuffs on Alex!"** in front of the officer, where Alex is a crew janitor. The officer sees two people standing near each other. (HOLE-11 is about the crew member being cuffed not resisting; this is about the onlookers not seeing it.)

The pets of the base game do better: `pet_command.dm` registers `COMSIG_MOVABLE_POINTED` on its owner and a dog fetches what its owner points at.

## Where

`code/modules/mob/mob.dm:296`, in `/atom/proc/visible_message`, shown above. `audible_message` at `mob.dm:358` has the same shape.

`code/modules/mob/emote.dm:39`, the signal every emote sends on the one who made it, after it has run:

	emote.run_emote(src, param, type_override, intentional)
	SEND_SIGNAL(src, COMSIG_MOB_EMOTE, emote, act, type_override, message, intentional)

`code/modules/mob/living/emote.dm:335`, pointing is an emote with a target:

	/datum/emote/living/point
		key = "point"
		key_third_person = "points"
		message = "points."
		message_param = "points at %t."

`code/datums/components/pet_commands/pet_command.dm:44`, the base game's own listener for pointing:

	RegisterSignal(tamer, COMSIG_MOVABLE_POINTED, PROC_REF(point_on_target))

`code/modules/llm_crew/crew_npc_senses.dm:389`:

	var/list/message_mods = hearing_args[HEARING_MESSAGE_MODE] || list()
	// Custom emotes are not speech.
	if(message_mods[MODE_CUSTOM_SAY_ERASE_INPUT])
		return

## How it was found

Read from the code: `visible_message` and `show_message` (`mob.dm:227`, which also returns at once with no client), `/mob/proc/emote`, the point emote, and a search of the crew's server code for any listener. Not seen in a round, since the only human aboard has been the Captain and no round log notes a point or an emote.

## How to fix it

1. Server, `crew_npc_senses.dm`: keep a list of the people whose signals this body is registered on (`watched_people`, weak references). In `look_around`, for each person newly in view, `RegisterSignal(person, COMSIG_MOVABLE_POINTED, PROC_REF(on_seen_point))` and `RegisterSignal(person, COMSIG_MOB_EMOTE, PROC_REF(on_seen_emote))`. When a person drops out of `last_seen_at` (the loop at the end of `look_around`), unregister both. Unregister all in `stop_senses`. A body may be registered on by several crew; each crew controller registers its own handlers, which signals allow.
2. `on_seen_point(person, atom/pointed_at)`: if the body can sense, is not blind, and the person and the thing are both still in `oview` of the body, emit a new sense kind `CREW_SENSE_SEEN` with text "Alex points at the blood in the Bar." and details `doer`, `handle`, `did: "points"`, `at` (the thing's name, and for a person their handle, for a mess its kind and room).
3. `on_seen_emote(person, datum/emote/emote, act, type_override, message, intentional)`: only `intentional` emotes, only visible ones the body can see (`emote.emote_type & EMOTE_VISIBLE` and the person in `oview`) or audible ones within hearing range. Emit `CREW_SENSE_SEEN` with "Alex nods." Use the emote's third-person text, not `message` when that is null.
4. Window, `brain.ts`: add `seen` to the event kinds. Keep it in the talk log as context the way speech is kept, so that the model asked about "clean that" next sees "Alex points at the blood in the Bar." on the line before. Do not wake the model for it alone (a point with no words is not a question), except a point at the NPC itself.
5. Readers: the two cheap uses, both code only. Where a line from a superior names no room (`takeToldWork` and the job readers that call it), take the room of the thing that speaker pointed at within the last ten seconds. In the yes/no readers (the Quartermaster asking the Captain, a keeper asking a stranger's business), a nod or shake from the person asked counts as yes or no.
6. The game's own "X is trying to put handcuffs on Y!" lines are not emotes and stay unseen after this. Seeing those wants a base-game change (an opt-in signal in `visible_message` for mobs with no client), which is the owner's call since it touches a base file.

Keep to the prompt budget: a seen line is a short line in the talk log, which is already trimmed by count.

## How to test the fix

- Simulator: add a `point` and an `emote` the scenario can make a player do (`tools/llm_crew/sim.ts` sends a `seen` event), and a case where the Captain points at blood in the Bar and says "clean that": pass when the janitor takes a task for the Bar.
- DM compile, and the type check.
- In a round: stand by a janitor, point at a mess, say "clean that". Grep `game.log` for the janitor taking the task, and the Crew Brain window's event list for "points at".
