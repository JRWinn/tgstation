---
id: HOLE-14
title: A crew member whose ID is given a new job, promoted to replace a dead head or demoted, is run by the new job in the window and the old one on the server
kind: gap
severity: medium
effort: large
confidence: likely
status: found
found_by: Opus 5.5
area: design
files: code/modules/llm_crew/crew_npc_spawn.dm:26, code/modules/llm_crew/crew_npc_cargo.dm:41, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:412, tgui/packages/tgui/interfaces/CrewBrain/jobs/index.ts:41, code/modules/llm_crew/crew_npc_quartermaster.dm:37
fix: Have the server notice when the job on the body's own worn ID changes, learn that job's places again and send a knowledge event, and have the window start the new job's state fresh and drop the old job's tasks
---

## What is wrong

In a round of SS13 a job is not fixed. The usual answer to a dead or missing head is to promote someone: the Captain or the Head of Personnel puts a technician's ID in the ID console, types "Quartermaster" on it and gives it back. A Head of Personnel also demotes people ("you are an Assistant now"). Nothing in the crew code allows for a crew member's job changing after it was spawned. The two halves of the crew go by two different moments:

- **The window goes by the job on the card now.** Every update, `brain.job = npc.job || brain.job`, and every plan is picked with `jobFor(brain.job)` (`driver.ts:248`, `brain.ts:592`, `brain.ts:1485` and the rest). Change the card and the next update runs the new job's `plan()`, `syncTasks` and readers.
- **The server goes by the job at spawn.** `learn_starting_places` is called once, from `create_crew_npc`, and nowhere else. It sets `post_place`, `post_turf`, `work_area`, `look_in_rooms`, `closed_rooms`, `reached_through`, `office_place`, `meeting_place`, `staff_post_place` and `head_office_place`, and the engineering and security places, all from the job of that moment. None is ever worked out again.

So after a change the body is the new job in its head, standing on the old job's post.

One concrete case. Pun Pun kills the Quartermaster (crew have been beaten unconscious by it in two logged rounds). The human Captain promotes cargo technician Alex: takes the card, sets it to "Quartermaster" at the ID console, and puts it back on Alex.

1. Next update, Alex's brain is run by `QUARTERMASTER`. But the server never ran `learn_quartermaster_places` for Alex: `office_place` and `staff_post_place` are null, so the window is sent `office: null` and `staff_post: null`.
2. `SUPPLY_WAY.room` is `(brain) => brain.staffPost`: the new Quartermaster has no room to hold its staff meeting in. Its "go back to your office" and "go out to the staff post to hear a knock" steps (`quartermaster.ts:1172` to `1185`) are never offered, so its knock at the office door is never answered: there is no office.
3. It has no order book (`book: null`), so its first work is to find paper (`quartermaster.ts:826`), as a Quartermaster spawned with none would.
4. On the server it is still a technician at the counter: `post_turf` is the counter spot, so `return_to_post` (`crew_npc_cargo.dm:231`) keeps walking it back there whenever it shuffles off, and `belongs_in_post` guards the bay for it. The old tasks of the technician job that its brain had on its list (freight, rooms, a pickup) are no longer any job's to finish, and stay on the list.
5. The other technician and every head look up "the Quartermaster" by job, in view or on the PDA, and the dead one's PDA is still listed with the same job (see HOLE-08), so which of the two gets an order is chance.

The other way round is quieter but the same: a janitor demoted to "Assistant" is `CREW` in the window ("a person, free to walk the station") and still has the Custodial Closet as its post on the server, so its doors still count for `belongs_in_post` and the closet is still in `work_area`.

The prompt is partly kept up: `prompt.ts:26` takes `jobFor(job).about(post)` each time, so the model is told the new job but given the old post.

## Where

`code/modules/llm_crew/crew_npc_spawn.dm:23`, the only call:

	var/datum/ai_controller/crew_npc/controller = new(npc)
	if(owner_ckey)
		get_crew_brain_link(owner_ckey).add_npc(controller)
	controller.learn_starting_places()

