---
id: SEC-15
title: Whoever attacked the officer is looked for by name and not by the handle the server gave, so with two masked Unknowns, or two of one name, the baton goes to whichever is first in view
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:975, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1268, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:503, code/modules/llm_crew/crew_npc_security.dm:1571, code/modules/llm_crew/crew_npc_senses.dm:108
fix: Find the attacker in peopleInView by beat.attacker.handle first and by name only when no handle came, and send the stop to that handle
---

## What is wrong

When someone with no warrant on them hits, shoves or grabs an officer, the server tells the brain who: `struck_name` (their name as it looks) and `struck_by` (the handle the server keeps for that one body, `person_key` = the mob's REF and its name). The window keeps both in `beat.attacker`. Then it uses only the name:

- `syncBeat` opens the `stop_attacker` task if anyone in view has that name;
- `planBeat` for `STOP` sends the baton at the first person in `peopleInView` with that name.

`beat.attacker.handle` is stored and never read.

Names are not unique in what the body sees. A human whose face is hidden and who shows no ID is "Unknown" (`get_visible_name`). Two people in gas masks with no ID in view are both "Unknown". Two people may also share a name, and in this codebase that is not prevented. In either case the officer can baton the wrong one: someone who did nothing, perhaps a head of staff or the person it is supposed to be protecting.

One concrete case:

1. A plasma fire in the Bar. Two players without IDs on them wear gas masks: both are "Unknown" to the officer.
2. One of them shoves the officer. `relay_attackers` → `on_struck` → `tell_struck`: `struck_name = "Unknown"`, `struck_by = "p7"` (the handle of the one who shoved).
3. `securityFeels`: no warrant on "Unknown" (unless SECT-13's trespass warrant), so `beat.attacker = { name: "Unknown", handle: "p7" }`.
4. `syncBeat` keeps `stop_attacker` open: someone named "Unknown" is in view. `planBeat`: `peopleInView.find((person) => person.name === "Unknown")` returns the first in the list, which is `p4`, the one who did nothing.
5. `{ tool: 'arrest', person: 'p4', how: 'stop' }`. `tool_arrest` checks only that `p4` is in sight and not the Captain. Two baton hits on the wrong person. `game.log`: "hit ... with its baton 2 times (stop)".

The opposite also happens, more mildly: an attacker who pulls a mask on after the shove changes name (and handle, since the handle is made with the name), and the task says "Whoever attacked you has gone" with them standing there. That is what a player would see too ("Unknown"), so it is not a fault; only the first case is.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:975`, `planBeat`, `STOP`:

    if (task.kind === STOP) {
      const attacker = beat.attacker;
      const seen = attacker
        ? brain.peopleInView.find((person) => person.name === attacker.name)
        : undefined;
      return seen
        ? {
            ...
            act: { tool: 'arrest', person: seen.handle, how: 'stop' },
          }

`:1268`, `securityFeels`, which keeps the handle:

    beat.attacker = {
      name: by,
      handle: String(event.details.struck_by ?? ''),
      at: brain.now,
    };

`:503`, `syncBeat`, by name again:

    brain.peopleInView.some((person) => person.name === attacker.name),

`code/modules/llm_crew/crew_npc_security.dm:1571`, `tell_struck`, which sends both:

    emit_sense(CREW_SENSE_KNOWLEDGE, text, list("struck_by" = ishuman(attacker) ? handle_for(attacker) : null, "struck_name" = attacker.name, "how" = how))

`code/modules/llm_crew/crew_npc_senses.dm:108`:

    /datum/ai_controller/crew_npc/proc/person_key(mob/living/carbon/human/person)
        return "[REF(person)]|[person.name]"

## How it was found

Read from the code on both sides. Not seen in a round: the attackers so far were Pun Pun, the only one of that name.

## How to fix it

1. In `planBeat` for `STOP`, and in the `keep(STOP, ...)` test in `syncBeat`, look the attacker up by handle first: `brain.peopleInView.find((person) => attacker.handle && person.handle === attacker.handle)`. Only if `attacker.handle` is empty (the attacker is not human, so the server sent no handle) fall back to the name, and then only if exactly one person in view has that name; with two or more, do not open the task (the officer cannot tell which).
2. The same rule for `securityFeels`'s warrant match is a separate question (a warrant is by name on purpose); leave it.
3. Nothing on the server: it already sends the handle.

## How to test the fix

- `tools/llm_crew/security.ts`: a case with two people named "Unknown" in `peopleInView` (handles `p4` and `p7`) and `beat.attacker = { name: 'Unknown', handle: 'p7' }`: the plan's `act.person` is `p7`. A case with the attacker's handle not in view and another "Unknown" in view: no stop.
- Window type check.
- In a round with two masked players without IDs: one shoves the officer. `game.log`'s "(stop)" line must name the one who shoved.
