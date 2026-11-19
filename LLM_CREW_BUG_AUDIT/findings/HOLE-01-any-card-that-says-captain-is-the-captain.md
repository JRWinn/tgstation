---
id: HOLE-01
title: Anyone holding or wearing a card whose job text has "captain" in it is obeyed as the Captain
kind: bug
severity: high
effort: large
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:84, code/modules/llm_crew/crew_npc_senses.dm:191, code/modules/llm_crew/crew_npc_guarding.dm:45, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:353, code/modules/llm_crew/crew_npc_cargo.dm:803
fix: Have the server work out each person's rank from the card they wear and whether its name matches their face, send that as a field, and have the window go by that field and never by words in the job text
---

## What is wrong

The crew tell who someone is by the job text on an ID card, and by nothing else. Three things make that easy to abuse. The cheapest is point 2: it needs only a Captain's or head's card in the hand, picked up or stolen. Points 1 and 3 need a retyped card (the Head of Personnel's console, or a traitor's agent card) or a stolen worn one.

1. **The job text is matched as a piece of text, anywhere in the title.** `isJob` in `hierarchy.ts` is `title.includes(job)`. Every rank check in the window is built on it (`isHead`, `answersTo`, `departmentHeadedBy`), and the Captain checks are `/captain/i.test(job)`. A throwaway script run against the real file printed:

        "captain's lackey"      isHead true   HoS answersTo it true   Janitor answersTo it true
        "Not the Captain"       isHead true   HoS answersTo it true   Janitor answersTo it true
        "Acting Captain"        isHead true   ...
        "Chief Engineer's Mate" isHead true   headed Engineering
        "Quartermaster Fan Club" isHead true  headed Supply

   The job text on a card is free text in the base game. The ID console sets it to whatever is typed (`PRG_assign` in `code/modules/modular_computers/file_system/programs/card.dm:206`, `modified_id.assignment = new_asignment`), and an agent card asks its holder "What occupation would you like to put on this card?" (`code/game/objects/items/cards_ids.dm:1822`).

2. **The card in the hand counts before the card that is worn.** The server tells the window each person's job with `person.get_assignment(if_no_id = "", if_no_job = "")`. That proc's third argument defaults to `hand_first = TRUE` (`code/modules/mob/living/carbon/human/human_helpers.dm:9`). So a player who picks up the Captain's spare ID and simply holds it is "Captain" to every crew member that looks at them.

