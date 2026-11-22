---
id: PLAY-05
title: A janitor's spoken open that door, naming no room, replaces its PDA ask for the Mining Office, so the door is opened with no hold and the technician refuses the janitor it sent for
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: 3bffe3a08f4
found_by: Opus 5.5
checked_by: Opus 5.5
area: doors
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2525, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1512, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1318, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:882, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2165, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1046
fix: In putAsk, a newer ask from the same person that names no room, and no other door, keeps the room, door and PDA marks of their standing ask, and a DOOR task whose open_door is still in flight is not finished
---

## What is wrong

A cargo technician sends a janitor a PDA message about a mess in the Mining Office. The janitor PDAs back that it is at the door. The technician answers by PDA that it is coming, and walks to the door. While it walks, the janitor says something aloud with the word "door" in it and no room: "open that door so I can get back to work". That line is a new ask, and it takes the place of the PDA ask, because a second ask from the same person is taken as their newer word (`putAsk`, from KNA-01's fix). The new ask has no room. `mayPass` then reads no room as the post, the Cargo Bay. The Cargo Bay has no mess and nobody sent the janitor there, so the janitor may not pass. `doorWanted` turns null.

Three things follow, all wrong:

1. The voice is told "You are not opening it for them: a door of your department is only opened for a janitor that you or a workmate sent for". It says so to the very janitor it sent for, two seconds after the door opened for them.
2. `syncTasks` finishes the DOOR task for the janitor and the Mining Office, and the done task is pruned from the list. The server is already on its way and opens the door anyway. When the result comes back, `noteResult` looks the task up by id and finds nothing. So `afterActing` does none of its door work: no `dropAsk`, no `lastOpened`, no `noteLetIn`, and no DOOR_WATCH. With no watch the technician does not stand by the door. It walks back to its post at once, and the door shuts before the janitor gets to it.
3. The spoken ask is never dropped, so the refusal cue keeps coming for the rest of `DOOR_ASK_DS`.

The janitor is shut out of a room it was sent to clean, and has to PDA again. The KNB-04 hold never starts, so no "done holding" line is ever written.

The concrete case, from round-15.44.36. Kailyn Patterson (cargo technician, has the rooms) had sent Hayden Griffiths (janitor) about oil in the Mining Office.

1. 22:10:31 Hayden PDAs "I am at the Mining Dock Maintenance door of the Mining Office". `readsMessage` puts an ask with `room: 'Mining Office'`, `byPda: true`. `doorWanted` returns Hayden and the Mining Office. A DOOR task is added and Kailyn PDAs that she is coming.
2. 22:10:39 Hayden says aloud "Kailyn, ... open that door so I can get back to work." `roomAskedIn` finds no room. `overhears` calls `putAsk` with `room: undefined`, no `byPda`. Same name, so it replaces the PDA ask. The room differs, so `answered` is not carried over either.
3. `mayPass(brain, 'Hayden Griffiths', undefined, false)`: `wanted = room ?? post` is the Cargo Bay. No mess there, no call to there. It returns null. `doorWanted` is null.
4. In `syncTasks` the DOOR task (Hayden, Mining Office) no longer matches `wants` and is finished, then pruned.
5. 22:10:40.458 the server opens Mining Dock Maintenance "to let Hayden into Mining Office". The result finds no task.
6. 22:10:42 Kailyn's voice, given the refusal cue, says she can only open the door for a janitor she sent.
7. At 22:10:46 Kailyn's body is told it is "away from your post ... on your way back to it" and walks off. By 22:10:49 she is back in the Cargo Bay. Hayden, at (76,164) by the door at (75,164), finds it locked at 22:11:03 and has to PDA again at 22:13:00.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2525`, in `overhears`, a spoken ask carries only the room it names:

      putAsk(brain, {
        name: speaker,
        at: brain.now,
        // The room they named, if they named one of the department's. Said aloud, an ask used to
        // carry no room, and was taken for the post whatever room it named.
        room: askedRoom,
        out: LET_OUT_WORDS.test(heard),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1512`, `putAsk`, the newer ask replaces the person's older one whatever room each names. Only `answered` and `refused` are kept, and only for the same room:

    function putAsk(brain: NpcBrain, ask: DoorAsk): void {
      const before = askFrom(brain, ask.name);
      if (before && before.room === ask.room && !!before.out === !!ask.out) {
        ask.answered ||= before.answered;
        ask.refused ||= before.refused;
      }
      const list = doorAsks(brain).map((it) => (it === before ? ask : it));

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1318`, in `mayPass`, no room is the post:

      const wanted = room ?? post;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:882`, in `syncTasks`, the DOOR task goes when `wants` changes, though its `open_door` is still on its way:

      for (const task of brain.tasks) {
        if (
          task.kind === DOOR &&
          task.state !== 'done' &&
          (task.item !== wants?.name || task.place !== wants?.room)
        ) {
          finishTask(brain, task);
        }
      }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:150`, the done task is pruned in the same pass (a DOOR task has no `askedBy`):

      brain.tasks = brain.tasks.filter((task) => {
        if (task.state === 'done') {
          // A finished task is only kept while someone has yet to hear of it.
          const owedWord = task.askedBy && !task.reported;

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:1046`, in `noteResult`, the result is matched to the task by id:

      jobFor(brain.job).afterActing?.(
        brain,
        last.act,
        brain.tasks.find((task) => task.id === last.task),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2165`, in `afterActing`, all the door work hangs on finding that task:

        if (task?.kind === DOOR) {
          if (task.item) {
            dropAsk(brain, task.item);
          }

and further down, at 2235, the DOOR_WATCH that holds the technician by the door is only added inside that branch.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1939`, in `cues`, the refusal:

      } else if (brain.doorAsked && brain.now - brain.doorAsked.at < DOOR_ASK_DS) {
        // Someone has asked who is not being let in. What it says has to match what it does.
        lines.push(
          `${brain.doorAsked.name} has asked you about the door. You are not opening it for them: ...

## How it was found

Seen in a round log, round-15.44.36 (`data/logs/2026/11/19/round-15.44.36/`), then the code read.

game.log:

    [2026-11-19 22:10:31.479] ... (Hayden Griffiths) ... was told by its brain to PDA Kailyn Patterson: I am at the Mining Dock Maintenance door of the Mining Office about the mess. Could you let me in, please?
    [2026-11-19 22:10:31.539] ... (Kailyn Patterson) ... was told by its brain to PDA Hayden Griffiths: Hayden, I am coming to the Mining Dock Maintenance door of the Mining Office to let you in.
    [2026-11-19 22:10:39.265] GAME-SAY: *no key*/(Hayden Griffiths) (mob_3022) "Kailyn, I&#39;m standing here with a rag in hand waiting to scrub oil; open that door so I can get back to work." (Fore Port Maintenance (77,161,2))
    [2026-11-19 22:10:40.458] GAME: Crew NPC *no key*/(Kailyn Patterson) (owner: zimfire) opened Mining Dock Maintenance to let *no key*/(Hayden Griffiths) into Mining Office.
    [2026-11-19 22:10:42.673] GAME-SAY: *no key*/(Kailyn Patterson) (mob_3019) "Oh, Hayden! You&#39;re standing right there with your rag, but I can only open the door if you were sent by me or a workmate while the mess is still there. ..." (Fore Port Maintenance (76,163,2))
    [2026-11-19 22:11:03.812] ... (Hayden Griffiths) ... walk failed (go_to, to Mining Office): there is no way through. Stopped at Fore Port Maintenance (76,164,2) ...
    [2026-11-19 22:13:00.392] ... (Hayden Griffiths) ... was told by its brain to PDA Kailyn Patterson: I am at the Mining Dock Maintenance door of the Mining Office about the mess. Could you let me in, please?

crew_brain.log (its bracketed times run 6 hours behind game.log). Kailyn's prompt logged at 22:10:43.528, built from the state just after Hayden spoke and just before the door opened, has both the call and the refusal:

    There is a mess in the Mining Office. You have sent Hayden Griffiths, a janitor, a PDA message asking them to clean it up.
    Hayden Griffiths has asked you about the door. You are not opening it for them: a door of your department is only opened for a janitor that you or a workmate sent for, ...

The refusal line is only given when `doorWanted` is null, so by then the PDA ask for the Mining Office was no longer what was wanted. Kailyn's next prompt, logged at 22:10:57.765, shows she was back at her post nine seconds after opening, and the refusal still standing:

    [16:10:40] You open the door for Hayden Griffiths and hold it, to let them into Mining Office.
    [16:10:49] You arrive in Cargo Bay.
    You are at your post, the Cargo Bay.
    Hayden Griffiths has asked you about the door. You are not opening it for them: ...

No "You are done holding the door of Mining Office for Hayden Griffiths" line appears anywhere in crew_brain.log.

What was not seen: the window's task list itself is not logged, so that the DOOR task was finished and pruned before the result came back is read from the code, not seen. It is the only path I found that leaves the ask undropped and starts no DOOR_WATCH after an `ok` open. Whether the server-side hold was ended by Kailyn's walk back, or by the timer, is not in the log either.

See also: KNA-01 (fixed in cba515cfec5) made door asks a list and made a second ask from the same person replace the first. That fix is what lets a roomless follow-up wipe a named ask from the same person. CARGO-10 (a duplicate of KNA-01) noted that a door opened after its task was closed leaves `afterActing` with no task; there it was a different person's line, here it is the asker's own. KNB-04 is the hold that never started.

## How to fix it

1. In `putAsk` (`jobs/cargo.ts`), when `before` is from the same person, is still live (`askLive`), and the new ask has no `room` and the same `out`, treat it as the same ask said again. Copy `room`, `byPda`, `answered` and `refused` from `before` onto the new ask, and `door` too when the new ask has none. Keep the new `at` so the ask stays fresh. Do not make "no `door`" a condition: `overhears` fills `door` from the server's `near_door` whenever the speaker is within `CREW_NPC_AT_DOOR` (2 tiles) of an airlock, so a janitor standing at the very door it PDA'd about would carry that door and the fix would not apply. Only when the new ask carries a `door` that differs from `before.door` (both set) is it taken for a different door and left to replace as now. A follow-up that names a different room, or asks out where the first asked in, still replaces as now.
2. In the loop at `jobs/cargo.ts:882` in `syncTasks`, do not finish a DOOR task whose `open_door` is still on its way: skip it when `brain.lastAct?.task === task.id && brain.lastAct.tool === 'open_door'`. The result will finish it through `afterActing`, which then drops the ask, books the let-in and starts the DOOR_WATCH as it should. This also covers CARGO-10's case of someone else's line, and any other change of `wants` mid-walk.

I would do both. Step 1 is the cause seen here. Step 2 makes sure an open the server has already set off is always booked, whatever changes `wants` while it walks.

What must keep working: (19) in the change log, where a janitor standing inside the Mining Office says "I'm already at the door; step aside" and no second door is opened. That case is stopped by `idleWord` before `putAsk`, so step 1 does not touch it. A janitor who asks first to be let in and then, from inside, asks to be let out must still get the let-out, which step 1 keeps because `out` differs.

## How to test the fix

- Add a simulator scenario (`tools/llm_crew/`): a technician sends a janitor a PDA about a mess in a room inside the department; the janitor PDAs that it is at that room's door; while the technician walks there, the janitor says "open that door" with no room. Check that `doorWanted` still names the janitor and that room, that no refusal cue is given, and that after the `open_door` result a DOOR_WATCH is added and the ask is dropped.
- A second case: change `wants` (another person's ask) while an `open_door` is in flight, and check the result still books the let-in.
- Type check the tgui package.
- In the next round's game.log, after any "opened ... to let X into Y" line, look for the technician's voice refusing X within a few seconds. In crew_brain.log, look for "You are done holding the door of Y for X" after each such opening, and for no "has asked you about the door. You are not opening it" cue in a prompt where the same person is listed as sent for.

## Check

Checked by Opus 5.5 against the code at 99f4d33dd0e and the round logs. Confirmed.

What I read:

- Every quote is still what the code says: `overhears` (cargo.ts:2525), `putAsk` (1512), `mayPass` (1318), the finish loop in `syncTasks` (882), `afterActing`'s DOOR branch (2165, DOOR_WATCH at 2245), the refusal in `cues` (1939), the prune in `tasks.ts` `syncTasks`, and `noteResult` in driver.ts, which finds the task by `last.task` id.
- The line says no room: `roomAskedIn` only matches the department's own room names, and none is in "open that door so I can get back to work". `LET_OUT_WORDS` (`\bout\b|\bdone in\b`) does not match, so `out` is false. `idleWord` is false because Hayden is outside. `DOOR_WORDS` matches "door". So `putAsk` runs, and with `room` undefined against the PDA ask's 'Mining Office' it replaces it with nothing carried over.
- I looked for a way `mayPass` could still let Hayden through with no room. `wanted` is the Cargo Bay. The security branch does not apply. `boundBeyond(..., 'Cargo Bay')` would return the Mining Office only if `roomsThrough` lists the Mining Office as reached only through the Cargo Bay, and it has its own maintenance door, so it does not; and the prompt shows the refusal line, which `cues` gives only when `doorWanted` is null. `lastOpened` cannot be the reason it was null: it is only set in `afterActing`, and the result had not come back yet.
- The order of events in the logs fits the finding exactly. crew_brain.log 22:10:35.550: Kailyn's body gets `open_door("p6", "Hayden Griffiths", "Mining Office", "Mining Dock Maintenance")`. 22:10:39.265 in game.log: Hayden speaks. Kailyn's prompt at 22:10:43.528 has Hayden's line as its last event, no "[16:10:40] You open the door" event yet, "You are in the middle of going to open the door for someone", and the refusal. So the refusal was built while the open was in flight and after the spoken ask had replaced the PDA one.
- After the open: crew_brain.log 22:10:46.012, Kailyn's routine is "You are away from your post, the Cargo Bay, and are on your way back to it", `go_to("Cargo Bay")`. With a DOOR_WATCH she would have been held at the door. Her prompt at 22:10:57.765 still has the refusal, which can only be if `dropAsk` never ran. Both fit `afterActing` getting no task.
- Not a duplicate. KNA-01 (fixed in cba515cfec5) is the change that made a same-person ask replace the old one; this is a new fault that fix opened. CARGO-10 is a duplicate of KNA-01 and only notes the no-task result in passing, for another person's line. PLAY-06 is about a failed let-out. No other finding quotes the finish loop for an in-flight open.

What I changed:

- Fix step 1 and the fix line. The finder's step 1 required the new ask to have no `door`. But `overhears` fills `door` from the server's `near_door` (crew_npc_senses.dm:430) whenever the speaker is within `CREW_NPC_AT_DOOR`, which is 2 tiles. Here Hayden was at (77,161) and the door at (75,164), 3 tiles, so no door was sent. A janitor one step nearer would have carried the door and the fix as written would not have helped. Now the door only stops the carry-over when it names a different door from the one already asked at.
- Step 7 of the case: Hayden stood at (76,164) when the walk failed, as game.log says, and I added the routine line that sent Kailyn back.

What I could not settle:

- Why Hayden did not get through in the moments the door was held. Kailyn opened from outside: her prompt at 22:10:43 has her in Fore Port Maintenance at (76,163), and Hayden then says "Step back so I can reach it". She may have stood in his way, and the server's hold may have ended when she walked off. Neither is in the log. This does not change the finding: without the task, no let-in was booked, no watch was kept, and the refusal was given to the janitor she had sent for. But a DOOR_WATCH alone may not have got him in if her body was on his square.
- Severity medium and effort small are right: it needs a roomless spoken follow-up while an open is in flight, which comes up when a janitor waits at a door, and both steps are a few lines in cargo.ts.
- Step 2 of the fix is sound. `lastAct` is cleared after `LOST_ACT_MS` if no result comes, so a DOOR task kept for an in-flight open cannot stick for good. If `wants` has moved to someone else meanwhile, `syncTasks` adds their DOOR task beside the kept one, and the driver takes it after the result.

## Fix so far

Both steps done on branch `p-cargo`, in `jobs/cargo.ts` only (`putAsk`, and the DOOR finish loop in `syncTasks` reading `brain.lastAct`), so nothing in `driver.ts` was needed. Table `tools/llm_crew/cargo-play.ts`; not played.
