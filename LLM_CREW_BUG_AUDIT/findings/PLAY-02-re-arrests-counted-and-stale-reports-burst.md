---
id: PLAY-02
title: Each new cuffing of the same prisoner counts as another arrest, and the officer's word to its head waits behind the arrest and goes out late, all at once and stale
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1142, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:165, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:505, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:134, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:893, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:517
fix: In hold_arrested count only when arrested is not this person already, and when a warrant's word is added drop older unsent words on the same name that it makes untrue
---

## What is wrong

Two things go wrong with what security tells about one warrant. Both were seen in one played round.

**1. One arrest is counted many times.** The server adds one to `work_arrests` every time the officer puts cuffs on someone. It does not ask whether this is the same person on the same warrant, still not in a cell. When a jailing fails and the officer cuffs the same prisoner again, that is counted as a new arrest. The officer reads this count out at its staff meeting, and the Head of Security passes it to the Captain. It should count one arrest for one person brought in, however many times the cuffs had to go on.

**2. Word to the Head of Security waits, then goes out in a burst, out of date.** Each outcome ("I have X in cuffs", "I cannot bring in X", "X is in Cell 2") becomes a WORD task with urgency `asked`. While the officer has the prisoner by the arm, the SERVE task for the warrant is `emergency`, so the word is not sent until the prisoner is in a cell. Then every word still in the list is sent, one after the other, in the order made. Nothing takes out a word that a later one has made untrue. So the Captain hears "cannot get them into a cell" after the prisoner is already in the cell. The Head of Security also passes on the officer's own "I" ("Casey cannot bring in Sunshine Langston: I cannot get them into a cell").

The case from round-15.44.36 (game.log times):

1. 22:04:06 Casey Cooper cuffs Sunshine Langston on the one warrant. `hold_arrested(person, 0, TRUE)` adds 1 (count 1). The window pushes a `cuffed` outcome, which becomes a word for Archie.
2. 22:04:33 In Cell 1 Casey takes the cuffs off, Sunshine is told "free to go" (TRB-07), and at 22:04:38 Casey "could not walk back out to the timer". Sunshine is not cuffed now.
3. 22:04:45, 22:05:13 and 22:05:38 the same thing happens again, at Cells 1, 2 and 3. Each time `make_arrest` finds her not in cuffs and goes the full way, so `hold_arrested` is called with `counted` TRUE. The count goes to 4.
4. After the third refused cell, `warrant.cellTries` is 3, equal to the number of cells. `cannot(warrant.name, 'I cannot get them into a cell')` adds a second word. Casey waits 90 seconds (`CELL_AGAIN_DS`).
5. 22:07:16 Casey puts her in Cell 2. A third word, `jailed`, is added.
6. Only now is SERVE done. The three words go by PDA within 7 seconds, in the order made, from the Fore Primary Hallway: "in cuffs" (22:07:27), "cannot get them into a cell" (22:07:31), "in Cell 2" (22:07:34). Archie passes each one on to the Captain as it comes.
7. 22:08:20 at the security meeting: "Archie, that is 4 arrests made." Archie tells the Captain "4 arrests made". There was one warrant, one person and one jailing.

