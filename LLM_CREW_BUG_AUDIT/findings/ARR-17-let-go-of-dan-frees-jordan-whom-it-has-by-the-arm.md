---
id: ARR-17
title: Told to let go of someone by a short name, security frees whoever it has by the arm if that name is anywhere inside theirs
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 00ac0a87f2e
found_by: Opus 5.5
checked_by: Opus 5.5
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

## Check

Checked by Opus 5.5, from the code; nothing run.

- The quotes are what the code says today: `is_named` at `crew_npc_security.dm:1264` is `!!findtext(LOWER_TEXT(person.name), wanted)`; `tool_free` checks `held` first at 1285; the `jailed` matches at 1296 and 1312 and the cell match in `set_free` at 1329 use `findtext` / `is_named` too.
- How a short name gets there. The desk's `strike` (`jobs/desk.ts:258`) sends on `who = warrant?.name ?? held ?? name`, so a pardon of "Dan" against a warrant on "Dan Reyes" goes out as the full name, and is fine. The short name reaches the officer only when the warrant itself stands under it; TRUST-06 (`readWarrant` keeps a first name two people share, and a surname, as said) shows that it can. `LET_GO_WORDS` in `officer.ts:357` passes it to `dropWarrant`, which pushes `toFree` with that name (`arrests.ts:199`), and `freeStep` sends it as it is.
- The free task goes out while it holds someone: `keep(brain, FREE, true, 'emergency', ...)` (`arrests.ts:466`), and `freeStep` has no check for a prisoner in hand. The serve task for the one in hand is `ready: false` while `noCellAt` is fresh or every cell has refused (`arrests.ts:671`, `684`), so the free step is the emergency that runs. On the server, `findtext("jordan smith", "dan")` is true and `held` is let go and uncuffed.
- What follows, to add to the write-up: the window then drops every `beat.jailed` name `sameName` to "Dan" (`arrests.ts:1223`), so it forgets Dan Reyes is in Cell 1, and reports Dan freed. Jordan's warrant still stands, so the officer goes after Jordan again; the lasting harm is that Dan sits out the whole term after a pardon and the Head of Security is told he is out.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans mentions `is_named` or this match.
- Severity kept at medium: the wrong person is acted on, but it needs a short-name warrant and a full brig at once. Confidence raised to sure: the chain is certain once those hold.
- On the fix: step 1 alone closes it. In DM, split with `splittext(LOWER_TEXT(name), regex("\[^a-z0-9\]+"))` and test that every word of `wanted` is in the person's list. Keep the window's one-word form too ("punpun" for "Pun Pun", `sameName` in `jobs/security.ts:72`), or a free sent as written in the warrant could stop matching. Use the one helper in every place it matches a name (1264, 1285, 1296, 1300, 1308, 1312, 1329). Step 2 needs a window change as well (a `who` answer with names, and the free task not counting it as a try); it can wait.
