---
id: SEC-02
title: Any pull on an officer counts as an attack, so it batons whoever walked it out of a room, and a head of staff is not spared
kind: bug
severity: high
effort: medium
confidence: likely
status: found
found_by: Fable 5.2
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1530, code/modules/llm_crew/crew_npc_security.dm:853, code/modules/llm_crew/crew_npc_guarding.dm:173, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1253, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:975
fix: Do not tell the brain of a hold taken by a crew member putting it out of a room or by security arresting it, and refuse the stop-with-baton on a head of staff as it is refused on the Captain
---

## What is wrong

Security staff listen for three things: being hit (`COMSIG_ATOM_WAS_ATTACKED`), being pulled (`COMSIG_LIVING_GET_PULLED`), and their kit being taken. All three are sent to the brain the same way, with `struck_name`. The brain (`securityFeels`) makes whoever it names "the attacker", and the next step is `arrest ... how: stop`: two hits with the baton.

A pull is not an attack. In this game people pull each other all the time, and two of the crew's own lawful acts are pulls:

- A crew member with a post behind a locked door walks a stranger out of it by the arm (`take_hold_of` in `crew_npc_guarding.dm`, `body.start_pulling(person)`). An officer has no access of its own to cargo, engineering or the janitor's closet, and it goes into those rooms after people it has a warrant on. Nothing in `jobs/guarding.ts` knows of security: an officer is a stranger like any other.
- The Head of Security takes an arrested officer by the arm (`hold_arrested`).

