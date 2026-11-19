---
id: CHEAT-10
title: Whether someone in view belongs in a post, or outranks the body, is read off the hidden access list and trim of their card, not the job the card shows
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
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
4. (Added by the checker, and the one that comes up without anyone touching a card.) The Bridge Assistant and the Veteran Advisor trims carry `ACCESS_COMMAND` (`code/datums/id_trim/jobs.dm`, lines 247 and 1323). Both are station-trait jobs that appear in some rounds. Either one walking into a post they have no access to is `command`, so `why_not_put_out` says they outrank the body and it never walks them out, while a player reading "Bridge Assistant" on the card would.

One part is fair: a body wearing security HUD glasses sees the job icon the HUD draws from the card's trim (`sec_hud_set_ID` in `code/game/data_huds.dm` uses `get_trim_sechud_icon_state`). The Head of Security spawns wearing them; an officer does not (they are only in its chameleon list). So for case 2, an officer reading the trim knows what it could not see; a HUD-wearing Head of Security would see the trim's icon. The fix should go by the title unless the body wears a security HUD.

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

## Check

Checked by Opus 5.5. Confirmed.

- Read `crew_npc_guarding.dm` 1 to 72 and 136 to 140, and `crew_npc_senses.dm:191`: the quotes match. `belongs_in_post` tests `door.allowed(person)` (`code/modules/jobs/access.dm:6`), which reads the card's access. `crew_npc_is_command` reads `ACCESS_COMMAND in card.GetAccess()`. `crew_npc_job_of` reads `card.trim.job` before `card.assignment`. Callers: `answers_to`, `why_not_put_out`, `tool_arrest`'s Captain refusal (`crew_npc_security.dm:853`), and the body's own tools (`crew_npc_inventory.dm:135`, its own card, which is fair).
- What a player sees of someone else: `get_assignment` shows the card's title (`human_helpers.dm`, `get_displayed_name`), and a security HUD shows the trim's icon. Nothing shows the access list. So `belongs` and `command` are read off what no player could see, apart from the HUD case noted above.
- `get_idcard(FALSE)` on a human returns the worn or belt card only (`human_helpers.dm:117`), so held cards are not read for `command`; `allowed` does read held ones. That does not change the finding.
- Added case 4 (Bridge Assistant, Veteran Advisor), checked against `jobs.dm`. The Quartermaster has both `ACCESS_COMMAND` and the head-of-staff flags, so fix step 3 keeps it as command.
- Nothing in the change log or plans says reading access was chosen; the file's own header says "anyone the door opens for", which is the code, not an owner decision.
- Severity medium, as the other knowledge findings. Effort small: three procs in one file. The fix works; for step 2, a job's outfit is a typepath, so take `initial(outfit.id_trim)` and look it up in `SSid_access.trim_singletons_by_path`, then `door.check_access_list(trim.access)`. Test: the guarding scenarios in the simulator, plus a case with a Bridge Assistant in the Cargo Bay who should now be put out.
- Not run: nothing here needed a script.
