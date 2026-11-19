---
id: DESK-02
title: Once a janitor has been let into a room, its next call to that room is given up as nobody let you in before it sets off
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:484, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:735, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:887, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:655
fix: Clear brain.letInAsks for a door once the janitor is through it, and whenever no open mess task asks at that door, so each new call starts with a knock
---

## What is wrong

What a janitor has done to be let into a locked room (knocked, sent word, said so) is kept in `brain.letInAsks`, by door. Nothing clears an entry when the janitor is let in, cleans and leaves, or when the call is done. An entry is only deleted when someone says no (`REFUSED_WORDS`), or by `meets` when someone from cargo comes into view more than a minute after the last ask.

So the next call to the same room finds the old entry. `syncTasks` reads it as "has knocked and messaged, and more than a minute has gone by" and blocks the new task at once with `NOT_LET_IN`. The janitor never walks to the door, never knocks, and never sends word. The task is `blocked`, so `tasks.ts:154` never drops it for age either: it sits on the list, waiting on someone from cargo to come into view.

Concrete case, MetaStation:

1. Victor, a cargo technician, sends the janitor "There is a mess in the Cargo Bay: pool of oil. Could you come and clean it up, please? Come to the Cargo Lobby and I will let you in."
2. The janitor goes to the Cargo Bay door, knocks (`letInAsks['Cargo Bay'].knocked = true`), messages Victor (`messaged = true`), is let in, cleans, is let out. The entry stays.
3. Fifteen minutes later Victor sends the same call for a new mess there. `readsMessage` adds a new CLEAN task with `via = 'Cargo Lobby'`.
4. In the same update, `syncTasks` reaches the `task.via` branch: `asks` is the old entry, `hasAsked` is TRUE, `brain.now - asks.at > LET_IN_WAIT_DS`, no door is held, so `blockTask(task, NOT_LET_IN)`.
5. The janitor goes on with other work, or explores. Victor's calls go unanswered and he moves on to other janitors, who will do the same on their second call.

It also breaks the step order when the entry is younger than a minute: `letInStep` skips the knock and the PDA message (`!asks?.knocked` is false), so a janitor back at the same door soon after sits waiting without knocking.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:484`, in `syncTasks`:

    const asks = brain.letInAsks[doorFor(brain, task.place)];
    const givenUp =
      !!asks &&
      hasAsked(brain, task, asks) &&
      brain.now - asks.at > LET_IN_WAIT_DS &&
      !brain.doorHeld;
    blockTask(task, givenUp ? NOT_LET_IN : null);

`janitor.ts:735`, `noteAsked`, which only ever adds:

    const asks = brain.letInAsks[place] ?? { at: brain.now, count: 0 };
    asks[what] = true;
    asks.at = brain.now;

The only deletes, `janitor.ts:873` (told no) and `janitor.ts:891` (`meets`, cargo only):

    for (const [place, asks] of Object.entries(brain.letInAsks)) {
      if (brain.now - asks.at > ASK_AGAIN_AFTER_DS) {
        delete brain.letInAsks[place];
      }
    }

`letInStep`, `janitor.ts:655`, which takes an old knock for a new one:

    if (!asks?.knocked) {

A grep of the window code for `letInAsks` finds it only in `janitor.ts` and the brain's start value in `brain.ts:313`.

## How it was found

Read from the code, then run in a throwaway bun script in the system temp folder (fixtures `janitor('mop')`, the real `readsMessage`, `afterActing` and `syncTasks`): a call to the Cargo Bay, a knock and a message, let in and done, then the same call 9000 ds later. It printed:

    asks after call1 {"Cargo Bay":{"at":3010,"count":2,"knocked":true,"messaged":true}}
    task after in room done
    call2 task 2 blocked nobody let you in, and you will ask again when someone who works there turns up

The server side was checked for whether `person_in_view` would clear it in time: `crew_npc_senses.dm:192` only raises it for someone not seen in the last `CREW_NPC_SIGHT_MEMORY`, and a janitor blocked on this does not go near cargo, so it may never come. Not seen in a round.

## How to fix it

1. In `syncTasks`, before the loop over CLEAN tasks, delete every `brain.letInAsks[door]` for which no open CLEAN task with `via` has `doorFor(brain, task.place) === door`. A call that is done or dropped then leaves nothing behind.
2. Also delete `brain.letInAsks[door]` when the janitor is standing in `door` (it has been let through). Do this after `doorFor` is worked out for the room inside, so a nested room's outer door is cleared once it is in the outer room.
3. Keep the refusal delete and the `meets` delete as they are.
4. Keep `hasAsked` and the wait as they are: with the entry cleared, a new call starts from the knock.

## How to test the fix

- Simulator: a janitor called by a technician to the Cargo Bay, let in, cleans, let out. Then a second call to the Cargo Bay ten minutes later. It must walk to the door, knock and message again. Before the fix the second task is blocked on "nobody let you in" at once.
- Type check from `tgui/`.
- Next round: grep `crew_brain.log` for "nobody let you in" and check each follows a real knock in `game.log` for that call.