`code/modules/llm_crew/crew_npc_cargo.dm:41`, everything worked out from the job of that moment:

	/datum/ai_controller/crew_npc/proc/learn_starting_places()
		var/list/known = list()
		var/list/sentences = list()
		// The Quartermaster is cargo staff with no post at the counter: it has an office, and its staff to find.
		if(is_quartermaster())
			sentences += learn_quartermaster_places(known)
		else if(works_in_cargo())

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:410`, the window following the card:

	// It knows its own job. A body the server cannot put a job to for a moment, because its ID
	// cannot be read, has not stopped being what it was: a head with no job drops its meeting.
	brain.job = npc.job || brain.job;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:778`:

	const SUPPLY_WAY: MeetingWay = {
	  room: (brain) => brain.staffPost,

`code/modules/llm_crew/crew_npc_cargo.dm:11`, the server's own reading of its job, which does follow the card (so `is_quartermaster()` and `works_in_cargo()` change at once while the places do not):

	var/obj/item/card/id/card = body.get_idcard(TRUE)
	return card?.assignment || body.get_assignment(if_no_id = "", if_no_job = "")

## How it was found

Read from the code, not seen in a round. No round has had a job changed on a crew NPC. I did not follow each job module's tasks to see which of the old job's tasks would throw or loop under the new job; that the old tasks stay on the list is read from the fact that each job's `syncTasks` adds and finishes only its own kinds. TRUST-10 and the finding on a card held in the hand (a crew member holding someone else's ID takes its job) are about a card taken or held; this one is the body's own card, worn, changed on purpose.

## How to fix it

1. On the server, keep the job the places were learned for: a new var `places_job` on the controller, set at the end of `learn_starting_places`.
2. In `look_around` (once a second is plenty, or on `COMSIG_ID_CARD_ASSIGNMENT_CHANGED` if the base game has such a signal; I did not find one), compare `job_title()` with `places_job`, reading only the card the body wears (`get_idcard(FALSE)`), so that a card in the hand does not count (see TRUST-10 for that fault). When it differs and the new job is a real job (`SSjob.get_job` finds it), clear the job places (`post_place`, `post_turf`, `post_door_refs`, `work_area`, `look_in_rooms`, `closed_rooms`, `reached_through`, `office_place`, `meeting_place`, `staff_post_place`, `head_office_place` and the engineering and security ones) and call `learn_starting_places` again. That emits a knowledge event, "You are the station's Quartermaster...", which is how the body learns it in a way it could: it was told and handed a card. Log it to `game.log`: "Crew NPC X's job changed from A to B".
3. In the window, in `ingest`, when `npc.job` changes to a title that `jobFor` maps to a different job than before, end the old job: finish every task whose kind belongs to the old job (give each job a `kinds` list, or keep the job a task was added under on the task), and clear the per-job state fields (`ledger`, `book` reading, `meeting`, `nextMeetingAt` set from now, `desk`, `beat`, `chief`, `engine`, `duties`, `asks`, `requisition`). Tasks told to it by someone (`source: 'told'`) are kept.
4. Leave out the case `npc.job === ''` (card off for a moment), which the existing `|| brain.job` already covers.
5. Question for the owner: should a crew member promoted by the Captain say so to its new staff (a PDA message to each, "I am the Quartermaster now"), or wait for them to find out at the next meeting? Either is cheap once step 3 is in.

## How to test the fix

- Add a simulator hook to change an NPC's `job` partway through a scenario (`tools/llm_crew/sim.ts`), and a scenario: two technicians, the Quartermaster removed at minute 3, technician 1 given "Quartermaster" at minute 4. Pass when technician 1 holds a supply meeting in the bay by minute 15 and no task of kind freight or rooms is left on its list.
- Type check and the DM compile.
- In a round: take a technician's ID, change its assignment at the ID console, give it back, and grep `game.log` for "job changed from"; then look in the Crew Brain window for the new office and staff post on its card.
