---
id: GAP-18
title: Cargo and the Quartermaster, what five plans left unbuilt, in one list (an uncollected order is never sent back, the stuck shuttle is told to nobody, and more)
kind: gap
severity: medium
effort: large
confidence: likely
status: found
area: supply
files: LLM_CREW_PLAN_ROUND_1332.md:52, LLM_CREW_PLAN_QUARTERMASTER.md:161, LLM_CREW_PLAN_DROPPED_CRATES.md:31, LLM_CREW_PLAN_ROUND_0912.md:36, code/modules/llm_crew/crew_npc_held.dm:174
fix: Build the uncollected order going back and the Quartermaster telling the Captain of a stuck shuttle first, both small, and put the rest to the owner as a list
---

## What is wrong

Leftovers for cargo are spread over the Status sections of five plans and the "Not built" lists of six change log entries. This is the one list. Each row was checked by a search of today's code, not by reading every proc: confidence is "likely" for that reason.

**Asked for by the owner, not built:**

| # | Item | Recorded in | Today |
| --- | --- | --- | --- |
| 1 | "An order nobody collects after three reminders goes back on the next shuttle, and the Quartermaster tells the head." (alteration 15) | 13:32 plan line 52; 15:00 entry "An order nobody collects is not yet sent back" | `crew_npc_held.dm:174` stops reminding after `CREW_NPC_HELD_REMINDERS`. The crate then stands on its square for the rest of the round, and the square is lost to the next crate |
| 2 | When the shuttle comes, loose things left on the marked squares are sold; later anyone can put a thing on a square to sell it (alteration 18) | 13:32 plan line 59, "a future TODO" | Not built, as the owner said. Listed so it is not lost |
| 3 | Mess calls go one message listing the rooms, not one a room (item 12) | 13:32 plan line 42; 15:00 entry | One PDA message a room (`tidyStep` in `jobs/cargo.ts`). A janitor gets three messages in a row for three rooms of cargo |
| 4 | A crate dropped at the lobby door with a workmate standing just inside: "the hauler asks the workmate to step aside" (item 8) | 13:32 plan line 36; 15:00 and 18:05 entries (six lost grips on the stairs at (77,148), "Monte Mcmullen is standing in the way") | "Nothing asks it to move until the haul has been given up" |
| 5 | The Warehouse: "go by the tunnel door" (item 10) | 13:32 plan line 35; 09:12 plan 4.9; four change log entries | Cause never found. Left fifteen minutes after two failures |
| 6 | "No way out" of the crowded closet at round start: people in the way are waited for, not counted as a shut door (item 9) | 13:32 plan line 44 | "Cause not confirmed" |

**Decided in the Quartermaster plan, not built:**

| # | Item | Recorded in | Today |
| --- | --- | --- | --- |
| 7 | "It also runs mining, but not yet." Mining and the bitrunners at its meeting | QM plan lines 23, 164 | `hierarchy.ts` has no mining staff in play. Fine until miners are crew |
| 8 | Giving the counter itself to one technician | QM plan line 165, "Mine: gating it risked someone standing unserved" | Whoever is asked serves. The work split names a counter keeper and the name changes nothing at the counter |
| 9 | Voice cases against the real model for the Quartermaster's lines | QM plan line 163 | None in `tools/llm_crew/voice.ts` |

**Proposed in the dropped-crates plan and the 09:12 plan, not built:**

| # | Item | Recorded in | Today |
| --- | --- | --- | --- |
| 10 | The Quartermaster coming itself when a technician is shut in and there is no other to send | dropped crates plan line 33 | Tells its only technician to try again |
| 11 | A line in the order book about a crate that would not come | line 34 | The book says "Given to X" and then nothing until "Docked" |
| 12 | A knock from outside answered by opening the door to see who is there (09:12 plan 4.8) | 09:12 plan line 38: "Rewriting it blind seemed worse than leaving it" | A knock is answered by name: `tool_open_door` finds a person of that name at the door through a door it cannot see through (`person_at_room`, `janitor_at_door` in `crew_npc_doors.dm`). That is knowledge the body does not have. Best mended with GAP-03, which rewrites the same proc |
| 13 | Simulator scenarios `regrip`, `putclear`, `shutaboard`, and those in 09:12 section 5 | dropped crates line 36; 09:12 line 41 | Not written: the simulator has no crates that move |

**Found in rounds, written in the change log as not built:**

