---
id: TRUST-06
title: Who a warrant may be on is checked against one person, and the officer then arrests anyone in sight whose name holds the warrant's words, a head of staff included
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:465, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:72, code/modules/llm_crew/crew_npc_security.dm:853, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:358, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:540
fix: Settle a warrant on one known person by full name at the moment it is declared, refuse a name that fits more than one, and have the officer check the person in front of it is that one and not a head before it lays a hand on them
---

## What is wrong

Also written up as: SECT-16

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

The same happens with no head involved (from SECT-16). The Head of Security knows Dana Reyes (Janitor) and Dana Smith (Cook) from its PDA. The Captain sends "Arrest Dana for theft." The warrant list is `["Dana"]`, and the Captain is told "Captain, I have that: a warrant for Dana, for theft. 5 minutes." Nothing tells the Captain there are two Danas. `sameName('Dana', 'Dana Smith')` and `sameName('Dana', 'Dana Reyes')` are both true, so whichever the officer sees first is arrested, cuffed and put in a cell, and that is reported as the warrant served. Staff send sightings of both, and every head reads "Security is looking for Dana" at its meetings. Random names in SS13 come from lists of a few hundred first names, so two crew with one first name happen in a full round.

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

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:358`, in `readWarrant`, where a shared first name is left as it was said:

    // A first name alone is whoever it knows of by that first name, if there is only one.
    const owners = known.filter(
      (it) => firstName(it).toLowerCase() === (name ?? '').toLowerCase(),
    );
    if (owners.length === 1) {
      name = owners[0];
    } else {

`security.ts:154`, in `closeName`, the misspelling reader it falls back to, gives nothing on a tie:

    if (near.length === 0 || (near.length > 1 && near[0].apart === near[1].apart)) {
      return undefined;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:540`, where the warrant is stored under the words read:

    const minutes = declared.minutes ?? MINUTES_USUAL;
    const unknown = !knownNames(brain).some((it) =>
      sameName(declared.name, it),
    );
    desk.warrants.push({
      name: declared.name,

## How it was found

Read from the code, and a throwaway bun script (in the system temp folder) that imported `jobs/security.ts` printed:

    readWarrant('Warrant for Jane, for theft.', ['Jane Doe', 'Jane Marsh', 'Bob Hale'])  -> {"name":"Jane","reason":"theft","minutes":null}
    sameName('Jane', 'Jane Marsh') -> true    sameName('Doe', 'Jane Doe') -> true
    readWarrant('Warrant for Doe, for theft.', ['Jane Doe', 'John Doe'])               -> {"name":"Doe","reason":"theft","minutes":null}

`deskTakes` and `target` were not run; they were read. Not seen in a round.

SECT-16 (a second write-up of this) ran the Dana case through `deskTakes` in a bun script with fixtures from `tools/llm_crew/fixtures`, and it printed `["Dana"] [ "Captain, I have that: a warrant for Dana, for theft. 5 minutes." ] true true` (the warrant list, the reply, and `sameName` for each Dana).

## How to fix it

1. In `deskTakes`, after `readWarrant`, list every known name that `sameName(declared.name, it)` fits. If more than one, take no warrant and answer in fixed words: "Which Jane: Jane Doe or Jane Marsh?" If exactly one, store the warrant under that full name. If none (someone it has never heard of), store the words said, as now. One way to do it (from SECT-16): have `readWarrant` return the owners it found when there are two or more (for example `{ name, reason, minutes, ambiguous: ['Dana Reyes', 'Dana Smith'] }`), and put the "which one" answer as a new fixed line in `REFUSALS`, such as "Captain, there are two by that name: Dana Reyes and Dana Smith. Which one?". The next "Warrant for Dana Reyes" is then read whole. The same question applies to a name read in full that `sameName` fits to two known people: a warrant on "Pun Pun" when "Pun Pun" and "Pun Pun II" are both aboard. A first name with one owner is left as it is.
2. Test the rules against that one person's job, as now.
3. In `target`, match a warrant stored under a known full name only to a person whose name is that name (allow the " (as ...)" form a mismatched card gives, if the owner wants that to count). Keep `sameName` only for warrants on names nobody knew.
4. Before the arrest itself, the officer checks the person in view: if `person.command` is true (the server sends it, from their worn ID's access) and the warrant was not declared by the Captain, it does not arrest, and tells the Head of Security. That makes the head rule hold whatever went wrong with the name. The officer does not know today who declared a warrant: `BeatWarrant` (`types.ts:483`) has no `by` or `byJob`; only the desk's `Warrant` has `byJob`. So the warrant the desk gives the officer must carry that the Captain declared it (a field set in `giveWarrant`, and the word in the PDA line the officer reads, if it goes by PDA). Steps 1 to 3 are the fix; 4 and 5 are belts and braces and can be built after.
5. On the server, `tool_free` should take the full name and compare it whole (`LOWER_TEXT(person.name) == wanted`), with the substring test only as a fallback when nothing matches whole.

## How to test the fix

- `tools/llm_crew/security.ts`: add a desk with two known Janes, one a head; "Warrant for Jane, for theft" from a head gives the "Which Jane" line and no warrant. "Warrant for Jane Doe" is taken. From SECT-16: with Dana Reyes and Dana Smith on the PDA list, "Arrest Dana for theft." from the Captain leaves no warrant and answers with the new line; "Arrest Dana Smith for theft." is a warrant on Dana Smith; with only Dana Reyes known, "Arrest Dana for theft." is still a warrant on Dana Reyes. An officer holding a warrant on "Jane Doe" does not pick Jane Marsh as its `target`.
- A case for step 4: a warrant declared by a head on a name that, when served, turns out to be someone in view with `command: true`: no `arrest` step.
- Type check.

## Check

Checked by Opus 5.5. The quotes are what the code says today: the `theirJob` lookup and the rule chain in `deskTakes` (`desk.ts:463`), the warrant pushed under `declared.name` (`desk.ts:540`), `target` (`arrests.ts:281`), `sameName` (`security.ts:72`, every word of the wanted name in theirs), the first-name branch of `readWarrant` (`security.ts:358`), and `tool_arrest`, which refuses only the Captain (`crew_npc_security.dm:853`).

Ran a throwaway bun script (in the scratchpad, outside the repo) importing `jobs/security.ts`: `readWarrant('Warrant for Jane, for theft.', ['Jane Doe','Jane Marsh','Bob Hale'])` gives `{"name":"Jane",...}`; `readWarrant('Arrest Dana for theft.', ['Dana Reyes','Dana Smith'])` gives `{"name":"Dana",...}`; with only Dana Reyes known it gives `Dana Reyes`; `sameName('Jane','Jane Marsh')` and `sameName('Dana','Dana Smith')` are both true. So the rules in `deskTakes` are tested against whichever matching name `knownNames` lists first, while `target` takes whichever matching person comes first in view. Nothing between them checks it is the same person, and the officer side has no head check (no use of `person.command` in `arrests.ts`).

Severity raised to high: FORMAT.md puts "the wrong person is acted on" at high, and here an innocent person, or a head on a head's warrant against the project's rule about laying hands on heads, is cuffed and jailed. It needs a warrant given by a bare first name or surname that two crew share; a shared first name among thirty or forty crew is likely in a full round. Searched the change log and plans for a shared first name or "which one": nothing. The fix's steps 1 to 3 are window only and medium; step 4 needed a note that the officer does not know who declared the warrant.

## Fix note

Steps 1 to 3 are built, in the window only. Step 1: `deskTakes` lists every known name the warrant's name fits; two or more, and it takes no warrant and asks in fixed words (`REFUSALS.whichOne`, "Captain, there are two by that name: Dana Reyes and Dana Smith. Which one?"); exactly one, and the warrant is kept under that full name and the rules are tested against that one person. A name read in full that is itself a known name is taken as that one ("Pun Pun" with "Pun Pun II" aboard is Pun Pun), not asked about, so that the full name can always be given. Step 3: `target` in `arrests.ts` matches a warrant on a name the officer knows (PDA list or seen before) only to a person of that exact name (or "<name> (as ...)"); a name nobody knew is matched by `sameName` as before.

Not built: step 4 (the officer refusing to arrest a head on a warrant the Captain did not declare) needs a field on `BeatWarrant` in `types.ts` saying who declared it, which this worker did not own. Step 5 (`tool_free` comparing whole names) is server code in `crew_npc_security.dm`, also not owned here. `strike` and `dropWarrant` still find a warrant by `sameName`; with step 1 the stored name is a full name, so this matters only for names nobody knew.