No word went to Archie for the three minutes from 22:04:06 to 22:07:27, while the arrest was going wrong.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1138`, `hold_arrested`. It counts every cuffing:

    /datum/ai_controller/crew_npc/proc/hold_arrested(mob/living/carbon/human/person, hits, counted)
    	var/mob/living/carbon/human/body = pawn
    	var/handle = handle_for(person)
    	if(counted)
    		work_arrests++

`code/modules/llm_crew/crew_npc_security.dm:984` and `:996`, in `make_arrest`. Every path that puts cuffs on passes TRUE. Only someone already in cuffs passes FALSE (`:927`):

    	return hold_arrested(person, hits, TRUE)

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:463`, the window takes the server's count as it is:

    	arrests: npc.work_done?.arrests ?? 0,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:134`, in `syncTasks`. Each outcome is added to the end of the words, and nothing looks at the words already waiting:

    for (const outcome of takeOutcomes(brain)) {
      beat.words.push({
        outcome,
        line: outcomeLine(firstName(head.name), outcome),
        unheard: 0,
      });
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:165`, the word is only `asked` unless it is about being hurt or attacked:

    keep(brain, WORD, true, urgent ? 'emergency' : 'asked', word.line);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:503`, the warrant is `emergency` while it has the prisoner by the arm, so it always comes first:

    // With them in sight, or by the arm, nothing comes before it.
    const now = !!target(brain, warrant) || holds(brain, warrant);
    keep(brain, SERVE, true, now ? 'emergency' : 'asked', warrant.name);

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:517` (added by the checker). While the SERVE task waits in the brig for the cells to be tried again, the driver stops at it, so nothing below it, the `asked` WORD tasks among them, is done in those 90 seconds:

    if (!plan.ready && plan.wait && task.urgency !== 'routine') {
      if (ready.length === 0) {
        ...
        return null;
      }
      break;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:455`, the "cannot" word, which is in the officer's own voice:

    if (holds(brain, warrant) && (warrant.cellTries ?? 0) >= cells) {
      cannot(warrant.name, 'I cannot get them into a cell');
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:893`, in `deskOutcome`. The Head of Security passes the "why" on word for word, with the officer's "I" in it, and does not check that the person is in a cell already:

    tellCaptain(
      brain,
      `Captain, ${own ? 'I' : firstName(from)} cannot bring in ${outcome.name}: ${outcome.why}.`,

## How it was found

Seen in a round log, `data/logs/2026/11/19/round-15.44.36`.

game.log, the four counted cuffings of one person:

    [2026-11-19 22:04:06.448] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) arrested *no key*/(Sunshine Langston) at Bar Lounge (131,134,2).
    [2026-11-19 22:04:45.498] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) arrested *no key*/(Sunshine Langston) at Brig (96,162,2).
    [2026-11-19 22:05:13.830] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) arrested *no key*/(Sunshine Langston) at Brig (99,162,2).
    [2026-11-19 22:05:38.153] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) arrested *no key*/(Sunshine Langston) at Brig (102,162,2).

Each comes after "took the cuffs off ... at Brig", "is free to go" and "could not put Sunshine Langston in Cell N: it could not walk back out to the timer". Then:

    [2026-11-19 22:07:16.379] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) put *no key*/(Sunshine Langston) in Cell 2 for 5 minutes.
    [2026-11-19 22:08:20.377] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) was told by its brain to say: Archie, that is 4 arrests made. I need nothing.
    [2026-11-19 22:08:24.801] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Zim Fire: Security staff meeting: 1 of 1 there. Since the last one: 4 arrests made. Still wanted: Pun Pun. In the cells: Sunshine Langston in Cell 2.

