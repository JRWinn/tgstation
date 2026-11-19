---
id: GAP-12
title: Closing or reloading the brain window stops every job and forgets everything, the warrant list included (the brief's fallback, decision 9, covers only a dead model)
kind: gap
severity: high
effort: large
confidence: sure
status: duplicate
duplicate_of: HOLE-02
found_by: Fable 5.2
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198, code/modules/llm_crew/crew_brain_link.dm:76, code/modules/llm_crew/crew_npc_controller.dm:1, LLM_CREW_BRIEF.md:19
fix: Keep on the server the few records that must outlive the window (warrants and who is in a cell, who is inside a locked room, orders in hand), hand them back when a brain is made, and have the server finish or let go of what a body is holding when its window goes quiet
---

## What is wrong

`LLM_CREW_BRIEF.md` decision 9: "**Fallback.** If the owner's LLM is missing, slow or disconnected, the NPC keeps running on default behavior without personality." Its acceptance check: "Closing the brain window leaves the NPC wandering silently, with no errors."

That was written when the model chose the goals. Since then the work has moved out of the model and into `plan()` in the window, on purpose ("code does the work, the model is only the voice"), and every plan has a fallback for a dead model. But all of that code runs in the owner's game client. The server has no plan of its own and no knowledge of whether a window is open: nothing in `code/modules/llm_crew/` asks. So the rule "a dead model must not stall anything" holds, and the wider one does not:

- **Window closed, owner disconnected, or the owner's client crashed:** every body goes back to the behaviour tree's default. Janitors, technicians, heads, engineers and security all wander or stand at their posts. No order is placed, no door is opened, no warrant is served. A janitor let into the Cargo Bay stays shut in. The engine, half lit, stays half lit.
- **Window reopened, or reloaded by a rebuild of the bundle mid-round** (the known "tgui rebuild wipes NPC memory"): `stopSession` throws away every brain and `ingest` makes blank ones. Gone: the Head of Security's warrant list ("It is the only copy", `LLM_CREW_PLAN_SECURITY.md` 3.1), who is in which cell and until when as the brain knows it, every task list, who has been sent for and who is inside a locked room (`expected.ts`), the heads' meeting clocks, the work split the Quartermaster gave out, what each head's staff said they needed, who each body has met, and all talk.

Two things were built to survive this, which shows the need was seen: the Quartermaster's order book ("With nothing in its head and writing in the book, as after the brain window is closed and opened again, it reads the book and carries on", Quartermaster plan section 3) and the trail out of locked rooms ("kept on the server... A reload of the brain window must not lose it", secure areas plan section 2). Nothing else was.

One case: the Captain declares a warrant on Pun Pun at 20:05. At 20:10 the owner runs the build with the server up, or closes the Crew Brain window by mistake and opens it again. The Head of Security's brain is new: `brain.desk.warrants` is empty (`DeskWork` in `types.ts:430`), and so is the officer's `BeatWork.warrants`. The officer's is new too. Nobody is looking for Pun Pun, the heads go on reading out a list security no longer has, and sightings sent to the Head of Security are answered "there is no warrant on Pun Pun". If the officer had a prisoner by the arm at that moment, the server still has the pull, and no brain knows there is a prisoner.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:197`:

    /** Forgets everything and stops any call in progress. Called when the window closes. */
    export function stopSession(): void {
      session++;
      act = null;
      ...
      brains.clear();
      clearExpected();
      clearRounds();
      running = false;
    }

`code/modules/llm_crew/crew_brain_link.dm:76`, `ui_data`, sends each NPC's last few sense events (`"events" = npc.sense_events`, capped at `CREW_NPC_EVENT_HISTORY`) and its live state, and nothing that is the brain's own memory except `book` (the order book's lines).

`code/modules/llm_crew/crew_npc_controller.dm:4`:

    * The behavior tree here is only the motor layer and the default behavior: it carries out
    * actions and keeps the body wandering when no brain is attached. It never picks goals.

A smaller fault in the same place: `stopSession` clears `brains`, `expected` and `rounds`, but not the other module-level maps keyed by NPC id, which then carry over into the new session: `stepInsideTries` (`driver.ts:105`), `lastOpened` (`jobs/cargo.ts:1344`), `emptiesSince` (`jobs/freight.ts:37`), `shutInPassedOn` (`jobs/head.ts:153`), `puttingBack` (`jobs/janitor.ts:127`).

## How it was found

Read from the code against the brief. The memory wipe on a rebuild is known (README of this audit, "Never run the normal build while dreamdaemon.exe is up"): what is added here is that it is the same fault as closing the window, what exactly is lost, and that the brief's fallback no longer describes it. Not tried in a round.

## How to fix it

Moving the plans to the server is the full answer and is a rewrite: not proposed. Three smaller steps, each useful alone:

1. **Server keeps what must not be lost, and hands it back** (large, both sides). Follow the order book's pattern: the record lives on the body or the server, and a new brain reads it in `ingest`. In order of harm:
   - **Warrants.** The honest carrier is a thing in the game: the security plan's stage 2 is the records console, and a simpler one is a sheet on the Head of Security's clipboard written by `tool_note`-style fixed lines ("Warrant 2. Pun Pun, for trespass. 5 minutes. Declared by the Captain." / "Warrant 2. Served: Cell 1."), read back as `book` is. That keeps "senses only" and gives the Captain something to read. Generalise `tool_note`, `order_book_lines` and `ready_to_write` in `crew_npc_quartermaster.dm` from "Quartermaster only" to "any head".
   - **Who is inside a locked room.** The server already keeps who let a body in (`who_let_in`, the trail). Send each keeper of a room "people in your rooms that a door there does not open for, whom you can see" (it already sends `strangers` material in `people_in_view`), and let a new brain treat anyone already inside when it wakes as let in, not as a stranger.
   - **Who is in a cell.** Already on the server (`crew_npc_cell_holding`, the timer). Send it in `security` for every cell so a new brain does not question or re-arrest its prisoners.
   - **The work split, meeting clocks.** Cheap to lose: a head holds its first meeting again thirty seconds after waking and deals the work out again. Leave.
2. **Server lets go when the brain goes quiet** (medium, server). The window acks events (`acked_seq`, `crew_brain_link.dm:221`). If a body has unacked events older than, say, 30 seconds, its brain is gone. Then: release anyone it is pulling other than a cuffed prisoner, walk a prisoner to a cell by the existing errand if one is in hand, and stop there. `game.log` gets one line: "its brain has gone quiet". This is the brief's "keeps running on default behavior", made true for the states that are dangerous to freeze.
3. **Clear the stray maps** (small, window). Export a `clear...` from `driver.ts`, `jobs/cargo.ts`, `jobs/freight.ts`, `jobs/head.ts` and `jobs/janitor.ts` and call them in `stopSession` beside `clearExpected()`.

And say it in the brief: decision 9 should read that the fallback for a dead model is the coded job, and the fallback for a closed window is wandering.

Question for the owner: is a paper warrant list on the Head of Security's clipboard wanted (it is a new thing a player can steal and read), or should the list simply be held on the server for now?

## How to test the fix

- Simulator: `tools/llm_crew/sim.ts` can call `stopSession()` and go on feeding the same server state. Add a scenario `reload`: a warrant is declared, the session is stopped and started, and the officer still goes for the wanted person; a janitor inside the bay when the session restarts is not questioned and is let out when it asks.
- Type check, server compile.
- In a round: close the Crew Brain window for a minute with an order in hand and a warrant standing, reopen it (the "Crew Brain" admin verb), and read `game.log` and `pda.log` for the next five minutes.

## Check

Checked by Opus 5.5, read from the code. The same fault as HOLE-02: one cause (every brain's plans and memory live only in the window's module state, emptied by `stopSession` in `brain.ts` or by a new page) and one change puts it right (keep the lasting memory on the server and give it back when a brain is made). HOLE-02 keeps the write-up. The quotes here were checked and hold (`crew_npc_controller.dm:4`, `brain.ts:197`, `ui_data` in `crew_brain_link.dm`, the plans' lines on the order book and the trail). What only this file had was copied into HOLE-02: the brief's decision 9 and its check at `LLM_CREW_BRIEF.md:105`, the trail plan line, "It is the only copy", the server-side "gone quiet" step, the paper warrant list question and the janitor-in-the-bay sim case. One correction not made here, since the body is left as it is: `puttingBack` (`jobs/janitor.ts:127`) is keyed by task id, not NPC id.
