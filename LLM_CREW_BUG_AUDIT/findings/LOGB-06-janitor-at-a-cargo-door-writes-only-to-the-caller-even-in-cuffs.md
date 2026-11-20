---
id: LOGB-06
title: A janitor waiting at a cargo door writes only to the technician who called it, eight times in thirteen minutes while that technician was in cuffs, and never to the other one
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:662, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:887, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:674
fix: When word to the caller brings nobody, write in turn to others whose ID opens that door (room_keepers, as officers get) and then its own head, once each, and never write twice to one person for that door
---

## What is wrong

A janitor called to a mess in a locked cargo room goes to its door, knocks, and sends one PDA message: to `task.askedBy`, the technician who called it. Then it waits a minute (`LET_IN_WAIT_DS`). If nobody comes, the task is blocked "nobody has let you in", until any cargo worker comes into its view: `meets` then wipes the record of having asked, and the janitor knocks and writes again. To the same person.

Nothing asks whether the caller can still open a door. A technician in cuffs, in a cell, down, or simply gone off the station gets the message every time, and the other technician, who could open it, is never written to. A word said aloud goes to the caller too if it is in sight, cuffed or not (`caller` at `janitor.ts:674` takes `task.askedBy` before any technician).

A body shut in a room already does better: `nextToWrite` in `driver.ts` writes to whoever let it in, then to others whose ID opens the door, then to its head, once each. The janitor at a door on the outside has none of that.

The case, `data/logs/2026/11/18/round-15.52.18`. Marisol Burris (technician) called Delma Basinger (janitor) to a mess in the Mining Office. At 22:06:50 the Captain declared a warrant on Marisol; the officer cuffed her at 22:09:52 ("arrested Marisol Burris at Cargo Lobby (78,146,2)") and led her off to the brig. Jayden Phillips, the other technician, was at work in the bay all the while. `pda.log`, every message from Delma to Marisol:

    22:08:49 "I am at the Quartermaster Maintenance door of the Cargo Bay about the mess in the Mining Office. Could you let me in, please?"
    22:10:24 the same
    22:11:41 the same
    22:12:58 the same
    22:14:00 "I am at the Cargo Bay door of the Mining Office about the mess. Could you let me in, please?"
    22:15:46 the same as the first
    22:16:54 the same as the fifth
    22:21:24 the same as the first

