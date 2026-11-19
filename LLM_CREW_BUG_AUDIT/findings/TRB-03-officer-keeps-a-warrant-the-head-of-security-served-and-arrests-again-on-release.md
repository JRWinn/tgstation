---
id: TRB-03
title: When the officer is out hurt both it and the Head of Security hold each warrant, and whichever did not make the arrest arrests the prisoner again when the cell opens
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: e33be65dfc6
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:802, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:765, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:954, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:755
fix: When a warrant is served, have the desk strike it from its own beat and send every other holder a fixed served line that only takes it off their beat, without the let-go that dropWarrant does
---

## What is wrong

See also: SECT-11 (a warrant declared while the officer is out hurt is never given to it after "try again"). Same handover, different fault and fix; SECT-11's fix keeps working with this one's.

A warrant that is being served should be in one pair of hands. When the officer breaks off hurt, the Head of Security takes every warrant into its own hands, but the officer is never told to give them up, and it does not give them up of itself. From then on two crew hold one warrant, each in its own `beat.warrants`. When one of them puts the person in a cell, only the desk's list is struck: the other copy stays, and is served again on the first sight of the person after the cell opens.

A hurt officer still makes arrests "for someone who stands for the cuffs" (arrests.ts header; `serveStep` only refuses force when hurt), and every crew NPC stands for the cuffs (`being_arrested`). So a crew member put in a cell by the Head of Security is cuffed again by the officer the next time it sees them free, and walked back to the brig for a second term on a warrant that was served.

The case:

1. The Captain declares "Warrant for Dana Reyes, for theft." The Head of Security gives it to the officer, Hale. Hale's `beat.warrants` has Dana.
2. Hale is beaten under half health by Pun Pun while on another warrant. It sends "Joan, I could not take Pun Pun. I am hurt." The Head of Security's `deskOutcome` sets `officerOut = 'hurt'` and sets every warrant back to `given = 'no'`. `syncDesk` then has nobody to serve and calls `giveWarrant` on itself for each warrant. Hale is told nothing: there is no line for "hand them back". Hale's own `beat.warrants` still has Dana, `tries`, `force` and all.
3. The Head of Security finds Dana, who stands for the cuffs, and puts her in Cell 2 for 5 minutes. Its own outcome is `jailed`: `deskOutcome` strikes Dana off `desk.warrants`, tells the Captain, and stops. No word goes to Hale.
4. Five minutes later the cell opens and Dana goes back to work. Hale meets her in a hallway. `target()` finds her (she is in no running cell and in none of Hale's `jailed`). `serveStep`: `warrant.force` is false on Hale's copy, so it is the quiet arrest, which a hurt officer may still make. "Dana Reyes, you are under arrest, for theft. Stand still." She stands still, is cuffed, and is walked to a cell for another five minutes.
5. Hale reports "Joan, Dana Reyes is in Cell 1 for 5 minutes." `deskOutcome` finds no warrant, still writes `desk.held`, counts a second arrest, and tells the Captain "Captain, Dana Reyes is in Cell 1 for 5 minutes". The Captain sees a second arrest on a warrant already served, and nobody can say why.

It works the other way too: if the hurt officer makes the quiet arrest first, the Head of Security's own copy is left in its `beat.warrants`, and while `officerOut` stays set (it is cleared only by the Captain's "try again"), `syncDesk` never calls `handBack`, so the Head of Security arrests her again when the cell opens.

The same double holding comes about with two officers aboard and a Head of Security, since `officerAboard` is "one in sight, or the first on the PDA" and so is not always the same officer; and in the pardon case the let-go word goes to only one of them.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:802`, the officer out hurt: the desk takes the warrants, nothing goes to the officer:

    case 'hurt':
      ...
      } else {
        desk.officerOut = 'hurt';
        for (const it of desk.warrants) {
          it.given = 'no';
        }

`desk.ts:954`, in `syncDesk`, with nobody to send:

    for (const warrant of desk.warrants) {
      if (!officer) {
        // Nobody to send. It serves the warrant itself.
        giveWarrant(brain, warrant);
        warrant.given = 'taken';

`desk.ts:765`, a warrant served: only the desk's own list is struck.

    case 'jailed': {
      ...
      if (warrant) {
        desk.warrants = desk.warrants.filter((it) => it !== warrant);
        desk.serial += 1;
      }
      tellCaptain(...)

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:281`, `target`, which counts as free anyone not in a cell it put them in or can see running:

    const shut = inCells(brain);
    return brain.peopleInView.find(
      (person) =>
        sameName(warrant.name, person.name) &&
        person.name !== brain.name &&
        !shut.includes(person.name),
    );

`arrests.ts:755`, in `serveStep`: hurt, it refuses only force.

    const force = warrant.force && !beat.hurt;
    if (warrant.force && beat.hurt) {
      return { ready: false, ... };
    }

The officer's side reads only give, seen, let-go and again lines from its head (`takeWord` in `jobs/officer.ts:313`), so there is no word it could be sent today that means "that one is served".

## How it was found

Read from the code, both halves of the desk and the beat. Not run in the simulator: the `hurt` scenario ends before any second arrest is tried. Not seen in a round.

## How to fix it

