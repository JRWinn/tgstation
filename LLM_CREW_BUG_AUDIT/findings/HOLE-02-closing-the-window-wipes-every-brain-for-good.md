---
id: HOLE-02
title: Closing the brain window, or the owner dropping off, wipes every crew member's memory for good and nothing says so
kind: gap
severity: critical
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:93, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:242, code/modules/llm_crew/crew_brain_link.dm:58, code/controllers/subsystem/tgui.dm:370
fix: Keep a copy of each brain's lasting memory on the server and hand it back when the window opens, log and announce when the window shuts, and open it again by itself when the owner is back
---

## What is wrong

Everything a crew member knows beyond what its body can see this second lives in one JavaScript `Map` in the owner's game window. When that window goes, the map is emptied. When the window comes back, each brain is made new, with nothing in it. The server keeps none of it, and writes nothing in any log to say it happened.

The window goes whenever any of these happens:

- The owner clicks the X on the Crew Brain window. Nothing warns that this lobotomises eleven bodies.
- The owner's client disconnects, crashes or times out. `/mob/Logout` calls `SStgui.on_logout`, which closes every window that mob had (`code/controllers/subsystem/tgui.dm:370`).
- The window reloads: a tgui rebuild during a round (already in the owner's notes), or a manual refresh.

When the owner comes back, nothing opens the window again. They have to know to use the "Crew Brain" admin verb.

**What is lost** (all of it is fields of `NpcBrain` made fresh in `ingest`, `brain.ts:224`): every task it was told or asked to do, the Head of Security's whole list of warrants and who is in which cell (`desk`), the officer's warrant and who it has cuffed (`beat`), every head's notice of who is wanted (`wanted`), the Head of Personnel's list of who is short of what and the order it has out (`asks`, `requisition`), the Quartermaster's order ledger other than what is written in the paper book, who was sent to collect which crate (`pickups`), the meeting in progress and when the next is due, the engine's lighting sequence and how far it had got (`engine`, `chief`), rooms it was told to keep out of (`keptOut`), what it feels about each person (`feelings`), its notes, and what it has seen in each room and container (`places`, `people`).

**What a new brain does that is wrong**, because the body carries on and the brain starts from nothing:

- `bornAt: now` and `nextMeetingAt: 0`, so every head calls a "first" staff meeting again shortly after the window opens (`syncMeeting`: `brain.nextMeetingAt = brain.bornAt + way.firstAt`), and its staff, also new, report all their work since the start of the shift as if never reported (`workReported: {}`).
- `lastSeq: npc.acked_seq`: anything the old window had acknowledged is "history, not news". A PDA message with a warrant, an order or a summons that the old brain had read and not yet finished acting on is never read again.
- An officer with someone cuffed and by the arm has no warrant for them. Someone in a brig cell has nobody who knows why or for how long, beyond the cell's own timer.
- The server still holds the old state for the body: `supply_run_active`, `ordered_numbers`, `notices_owed`, crates held for people, `custody_cell`. The new brain is shown these as facts with no history.
- Module state that is keyed by NPC id and is not cleared by `stopSession` leaks across: `stepInsideTries` (`driver.ts:105`), `lastOpened` (`jobs/cargo.ts:1344`), `emptiesSince` (`jobs/freight.ts:37`), `shutInPassedOn` (`jobs/head.ts:153`), `puttingBack` (`jobs/janitor.ts:127`). The ids `npc1`, `npc2` are the same after the window reopens, so the new brains inherit these.

**What the bodies do with no brain:** the walk or errand in hand finishes, and then the behaviour tree's last branch, `idle_random_walk/crew_npc`, shuffles each body about one tile at a time for ever. Those with a post stay within two tiles of it. Nobody works. That part is as the brief decided ("the NPC keeps running on default behavior"). The memory loss is what was not decided: the Quartermaster plan is the only one that thought of it ("With nothing in its head and writing in the book, as after the brain window is closed and opened again, it reads the book and carries on", `LLM_CREW_PLAN_QUARTERMASTER.md:68`).

One concrete case: the Captain declares a warrant, the officer is walking the wanted person to the brig, and the owner's client hiccups for five seconds. The owner reconnects and reopens the window. The Head of Security has no warrant on its list. The officer has a cuffed stranger by the arm and no reason to take them anywhere: it lets go of nothing and jails nobody. The Captain is never told how the warrant went.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:92`:

      // Closing the window stops all thinking; the NPCs carry on with default behavior.
      useEffect(() => stopSession, []);

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198`, `stopSession`:

      queue.length = 0;
      choiceQueue.length = 0;
      readingQueue.length = 0;
      brains.clear();

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:241`, in `ingest`:

            // Anything the server says was already dealt with is history, not news.
            lastSeq: npc.acked_seq,

`code/modules/llm_crew/crew_brain_link.dm:58`: `ui_interact` opens the window. There is no `ui_close` on the link, so the server takes no note of the window shutting.

`code/controllers/subsystem/tgui.dm:370` (base game):

    /datum/controller/subsystem/tgui/proc/on_logout(mob/user)
    	close_user_uis(user)

## How it was found

Read from the code. The memory loss on a tgui rebuild was seen by the owner before and is in the session notes; the change log does not list it as a fault to fix, and no plan covers the owner disconnecting. Not tested: whether the window keeps thinking while it is minimised or hidden behind the game (the browser may slow its timers; `ingest` runs on each update from the server, not on a timer, so it most likely carries on).

## How to fix it

Three parts. The first is the one that matters.

1. **Keep each brain's lasting memory on the server, and give it back.**
   - In the window, write `snapshot(brain)` in a new file `persist.ts`: a plain object of the fields that are worth keeping across a restart. Keep: `tasks` and `nextTaskId`, `notes`, `feelings`, `places`, `people`, `desk`, `beat`, `wanted`, `ledger`, `asks`, `requisition`, `pickups`, `summons`, `meeting`, `nextMeetingAt`, `metOnce`, `workReported`, `lateWork`, `duties`, `sentToQm`, `givenOrder`, `engine`, `chief`, `keptOut`, `janitorCalls`, `toldHeadAt`, `suppliesAt`, `lastSeq`, `bornAt`. Drop everything that is about this second: `failures`, `lastAct`, `driveAfter`, `mustSay`, `pending`, `talks`, `choosing`, `status`. `Map` and `Set` fields are written as arrays.
   - Times kept as `Date.now()` do not survive: on the way out, write each as "milliseconds ago", and on the way in add `Date.now()` back. Times kept as server time (`brain.now`, `event.at`) survive as they are.
   - Send it with a new `ui_act` action `save_brain` (`npc`, `state` as one JSON string). On the server keep it on the controller (`var/brain_snapshot`), cap its length (say 60,000 characters), and take one per NPC every 20 seconds at most. It is client data: the server stores it and gives it back to the same owner, and never reads it.
   - Send it when something lasting changes (a task added or finished, a warrant, an order, a meeting begun or ended) and no more than every 20 seconds.
   - Give it back in `ui_static_data` (sent once when the window opens) as `snapshots[npc_id]`. In `ingest`, where a brain is made, fill it from the snapshot if there is one. With a snapshot, `lastSeq` comes from the snapshot, not from `acked_seq`.
   - This keeps the rules: it is the crew member's own memory, no other crew member sees it, and nothing new goes in any prompt.
2. **Say so when the window shuts.** Add `/datum/crew_brain_link/ui_close(mob/user)`: `log_game` "Crew Brain window of [owner] closed: [n] crew have no brain", and tell the owner in chat how to open it again. Log the opening too. Then a round's `game.log` shows the gaps.
3. **Open it again without being asked.** In `New`, `RegisterSignal(SSdcs, COMSIG_GLOB_CLIENT_CONNECT, ...)`; when the client that connects has `owner_ckey` and the link has NPCs, call `ui_interact(client.mob)` after a few seconds.
4. Clear the five module maps named above in `stopSession`, or key them off the brain object.

A smaller step if the whole of (1) is too much at once: have the X button ask first. The window can take a `can_close = FALSE` and show its own "Stop the crew thinking?" button. That stops the commonest accident and none of the others.

Questions for the owner:
- While the window is shut, should a body holding a prisoner or a crate let go of it? Today it keeps hold and wanders.
- Should memory outlast the round (the brief lists "memory saved between rounds" as later work)? The same snapshot, written to a file under `data/`, would do it.

## How to test the fix

- Simulator: add a scenario to `tools/llm_crew/sim.ts` that runs `warrant` halfway, calls `stopSession()`, feeds the saved snapshots back through `ingest`, and checks the Head of Security still lists the warrant and the officer still jails its prisoner.
- A round trip test for `snapshot` and its reader on a brain taken from the `crew` scenario: every kept field equal after the trip.
- Type check and server compile.
- In a round: declare a warrant, close the window while the officer is walking, open it with the verb. `game.log` should show the "closed" and "opened" lines, and `pda.log` the Head of Security's "in cuffs" word to the Captain.
