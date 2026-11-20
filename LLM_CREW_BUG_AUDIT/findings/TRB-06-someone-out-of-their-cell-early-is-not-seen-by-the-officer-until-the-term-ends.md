---
id: TRB-06
title: Someone who gets out of their cell before their time, let out by a player or breaking out, is not seen by the officer until the term would have ended, even on a new warrant
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:271, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:439, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:944, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:251
fix: In inCells count a name from beat.jailed only while that person is not in view outside a running cell, and drop the jailed and held entries when they are seen out
---

## What is wrong

Once the officer has put someone in a cell, its window takes it that they are in that cell until the minutes it set have gone by, whatever it sees. `inCells` puts every name in `beat.jailed` on the list of people "shut in a cell", and `target` passes over anyone on that list. So if the prisoner is out early, the officer looks straight at them and does not see them as anyone it has business with.

Ways a prisoner is out early, all ordinary in a round with players: the Captain or any player with brig access presses stop on the cell timer; a friend breaks the cell's glass door; the prisoner breaks it themselves; a power cut and a crowbar on the dead door. None of them are seen by the crew: nothing in the window watches a cell after the jailing.

The case:

1. The officer puts Dana Reyes, a player, in Cell 1 for 15 minutes. `beat.jailed["Dana Reyes"].until` is 15 minutes on. The Head of Security's `desk.held` says the same.
2. Two minutes in, Dana smashes the cell door and walks out.
3. The Captain sees her in the hallway and declares again: "Warrant for Dana Reyes, for breaking out." The desk takes it (it is no longer on `desk.warrants`) and gives it to the officer.
4. The officer has Dana in view at its post. `target()`: `inCells` includes "Dana Reyes" from `beat.jailed`, so `!shut.includes(person.name)` is FALSE and she is not a target. `serveStep` finds nobody in sight, walks to where she was last reported, looks for twenty seconds with her in front of it, and walks the hallways.
5. Staff who see her send sightings; each one sends the officer to look, and each look finds no one. This lasts for the 13 minutes left of the old term. Meanwhile the Head of Security's staff meeting report to the Captain says "In the cells: Dana Reyes in Cell 1."

Without a new warrant the harm is smaller but still real: the desk tells the Captain she is in a cell when she is not, and nobody tells the Captain she is out.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:271`:

    /** The names of those it knows to be shut in a cell: ones it put there, and ones it can see there. */
    function inCells(brain: NpcBrain): string[] {
      return [
        ...Object.keys(beatOf(brain).jailed),
        ...(brain.security?.cells ?? []).flatMap((cell) =>
          cell.running ? (cell.occupants ?? []) : [],
        ),
      ];
    }

`arrests.ts:281`, `target`, which passes over every name on that list:

    const shut = inCells(brain);
    return brain.peopleInView.find(
      (person) =>
        sameName(warrant.name, person.name) &&
        person.name !== brain.name &&
        !shut.includes(person.name),
    );

`arrests.ts:439`, the only way a `jailed` entry goes, by the clock:

    for (const [name, held] of Object.entries(beat.jailed)) {
      if (brain.now > held.until) {
        delete beat.jailed[name];
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:944`, the desk's `held`, likewise by the clock only, and `inTheCells` (desk.ts:251) reports it to the Captain.

The server already tells the window what it would need: `security.cells` has, for each cell in view, whether its timer runs and who is in it (`security_state`, `crew_npc_security.dm:1601`), and `peopleInView` has everyone in sight with their room.

## How it was found

Read from the code. Not seen in a round: no round so far has had a prisoner out early.

## How to fix it

1. In `inCells`, take a `beat.jailed` name only if that person is not in `brain.peopleInView` standing outside a running cell. Simplest rule: if they are in view and not among the `occupants` of any cell in `security.cells` that is `running`, they are not shut in. `running` and `occupants` are null for a cell the body cannot see (`security_state`, `crew_npc_security.dm:1619`), but someone in view standing inside a cell puts that cell's floor in sight, so the cell is seen; the rule needs no more than that. Compare names with `sameName`, as `target` does with the warrant's name, since `beat.jailed` is keyed by the name the server gave back.
2. In `syncBeat`, when that is seen, delete the `beat.jailed` entry and push an outcome so the desk hears it, for example `{ what: 'freed', name }` with a new field `early: true`, or a new kind `out` read by `readOutcome` from a fixed line such as "Joan, Dana Reyes is out of Cell 1 before their time." The desk deletes `desk.held` and tells the Captain in fixed words. Whether someone out early is to be arrested again without a new warrant is the owner's to say; until then, telling the Captain is enough, since the Captain can declare again.
3. The Head of Security should do the same for `desk.held` when it sees the person out of the cells (it shares `peopleInView` and `security.cells`).

## How to test the fix

- `tools/llm_crew/security.ts`: a case for `inCells`/`target` where `beat.jailed` holds a name, the person is in `peopleInView` in a hallway, and `security.cells` shows the cell `running: 0` or not listing them. `target` must find them. `target` is not exported; test it through `syncBeat`: the officer's `serve` task for that name must turn `emergency` and the warrant get `ownSeenAt`, and `planBeat` must give the "you are under arrest" step, not "is not in the ...". The check below did exactly this and can be lifted into the file. Add the case the other way too: the person in view inside a cell seen `running: 1` with them in `occupants` stays passed over.
- A case for the desk: after an `out` (or `freed`, early) outcome, `inTheCells` no longer names them.
- Simulator: after the `warrant` scenario's jailing, stop the cell in the simulated server and walk the prisoner past the officer with a new warrant. The officer should arrest.
- Type check.

## Check

Confirmed. Read `inCells` and `target` (arrests.ts:271-293), the clock-only expiry of `beat.jailed` (arrests.ts:439) and of `desk.held` (desk.ts:944), `inTheCells` (desk.ts:251, used by the Head of Security's report at headofsecurity.ts:101 and desk.ts:1170), and the desk's warrant intake (desk.ts:461-540): a new warrant is refused only if the name is on `desk.warrants`, so a second one on someone in `desk.held` is taken and passed on. `giveWarrant` (arrests.ts:131) takes it too. The only other way a `jailed` entry goes is the `free` branch of `beatAfterActing` (arrests.ts:1223), after a pardon. Nothing in the change log or plans covers a prisoner out early.

Ran a throwaway bun script on the window code with `tools/llm_crew/fixtures.ts`: an officer in the Central Primary Hallway with Dana Reyes in view, a warrant on her, and `security.cells` showing Cell 1 not running and empty. With `beat.jailed["Dana Reyes"]` set, after `syncBeat` the serve task stayed `asked`, `ownSeenAt` was not set, and `planBeat` said "Dana Reyes is not in the Central Primary Hallway." With the entry taken out, the same brain gave `emergency` and "Dana Reyes, you are under arrest, for breaking out. Stand still." So the fault is as written.

Effort raised to medium: step 1 alone is a few lines, but steps 2 and 3 add an outcome the desk must read and act on, across arrests.ts, desk.ts and readOutcome. Not related to SEC-05, which is the server's own `jailed` list, a separate record.
