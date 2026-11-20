---
id: TRB-02
title: A pardon or a withdrawn warrant that comes while the cuffs are going on leaves the person cuffed and held by the arm for the rest of the round
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 829851c8851, d58b7dc2aab, 111a7206845
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

1. Have `dropWarrant` note each name it drops with the flag and the time: `beat.dropped = [{ name, pardoned, at: brain.now }]`, kept a minute. In `beatAfterActing`, in the `arrest` branch, before `if (!warrant) return;`: if the act was not `how: 'stop'`, the task is a SERVE task whose item is on `beat.dropped`, and the answer says the cuffs went on (`ok || details.cuffed`), push `{ name: task.item, pardoned: <from beat.dropped>, tries: 0 }` onto `beat.toFree` (unless it is there already). The task is still found: `finishTask` (tasks.ts:108) only marks it done, and `noteResult` (driver.ts:964) looks it up by id. Keying on `beat.dropped`, not only on "the warrant is gone", keeps ARR-13 apart: a warrant the Head of Security handed back is gone from its beat too, and that prisoner is still wanted.
2. A net in `syncBeat` (the finder's step 2) needs two guards the finder did not give, or it does harm:
   - `security.holding` is whoever the body is pulling (`var/mob/living/held = body.pulling`, crew_npc_security.dm:1623), not whoever it arrested. A Head of Security or officer walking a trespasser out of its post (`take_hold_of`, crew_npc_guarding.dm:173) is "holding" them on no warrant, and the net would raise an emergency FREE task in the middle of the eviction. Take the net only for someone held who is also seen `cuffed`, or better have `security_state` send `arrested` (the server's own `arrested` weakref) and test that.
   - A Head of Security that handed a warrant back mid-arrest (ARR-13) holds a wanted prisoner whose warrant is on its desk, not its beat. The net must also skip anyone named in `deskOf(brain).warrants` when the brain keeps a desk.
3. Keep `freeStep` as it is: `tool_free` (crew_npc_security.dm:1284) finds the one held through `arrested` and takes the cuffs off.

## How to test the fix

- Simulator: in the `warrant` scenario, have the Captain send "Pardon <name>." in the tick after the officer sends `arrest`, and have the simulated arrest come back cuffed. The officer should then send `free` for that name, and the Head of Security's list and the officer's hold should both be empty.
- The same with "Cancel the warrant on <name>" from the head that declared it.
- If the net is built: a scenario where the officer (or Head of Security) walks a trespasser out of its post by the arm, with no warrant on them. No FREE task may open and the eviction must finish. And ARR-13's scenario: the Head of Security that handed the warrant back must not let its prisoner go.
- Type check.
- In a round, grep `game.log` for "arrested" followed by "took the cuffs off" for the same name after a pardon.

## Check

Read `dropWarrant`, `handBack`, `syncBeat`, `serveStep`, `beatAfterActing` (arrests.ts), the officer's `takeWord` (officer.ts:313, the let-go line calls `dropWarrant` once, when the word comes), `strike` (desk.ts:259), the driver's busy rule and `orderToDrop` (driver.ts:631, :726), `noteResult` (driver.ts:943), `make_arrest`, `hold_arrested`, `tool_free` and `security_state` in crew_npc_security.dm, and the plan's pardon rule (LLM_CREW_PLAN_SECURITY.md:319). The quotes match today's code, and the change log (LLM_CREW_CHANGELOG.md:597) says a pardon ends "an arrest under way", so this is not chosen behaviour.

Ran a throwaway bun script (outside the repo): an officer with a warrant on Dana Reyes, in sight and not yet cuffed; `dropWarrant(..., true)` leaves `toFree` empty; then `security.holding` set to her, her seen cuffed, `beatAfterActing` with an `arrest` that came back `ok` and `cuffed`, and `syncBeat`: no warrant, nothing on `toFree`, no outcome, no open task. Nothing lets her go.

Confirmed. Severity lowered to medium: the word has to reach the officer in the few seconds an arrest act runs, after passing through the Head of Security, which is a narrow window and will not come up in most rounds; when it does, the harm lasts the round. The fix is mended: the finder's net in `syncBeat` would have fired on any eviction by the arm, because `holding` is whoever the body pulls, and on ARR-13's prisoner, who is still wanted.

## Reopened in round two (branch crew-bug-fixes-medium)

The round-one fix (fixed_in above) does not cover the race this finding is about. The new simulator scenario `pardonmid` shows it: when the pardon reaches the officer while its arrest runs, dropWarrant removes the warrant, syncBeat finishes the serve task and syncTasks prunes it in the same pass, so when the arrest comes back cuffed `beatAfterActing` finds no task and the person is held for good. Being fixed in round three, in jobs/arrests.ts.

Round three (branch crew-bug-fixes-medium): d58b7dc2aab. When the serve task is gone by the time the arrest answers, beatAfterActing hands it to cuffedOnNoWarrant (jobs/arrests.ts), which names the person by the task, else by the arrest handle in people in view, else by security.holding, and matches beat.dropped, so a pardoned person cuffed mid-arrest is let go. The `pardonmid` scenario passes on it and fails on the code before it.
