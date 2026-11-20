---
id: DESK-02
title: Once a janitor has been let into a room, its next call to that room is given up as nobody let you in before it sets off
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: bb64daafd00
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:484, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:735, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:887, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:655
fix: In syncTasks delete brain.letInAsks for the room the janitor stands in and for any door no open via mess task asks at, so each new call starts with a knock
---

## What is wrong

What a janitor has done to be let into a locked room (knocked, sent word, said so) is kept in `brain.letInAsks`, by door. Nothing clears an entry when the janitor is let in, cleans and leaves, or when the call is done. An entry is only deleted when someone says no (`REFUSED_WORDS`), or by `meets` when someone from cargo (a technician or the Quartermaster) comes into view more than a minute after the last ask.

That `meets` delete often saves it: the server raises `person_in_view` for anyone not seen in the last 15 seconds (`CREW_NPC_SIGHT_MEMORY`, `_defines.dm:6`), so any cargo person stepping back into sight while the janitor cleans the bay, lets it out, or passes it in a hallway later clears the entry. The fault comes when none did: the technician who let it in stayed in sight the whole time and nobody else from cargo came by, or the janitor got out on its own, and then it kept away from cargo until the next call. Once blocked, the task waits for the next cargo person it sees, which clears the entry and frees the task; it is not stuck for good, but the call is left unanswered until then.

So the next call to the same room finds the old entry. `syncTasks` reads it as "has knocked and messaged, and more than a minute has gone by" and blocks the new task at once with `NOT_LET_IN`. The janitor never walks to the door, never knocks, and never sends word. The task is `blocked`, so `tasks.ts:154` never drops it for age either: it sits on the list, waiting on someone from cargo to come into view.

Concrete case, MetaStation:

1. Victor, a cargo technician, sends the janitor "There is a mess in the Cargo Bay: pool of oil. Could you come and clean it up, please? Come to the Cargo Lobby and I will let you in."
2. The janitor goes to the Cargo Bay door, knocks (`letInAsks['Cargo Bay'].knocked = true`), messages Victor (`messaged = true`), is let in, cleans, is let out. Victor is in sight the whole time and no other cargo person comes into view once the minute after the message is up, so `meets` never deletes it. The entry stays.
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

1. In `syncTasks`, just before the loop that holds the `task.via` branch (the one over `workable`), delete every `brain.letInAsks[door]` for which no CLEAN task with `state !== 'done'` and a `via` has `doorFor(brain, task.place) === door`. A call that is done or dropped then leaves nothing behind. A task blocked on `NOT_LET_IN` is not done, so its entry is kept, and it still waits for someone from cargo as now.
2. Also `delete brain.letInAsks[brain.location]`: standing in the room, it has been let through that door. This is enough for a nested room too: once it is in the outer room, `doorFor` stops at the inner room (`outer === brain.location`), so the outer entry is not looked up again anyway and is cleared here.
3. Keep the refusal delete and the `meets` delete as they are.
4. Keep `hasAsked` and the wait as they are: with the entry cleared, a new call starts from the knock.

`afterSaying` can note `said` for a CLEAN task with no `via` when the janitor happens to be at that room's door; step 1 clears such entries too, which is harmless. Window code only, no server change. No cheat: it only forgets what it asked.

## How to test the fix

- Simulator: extend the `office` scenario (`tools/llm_crew/sim.ts`, a janitor sent for, let in and let out) with a second mess in the same room ten minutes after the first is cleaned, with no other cargo person coming into the janitor's view in between. It must walk to the door, knock and message again. Before the fix the second task is blocked on "nobody let you in" at once.
- A small table case (bun, fixtures `janitor('mop')` with `stowed = []`): call, knock, message, in the room and done, then the same call 9000 ds later. `syncTasks` must leave the new task open, and `plan` at the door must give `knock`. Also: the same call 300 ds later, standing at the door, must give `knock`, not the wait.
- Keep: a refusal still drops the task, and a task blocked on `NOT_LET_IN` stays blocked until a cargo person comes into view (`meets`).
- Type check from `tgui/`.
- Next round: grep `crew_brain.log` for "nobody let you in" and check each follows a real knock in `game.log` for that call.

## Check

Read `janitor.ts` at every quote (all still match): `syncTasks` 383-495, `letInStep` 621-701, `hasAsked`, `noteAsked`, `readsMessage` 795-885, `meets` 887-896, `afterActing` and `afterSaying`. A grep of the window code finds `letInAsks` only in `janitor.ts`, `brain.ts:313` and `types.ts:1191`; `meets` is called only from `brain.ts:657` on `person_in_view`. Read the server side of that event (`crew_npc_senses.dm:187-211`, `CREW_NPC_SIGHT_MEMORY` is 15 seconds in `_defines.dm:6`) and `isCargo` (`cargo.ts:84`, technicians and the Quartermaster). Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers it.

Ran a throwaway bun script outside the repo (fixtures `janitor('mop')` plus `stowed = []`, real `readsMessage`, `afterActing`, `syncTasks`, `meets`, `plan`):

    A no cargo met: call2 blocked nobody let you in, and you will ask again when someone who works there turns up
    B after meets at 3700 {}
    B call2 open
    C plan {"ready":false,"wait":true,"asked":true,"step":"You have knocked and asked to be let into the Cargo Bay, and are waiting by the door."}

So the fault is real (A), and so is the skipped knock on a quick second call (C). But (B) shows one cargo person coming newly into view after the minute clears it, and with a 15-second sight memory that happens often in the bay and in hallways. The first write-up missed that. So it is not "sure" and not "for good" in most rounds: severity lowered to medium, confidence to likely. Confirmed because nothing makes it impossible and the fix is cheap and safe.