3. **Nothing checks that the card is that person's.** The name on the card is never compared with the face. An assistant wearing the Captain's spare ID with his face showing is seen as `name: "Bob Hale (as Captain)", job: "Captain"` (`get_visible_name` adds the "(as ...)"; the spare's `registered_name` is "Captain"), and the server sends `command: TRUE` and `superior: TRUE` for him, because `crew_npc_is_command` and `answers_to` look only at the worn card. Said aloud, this case happens to miss in `deskHears`: the speaker comes as his voice, "Bob Hale" (`get_voice` gives `real_name`), and `jobOf` looks for that exact name in view, finds no "Bob Hale" there, and falls back to his PDA's job. That is luck, not a guard. A traitor's agent card typed "Bob Hale" and "Captain" and worn gives `name: "Bob Hale", job: "Captain"` and is obeyed in full.

One concrete case. An assistant, Bob Hale, holds an agent card (or any card the Head of Personnel's console has typed "Captain" on). He walks up to the Head of Security and says "Arrest Jordan Vale for theft."

- `look_around` reports Bob as `job: "Captain"`.
- `deskHears` (`jobs/desk.ts:710`) looks his job up by his name among the people in view, gets "Captain", and calls `deskTakes(brain, "Bob Hale", "Captain", ...)`.
- `declarer = isHead("Captain")` is true and `captain` is true. The warrant is taken, read back, given to the officer, and Jordan Vale is batoned, cuffed and put in a cell.
- Bob can then pardon anyone (`if (!captain)` at `desk.ts:403` is the only bar), have the Quartermaster place any big purchase ("The Captain said yes"), order from cargo, and tell any head to hold a meeting.

The same holds by PDA. `on_pda_message` passes on the job the sending PDA shows, which is the job text of whatever card was last put in it. A PDA with a card reading "Captain" in it sends warrants and pardons from anywhere on the station.

The rule the code states is right: "It goes by the ID the person carries, never by anything they say" (`answers_to` in `crew_npc_guarding.dm`). What is missing is any care about which ID, and whose.

There are also two different tests in use. The server's `answers_to` goes by the card's trim or by `SSjob.get_job(card.assignment)` (an exact job name, worn card first), and sets `superior`. The window's own checks go by the loose text. A card reading "Acting Captain" is not `superior` to the server and is the Captain to the window. Which test a piece of behaviour uses depends on who wrote it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:84`:

    function isJob(title: string, job: string): boolean {
      return title.toLowerCase().includes(job.toLowerCase());
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:353`, in `deskTakes`:

      const declarer = isHead(fromJob);
      const captain = /captain/i.test(fromJob);

`code/modules/llm_crew/crew_npc_senses.dm:191`, in `look_around` (the same call is on line 197):

    people_in_view += list(list("handle" = handle_for(person), "name" = person.name, "job" = person.get_assignment(if_no_id = "", if_no_job = ""), ...

`code/modules/mob/living/carbon/human/human_helpers.dm:9` (base game):

    /mob/living/carbon/human/proc/get_assignment(if_no_id = "No id", if_no_job = "No job", hand_first = TRUE)
    	var/obj/item/card/id/id = get_idcard(hand_first)

`code/modules/llm_crew/crew_npc_guarding.dm:45`, `crew_npc_job_of`, which `answers_to` uses:

    	var/datum/id_trim/job/trim = card.trim
    	if(istype(trim) && istype(trim.job))
    		return trim.job
    	return SSjob.get_job(card.assignment)

`code/modules/llm_crew/crew_npc_cargo.dm:803`, `on_pda_message`: `sender_job` is passed straight through as `details["job"]`.

Other places that go by the loose text: `jobs/head.ts:209` (`captainName`), `jobs/cargo.ts:1874` and `:2190`, `jobs/quartermaster.ts:1460` and `:1623`, `jobs/officer.ts:378`, `jobs/meetings.ts:273`, `jobs/pickups.ts:86`, `jobs/wanted.ts:180`, `jobs/chiefengineer.ts:659`.

## How it was found

Read from the code. The table above is what `isHead` and `answersTo` returned when a script imported `hierarchy.ts` and called them. Not seen in a round: in every round so far the only human was the real Captain.

Not checked: whether a mask that hides the face changes `person.name` to the card's name in a way that makes point 3 worse or better. `get_assignment` returns "" for a body with `TRAIT_UNKNOWN_APPEARANCE`, so a fully hidden face has no job at all.

## How to fix it

0. Quick part, can go first on its own (small, server only): in `look_around` (`crew_npc_senses.dm`, both `get_assignment` calls) pass `hand_first = FALSE`. A player who examines someone sees the worn card, not one in a hand, so this is what a player could know. It closes point 2 at once. The same default is in `crew_npc_doors.dm:536` and `:574` (the janitor checks) and should change with it.
1. On the server, add one proc, say `crew_npc_rank_of(mob/living/carbon/human/person)`, in `crew_npc_guarding.dm`. It takes the card the person **wears** (`get_idcard(hand_first = FALSE)`, and only if it is in the ID slot or in a worn PDA, not in a hand). It returns a small list: `job` (the real job's title from the card's trim, or from `SSjob.get_job(card.assignment)`, else null), `captain` (TRUE for `/datum/job/captain`), `head` (the job has `JOB_HEAD_OF_STAFF`), `heads` (the department it heads, by name), and `card_is_theirs` (the card's `registered_name` equals `person.get_face_name("")`, or the face is hidden).
2. In `look_around`, send those fields with each person in view, and keep sending `job` as the plain text for the prompt and the window to show. A card that is not theirs gives `captain`, `head` and `superior` all FALSE, and a new flag `card_not_theirs`.
3. Make `answers_to` and `crew_npc_is_command` use the same proc, so the server has one test.
4. In the window, add to `PersonInView` the new fields, and change every check listed under "Where" to use them for people in view. `isHead(title)` and `answersTo(title, toTitle)` stay only for the PDA list, and there `isJob` must match the whole title or the title with a known prefix stripped ("Senior", "Acting" is the owner's call), not any substring. Anchor it: `^(senior |junior |lead )?<job>$`. (The comment on `isJob` names "Custodian", which `includes` never matched anyway, so nothing is lost there.) Where a check already reads the server's flag, as `cargo.ts:1874` and `:2190` do with `person.command || isHead(person.job)`, drop the `|| isHead(...)` half for people in view.
5. For PDA messages there is no face to check. Two ways. (a) Go on trusting the PDA's job text, exact match only: this is what a player does. (b) Have the server look the sender's name up on the crew manifest (`GLOB.manifest`, which every PDA can show, so it is something the body could read) and send `job` from there. I would take (b): a warrant by PDA is the most damaging order there is, and an agent card or a stolen card does not change the manifest. Note that the ID console does write the manifest when a retyped card is ejected (`GLOB.manifest.modify(registered_name, assignment, get_trim_assignment())`, `card.dm:94`), so go by the record's trim field, not its rank text, or a Head of Personnel's "Captain" title still passes.
   Keep in mind how the window finds a speaker: `jobOf` in `desk.ts` (and its copy in `arrests.ts`) matches the voice name against `person.name` in view exactly. Once `card_not_theirs` exists, look the speaker up by the face name (send `face_name` with each person in view, or strip a trailing " (as ...)"), or the person with a stolen card is never matched and the new flag is never read.
6. Tell the brain when a card is not its holder's: one line in the prompt cue ("X is wearing an ID that is not theirs"), so that what it says is true, and security can be told. What security does about it is for the owner.

Questions for the owner:
- Should an "Acting Captain", made so by the Head of Personnel's console, be obeyed? Today the window says yes and the server says no.
- Should a card in the hand count for anything (showing a card to prove who you are)?
- With two Captains aboard, whose word stands when they differ? Today both are obeyed and the last order wins. Reports go to whichever the PDA lists first (`captainName`).

## How to test the fix

- Add cases to `tools/llm_crew/security.ts`: a warrant declared aloud by someone whose `job` is "Captain's lackey", by someone with `card_not_theirs`, and by PDA from a name the manifest does not list as Captain. Each must get `REFUSALS.notDeclarer`.
- A table for `isJob`: "Janitor" and "Senior Janitor" match Janitor, "Captain's lackey" and "Not the Captain" do not match Captain.
- Server compile. Then in a round: hold the Captain's spare ID as an assistant and say a warrant to the Head of Security. `game.log` must show the refusal line said, and no "arrest" tool call. Then wear the spare ID with the face showing: the Brain window must show that person with `card_not_theirs`, and a warrant said aloud must still be refused (this checks the speaker lookup by face name).
- The real Captain, wearing their own card, must still be obeyed aloud and by PDA: run the existing cases in `tools/llm_crew/security.ts`, and `sim.ts quiet warrant`, `pardon` and `nohos` a few times each, unchanged. The sim's people in view will need the new fields set for the Captain, or every one of those scenarios will be refused.

## Check

Confirmed. Every quote matches the code today: `isJob` (`hierarchy.ts:84`), `deskTakes` (`desk.ts:353`, `:354`, `:403`), both `get_assignment` calls in `look_around` (`crew_npc_senses.dm:191`, `:197`), `crew_npc_job_of` and `answers_to` (`crew_npc_guarding.dm:45`, `:59`), `on_pda_message` (`crew_npc_cargo.dm:803`), and the other places listed under "Where".

Base game read: `get_assignment` defaults `hand_first = TRUE` and `/mob/living/get_idcard` looks at both hands first, so a held card wins over the worn one (`human_helpers.dm:9`, `living.dm:633`). `get_visible_name` gives "Face (as IDName)" when the worn card is not theirs (`human_helpers.dm:65`). `get_voice` gives `real_name` (`human_say.dm:32`), and the hear sense sends that as `speaker` (`crew_npc_senses.dm:404`). `PRG_assign` writes free text (`card.dm:206`); the agent card prompt is at `cards_ids.dm:1822`; the spare ID is `registered_name = "Captain"` with the captain trim (`cards_ids.dm:1267`). The messenger passes the sending PDA's `saved_job` (`messenger_program.dm:702`).

Traced: `deskHears` -> `jobOf` (`desk.ts:132`) finds the speaker in view by exact name and takes that job. With a Captain's card held in the hand and his own card worn, the name is his own and the job is "Captain", so `deskTakes` sets `declarer` and `captain` TRUE and nothing else is checked. The held-card case and the worn agent card typed with his own name go through. A stolen card worn with the face showing does not, aloud, only because the "(as ...)" name does not match the voice; I corrected point 3 to say so, since the original said the name shown is his own.

Ran a throwaway bun script importing `hierarchy.ts`: "captain's lackey", "Not the Captain" and "Acting Captain" give `isHead` TRUE and HoS/Janitor `answersTo` TRUE; "Chief Engineer's Mate" heads Engineering; "Quartermaster Fan Club" heads Supply. Same as the table.

Change log and plans: no entry fixes this or chooses it. `LLM_CREW_PLAN_SECURITY.md` section 3.1 says "The server says who is the Captain or a head, from the ID they carry", which the window does not do: it reads the text itself.

Severity stays high: an innocent person is cuffed and jailed on a non-Captain's word, which is the wrong person acted on. It needs a human with a held or forged card, which no round so far has had, so it will not show in solo test rounds. Effort stays large (server and window). Also corrected: the opening claim that any player has what is needed in the first minutes (the agent card is a traitor item and the console needs the HoP's card); added a small step 0 (`hand_first = FALSE`), the speaker lookup caution, the manifest trim note, and tests for the real Captain still being obeyed.