No ask to be let in went to Jayden. He was written to at 22:15:18 only to let Delma out, by the shut-in code in `driver.ts`. Two earlier asks to Marisol, at 21:57:55 and 22:01:39 while she was free and at the cargo meeting, brought nobody either. So a caller who is simply busy is the same case as one in cuffs. In between, `crew_brain.log` has Delma knocking at the Quartermaster Maintenance door at 22:08:47, 22:10:20, 22:11:38 and 22:12:54; let into the Cargo Bay twice when Jayden happened to open it (22:13:45, 22:16:37); left at the Mining Office door, which nobody opened; then "You are shut in Cargo Bay" (22:15:12, 22:18:40), let out, and back to the outer door to knock again. Thirteen minutes, no mess cleaned in the Mining Office. PDA was working: the last line of `pda.log` is at 22:21:24.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:662`, in `letInStep`, the only person written to:

    if (!asks.messaged && task.askedBy && brain.hasPda) {
      return {
        ready: true,
        step: `You have knocked at the door of the ${door}. You are sending ${task.askedBy}, who called you, a PDA message to say you are there.`,
        act: {
          tool: 'message',
          person: task.askedBy,

`janitor.ts:674`, the one asked aloud:

    const caller =
      brain.peopleInView.find((person) => person.name === task.askedBy) ??
      // A technician: the doors of the department are theirs to open, not the Quartermaster's.
      brain.peopleInView.find((person) => isTechnician(person.job));

`janitor.ts:887`, `meets`, which starts the whole round of asking again for any cargo worker seen:

    meets: (brain, _name, job) => {
      if (!isCargo(job)) {
        return;
      }
      for (const [place, asks] of Object.entries(brain.letInAsks)) {
        if (brain.now - asks.at > ASK_AGAIN_AFTER_DS) {
          delete brain.letInAsks[place];
        }
      }
    },

## How it was found

Seen in a round log, quoted above from `pda.log`, `game.log` and `crew_brain.log`, then the cause read in the current code, unchanged at each place quoted. The brain cannot know that the caller is in cuffs (the body does not see it through a door), and the fix does not need it to: nobody came, so someone else is asked.

Related: CARGO-12 is the technicians' side (a workmate in cuffs still counted as about). DESK-06 is a janitor called by someone not in cargo, who never asks at all.

## How to fix it

1. Keep in `letInAsks[door]` a list `wrote: string[]`, as `outAsks.wrote` is kept for a body shut in.
2. In `letInStep`, after the caller has been written to and `LET_IN_WAIT_DS` has gone by with no door, write once to the next technician on `brain.pdaPeople` (`isTechnician(person.job)`) not yet in `wrote`, then once to the Quartermaster. Same words. Reuse the `nextToWrite` pattern from `driver.ts`.
3. When `meets` starts the asking again, do not send the PDA to anyone in `wrote` again; knock and say it aloud to whoever has turned up, which is the person who is there.
4. For the aloud ask, prefer a technician in sight who is not the caller when the caller was already asked and nothing came of it.
5. Once everyone has been written to and nobody came, tell its head, once, as `DESK-06` proposes for the non-cargo case, and leave that mess.

## How to test the fix

- A simulator scenario: a technician calls a janitor to a locked cargo room and then stops answering (taken out of the round, or given a do-nothing brain); a second technician is at work. Want one PDA to the caller, then one to the second technician, and the door opened by the second.
- Type check.
- Next round, `pda.log`: no more than one "Could you let me in" from one janitor to one technician for the same door in ten minutes.

## Check

Confirmed. The code quotes match `janitor.ts` today (lines 662-671, 674-677, 887-895). The log quotes match `data/logs/2026/11/18/round-15.52.18`. In `pda.log`, Delma's let-in messages to Marisol are at lines 95, 102, 105, 106, 107, 113, 118 and 144. In `game.log`, line 972 is "arrested ... Marisol Burris at Cargo Lobby (78,146,2)" at 22:09:52, and line 981 is the officer saying she is cuffed and going to her cell.

- `letInStep` has one PDA step, to `task.askedBy`. `hasAsked` counts the asking done once that one message is sent. After `LET_IN_WAIT_DS` (600 ds), `syncTasks` blocks the task as not let in (`janitor.ts:484-490`).
- `meets` deletes every `letInAsks` entry older than `ASK_AGAIN_AFTER_DS` (600 ds) for any cargo job seen. The next `letInStep` then knocks and writes to the same caller again. `count` is kept in `noteAsked` but read nowhere. The only other way out is a refusal heard (`janitor.ts:857-873`).
- No guard picks a second person. I mended one point in the body: Jayden was written to, but only to let her out, by `nextToWrite`. I also added that the two asks to Marisol before her arrest failed as well.

The change log has no entry that chose "the caller only". Its entry for officers (H9, `LLM_CREW_CHANGELOG.md:320`) built the better pattern for a body shut out: `letInStep`, `noteShutOut` and `keepersOf` in `jobs/arrests.ts`, fed by the server's `room_keepers` (`crew_npc_security.dm:784`). That asks staff of the room first, then heads, then the Captain, one at a time, three at most.

On the fix: it would work, but as written it is tied to cargo (technician, then Quartermaster). The project's rule "an example is not the scope" and DESK-06, a call from outside cargo, both want the general form. Write in turn to the people whose ID opens that door, using the same `room_keepers` list the officer gets. That means the server sending keepers for the door a janitor waits at, not only for security bodies, then once to its own head. That touches the server and the window, so I set effort to medium: a few dozen lines, reusing existing helpers. If the owner wants it in the window only, the cargo-only steps 1-4 are a stopgap. Step 3 is right: someone who turns up should be asked aloud, not written to again. Severity medium: the mess goes uncleaned, and the caller's PDA fills with the same line, but nothing hangs.

Read the code and the round's logs. Nothing was run.
