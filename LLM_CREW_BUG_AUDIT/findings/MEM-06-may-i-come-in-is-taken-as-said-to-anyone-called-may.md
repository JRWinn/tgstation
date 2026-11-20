---
id: MEM-06
title: May I come in is taken as said to anyone aboard called May, even when the speaker is alone with the NPC
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 573db4f9638
found_by: Opus 5.5
checked_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:65, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:101
fix: In callsOn accept a name at the start with no comma after it only for someone in view, and for anyone not in view require the comma or colon
---

## What is wrong

Rule 2 of `saidTo`: if the line calls on someone else by name, it is theirs and none of this NPC's business. `callsOn` counts a line as calling on someone if their **first name** is the first word (after an opener like "hey"), with or without a comma. It is tried against everyone the NPC knows of: those in view, everyone it has ever seen (`brain.people`), and **every other crew NPC aboard** (`others`), wherever they are.

Several first names in `strings/names/` are ordinary words that start sentences: May, Grant, Mark, Hope, Grace, Faith, Bill, Art, Sue, Chase, Rose, Summer. A line that begins with one of those words is taken as said to that person, and rule 2 runs before the rule that a line with no one else in the room is for this NPC. So the NPC ignores it.

Run (script below): a cargo technician at its post, the Captain one tile away and turned to it, nobody else in view, one other crew member aboard with the name given:

| The Captain says | Other crew aboard | `saidTo` gives | Should be |
| --- | --- | --- | --- |
| May I come in, please? | May Rees | other: May Rees | me |
| Grant me access to the bay. | Grant Cole | other: Grant Cole | me |
| Mark crate 4 for the Bar, please. | Mark Fry | other: Mark Fry | me |
| Hope you are well. Can I order a mop? | Hope Dunn | other: Hope Dunn | me |

With `other`, `shouldWake` does not wake the NPC, and the job hooks that check `said_to !== 'other'` (`jobs/cargo.ts`, `jobs/guarding.ts`, `jobs/pickups.ts`, `jobs/head.ts`) skip it. "May I come in?" at a locked door is exactly the line a door-keeper is there to answer.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:65`, `callsOn`:

    const first = name.split(/[^A-Za-z]+/).find((part) => part.length > 2);
    ...
    const atStart = new RegExp(`^\\W*(?:${OPENERS}\\W+)?${word}\\b`);
    const byComma = new RegExp(`(,\\s*${word}\\b)|(\\b${word}\\s*[,:])`);
    return atStart.test(lower) || byComma.test(lower);

`addressing.ts:101`, in `saidTo`, rule 2 run over everyone known, before the "nobody else is there" rule:

    const known = new Set([
      ...brain.peopleInView.map((person) => person.name),
      ...brain.people.keys(),
      ...others,
    ]);
    for (const name of known) {
      if (name !== brain.name && name !== speaker && callsOn(heard, name)) {
        return { to: 'other', name };
      }
    }

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/addressing.ts` and called `saidTo` for the four lines above with the other name in `others`. Each printed `other:<name>`. The first names were checked against `strings/names/first_male.txt` and `first_female.txt`. Not seen in a round log.

## How to fix it

1. Give `callsOn` a flag saying whether the named person is in view. In `saidTo`, pass TRUE for names from `brain.peopleInView`, FALSE for names only from `brain.people` and `others`.
2. For someone in view, keep both tests as now: "josh do something" with Josh in the room is the owner's own example (`tools/llm_crew/addressing.ts`) and must still be Josh's.
3. For someone not in view, accept only the comma or colon form: "Billy, where are you?" and "Open the door, Billy". A bare first word ("May I come in") does not call on someone who is not there.
4. Optionally, for anyone, do not count `atStart` when the name word is followed directly by "I", "me", "we", "you" or "the" with no comma ("May I", "Grant me", "Mark the"): a name used to call on someone is not followed by those. This is a short general rule, not a list of names.

## How to test the fix

- Add the four rows above to `tools/llm_crew/addressing.ts` (want `me`), plus "May, could you open the door?" with May Rees not in view (want `other:May Rees`) and with her in view (want `other:May Rees`). All existing rows must still pass.
- Type check from `tgui/`.

## Check

Checked by Opus 5.5. The quotes in `addressing.ts` (`callsOn`, and the `known` loop in `saidTo` that runs before the "nobody else is there" rule) are what the code says today. The caller is `brain.ts` (about line 604), which passes `others = [...brains.values()].map((other) => other.name)`: every crew NPC aboard, wherever it is. NPC bodies are named by `randomize_human_normie` (`crew_npc_spawn.dm:11`), which draws from `strings/names/`; May, Grant, Mark, Hope, Grace, Faith, Bill, Art, Sue, Chase, Rose, Summer, Frank and Hunter are all in `first_male.txt` or `first_female.txt`. Nothing in the change log or the plans covers it.

Ran a throwaway script (bun, in the scratchpad): `tech()` from the fixtures, the Captain one tile away and facing it, nobody else in view, `others` holding the one other name. The four lines in the table gave `other:May Rees`, `other:Grant Cole`, `other:Mark Fry`, `other:Hope Dunn`; "Can I come in, please?" with May Rees aboard gave `me`. Confirmed. Severity medium stands: it needs a crew member with one of a dozen or so word-like first names and a line that opens with that word, and then a line meant for the NPC goes unanswered.

On the fix: steps 1 to 3 are sound and keep the owner's "josh do something" row, since Josh is in view there. Step 4 is the more general rule and would also cover someone in view called May; I would build both. PARSE-14 also reworks rule 2 of `saidTo` (full names); build them together so the two changes do not fight.
