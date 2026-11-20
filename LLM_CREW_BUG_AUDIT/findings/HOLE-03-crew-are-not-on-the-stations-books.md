---
id: HOLE-03
title: The crew are made outside the job system, so they hold no job slot, are not on the manifest and have no records or bank account
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: design
files: code/modules/llm_crew/crew_npc_spawn.dm:9, code/modules/llm_crew/crew_npc_spawn.dm:103, code/datums/records/manifest.dm:108, code/modules/jobs/job_types/_job.dm:415
fix: Give each body a mind and its job through SSjob when it is spawned, take the job's slot, and put it on the manifest, and skip any job a player already holds
---

## What is wrong

`create_crew_npc` makes a bare human and dresses it: `new /mob/living/carbon/human`, `randomize_human_normie`, `equipOutfit`. The job system (`SSjob`) is never told. So, for every crew NPC:

- **Its job slot is still open.** `spawn_test_crew` makes a Head of Personnel, a Quartermaster, a Chief Engineer and a Head of Security whether or not a player was given that job at round start, and a player can join late as any of them afterwards. Then there are two. The crew pick "the" head by the first match on their PDA list (`headName` in `jobs/meetings.ts:109`, `quartermasterAboard`, `captainName`), which may be the player or the NPC, and it is not the same pick for every crew member in sight of one of them.
- **It is not on the crew manifest.** `GLOB.manifest.inject` returns at once for a body with no mind (`if(!(person.mind?.assigned_role.job_flags & JOB_CREW_MANIFEST)) return`), and nothing in `code/modules/llm_crew/` calls it anyway. A player who opens the manifest on a PDA to find out who the Head of Personnel is sees no crew at all.
- **It has no security or medical record.** Records are made by the same call. The security records console cannot show an NPC, set it to "Arrest", or add a crime to it. The plan's stage 2 for security ("The Captain may also set someone wanted at the records console", `LLM_CREW_PLAN_SECURITY.md:372`) cannot name one of the crew. The change log's warning at line 639 ("Do not set a crew NPC to Arrest at a records console") is about something that cannot be done.
- **It has no bank account.** `post_equip` sets the card's account from `equipped.account_id`, which is only made for a body that came through the job system. The card has none: no pay, nothing can be bought at a vendor, and nothing can be charged to it.
- **It has no mind.** Anything in the base game that goes by `mind.assigned_role` does not see it as crew: `human.job` is not set either, since `SSjob.equip_rank` is what sets it.

One concrete case. A friend joins the owner's round thirty seconds in and picks Quartermaster from the late-join list, because the list shows the slot free. Now the Head of Personnel NPC sends its order "to the Quartermaster" by PDA to whichever of the two its PDA lists first. If that is the player, who does not answer "noted" in the set words, the head waits `NOTED_WAIT_DS` (3 minutes) and then walks to the counter instead. The NPC Quartermaster, meanwhile, holds its own staff meeting with the same two technicians the player is trying to give orders to.

## Where

`code/modules/llm_crew/crew_npc_spawn.dm:9`:

    /proc/create_crew_npc(turf/spawn_turf, datum/outfit/outfit_type = /datum/outfit/job/janitor, owner_ckey)
    	var/mob/living/carbon/human/npc = new(spawn_turf)
    	randomize_human_normie(npc)
    	npc.equipOutfit(outfit_type)

`code/modules/llm_crew/crew_npc_spawn.dm:103`, the list in `spawn_test_crew`: outfits and counts, with no look at who already holds the job.

`code/datums/records/manifest.dm:106` (base game):

    /datum/manifest/proc/inject(mob/living/carbon/human/person, atom/appearance_proxy)
    	set waitfor = FALSE
    	if(!(person.mind?.assigned_role.job_flags & JOB_CREW_MANIFEST))
    		return

`code/modules/jobs/job_types/_job.dm:415` (base game), in `/datum/outfit/job/post_equip`:

    		var/datum/bank_account/account = SSeconomy.bank_accounts_by_id["[equipped.account_id]"]

    		if(account && account.account_id == equipped.account_id)
    			card.set_account(account)

## How it was found

Read from the code. Not seen in a round: every round so far had one human, the Captain. `cargo.html` recording an order as placed by "*null*" (`LLM_CREW_CHANGELOG.md:295`) is very likely the same root: the order console writes the orderer's account or record name, and the body has none. That line was not traced.

## How to fix it

1. In `create_crew_npc`, take a job, not an outfit: `datum/job/job = SSjob.get_job_type(job_type)`. Give the body a mind (`npc.mind_initialize()`), then `SSjob.equip_rank(npc, job, null)` in place of the bare `equipOutfit`, and `job.current_positions++`. `equip_rank` sets `npc.job`, calls `on_job_equipping` (which dresses it and makes its bank account) and `after_spawn`. Read `on_job_equipping` in `code/modules/jobs/job_types/_job.dm` first: it takes a client for preferences and must be checked with a null one.
2. Then `GLOB.manifest.inject(npc)`.
3. In `spawn_test_crew`, skip any entry whose job already has `current_positions >= total_positions`, or, for the heads, any that a living player holds. Log which were skipped.
4. Keep the janitor's galoshes and the "hands start empty" steps as they are, after the equip.
5. Check what a mind on a body with no client switches on. Things to read before trusting it: who the traitor objectives pick as targets (a crew NPC as a target is fine, and may be wanted), whether any round event picks a mind without checking for a client and then waits on input from it, and the round-end report, which will now list the crew.

This is a change to how every body is made, so it wants one full round played before anything else is built on it.

Questions for the owner:
- Should the crew show on the manifest and in records? It is what makes them findable by players and arrestable through the game's own system. It also makes them possible targets of the game's antagonists.
- When a player takes a job an NPC holds, who gives way? The simplest rule is that the standing crew fills only jobs no player has, at spawn, and a late joiner is told the slot is taken.

## How to test the fix

- Server compile.
- In a round: open a PDA's crew manifest and a security records console and find all eleven. Look at the late-join list for Head of Personnel: it must show the slot filled. `runtime.log` must be clean through the first payday (about five minutes in).
- Grep `cargo.html` for "*null*" after an order is placed.
