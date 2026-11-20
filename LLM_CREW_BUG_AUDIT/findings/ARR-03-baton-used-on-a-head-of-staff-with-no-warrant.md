---
id: ARR-03
title: An officer stops a head of staff with the baton when there is no warrant, which is laying a hand on a head
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 3ee1db32f6f, 7bf567c25fc, 111a7206845
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:495, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:975, code/modules/llm_crew/crew_npc_security.dm:853
fix: Refuse the baton with no warrant on anyone who is command, in the stop_attacker task and in tool_arrest, and report it instead
---

## What is wrong

The owner's rule: nobody lays a hand on the Captain or a head of staff, other than a lawful arrest. "Stopping" someone (`how: 'stop'`) is the baton with no warrant, so it is not a lawful arrest. The server refuses it for the Captain only. The window never asks who the attacker is. So any head of department who hits, shoves or takes hold of the officer is hit twice with the stun baton.

One concrete case: the Quartermaster, a crew NPC, finds the officer in the Quartermaster's Office with no right to be there and walks it out by the arm (see ARR-02 for how that comes about). `securityFeels` notes the Quartermaster as `beat.attacker`. `syncBeat` opens `stop_attacker`. `planBeat` sends `arrest(handle, 'stop')`. `tool_arrest` checks only for the Captain, and `make_arrest` lands two baton hits on the Quartermaster. The same goes for a human player in a head's job who shoves the officer.

The Head of Security is a head as well: an officer shoved by its own head would baton it.

The Quartermaster case needs ARR-02 (a walk-out read as an attack) and goes away when that is fixed. What is left after it is a human player in a head of staff's job who hits, shoves, grabs or takes the baton from an officer: crew NPCs never hit anyone.

SEC-02 names the same gap in passing ("a head of staff is not spared"). This file is the window's side of it and what to report in place of the baton.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:495`, in `syncBeat`:

    const attacker = beat.attacker;
    keep(
      brain,
      STOP,
      !!attacker &&
        !attacker.stopped &&
        !beat.hurt &&
        !!security?.has_baton &&
        brain.peopleInView.some((person) => person.name === attacker.name),
      'emergency',
    );

`arrests.ts:975`, in `planBeat`:

    if (task.kind === STOP) {
      const attacker = beat.attacker;
      const seen = attacker
        ? brain.peopleInView.find((person) => person.name === attacker.name)
        : undefined;
      return seen
        ? {
            ready: true,
            step: `${seen.name} has attacked you. There is no warrant on them, so you are stopping them with your baton and no more.`,
            act: { tool: 'arrest', person: seen.handle, how: 'stop' },
          }
        : { ready: false, step: 'Whoever attacked you has gone.' };
    }

`code/modules/llm_crew/crew_npc_security.dm:853`, in `tool_arrest`, the only guard:

    	if(istype(crew_npc_job_of(person), /datum/job/captain))
    		action_result(CREW_TOOL_ARREST, FALSE, "[person.name] is the Captain. Nobody lays a hand on the Captain.", list("handle" = handle, "reason" = "captain"))
    		return

`PersonInView` already carries `command` ("TRUE if this person is the Captain or a head of staff, going by their ID"), set by `crew_npc_is_command(person)` in `look_around`.

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. Server, `tool_arrest`: when `how == CREW_ARREST_STOP` and `crew_npc_is_command(person)`, refuse, with `"reason" = "command"` and words such as "[person.name] is a head of staff. With no warrant you do not lay a hand on them." Keep the Captain check as it is for every `how`.
2. Window, `syncBeat`: do not open `STOP` when the attacker seen in view has `command` set. The attack is still word for whoever keeps the list: push the `attacked` outcome at once (set `attacker.told`), so the Captain hears "X attacked Nova. There is no warrant on them." and can declare one. Only the Captain can declare a warrant on a head, which the desk already enforces.
3. Window, `beatAfterActing`, the `how === 'stop'` branch: a result with reason `captain` or `command` should also push the `attacked` outcome if it has not gone (`ok` is false there, so today nothing is told).
3a. Window, `planBeat`, the `STOP` branch: also return a not-ready plan when `seen.command` is set. So the step is safe however the task came to be open, as the plan is what sends the act.

Either the server guard (step 1) or the window guard (step 2) alone stops the baton; do both, the server as the backstop. Each side is a few lines.

4. The `get_away` task needs no change: getting out of reach of a head who is hitting it lays no hand on anyone.
5. The owner's question: should an officer with a baton defend itself against a head of staff who goes on hitting it? As built after this fix it would stand and report. The other choice is to get away from them, as it does with no baton: allow `AWAY` when the attacker is command.

## How to test the fix

- Type check, lint, server compile to a side copy.
- A case in the simulator (`fight` is the nearest scenario): the attacker's entry in `people_in_view` has `command: true`. No `arrest(..., 'stop')` is sent, and one `attacked` outcome reaches the Head of Security.
- In a round, as a head of staff, shove the officer. `game.log` must have no "hit ... with its baton ... (stop)" for you, and the Captain should get the PDA line.

## Check

Checked by Opus 5.5. Confirmed.

Read `tool_arrest` (`crew_npc_security.dm:837-857`): the only rank check is `istype(crew_npc_job_of(person), /datum/job/captain)`, made for every `how`, so `stop` goes through on any other head. `make_arrest` for `CREW_ARREST_STOP` on someone on their feet calls `baton_hits(person, baton, 2)`. Read `tell_struck` (`:1550`): a hit, shove, grab or a taken item from anyone sends `struck_name`. Read `securityFeels` (`arrests.ts:1253`): anyone with no warrant on them becomes `beat.attacker`, with no look at rank. Read `syncBeat` (`:495`) and `planBeat` (`:975`): neither looks at `command`, which `look_around` does send for each person in view (`crew_npc_senses.dm:191`, `crew_npc_is_command` goes by `ACCESS_COMMAND` on the ID, so the Head of Security counts). Read `beatAfterActing` (`:1075`): a refused stop sets `attacker.stopped` and tells nothing, so today a Captain who attacks the officer is not reported either; step 3 is right.

The rule is in `LLM_CREW_PLAN_SECURITY.md:51` ("nobody lays a hand on the Captain or a head of staff") and question 5 (`:477`): a head may be arrested, on the Captain's warrant only. Section 3.7 says a player who joins in "is stopped with the baton" but does not carve heads out of the rule, and no change log entry chose to baton heads. SEC-02 named this half in passing and is marked a duplicate of ARR-02; this is the separate cause. Added the note that the lasting case is a player head once ARR-02 is fixed, and a guard in `planBeat`. Severity medium and effort small kept: the change is a few lines on each side.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: 7bf567c25fc, 3ee1db32f6f.

- ARR-03 (server part): part done. An officer no longer stops a head of staff with the baton when there is no warrant: tool_arrest refuses how 'stop' on anyone crew_npc_is_command counts, with reason 'command' (crew_npc_security.dm, tool_arrest). The Captain check stays for every how. Left: Window part (jobs/arrests.ts, another worker this round): syncBeat should not open STOP when the attacker in view has command set, and should push the attacked outcome; beatAfterActing's how==='stop' branch should push attacked on reason 'captain' or 'command'; planBeat STOP should return not-ready when seen.command. Finding step 5 (whether an officer may get away from a head who keeps hitting it) is the owner's question.

Round two (branch crew-bug-fixes-medium): no more code was needed. Both parts above were in round one, each by a different group, so the finding is now whole, apart from any step that waits on the owner.

Round three (branch crew-bug-fixes-medium): 111a7206845. This finishes the parts left above, apart from any step that waits on the owner.
