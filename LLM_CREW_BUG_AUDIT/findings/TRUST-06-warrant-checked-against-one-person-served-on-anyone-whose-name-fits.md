---
id: TRUST-06
title: Who a warrant may be on is checked against one person, and the officer then arrests anyone in sight whose name holds the warrant's words, a head of staff included
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:465, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:72, code/modules/llm_crew/crew_npc_security.dm:853
fix: Settle a warrant on one known person by full name at the moment it is declared, refuse a name that fits more than one, and have the officer check the person in front of it is that one and not a head before it lays a hand on them
---

## What is wrong

The desk's rules about who a warrant may be on are kept in `deskTakes`: nobody declares one on the Captain, none on security's own staff, and only the Captain declares one on a head. They are tested against **one** job, found like this:

    const theirJob =
      jobOf(brain, declared.name) ||
      jobOf(
        brain,
        knownNames(brain).find((it) => sameName(declared.name, it)) ?? '',
      );

`find` takes the first name it knows that holds every word of the warrant's name. The warrant is then stored under the words that were said, not under that person. When the officer looks for whoever it is on, `target` in `arrests.ts` takes the first person in view for whom `sameName(warrant.name, person.name)` is true. That need not be the person the rules were checked against.

`readWarrant` keeps a short name as it was said whenever it fits more than one person it knows: a first name shared by two people ("A first name alone is whoever it knows of by that first name, if there is only one"), or a surname, which it does not try to complete at all.

So a head can have another head arrested, which only the Captain may order, and it can happen by plain bad luck as well:

1. Aboard are Jane Doe, an assistant, and Jane Marsh, the Head of Personnel. The Head of Security knows both (its PDA lists them).
2. The Research Director, a player, says to the Head of Security: "Warrant for Jane, for theft."
3. `readWarrant`: "Jane" is the first name of two people, `closeName` finds two equally near and gives up, so the name stays "Jane".
4. `deskTakes`: `jobOf(brain, "Jane")` is ''. `knownNames(brain).find(sameName("Jane", ...))` returns whichever Jane is listed first. With the assistant first, `theirJob` is "Assistant". No rule stops it; the warrant on "Jane" is taken and given to the officer.
5. The officer meets Jane Marsh in a hallway. `target`: `sameName("Jane", "Jane Marsh")` is true. It tells her she is under arrest, cuffs her, and puts her in a cell.

The server does not stand in the way: `tool_arrest` refuses only the Captain (`crew_npc_security.dm:853`).

The same loose match is used to let people go. `strike` and the officer's `dropWarrant` find the warrant by `sameName`, and `tool_free` on the server by `findtext(name, wanted)`, so a pardon or a withdrawal for "Jane" lets go whichever Jane is held first.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:465`, quoted above.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281`, `target`:

    return brain.peopleInView.find(
      (person) =>
        sameName(warrant.name, person.name) &&
        person.name !== brain.name &&
        !shut.includes(person.name),
    );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:72`, `sameName`: "every word of the wanted name is in theirs".

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:358`, in `readWarrant`, where a shared first name is left as it was said.

## How it was found

Read from the code. Not run: a table case would show it in a few lines (see below). Not seen in a round.

## How to fix it

1. In `deskTakes`, after `readWarrant`, list every known name that `sameName(declared.name, it)` fits. If more than one, take no warrant and answer in fixed words: "Which Jane: Jane Doe or Jane Marsh?" If exactly one, store the warrant under that full name. If none (someone it has never heard of), store the words said, as now.
2. Test the rules against that one person's job, as now.
3. In `target`, match a warrant stored under a known full name only to a person whose name is that name (allow the " (as ...)" form a mismatched card gives, if the owner wants that to count). Keep `sameName` only for warrants on names nobody knew.
4. Before the arrest itself, the officer checks the person in view: if `person.command` is true (the server sends it, from their worn ID's access) and the warrant was not declared by the Captain (`byJob`), it does not arrest, and tells the Head of Security. That makes the head rule hold whatever went wrong with the name.
5. On the server, `tool_free` should take the full name and compare it whole (`LOWER_TEXT(person.name) == wanted`), with the substring test only as a fallback when nothing matches whole.

## How to test the fix

- `tools/llm_crew/security.ts`: add a desk with two known Janes, one a head; "Warrant for Jane, for theft" from a head gives the "Which Jane" line and no warrant. "Warrant for Jane Doe" is taken. An officer holding a warrant on "Jane Doe" does not pick Jane Marsh as its `target`.
- A case for step 4: a warrant declared by a head on a name that, when served, turns out to be someone in view with `command: true`: no `arrest` step.
- Type check.