pda.log, nothing from Casey between 22:03:14 and 22:07:27, then the burst after the jailing:

    [2026-11-19 22:07:27.977] PDA: ... ( PDA: Casey Cooper to Archie Sandford (Head of Security)) "Archie, I have Sunshine Langston in cuffs." (Fore Primary Hallway (107,157,2))
    [2026-11-19 22:07:31.943] PDA: ... ( PDA: Archie Sandford to Zim Fire (Captain)) "Captain, Casey cannot bring in Sunshine Langston: I cannot get them into a cell." (Head of Security's Office (129,178,2))
    [2026-11-19 22:07:34.438] PDA: ... ( PDA: Archie Sandford to Zim Fire (Captain)) "Captain, Sunshine Langston is in Cell 2 for 5 minutes. Sent from my PDA" (Head of Security's Office (129,178,2))

Then the code above was read. The 90 seconds between 22:05:38 and 22:07:10 fit `CELL_AGAIN_DS = 900` (arrests.ts:105). The `cuffed` word went once only because of the `cuffedByMe` guard (arrests.ts:1148). The window does not guard the count, which comes from the server.

The crew_brain.log was not read beat by beat. I did not confirm from it which task the driver chose at each beat. The driver picking `emergency` before `asked` is what the code says; it was not traced in the driver. (The checker has since traced it: see `## Check`.)

Searched: `work_arrests`, `arrests made`, `hold_arrested`, `beat.words`, `tellHead` and `cannot get them into a cell` in `findings/`, `LLM_CREW_CHANGELOG.md` and `LLM_CREW_PLAN_*.md`. None says either fault. The changelog only says the server counts arrests (line 679).

## How to fix it

**The count (server).**

1. No new var is needed. The controller's `arrested` weakref already holds "the person I cuffed and have not brought in". It is set in `hold_arrested` (`arrested = WEAKREF(person)`, :1143), cleared only when `put_in_cell` succeeds (`arrested = null`, :1349) and in `set_free` (`if(arrested?.resolve() == person) arrested = null`, :1549). A failed cell try leaves it set, which is why `put_in_cell` can take the prisoner again next go.
2. In `hold_arrested`, before `arrested` is set, change the count to `if(counted && arrested?.resolve() != person) work_arrests++`.
3. Leave the log line as it is ("arrested" for every cuffing). It is what the body did, and it is how the fault was seen.
4. Keep counting at the cuffs, not at the cell. An arrest that never reaches a cell (no cell free, power out) is still an arrest made. A prisoner who gets away and is cuffed again on the same warrant is still one arrest, which is right.

(The first write-up proposed a new `arrest_counted` weakref cleared in the same two places. That would work too, but it copies `arrested` exactly.)

**The word to the head (window).**

5. In `syncTasks` in `officer.ts`, before pushing a new word, drop any waiting word on the same name that the new one makes untrue. `jailed`, `freed` and `lost` drop older `cuffed` and `cannot` words on that name. A new `cannot` drops an older `cannot` on that name. Leave `hurt`, `attacked` and `baton` alone. When a word is dropped, `syncTasks` already finishes its WORD task (the loop after `syncBeat`).
6. Say why the arrest is stuck when it is stuck. In the loop over `beat.words` in `syncTasks`, work the urgency out on every sync: `emergency` for `hurt`, `attacked` and `baton` as now, and also for a `cannot` word while `brain.security?.holding` names that person. Then it goes out in the 90-second wait at the brig and not after the jailing. This works with the driver: while SERVE waits (`ready: false, wait: true`), `workInOrder` puts a ready emergency WORD ahead of it (same urgency, ready first), so the WORD reaches `ready` before the loop meets the waiting SERVE and stops (driver.ts:517). As an `asked` task it sorts below the waiting emergency SERVE, and the driver returns null at the SERVE and never looks at it: that is the cause of the three-minute silence. `tellHead` already sends by PDA when the head is not in sight (after a `SOUGHT_DS` wait if the officer stands at its post). Keep `cuffed` and `jailed` as `asked`: they can wait.
7. In `deskOutcome`'s default case in `desk.ts`, if the person is in `desk.held` already, do not pass a `cannot` to the Captain. That guards a late word that gets through anyway.
8. Change the words in `arrests.ts:456` from `'I cannot get them into a cell'` to `'no cell would take them'`, so the line the head passes on reads right ("Casey cannot bring in Sunshine Langston: no cell would take them.").

The re-cuffing loop itself is TRB-07 (prisoner set free when its cuffs come off in the cell). Fixing TRB-07 makes this rarer. It does not fix the count or the stale words, which come up whenever a jailing fails and is tried again.

## How to test the fix

- Server compile on a side copy.
- `tools/llm_crew/security.ts`: a case where `syncTasks` gets `cuffed`, then `cannot`, then `jailed` for the same name before any word is sent. Only the `jailed` word is left. A case where `cannot` comes in while `holds` is true: its WORD task is `emergency`.
- `tools/llm_crew/security.ts`: `deskOutcome` with `jailed` then `cannot` for the same name. The Captain is told once.
- In the next round, grep `game.log` for "arrested" lines on one name before "put ... in Cell". However many there are, the officer's meeting line should say 1 arrest. In `pda.log`, a "cannot bring in" should come while the officer is still in the brig, and never after "is in Cell".

## See also

- TRB-07: the cause of the re-cuffing loop seen here.
- TRB-10 and ARR-05: the same word taken twice by the desk. Those are about one word sent twice, not old words sent late.
- SEC-04: a refused cell is picked again. Here the cells were marked refused and each was tried once.
- TRB-09: `cannotTold` is never cleared, so a `cannot` is told once a round per person and reason. Not the same fault, but step 5 must not lean on `cannotTold` to stop a dropped `cannot` being made again: it is the word list that is pruned, not the record.
- PLAY-08: the same round and the same jailing (the Head of Security then messages the head it jailed). Another fault.

## Check

Checked by Opus 5.5. Status: confirmed.

What I read:

- `crew_npc_security.dm` `make_arrest` (:907-996), `hold_arrested` (:1138-1152), `put_in_cell` (:1256-1359) and `set_free` (:1490-1555). The quotes still match. Every path that puts cuffs on calls `hold_arrested(..., TRUE)`; only someone already in cuffs gets FALSE. `hold_arrested` adds 1 with no look at who was counted before. Nothing else touches `work_arrests` but the link (`crew_brain_link.dm:143`, sent as `work_done.arrests`). No guard stops the count.
- `officer.ts` `syncTasks` (:128-182) and `tellHead`, `arrests.ts` `syncBeat` (:388-529), the move results for `arrest` and `jail` (:1140-1265), and `desk.ts` `deskOutcome`'s default case (:890-905). The quotes match. Outcomes are only ever pushed onto `beat.words`; a word leaves only when it is sent by PDA, heard ("I have that"), or the head is gone. Nothing compares a new word with old ones.
- `tasks.ts` `workInOrder` (:389-427) and `driver.ts` (:504-596). This settles the point the finder left open. While SERVE waits in the brig (`serveStep` returns `ready: false, wait: true`, arrests.ts:735) it is an emergency and sorts above the `asked` WORDs, and the driver returns null at it (driver.ts:517). While SERVE is walking to a cell it is ready and older, so it comes first. Either way no WORD goes until SERVE is gone.

What I saw in `round-15.44.36`:

- game.log lines 908, 927, 949 and 973 are the four "arrested" lines for Sunshine Langston, each after a "took the cuffs off" and a "could not put ... in Cell N" (lines 914/921, 939/945, 955/966). Line 1056 is the one jailing. Line 1107 is "that is 4 arrests made". As written.
- pda.log lines 109 to 114: the three words from Casey and Archie's three relays, all between 22:07:27 and 22:07:34, after the jailing at 22:07:16. Nothing from Casey in pda.log between 22:03:14 and 22:07:27. As written.
- crew_brain.log: Casey's decisions at lines 790 (22:05:30) and 843 (22:07:12) have no decision between them, which fits the driver returning null for the whole wait. Line 843 lists "waiting its turn: tell the Head of Security how a warrant went" twice "and 1 more after those". So the words sat on the list behind the arrest, as the finding says.
- Small correction to the case: Sunshine Langston is the Head of Personnel. That does not change this fault.

Duplicates: searched `findings/` for `work_arrests`, `hold_arrested`, `arrests made`, `beat.words`, `cannot get them into a cell`. SEC-03 mentions `work_arrests` going up on a called-off arrest, which is a different fault. TRB-07, TRB-09, TRB-10, ARR-05 and PLAY-08 are related and named above. None is this fault.

What I changed:

- Effort from small to large. FORMAT.md says a fix in both the server and the window is large. Each half is small: about 1 line on the server and under 30 lines in the window.
- The server fix now reuses the existing `arrested` weakref, which is already set and cleared at exactly the points the new var was meant to be. One line, no new state.
- Step 6 now says to work the urgency out on each sync, and why the driver then sends the word in the brig wait. It also names the cause of the silence: driver.ts:517.
- Added the driver quote to `## Where`, and TRB-09 and PLAY-08 to `## See also`.

The fix keeps the rules: no cheats, the code does the work, nothing waits on the model. One thing to watch: dropping a word that was said to the head's face and not yet answered (`toldAt` set) is safe, since the newer word still goes, and `takeWord` only removes a word that has `toldAt` set.

This file holds two faults, the count and the stale words. They have one cause in the round but separate fixes. They can be fixed and marked one at a time.

Not done: no build, no simulator, no tables. The driver order was read from the code, not run.

## Fix so far

Window part done on branch p-secwin (commits 1d299d8c5fa and the follow-up after it), compile, tables and simulator only, not played:

- Step 5, changed: `syncTasks` in `jobs/officer.ts` drops waiting words on the same name by the table `STALE_AFTER`. "In a cell" and "let go" drop "cannot" and "lost", but not "in cuffs": having had them in cuffs stays true, and the warrant scenario checks that the Captain is told of the cuffs. "Lost" drops "in cuffs" and "cannot"; "in cuffs" drops "cannot" and "lost"; a new "cannot" drops an older one.
- Step 6: a "cannot" on the person in `security.holding` is an emergency and goes by PDA unless the head is in sight.
- Step 7: `deskOutcome`'s default case passes no "cannot" on for someone in `desk.held`.
- Step 8: the words are now "no cell would take them".

Left: the server's count, steps 1 to 4 (`hold_arrested` in `crew_npc_security.dm`), for the group that owns the .dm files. driver.ts was not needed.