And any player who is not the Captain (another player's character, or the owner in a second body) who control-clicks an officer to drag it out of a fire is treated the same.

The second half of the fault: the server refuses the baton only on the Captain. The rule is "nobody lays a hand on the Captain or a head of staff, other than a lawful arrest". `how: stop` is by its own description not an arrest ("someone who has attacked the body and is not being arrested"), and it is let through against the Quartermaster, the Head of Personnel and the Chief Engineer. The Quartermaster and its technicians are the ones who put people out of the Cargo Bay and the Quartermaster's Office.

One concrete case:

1. The Captain declares a warrant on a cargo technician's visitor seen in the Cargo Bay. The officer is let in, or follows someone through the door.
2. The Quartermaster sees a stranger in its post (`in_post && !belongs`), asks its business, and the verdict comes out `go`. The officer is not command (`crew_npc_is_command` is false for an officer), so `why_not_put_out` returns null and `take_hold_of` runs: `body.start_pulling(person)`.
3. On the officer, `on_grabbed` fires: `tell_struck(puller, "grab")`. The brain is sent "Quartermaster X takes hold of you." with `struck_name`.
4. `securityFeels` sets `beat.attacker = {name: X, at: now}`. The officer is in hand, so the driver waits.
5. The walk to the door takes a few seconds. `put_out` lets go. The attacker is fresh for 20 seconds (`ATTACK_FRESH_DS = 200`), the officer has its baton and is not hurt, and X is in sight: `syncBeat` opens the `stop_attacker` task as an emergency.
6. `planBeat` sends `{ tool: 'arrest', person: handle, how: 'stop' }`. `tool_arrest` checks only for the Captain. The officer walks back up to the Quartermaster and hits it twice with the stun baton. `game.log`: "hit ... with its baton 2 times (stop)".

The officer has also had its real arrest cancelled without a word: `taken_hold_of` calls `cancel_errand()`, which drops the result of the `make_arrest` in progress (see SEC-03 for what that leaves running).

## Where

`code/modules/llm_crew/crew_npc_security.dm:1530`:

    /// Someone has taken hold of the body.
    /datum/ai_controller/crew_npc/proc/on_grabbed(datum/source, mob/living/puller)
        SIGNAL_HANDLER
        if(isliving(puller))
            tell_struck(puller, "grab")

`code/modules/llm_crew/crew_npc_security.dm:853`, in `tool_arrest`, the only rank check, made for every `how`:

    if(istype(crew_npc_job_of(person), /datum/job/captain))
        action_result(CREW_TOOL_ARREST, FALSE, "[person.name] is the Captain. Nobody lays a hand on the Captain.", list("handle" = handle, "reason" = "captain"))
        return

`code/modules/llm_crew/crew_npc_guarding.dm:173`, in `take_hold_of`, the lawful pull:

    body.start_pulling(person)
    if(body.pulling != person)
        return list(FALSE, "You cannot get a hold of [person.name].")
    evicting = WEAKREF(person)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1253`, `securityFeels`, which does not look at `event.details.how`:

    const by = event.details.struck_name;
    if (typeof by !== 'string' || !brain.beat) {
      return;
    }
    ...
    if (beat.attacker?.name !== by || beat.attacker.stopped) {
      beat.attacker = {
        name: by,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:975`, the `STOP` step, with no look at `seen.command`:

    act: { tool: 'arrest', person: seen.handle, how: 'stop' },

## How it was found

Read from the code on both sides of the line. Not seen in a round: the rounds with security staff so far had a monkey as the only attacker. Whether the Quartermaster's verdict on an officer comes out `go` depends on what the officer says of its business and on the model, which was not run.

## How to fix it

Server, in `crew_npc_security.dm`:

1. In `on_grabbed`, do not call `tell_struck` when the puller is a crew NPC whose controller is at that moment putting this body out of a room or arresting it. Both are knowable without a hidden channel, because the body is told of both in words already: `taken_hold_of` ("X takes you by the arm and starts walking you out of ...") and `being_arrested` ("X is arresting you"). The simplest test that keeps to the body's own knowledge: skip when `in_hand_of == puller.name` or `arrested_by?.resolve() == puller`. `taken_hold_of` and `being_arrested` are both called after `start_pulling`, so move the `tell_struck` to a zero-delay timer (as `on_kit_gone` does with `kit_taken`) and make the test there.
2. A plain pull by anyone else is still told, but as what it is: keep `how = "grab"` in the details (it is there already) and let the window decide. See step 4.
3. In `tool_arrest`, when `how == CREW_ARREST_STOP` and `crew_npc_is_command(person)`, refuse with the same shape as the Captain's refusal and a reason of `"command"`. Leave `quiet` and `force` open for heads: a lawful arrest of a head is allowed by the rule.

Window, in `jobs/arrests.ts`:

4. In `securityFeels`, a `how` of `grab` from someone with no warrant on them does not make an attacker. It may set `beat.struckBy` for the voice. A grab from someone it has a warrant on is still resisting (keep the `warrant.resisted = true` branch): the owner should say whether a wanted person pulling the officer is "fighting back" worth five more minutes, or only a hit and a shove are.
5. In `planBeat` for `STOP`, give a not-ready plan when `seen.command` is true, and in `beatAfterActing` treat reason `command` like the Captain's refusal (it already sets `attacker.stopped`).

The question for the owner: should an officer on a warrant be exempt from being walked out of a locked room at all? Today cargo may put it out mid-arrest. A general answer that keeps "an example is not the scope" would be: someone from security who says they are on security business is given leave to stay (`jobs/guarding.ts`), and the keeper tells its head. That is a design choice and is not needed to stop the baton.

## How to test the fix

- `tools/llm_crew/security.ts` (table of cases): add cases for `securityFeels` with `how: 'grab'` from a stranger (no attacker), `how: 'hit'` (attacker), and a grab from a wanted person.
- Simulator: a scenario with an officer in the Cargo Bay and a technician who puts it out. The officer must not open a `stop_attacker` task. `sim.ts` plays the server, so it has to send the "takes hold of you" event the way the real server now would (or not at all).
- Server compile on a side copy.
- In a round: pull the officer as a non-Captain body, and have the Quartermaster walk it out of the bay. Grep `game.log` for "was laid hands on by" and for "(stop)": there should be no baton line after a grab.
