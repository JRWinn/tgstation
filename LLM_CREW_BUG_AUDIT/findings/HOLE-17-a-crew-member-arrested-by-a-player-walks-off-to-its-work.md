---
id: HOLE-17
title: A crew member arrested by a player, the Captain or a human officer, is not held, walks off to its work, and is only told so in its prompt
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:238, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:773, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:440, code/modules/llm_crew/crew_npc_security.dm:1391, LLM_CREW_PLAN_SECURITY.md:285
fix: Give the body one general way to be arrested by anyone it answers to, read from what it hears and feels, which holds it still the way being_arrested does and lets it go on the same rules, and read the arrest words loosely
---

## What is wrong

See also: HOLE-16 (a crew member jailed in a cell by a player does not know it is a prisoner). Not the same fault: that one is the cell, fixed in `look_around` from a running cell timer; this one is the arrest before it, read from words and cuffs. Each can be built alone.

The security plan's rule for a crew member under arrest is "It never fights, runs or hides" (`LLM_CREW_PLAN_SECURITY.md:287`). The code keeps that rule only for arrests the crew's own officer makes. Then the officer's server tool calls `being_arrested` on the prisoner's controller directly (CHEAT-04 writes up that channel), which stops its errand and walk and holds it still.

An arrest by a person is only words and handcuffs, and the crew code does very little with either:

1. **The words are read only in one form, and only from security.** `wantedOverhears` sets `brain.wanted.arrestedBy` when the line matches `ARREST_WORDS`, `/\byou are under arrest\b/i`, the speaker's job is a security job, and the first part of the line, up to the first comma, is the NPC's name. "Alex, you are under arrest" works. "You're under arrest, Alex", "Stop! You are under arrest", "Alex Hale. You are under arrest." (a full stop, not a comma) and anything the Captain says do not.
2. **When they are read, the body is not held.** `arrestedBy` is read in two places: `syncWanted`, which forgets it after `ARREST_STANDS_DS`, and `wantedCues`, which puts "...told you that you are under arrest. You stand still and go along with it" in the prompt. Nothing in `driver.ts`, `nextStep` or any job's `plan()` looks at it. So the driver goes on with the next step of whatever the NPC was doing, and the body walks off to it, while the model is told it is standing still.
3. **Cuffs on do not hold it either.** A body in cuffs with nobody pulling it can still walk (`get_able_to_run` ignores `INCAPABLE_RESTRAINTS` on purpose). HOLE-11 is about it never working the cuffs off; here the point is that it walks away in them, on its errand, from the officer who cuffed it, and every step needing a hand fails.

One concrete case. A friend plays a Security Officer. The Captain has asked him to bring in janitor Alex Hale for a talk. He walks up and says "Alex, you're under arrest, come with me." Alex's brain hears it, it matches nothing, and the model answers "Sure, just let me finish the Bar first." The body walks off to the Bar, as its next step says. The officer cuffs him on the way; Alex walks on to the Bar in cuffs and tries to mop. The officer batons him, which is what a player does with someone walking off from an arrest, and the crew code has made the crew member resist arrest, which the plan says it never does.

The case is in scope because the owner's next step is a station with more players aboard, and a human security officer is the most likely second player.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:238`:

	// Security telling it that it is under arrest.
	if (
	  ARREST_WORDS.test(heard) &&
	  isSecurity(job) &&
	  sameName(heard.split(',')[0], brain.name)
	) {
	  brain.wanted.arrestedBy = { by: speaker, at: brain.now };
	}

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:773`:

	export const ARREST_WORDS = /\byou are under arrest\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:16`, the header, which says the body does the holding:

	 * - A crew NPC told it is under arrest stands still and goes along. Its body sees to that: here
	 *   it is only remembered, so that what it says about it is true.

`code/modules/llm_crew/crew_npc_security.dm:1391`, the one place the body is held, called only from the crew officer's own tools (lines 874 and 1039):

	/datum/ai_controller/crew_npc/proc/being_arrested(mob/living/carbon/human/by)

A search of the window code for `arrestedBy` finds only `jobs/wanted.ts` and `types.ts`.

## How it was found

Read from the code: every use of `arrestedBy`, `ARREST_WORDS`, and every caller of `being_arrested`. Not seen in a round: no round has had a human officer. The words test was run in my head against the regex, not with a script.

## How to fix it

1. Server: a new tool `submit` (or `go_along`), allowed from the window, that calls `being_arrested(by)` with the person named by handle, after checking that person is in view and within a few tiles. That keeps the body's holding in one place, the one the crew's own arrests use, and drives it from what the body heard, which also moves the crew-officer case off the hidden call if CHEAT-04 is fixed the same way.
2. Window, `wantedOverhears`: widen the reader. A line from someone the NPC answers to by job (`answersTo` from `hierarchy.ts`, which takes in security, its head and the Captain), said to it (`said_to === 'me'`, already worked out in `ingest`), with "under arrest" or "you're nicked" or "come with me" plus "arrest" in it. Use the shared loose-wording reader the owner approved for orders (`loose-wording` in the memory notes; the LLM as last resort) for anything else that looks like it.
3. When it is read, set `arrestedBy` and push the `submit` step ahead of everything else in `nextStep`, the way the leaving step is (`leavingStep`).
4. Feeling the cuffs go on is a sense the body has: in `look_around`, a body that has become `handcuffed` with no `custody_phase` and someone it answers to beside it is arrested by them. Emit the knowledge event and call `being_arrested(that person)`. With nobody beside it, it is HOLE-11's case.
5. Owner's question: should a crew member take an arrest from a player it does not answer to (an assistant who says "you are under arrest")? The plan's "goes quietly" was written for its own security. I would take it only from security, its own head and the Captain, and have it say so to anyone else.

## How to test the fix

- Simulator: a scenario where a player with the job Security Officer says "You're under arrest, Alex" beside a janitor at work. Pass when the janitor's next tool call is `submit` and it takes no walk until let go. A second case from an assistant: the janitor goes on working.
- Type check and the DM compile.
- In a round: as the Captain, say "Alex, you're under arrest" beside a janitor and grep `game.log` for "is being arrested by"; the janitor should stand still.
