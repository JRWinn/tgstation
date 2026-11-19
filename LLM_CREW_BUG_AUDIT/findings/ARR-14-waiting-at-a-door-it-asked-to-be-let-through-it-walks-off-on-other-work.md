---
id: ARR-14
title: Having asked to be let in at a door, security walks off on its other warrant or for its kit, and is not there when the door is opened
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:604, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:356, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:513
fix: Set asked true on the wait in letInStep once it is at the door, as the janitor's wait at a door does, so the wait outranks its other asked work
---

## What is wrong

Shut out of a room where someone it has a warrant on was seen, security walks to the door, sends someone whose ID opens it a PDA message ("I am at the Kitchen door of the Bar with a warrant for Pun Pun. Could you let me in, please?"), and then waits there 90 seconds for each person asked (`letInStep`). That wait is `{ ready: false, wait: true }`.

The task list puts a wait like that behind any other work of the same urgency that is ready (`workInOrder`: `isCalledFor`, then "ready before not ready"), unless the plan also says `asked: true`. The comment on `isAskedWait` was written for exactly this: "it has knocked at a door and sent word that it is there, and whoever comes to open it has to find it standing there. Ranked with its other calls, the wait lost to every one of them that it could walk to." The janitor's wait at a door sets `asked: true`. Security's does not.

So when the person it is shut out from is not in its sight (the serve task is then `asked`, not `emergency`), any other `asked` task that is ready wins, and the driver's loop takes it before it reaches the wait (`driver.ts:513`, the wait only stops the loop when nothing ready came before it). Security walks off. The other work it may have:

- **Another warrant.** Its plan is a walk: to a sighting, or the next main hallway.
- **Its kit.** The `security_kit` task is `asked`. Short of cuffs or a charged baton, and with nobody it is after in sight, it walks to the lockers.
- **A desk task**, for an officer keeping the list itself (all `asked`): a notice to the heads, or the like.

Whoever it asked then comes and opens the door to find nobody. A crew NPC holding the door (`hold_door_for`) waits a while and gives up. When the officer comes back, its 90 seconds have run out, so it asks the next person, and after three it gives up: "I cannot bring in Pun Pun: nobody has opened the Bar for security", and the Head of Security has engineering force a door that was opened.

One concrete case: warrants on Pun Pun (the Captain sent "Pun Pun is in the Bar" a minute ago) and on Dana Reyes (no word). The Bar is locked to the officer and is in `blockedPlaces`, so Pun Pun's serve task goes to `letInStep`. The officer walks to the Bar's door (`go_to_door`) and messages the Captain. Next pass: Pun Pun's plan is the wait. Dana's plan is `go_to('Aft Primary Hallway')`, ready. Both tasks are `asked`. Dana's sorts first, so the officer walks to the Aft Primary Hallway. Once it is there, Dana's plan is the look (a wait), and Pun Pun's is `go_to_door` again (it is no longer at the door, and a walk there that worked does not count against `DOOR_TRIES`), which is ready and wins. So it walks back to the Bar's door, where Pun Pun's plan is the wait again and Dana's is the walk to the hallway again. It goes back and forth between the two for the 90 seconds, and is at the door only for the moment between. The Captain walks to the Bar and opens the door. Most likely nobody is there.

When the person it is after is in its sight through a window or across a counter, the serve task is an emergency and comes first, so the wait holds. The fault is in the far more common case, a sighting passed on by someone else.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:604`, in `letInStep`:

    const last = shut.asked[shut.asked.length - 1];
    if (last && brain.now - shut.askedAt < LET_IN_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        step: `${name} is in the ${shut.place}${within}, which is locked to you. You have asked ${last} to let you into the ${door}, and are waiting${atDoor ? ' at the door' : ''}.`,
      };
    }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:356`, in `workInOrder`:

    // Then a wait it has asked for: it has knocked at a door and sent word that it is there,
    // and whoever comes to open it has to find it standing there. Ranked with its other
    // calls, the wait lost to every one of them that it could walk to, so a janitor with
    // two calls asked at each door in turn and was never at either when it was opened.
    Number(isAskedWait(b)) - Number(isAskedWait(a)) ||
    // Then what someone is waiting on, if it can be got on with: ...
    Number(isCalledFor(b)) - Number(isCalledFor(a)) ||

`tasks.ts:377`:

    function isAskedWait(work: { task: Task; plan: Plan }): boolean {
      return !work.plan.ready && !!work.plan.wait && !!work.plan.asked;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:689`, the janitor's wait at a door, for comparison:

    if (brain.now - asks.at < LET_IN_WAIT_DS) {
      return {
        ready: false,
        wait: true,
        asked: true,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:445`, the kit task is `asked`:

    keep(brain, KIT, kit, 'asked');

## How it was found

Read from the code: the plan, the sort and the driver's loop. Not seen in a round; no round so far has had two warrants standing with one of them shut out.

## How to fix it

1. In `letInStep`, add `asked: atDoor` to the waiting plan. Only when it is standing at the door: a body that could not get to the door and asked from where it is (`letInFarLine`) has said it is not there, and need not stay put.
2. Nothing else is needed for the sort: `isAskedWait` ranks it above every other non-emergency task, and the driver's loop then stops at it.
3. An emergency (someone else it has a warrant on coming into sight) still comes first, which is right. That break-off is ARR-08's business.

## How to test the fix

- `tools/llm_crew/security.ts`: two warrants, one with `shutOut` and `asked` set and `atDoorOf` equal to its door, the other with no sighting; `nextStep` should be null (waiting), not a `go_to` to a hallway.
- A simulator scenario with two warrants and a locked room: the officer should stay at the door until it is opened or its 90 seconds are up.
- In the next round, grep `pda.log` for "Could you let me in, please?" from security, and `game.log` for the officer's walks in the 90 seconds after it.

## Check

Checked by Opus 5.5 on 2026-11-19. Read `letInStep` (arrests.ts:561-634; the wait at :604-611 has no `asked`), `workInOrder`, `isAskedWait` and `isCalledFor` (tasks.ts:335-384), the driver's loop over the sorted work (driver.ts:500-545: a non-routine wait stops the loop only while `ready` is still empty), the janitor's wait at a door (janitor.ts:689, which sets `asked: true`), `Plan.asked` (types.ts:912-916), `syncBeat`'s task urgencies (arrests.ts:445 the kit, :500 the serve task, `emergency` only with the person in sight or held) and `serveStep`'s sighting and hallway branches. The quotes match today's code. Another warrant's walk, or the kit trip, is `asked` and ready, so `isCalledFor` puts it before the wait, and the driver takes it. The change log's entry that built `isAskedWait` (LLM_CREW_CHANGELOG.md:664) did it for the janitor only; nothing says security was left out on purpose. One part was mended: the officer does not walk the hallways on and on, it goes back and forth between the door and the other work, because the serve task's plan turns into a ready `go_to_door` the moment it leaves. That does not save it. The fix is right and small: `asked: atDoor` on that one return. With it, the wait outranks every non-emergency task, the desk tasks of a Head of Security among them, for at most `LET_IN_WAIT_DS` (90 seconds) per person asked, which is what the janitor already does.
