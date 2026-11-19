---
id: ARR-17
title: Told to let go of someone by a short name, security frees whoever it has by the arm if that name is anywhere inside theirs
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1264, code/modules/llm_crew/crew_npc_security.dm:1285, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:924
fix: Match names in tool_free and set_free word by word, as sameName does in the window, not with findtext
---

## What is wrong

See also: SEC-05. SEC-05 names the `findtext` match as "a second, smaller fault" that "only bites if that changes", because the window sends whole names. It does not always: a warrant can stand under a first name alone (SECT-16, when two crew share it; PARSE-03 and SECT-03 for other short forms), and the let-go line the Head of Security sends uses the warrant's name as the list has it. And SEC-05's case is a cell; this one is the person in hand.

`is_named` is "the name asked for is part of it", by `findtext` on lower case. "dan" is part of "jordan", "ian" of "brian", "al" of "alice" and "hale". `tool_free` looks first at whoever the body has arrested and is holding:

    var/mob/living/carbon/human/held = arrested?.resolve()
    if(!QDELETED(held) && is_named(held, wanted) && (body.pulling == held || recently_saw(held)))
    	start_errand(held, CREW_TOOL_FREE, held.name)
    	return

So a let-go for "Dan" while it holds Jordan Smith lets go of Jordan Smith and takes his cuffs off. The window then records `freed` for "Dan" and tells the Head of Security "Dan is free", which is false, while Dan stays in his cell.

When the free step comes while it holds someone: the free task is an emergency, so it is taken whenever the serve task of the prisoner in hand is not ready. It is not ready while it waits for a cell (`noCellAt`, ARR-04) or stands in the brig after every cell refused (`cellTries`). Then the free step goes out, with Jordan by the arm.

One concrete case: two crew named Dan, so the Captain's "Arrest Dan for theft" stands as a warrant on "Dan" (SECT-16). The officer arrests Dan Reyes and jails him in Cell 1. Later it arrests Jordan Smith on another warrant, and every cell is now in use, so it stands in the Brig holding Jordan, waiting. The Captain pardons Dan. The Head of Security sends "Hale, Dan is to be let go: the Captain has pardoned them." `dropWarrant("Dan")` finds "Dan Reyes" in `beat.jailed`, so `toFree` gets "Dan". `freeStep` sends `free("Dan")`. On the server `held` is Jordan Smith, `findtext("jordan smith", "dan")` is true, and Jordan is let go and uncuffed. Dan Reyes stays in Cell 1.

The same `is_named` decides who is let out of a cell in `set_free` and who is uncuffed in sight in `tool_free`, with the same fault.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1264`:

    /// TRUE if this name is the one asked for: the same, or the name asked for is part of it.
    /datum/ai_controller/crew_npc/proc/is_named(mob/living/person, wanted)
    	return !!findtext(LOWER_TEXT(person.name), wanted)

`crew_npc_security.dm:1285`, in `tool_free`, the person in hand checked first (quoted above). And `crew_npc_security.dm:1296`, the `jailed` names, by `findtext` too:

    if(jailed[name] == cell && findtext(LOWER_TEXT(name), wanted))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:924`, `freeStep`, which sends the name as the list has it:

    act: { tool: 'free', person: name },

## How it was found

Read from the code on both sides. Not seen in a round. Marked `likely` because it needs a warrant under a short name, which takes one of the reading faults named above.

## How to fix it

1. In `is_named`, and in the `jailed` match in `tool_free`, match whole words: split both names on anything that is not a letter or a figure, and say yes when every word of the name asked for is one of the person's words. That is what the window's `sameName` does, and the two sides then agree.
2. In `tool_free`, when the name asked for fits more than one person it could mean (the one in hand, one in a cell, one in sight), free none and answer `reason: 'who'` with the names, so the window can say so rather than guess. The window counts `who` as a failed try today; it should tell the Head of Security instead.
3. Leave the order of the checks as it is once the match is exact.

## How to test the fix

- A DM unit check, or a line in the next round: `is_named` of "Jordan Smith" with "dan" is FALSE, with "jordan" TRUE.
- `tools/llm_crew/security.ts`: nothing changes in the window for step 1.
- In the next round, grep `game.log` for `let ... go at` and check the name is the one in the pardon in `pda.log`.
