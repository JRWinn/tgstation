---
id: KNB-12
title: Having rooms of your own is handed out job by job, so janitors put nobody out of the Custodial Closet and cannot open their own door for anyone
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: design
files: code/modules/llm_crew/crew_npc_cargo.dm:41, code/modules/llm_crew/crew_npc_doors.dm:493, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:751
fix: Work out a body's own rooms from its ID and its job's department for every job, and let anyone with rooms of their own guard them and open their doors
---

## What is wrong

See also: LOGB-01

The project's rule: "An example is not the scope. A behaviour described for one job is built as a general rule (anyone with a post behind a locked door) ... Nothing should assume only janitors and cargo."

Guarding a locked room and opening its door for someone were built for cargo, and extended by hand to engineering and to security. Every other job has neither. Two items in the 2026-11-18 morning entry ("fixes from the first round with a Quartermaster") say so for janitors, and both are still open:

- "Janitors do not put anyone out of their own rooms. The owner wants them to: Pun Pun got into the Custodial Closet and set off a cleaner grenade."
- "A janitor asked face to face to open a door its own ID opens only talks. It has no way to open a door for someone."

The 14:15 entry repeats the first from the other side: "Trespass warrants can only start with staff who put people out of their rooms: cargo, engineering and now security. Janitors do not." The owner's memory note of 2026-11-18 has it as wanted and not built.

Where it comes from in the code:

1. `learn_starting_places` gives a body a post, a `work_area` and the rooms it looks in on by an `if / else if` over three departments: `works_in_cargo()`, `works_in_engineering()`, `works_in_security()`. A janitor falls through all three and gets no `post_turf`, no `post_place`, no `work_area`.
2. Everything about locked rooms hangs off those: `post_doors()`, `belongs_in_post`, the questioning and putting out in `crew_npc_guarding.dm`.
3. `tool_open_door` refuses anyone who is not cargo in its first line, before it looks at whose door it is.
4. On the brain side the janitor job has `keepsPost: false` and no guarding hooks.

Concrete case: Pun Pun walks into the Custodial Closet behind a janitor. Three janitors stand in the closet with it. None has a post, so none finds anyone "who does not belong". The monkey takes a cleaner grenade off the rack and sets it off. Second case: the Captain, without an ID in hand, says to a janitor standing inside the closet "let me in". The LLM answers politely. No step opens the door, because `tool_open_door` would answer "You have no door of your own to open for anyone." and no job code offers it to a janitor.

The same holds for every job added from here on: a bartender and the bar, a cook and the kitchen, a doctor and medbay.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:45`, `learn_starting_places`:

    	if(is_quartermaster())
    		sentences += learn_quartermaster_places(known)
    	else if(works_in_cargo())
    		...
    	// Engineering staff know Engineering and the engine room, and the Chief Engineer its office.
    	else if(works_in_engineering())
    		sentences += learn_engineering_places(known)
    	// Security staff know the Security Office and the brig, and the Head of Security its office.
    	else if(works_in_security())
    		sentences += learn_security_places(known)

`code/modules/llm_crew/crew_npc_doors.dm:492`, `tool_open_door`:

    	if(!works_in_cargo() || isnull(post_turf))
    		action_result(CREW_TOOL_DOOR, FALSE, "You have no door of your own to open for anyone.")
    		return

and further down, who may be let in is written for one pairing only:

    	if(!inside && !(findtext(person.get_assignment(if_no_id = "", if_no_job = ""), "janitor") && mess_beyond))
    		action_result(CREW_TOOL_DOOR, FALSE, "You have no call to let [person.name] into [room_name].")

## How it was found

Read from the code, from the two lines in the morning entry. Not seen in a round since the one the entry names (`data/logs/2026/11/18/round-01.53.17`), where the grenade went off.

## How to fix it

1. **One general way to find a body's own rooms.** `crew_brain_rooms.dm` already works out, once a round, "the rooms that are locked to the crew at large" and, every thirty seconds, which of the owner's NPCs may go into each (the "Locked rooms" section of the brain window, 15:00 entry). Use that list on the server for every body: its own rooms are the locked rooms whose doors its ID opens and that belong to its job's department (`/datum/job`'s `departments_bitflags` against the area's type, the way `crew_npc_card_color` picks a department). A janitor gets the Custodial Closet. Cargo, engineering and security get what they have now, and the three hand-written lists become a check on the general one, not the source.
2. `post_place` for a job with no counter is where it works from: for a janitor, the closet. `keepsPost` stays false for it, so it still roams. Guarding only applies while it is in one of its rooms, which is how `belongs_in_post` is already used.
3. `tool_open_door`: replace `works_in_cargo()` with "has rooms of its own". Replace the janitor-and-mess test with the general one the brain already decides (`mayPass` in `jobs/cargo.ts`): the server checks only that the door is one of the body's and that its ID opens it. Who is let in is the brain's to know.
4. Brain side: move `mayPass`, the door steps and the guarding hooks that are not about crates out of `jobs/cargo.ts` into a shared file, as `jobs/guarding.ts` already is for putting people out, and give them to the janitor job.
5. Trespass then follows by itself: `wantedAfterActing` already has any body that "tries to put someone out of its room and cannot" tell its head.

Do KNB-04 and KNB-07 first or together: this widens the door tool to more jobs, and it should be the honest door that is widened.

Questions for the owner:

- Is the Custodial Closet a janitor's room to put people out of, the Captain and heads excepted as for cargo?
- A janitor's "post": the closet, or none (it guards only when it happens to be there)?
- Who may a janitor let into the closet when asked: anyone on its head's word, as cargo lets in whoever a technician sent for?

## How to test the fix

- Server compile to a side copy.
- Simulator: a new scenario beside `office` and `vouch`, with a janitor in its closet and a stranger walking in. Checks: the janitor questions them, then walks them out, then tells its head. And one where a head asks at the closet door and is let in.
- A round: `game.log` for "walked ... out of Custodial Closet", and Pun Pun's next visit.