1. Give the desk one place that knows a warrant is done: in `deskOutcome`, `case 'jailed'`, after striking it from `desk.warrants`, tell the officer to drop it if the officer was ever given it (`warrant.given !== 'no'` before the hurt reset, so keep a `wasGiven` flag on the warrant) and it was not the officer that reported it. Use a fixed line such as "Hale, Dana Reyes is in a cell: the warrant is served." (built in `security.ts` beside `letGoLine`, with its own pattern beside `LET_GO_WORDS`), read in the officer's `takeWord`.
2. Checker's correction: what that line and the desk's own copy call must not be `dropWarrant`. `dropWarrant` (arrests.ts:182) also pushes a let-go when `had && cuffed`, and a prisoner who is not a crew NPC is left in their cuffs in the cell (`tool_jail`), so an officer or a Head of Security standing in the brig, seeing them cuffed in there, would open the cell the other has just shut. Add a plain `forgetWarrant(brain, name)` in arrests.ts that only filters `beat.warrants` (and finishes the SERVE task, which `syncBeat` does already), and call it for the served line and, in `deskOutcome` `case 'jailed'`, on the Head of Security's own beat when the outcome came from the officer.
3. Leave out the finder's step 3 (have the hurt officer hand all its warrants back). It goes against what was built and planned: a hurt officer "still follows sightings" (LLM_CREW_PLAN_SECURITY.md:270) and "Someone who stays put for the cuffs it still arrests" (LLM_CREW_CHANGELOG.md:583). Steps 1 and 2 end the double arrest without it. If both holders going after one person at once should also stop, that is the owner's call.
4. As a net, in `serveStep` before arresting on its own copy, skip one it has heard was put in a cell on this warrant (needs step 1's line). With steps 1 and 2 this is belt and braces; it can be left out.
5. Two officers (MULTI-01) need the served line sent to every officer the warrant was given to, not only to `officerAboard`. That is MULTI-01's fix; this one should not wait on it.

## How to test the fix

- Simulator: extend the `hurt` scenario so that the Head of Security serves the remaining warrant on a crew NPC who stands still, then let the cell time run out and walk the prisoner past the officer. The officer must not arrest them again.
- The reverse: the hurt officer makes a quiet arrest while the Head of Security holds a copy. After the cell opens the Head of Security must not arrest them.
- With a prisoner who is not a crew NPC (left in cuffs in the cell) and the other holder standing in the brig when the served word comes: no `free` may be sent.
- Type check.
- In a round, grep `game.log` for two "arrested" lines on one name with one warrant, and `pda.log` for two "is in Cell" lines to the Captain for one name.

## Check

Read `deskOutcome` (desk.ts:735-840, the `jailed` and `hurt` cases), `syncDesk` (desk.ts:938), `strike`, `officerAboard` and `serving` (desk.ts:152-165), the Captain's "try again" (desk.ts:441), the officer's `takeWord` (officer.ts:313), and in arrests.ts `giveWarrant`, `dropWarrant`, `handBack`, `inCells`, `target`, `syncBeat`, `serveStep` and the `jail` branch of `beatAfterActing`. The quotes match today's code. On `hurt` the desk sets every warrant to `given = 'no'` and `syncDesk` copies each into its own beat; nothing tells the officer, and the officer's `syncBeat` keeps its warrants when it breaks off. A `jailed` outcome strikes only `desk.warrants`, from either side; nothing removes the other holder's beat copy, and `handBack` is not reached while `officerOut` is set. After the cell timer stops, `target` (which leaves out only those in `beat.jailed` or a running cell) finds the person again, and `serveStep` gives a hurt officer the quiet arrest when `warrant.force` is false. The plan and change log say a hurt officer still follows sightings and still makes the quiet arrest, so the officer keeping its copy is by design; the missing word when the warrant is served is not.

Not run: `deskOutcome` is not exported, and the reading is plain. Confirmed. Severity stays high: it is a second arrest and a second term on a warrant already served, the wrong person acted on, though it needs the officer to have broken off hurt first. Effort raised to medium: a new fixed line, its pattern, a handler in the officer, a helper in arrests.ts and two calls in the desk, across four files of the window. The fix is mended: the finder's steps used `dropWarrant`, which can open the cell of a prisoner left in cuffs, and its step 3 would undo a built and planned behaviour.

## Fix note, second round (the simulator test)

The `hurt` scenario in `tools/llm_crew/sim.ts` now runs 11 minutes, long enough for the monkey the Head of Security put in a cell to be let out when its five minutes are up. Let out, the monkey goes where the hurt officer is. Three new checks: the Head of Security tells the officer "Hale, Pun Pun is in a cell: the warrant is served."; the monkey is in the officer's sight for at least ten seconds after it is let out; and nobody arrests it again or tells it it is under arrest, with one jailing in all. Passed 3 times of 3. Not covered: the finding's crew NPC who stands still. The monkey bit the officer, so the officer's copy has `force` set and a hurt officer would not arrest it even if it kept the copy; only the first check would catch the old fault here. The reverse case (the hurt officer's quiet arrest while the Head of Security holds a copy) and the prisoner left in cuffs with the other holder in the brig are not in the simulator.