| # | Item | Entry |
| --- | --- | --- |
| 14 | The Quartermaster telling the Captain that the shuttle is stuck, and why | 16:15 "Not built". The technician knows why (`what_bars_shuttle`) and tells whoever ordered after two failures. The Quartermaster, who gave the order, is not told and tells nobody |
| 15 | A junk letter loose on the shuttle's deck, or a mouse aboard, still stops the shuttle: "the technician will say so and cannot yet act on it" | 16:15 "Known and not fixed" |
| 16 | A spent spray bottle is carried about for the rest of the round: "nothing refills it or puts it back" | 16:15 |
| 17 | Crates the owner pushed about are hauled again, and nothing logs the tile a crate ended on | 18:05 "Seen and left alone" |
| 18 | The Head of Personnel ordered janitorial supplies three times in nine minutes | 18:05 "Seen and left alone". Not looked into |

One case for row 1: the Head of Personnel orders supplies, the crate docks as #4521, the janitor sent for it is beaten down by Pun Pun. Cargo reminds the head three times and stops. The crate holds a square for the rest of the round, cargo's budget has paid 400 credits for it, and the head's order stands as "come in" for ever. With sixteen squares and one order every ten minutes it takes a long round to fill the bay, but the money is gone at once and the 200 credits for the empty never come back.

## Where

`code/modules/llm_crew/crew_npc_held.dm:174`:

    if(entry.post == post_place && entry.held_since && isnull(entry.collected_by) && entry.reminders < CREW_NPC_HELD_REMINDERS)

and `:272` `entry.reminders++`. Nothing reads `reminders` reaching the limit.

`code/modules/llm_crew/crew_npc_doors.dm:545`, `person_at_room`: finds "whoever of this name is standing at a door of a room, or is inside it", by name, on either side of a shut door.

## How it was found

Read from the plans' Status sections and the change log, each row checked by search. Rows 14 to 18 are the change log's own words.

## How to fix it

Smallest and most useful first:

1. **Row 14 (small, window).** The technician's failed-order result already carries the reason. In `jobs/cargo.ts`, pass it to the Quartermaster as other word is passed ("Ada, the shuttle will not leave: there is a letter in the mail crate aboard it."), a new fixed line in `jobs/supply.ts`. The Quartermaster writes it in the book (row 11 comes free: "Order 3. Held up: the shuttle will not leave.") and sends the Captain one PDA message.
2. **Row 1 (medium).** Server: when `entry.reminders` reaches `CREW_NPC_HELD_REMINDERS` and five more minutes pass, mark the entry `unclaimed` and send it in `held_crates`. Window: the technician with the shuttle hauls it aboard as it hauls an empty (`RECYCLE` in `jobs/freight.ts`) and tells the Quartermaster: "Ada, crate #4521 for Hop Kins was never collected. It is going back." The Quartermaster writes it and tells the head. No cheat: it is a crate put on the shuttle. Ask the owner whether cargo gets the money back, since the game's export pays for the crate, not its contents.
3. **Row 3 (small, window).** In `tidyStep`, gather every room of the department with a mess that is due a call into one message: "Messes in the Cargo Bay, the Delivery Office and the Warehouse. Come to the X door, please." The janitor's reader (`readsMessage` in `jobs/janitor.ts`, `kindsCalled`) must then make one task a room from one message.
4. **Row 4 (medium).** The step-aside ask exists (`jobs/aside.ts`, `tool_step_aside`). On the first lost grip whose result carries `in_the_way` (the handle of whoever is in the way, set by `in_the_way_report` in `crew_npc_doors.dm:904`), the hauler says "Monte, step aside, please." and takes the crate up again, before the second try. The dropped-crates plan's 4.1 has the retry.
5. **Row 16 (small).** A spent bottle is put down where the cleaning gear is kept the next time the janitor is there (`tool_put_down` takes a named thing).
6. **Rows 5, 6, 17, 18** need a round's log first. For row 5 the 20:19 entry's method works: a script over the map file and the door access helpers, walking from the bay to the Warehouse's tunnel door.
7. **Rows 2, 7, 8, 10** are the owner's to schedule.
8. **Rows 9 and 13** are in GAP-22 with the other tests never written.

## How to test the fix

- `tools/llm_crew/book.ts` for each new fixed line and book line.
- Simulator: `waiting` extended past the third reminder (row 1); `qm` with a shuttle that will not leave (row 14).
- In a round: `grep -n "never collected\|will not leave" pda.log game.log`.
