---
id: TRB-02
title: A pardon or a withdrawn warrant that comes while the cuffs are going on leaves the person cuffed and held by the arm for the rest of the round
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:182, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1093, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:713, code/modules/llm_crew/crew_npc_security.dm:1027
fix: In beatAfterActing, when an arrest comes back with the cuffs on and its warrant was dropped while it ran, push a let-go for that person; any net in syncBeat only for someone it holds cuffed whom no list it keeps has a warrant on
---

## What is wrong

The plan says a pardon stops an arrest under way: "an arrest under way stops. The officer lets go and takes the cuffs off" (LLM_CREW_PLAN_SECURITY.md:319). What is built only lets go of someone who is already by the arm, or already seen in cuffs, at the moment the word comes. An arrest takes from a few seconds (the cuffs alone, four seconds standing still) to twenty (a chase with the baton). A pardon, or a head taking back its own warrant, that lands in that time is lost, and the arrest finishes on nobody's warrant.

The case:

1. The officer has a warrant on Dana Reyes, sees her, says the arrest line and sends `arrest` with `how: 'quiet'`. The server's `make_arrest` starts the four seconds of cuffs.
2. The Captain, who has changed their mind, sends the Head of Security "Pardon Dana Reyes." `strike` takes the warrant off the list and, since it was given, has the officer told "Hale, Dana Reyes is to be let go: the Captain has pardoned them."
3. The officer's `takeWord` calls `dropWarrant`. The warrant comes off `beat.warrants`. `brain.security.holding` is still null (the hold comes at the end of `make_arrest`), and `peopleInView` does not yet show her `cuffed`, so nothing is pushed onto `beat.toFree`.
4. Nothing calls the arrest off: no emergency task is ready, and the driver lets a body that is busy carry on. The cuffs go on. `hold_arrested` takes her by the arm and answers `ok` with `cuffed: true`.
5. `beatAfterActing`: the task's warrant is gone, so `if (!warrant) return;`. Nothing is noted.
6. From now on `security.holding` is "Dana Reyes". There is no warrant on her and nothing on `toFree`. `serveStep` for any other warrant answers "You have Dana Reyes by the arm. X waits until they are in a cell", `wantsKit` is false while it holds someone, and `POST` walks her back to the Security Office in tow. Nothing in the window ever lets go of someone held on no warrant.

The Head of Security has already told the Captain "Dana Reyes is pardoned", and struck her off `desk.cuffed`, so nobody's list shows her at all. A crew NPC held like that stands for it and goes where it is pulled (`being_arrested`), so she is out of her work for good as well.

The same happens with `withdrawnLine`, and with the officer's own desk when there is no Head of Security (`strike` calls `dropWarrant` on itself).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:182`, `dropWarrant`, which looks only at what is true at this moment:

    const holding = brain.security?.holding;
    const inCell = Object.keys(beat.jailed).some((it) => sameName(name, it));
    const cuffed = brain.peopleInView.some(
      (person) => sameName(name, person.name) && person.cuffed,
    );
    if (
      ((holding && sameName(name, holding)) || inCell || (had && cuffed)) &&
      !beat.toFree.some((it) => it.name === name)
    ) {
      beat.toFree.push({ name, pardoned, tries: 0 });
    }

`arrests.ts:1093`, in `beatAfterActing`, where the arrest's answer is thrown away:

    if (act.tool === 'arrest') {
      if (act.how === 'stop') {
        ...
      }
      if (!warrant) {
        return;
      }

`arrests.ts:713`, in `serveStep`, which then holds every other warrant up behind the prisoner:

    const held = security?.holding;
    if (held) {
      return {
        ready: false,
        wait: true,
        step: `You have ${held} by the arm. ${name} waits until they are in a cell.`,
      };
    }

`code/modules/llm_crew/crew_npc_security.dm:1027`, `hold_arrested`, which takes the hold at the very end of the arrest.

## How it was found

Read from the code, both halves. Not run in the simulator (no scenario sends the pardon in the seconds of an arrest) and not seen in a round.

## How to fix it

1. In `beatAfterActing`, in the `arrest` branch, before `if (!warrant) return;`: if the act was not `how: 'stop'`, the warrant for that task is gone, and the answer says the cuffs went on (`ok || details.cuffed`), push `{ name: <the task's item>, pardoned: <true if the last let-go said pardoned>, tries: 0 }` onto `beat.toFree`. The simplest way to know `pardoned` is to have `dropWarrant` keep a short list of names it dropped in the last minute, with the flag.
2. As a net under every other way this can happen (SEC-03, ARR-08), add to `syncBeat`: if `security.holding` names someone with no warrant in `beat.warrants` and nobody on `toFree`, push them onto `toFree` with `pardoned: false`. Nobody should be held by the arm on no warrant.
3. Keep `freeStep` as it is: `tool_free` finds the one held through `arrested` and takes the cuffs off.

## How to test the fix

- Simulator: in the `warrant` scenario, have the Captain send "Pardon <name>." in the tick after the officer sends `arrest`, and have the simulated arrest come back cuffed. The officer should then send `free` for that name, and the Head of Security's list and the officer's hold should both be empty.
- The same with "Cancel the warrant on <name>" from the head that declared it.
- Type check.
- In a round, grep `game.log` for "arrested" followed by "took the cuffs off" for the same name after a pardon.
