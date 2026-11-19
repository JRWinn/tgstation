---
id: CHEAT-10
title: Whether someone in view belongs in a post, or outranks the body, is read off the hidden access list and trim of their card, not the job the card shows
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: senses
files: code/modules/llm_crew/crew_npc_guarding.dm:24, code/modules/llm_crew/crew_npc_guarding.dm:40, code/modules/llm_crew/crew_npc_guarding.dm:45, code/modules/llm_crew/crew_npc_senses.dm:191
fix: Judge belongs and command from the job title the card shows and the access that job is given, the way a player reading the card would
---

See also: HOLE-01 (the other side of the same coin: a card's job text is trusted too far). This finding is about what the body reads that no player can see.

## What is wrong

For each person in view, `look_around` sends the brain `belongs`, `command` and `superior`. A player looking at someone sees their face and, on examine, the name and job title on the ID they wear. They do not see the card's access list or its trim. The server reads both:

- `belongs_in_post(person)` tests `door.allowed(person)` for each door of the post. `allowed` reads the person's card access (any card they hold or wear). So whether a stranger "has a right" to be in the Cargo Bay is decided by the exact access on their card.
- `crew_npc_is_command(person)` is `ACCESS_COMMAND in card.GetAccess()`: a hidden access flag, not the title.
- `crew_npc_job_of(person)` (used by `answers_to`, and by `tool_arrest` to refuse to arrest the Captain) goes by `card.trim.job` first, the trim the card was printed with, and only falls back to the title. The HoP's console can change a card's title without its trim, and the other way round.

Concrete cases:

1. The Head of Personnel gives an assistant, Rae, extra cargo access at the desk. Rae walks into the Cargo Bay. A cargo technician NPC sees `belongs: true` and leaves her be. A player technician sees "Assistant" on her card and asks her what she is doing there; she says the HoP gave her access, which is how a player would learn it.
2. The HoP retitles an engineer's card "Captain" without changing the trim. `tool_arrest` reads the trim (Station Engineer), so the officer would arrest a person whose card says Captain, knowing what no player could. (The window, by HOLE-01, would go by the title "Captain" and refuse; the two sides then disagree.)
3. A head of staff who has lost command access through the HoP's console is not `command` any more, though their card still says "Chief Engineer".

`why_not_put_out` uses the same two procs to decide whether a body may walk someone out of its post, so this decides who gets taken by the arm.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:24`, `belongs_in_post`:

    		if(door.allowed(person))
    			return TRUE

`:40`, `crew_npc_is_command`:

    	var/obj/item/card/id/card = person.get_idcard(FALSE)
    	return !isnull(card) && (ACCESS_COMMAND in card.GetAccess())

`:45`, `crew_npc_job_of`:

    	var/datum/id_trim/job/trim = card.trim
    	if(istype(trim) && istype(trim.job))
    		return trim.job
    	return SSjob.get_job(card.assignment)

`code/modules/llm_crew/crew_npc_senses.dm:191`, sent for each person in view:

    "belongs" = !isnull(post_turf) && belongs_in_post(person), "command" = crew_npc_is_command(person), "superior" = answers_to(person)

## How it was found

Read from the code.

## How to fix it

1. One helper, `crew_npc_shown_job(person)`: the job that goes with the title on the card they wear (`get_idcard(FALSE)`, worn, as `crew_npc_is_command` already does, not held), by `SSjob.get_job(card.assignment)`, null if the title is no job. This is what examining them shows.
2. `belongs_in_post`: true if that job's standard access (the job's outfit `id_trim`, through `SSid_access.trim_singletons_by_path`) opens a post door (`door.check_access_list(access)`). Keep the brig-cell case.
3. `crew_npc_is_command`: the shown job has `JOB_HEAD_OF_STAFF` in `job_flags`, or is the Captain.
4. `crew_npc_job_of`: the shown job only. Drop the trim.
5. Coordinate with HOLE-01's fix, which proposes the server work out rank from the card and send it as a field. That field should come from these same helpers, so the server and the window agree, and both go by what the card shows.

Question for the owner: a card whose title is not a job at all ("Bartender's mate", free text) shows no job. Should such a person count as a stranger to every post, as here, or be asked their business?

## How to test the fix

- Server compile.
- The window side reads `belongs`, `command` and `superior` unchanged; run the guarding scenarios in the simulator.
- A round: have the HoP add cargo access to an assistant's card and send them into the Cargo Bay: a technician should question them. Retitle a card and check the officer's refusal to arrest follows the title.
