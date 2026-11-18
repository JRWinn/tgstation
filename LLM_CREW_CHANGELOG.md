# Crew NPC change log

**Claude: read the top entry before you touch crew code, and add an entry when you change it.**

This is the running record of what has changed in the LLM crew NPC work, newest first. The plans (`LLM_CREW_PLAN_*.md`) say what was meant. This says what was done, how far it was tested, and what is still wrong.

## How to add an entry

- Put it at the top, under this section. One entry for one sitting's work.
- Head it with the date, a short title, and the commit hash, or "not committed".
- Say how it was tested, in these words: **type check**, **server compile**, **simulator**, **model tests**, **played in a round**. Leave out what was not done. "Not played" is the usual truth: say it.
- List what changed as what the crew now does, with the file or function to look in.
- List what is known and not fixed. A fault found and left is worth more here than a fix.
- If a round showed the fault, name its log folder (`data/logs/YYYY/MM/DD/round-HH.MM.SS`).
- Do not rewrite old entries. If one turns out wrong, say so in the new entry.

---

## 2026-11-18, 09:40: the mail chute again, a janitor left shut in, and a door nobody could reach (the commit that added this entry)

**Tested:** type check, server compile (0 errors, 0 warnings), simulator (all 32 scenarios; `aside` failed once on "steps aside within a few seconds" and passed five times out of five when run again; it failed one run in five on the code before this change). **Not played in a round.** Built at 09:37, after the round that was running had ended. The simulator runs none of the server code. Three of the five fixes here are server code and mend fixes of mine that compiled and passed the simulator last time and did not work in the game. Treat them as unproven until a round shows them.

**Round that showed the faults:** `data/logs/2026/11/18/round-08.26.02`, the first round on `6e249e9e`.

### What that round showed about `6e249e9e`

Worked: the order chain. Order to unpacked crate in five and a half minutes; "Lance, I have that." three seconds after the technician spoke; one janitor sent for the crate; every door opened once; no janitor walking at the lobby airlock.

Did not work:

- **The mail chute fix never ran.** It listened for the body having moved. The base AI controller listens for the same thing on the same body and registers after, so it took the place of mine. Seven "movable_moved overridden" runtimes at spawn said so. The Quartermaster went down the chute twice.
- A new runtime from the locked-room check when the body was inside the pipes.
- Coming out of the pipes was logged as "came out of the Service Deliveries".

### What the crew does now

Slippery floors, by sight (`crew_npc_senses.dm`):

- **A body knows of a slippery thing only if it has seen it.** Oil, a peel, soap, foam: things that lie on a tile and can be seen. It keeps each one it sees in mind, and also knows of one on the tile in front of it if that tile can be seen. `remember_slippery`, `knows_slippery`, `slippery_seen`.
- **A floor that is only wet from a mop it does not know of**, and slips on like anyone, unless its shoes grip. The owner decided this. (The game does draw a faint sheen on a wet tile. The crew ignore it.)
- For a step onto a tile it knows is slippery it slows to a walk first: the step begun at a run is not taken, and the next one is, at a walk. It runs again on the step after. `mind_its_step`, now on the before-move signal, which nothing else of the controller's listens for.
- A bin, a chute, a pipe or what carries a body along one all count as the disposal pipes, for the line said on coming out. `look_around`.
- Whether a room is locked to a body is not worked out while it is off the floor. `locked_out_of` in `crew_npc_guarding.dm`, `place_locked_to_body` in `crew_npc_cleaning.dm`, `crew_npc_doors_of` in `crew_npc_doors.dm`.

Someone shut in (`driver.ts`, `jobs/cargo.ts`, `expected.ts`):

- **Shut in, a body goes to the door out even if it is already standing at a door.** Standing at one it had asked to be let in at is not standing at the way out. In the round the janitor knocked where it stood, and the technicians heard "knocking at the door of Cargo Bay, from outside", which they only answer for someone they sent for. Now its knock is at the door it came in by and says "from inside". `nextStep` in `driver.ts`.
- **A technician seeing someone "somewhere else" strikes them from that one room, not from every room.** In the round a door of the Cargo Bay was opened for a janitor who stayed in the Delivery Office. He was put down as in both, then seen in the Delivery Office and struck from both, and nobody knew to let him out. `noteLetOut` in `expected.ts`, `syncTasks` in `jobs/cargo.ts`.
- Seen standing in another of its locked rooms than the one it had them down for, a technician notes that room.
- **A PDA message that says "let me out" and names one of cargo's locked rooms is gone by**, with no note of the sender having been let in. The technician goes to that door. The server opens it only if the sender is found standing inside. `doorSought` in `jobs/cargo.ts`.

Finding a door (`tool_go_to_door` in `crew_npc_doors.dm`):

- **A body making for the door into a room tries each door for a way to it, best first, three at most.** In the round every janitor called to the Delivery Office made for the door that opens from the Security Post, which none of them can reach: 11 failed walks. A door that opens from a room locked to it is still reported as before, so that it asks at that room first. Each door passed over is logged: "found no way to X, a door into Y, and looks for another".

### Known and not fixed

- **None of this has been seen in the game.** In particular: that the before-move listener fires for a crew body's steps and that refusing one step does not stall its walk; that `oview(1)` leaves out a tile that is too dark to see; that the door tool, which now waits while routes are tested, behaves when it is called again meanwhile (it returns without a word, as exploring does).
- A body being walked out by the arm that is pulled at oil it knows of refuses one step like any other. Whoever has it by the arm may lose their grip.
- A knock from inside a locked room, by someone the department has no note of and cannot see, still opens nothing: a knock does not say who, and the door tool needs a name. The PDA message that follows the knock does.
- The door tool finds a person it cannot see by name, and reads which door another crew body wants straight from that body. Both are knowledge a technician would not have. Not changed.
- Every door opened for someone is still opened by code and held by switching off its closing (item 8 of `LLM_CREW_PLAN_NO_CHEATS.md`). The hold shared between two people in `6e249e9e` is built on that and goes when it does.
- Freeing a hand (`free_a_hand`, `6e249e9e`) was not exercised in the round. It puts the thing in the bag by a direct call, not a click on the bag.
- No janitor has soap or a wet mop. The oil in the Cargo Bay and the Delivery Office is called for and never cleaned.
- Pun Pun gets into locked rooms and gets away from whoever tries to walk it out. **That is wanted.** Do not fix it.
- No simulator scenario covers a body that is shut in while standing at an inner door, or a record struck from two rooms. The simulator's own door and knock are simpler than the game's.

---

## 2026-11-18, 09:20: crates that get away, and crates in the way (the commit that added `crew_npc_grip.dm`)

**Tested:** type check, server compile (0 errors, 0 warnings), simulator: all 30 scenarios with a quiet LLM, and the ten cargo and Quartermaster ones with a chatty and a dead LLM. 49 of 50 runs passed. The one that failed, `qmwait` on "the cargo technician ends at the post", passed four times out of four when run again, and failed once in four on the code before this change: the technician is on its five-minute round when the run stops. **Not played in a round.** The simulator does not run the server code and has no crates that move. Everything a crate does here (getting away, being taken up again, being pulled or pushed clear) is compile-checked only and has never been seen to work.

**Round that showed the fault:** `data/logs/2026/11/18/round-00.56.30`. Two crates were dropped at the dock within 12 seconds, and both technicians were shut aboard the supply shuttle for five minutes. Lost grips are in every logged round, and not only at the dock: `round-01.53.17` had three.

**Plan:** `LLM_CREW_PLAN_DROPPED_CRATES.md`. Its Status section lists where what was built differs from what was planned.

### What the crew does now

A crate that gets away (`code/modules/llm_crew/crew_npc_grip.dm`, new; called from `walk_finished` in `crew_npc_tools.dm`):

- **A body that loses its grip goes back and takes hold again.** Three times for one haul; the fourth time the crate gets away, the haul is given up. This holds for every kind of haul: off the shuttle, empties aboard, out to the lobby, a collected crate, an empty taken back, and a crate being moved from a door. `crate_got_away`, `go_back_for`, `take_up`.
- If someone was standing in the way, it takes hold first, is told who (so it asks them to step aside, as before), and waits three seconds before setting off. `wait_for_way`.
- The brain is told "You lost your grip on the crate. You are going back to take hold of it again." as a plain event. The LLM is not woken, and the brain window is told the body is busy throughout. `seeing_to_crate`, read in `crew_brain_link.dm`.
- **A crate that will not come is not walked away from.** It is put on the nearest spot clear of doors on the body's own side of it, by pulling. If there is nowhere in sight, the body goes straight back the way it came. `put_clear`, `clear_spot_for`, `haul_clear`.
- **If pulling fails it is pushed**, by walking into it, across open floor only and six tiles at most. `push_direction`, `push_clear`.
- The haul is then reported as failed, with where the crate was left: "You have left it in Supply Shuttle, clear of the doors." `put_clear_finished`, `gave_up_report`.
- A haul that ends with no way through counts towards the body knowing it is shut in, as a failed walk already did. `finish_haul`.

A crate in the way:

- **Anyone whose walk ends with no way through looks for a loose crate jammed in a doorway**: on a door's own tile, or beside a door in a passage one tile wide. It has to see the crate, or the door it lies by. It moves the crate clear as above and then takes up its walk, or its own haul, again. Once a minute at most. `clear_the_way`, `crate_in_the_way`, `crew_npc_crate_shuts_way`.
- An empty crate lying by a door aboard the docked shuttle now counts as a crate left by a door, and is moved to the middle of the deck. Before, it counted as sent back and nobody touched it. `misplaced_crates` and `haul_freight` in `crew_npc_freight.dm`.

The log. All in `game.log`, as "Crew NPC ... ":

- "lost its grip on the X (tool). The crate was left at ...; the body was at .... Next to the crate: ...".
- "is going back to take up the X again: try N of 3".
- "has given up hauling the X (tool: reason) and is putting it clear of the doors. It lies at ...".
- "put the X clear of the doors at ..., by pulling it" or "by pushing it", or "could not get the X clear of the doors".
- "found no way to PLACE (tool) and is moving the X clear: it lies at ..., shutting a doorway".

The Quartermaster is the guide (`jobs/cargo.ts`, `jobs/quartermaster.ts`, the words in `jobs/supply.ts`):

- A technician who gave a haul up tells the Quartermaster, the way other word is passed: "Ada, I could not get crate #4521 off the shuttle. It is in the Supply Shuttle, clear of the doors." It tells of one crate once in five minutes. `syncWontCome` and `wontComeStep` in `jobs/cargo.ts`; `gaveUp` is set in `ingest` in `brain.ts`.
- The Quartermaster answers "I have that", walks up to another technician and says: "Cora, crate #4521 is in the Supply Shuttle and Vik could not get it off the shuttle. See to it, please." With only one technician it says "Vik, try crate #4521 again in a little while, please." `crateHeldUp` and `sendStep` in `jobs/quartermaster.ts`.
- Whoever is told "See to it, please." has the shuttle and the rooms as well as their own part of the work for five minutes. `leftTo` in `jobs/cargo.ts`.
- Told of the same crate a second time, the Quartermaster sends whoever ordered it a PDA message that it is held up.
- A technician's PDA message to the Quartermaster that it is shut in has the Quartermaster send another technician the same way. `readsMessage` in `jobs/quartermaster.ts`.
- A technician's voice is told when it has given a crate up, where the crate is, and not to say it is on its way. `cues` in `jobs/cargo.ts`.

### Known and not fixed

- **Nothing here has been seen in the game.** In particular: that a crew body walking into a crate pushes it (read from `PushAM` in `living.dm`), that setting off for the crate again from inside `walk_finished` behaves (it is done 0.2 seconds later, by a timer), and that the spot picked to put a crate clear is one the body can walk to.
- A crate lying between two shut doors, with the body on the far side of both, is not found: the body sees neither the crate nor the door it lies by.
- With two doorways jammed at once, the second is cleared a minute after the first, on the next walk that fails.
- Any crew body will move a crate out of a doorway when its walk fails near one, even if a locked door was the real reason. The crate has to be on a door tile or in a one-tile passage by a door, so this should be rare. Not seen either way.
- Whether a technician shut aboard the shuttle ever sends "I am shut in" is not known. That path (`drive` in `driver.ts`) was written for locked doors and first goes to stand at a door.
- With no other technician to send, the Quartermaster does not go itself.
- The Quartermaster's "try it again" changes nothing in whoever hears it. They try again by themselves after the usual wait.
- A crate that would not come is not written in the order book.
- A technician who cannot walk to the Quartermaster, being shut aboard the shuttle, cannot say a crate would not come. It goes on trying to reach the Quartermaster's door until the word is five minutes old, then drops it. Nothing about it goes by PDA.
- The simulator's "the cargo technician ends at the post" check fails now and then in `qmwait` as well as `nested`, for the same reason. It did before this change.
- New simulator scenario `qmstuck` only. The simulator's own `unload` is made to fail by hand in it: it tests what the brains say and do, not the crate.
- No voice cases on the real model for the new lines.

---

## 2026-11-18, morning: fixes from the first round with a Quartermaster (the commit that added this file)

**Tested:** type check, server compile (0 errors, 0 warnings), simulator (all 31 scenarios pass). **Not played in a round.** The simulator does not run the server code, so the server-side fixes below are compile-checked only.

**Round that showed the faults:** `data/logs/2026/11/18/round-01.53.17` (MetaStation, 34 minutes). It ran a build from before the last of the Quartermaster work in `1939a113`.

### What the crew does now

Orders and crates:

- **Said is not told.** A technician with word for the Quartermaster (an order has come in, a crate is waiting, a crate is lost) waits to hear "Jameson, I have that." Until then the word is not passed on. With nothing back in 25 seconds it walks up and says it again. After two tries it sends the PDA to whoever ordered itself. `tellQuartermaster` in `jobs/cargo.ts`; the answer is in `overhears` in `jobs/quartermaster.ts`; the words are `WORD_HEARD` in `jobs/supply.ts`.
- The Quartermaster's "I have that" is said word for word and whatever its body is doing. `toTell` entries can now be `exact` and `whileBusy` (`types.ts`, `drive` in `driver.ts`).
- A head stops asking for an order once cargo says a crate of it is still waiting, not only on "your order has come in". `readsMessage` in `jobs/head.ts`.
- A head gives whoever it sent for a crate five minutes before it sends someone else. `sendFor` in `jobs/head.ts`.
- A crate to collect comes before a mess the same person was called to. `workInOrder` in `tasks.ts`.

Cargo's doors:

- A technician no longer tells a janitor "nobody here sent for you" when that janitor may come in and is only waiting a turn, or has just been told "I am coming". `syncTasks` in `jobs/cargo.ts`.
- A door just opened for someone is not opened again, the same way, for 15 seconds. `doorWanted` in `jobs/cargo.ts`.
- A door held open for two people shuts behind the later one, not the first one through. `hold_door_for` and `watch_door` in `crew_npc_doors.dm`.
- Someone let into locked rooms who wants out waits at the door they came in by. They try another way out every two minutes, not every 20 seconds. `drive` in `driver.ts`, `ingest` in `brain.ts`.

Janitors:

- With both hands full, a body puts what is not a tool of its trade (or an empty spray) in its bag, or on the floor, before it picks something up. `free_a_hand` in `crew_npc_hands.dm`.
- A mess seen in a room that is locked to the body is not its to go to. It goes when someone who works there calls it. `mess_places` in `crew_npc_cleaning.dm`.

The mail chute (fix 1 of `LLM_CREW_PLAN_NO_CHEATS.md`):

- A body walks, not runs, wherever its next step may be onto a slippery tile, unless its shoes grip. `mind_its_step` in `crew_npc_senses.dm`.
- A body that is not standing on a floor (in a pipe, a locker, a crate) senses nothing until it is out. Coming out of the disposal pipes is said in its event list and in `game.log`. `look_around` in `crew_npc_senses.dm`.

### Not the crew's fault

- **PDA messages stop when station power goes.** In that round every "Your PDA would not send the message." begins at 26 minutes, and `pda.log` has no line after it. A meeting with one of three staff there, a report never sent, and a technician calling one janitor six times in five minutes were all this.
- A random event turned the gravity generator off at 30 minutes, and nothing turns it back on.

### Known and not fixed

- The route planner sends a janitor inside the Cargo Bay to the lobby airlock, which is locked to it (11 failed walks stopping at 77,146). Cause not found. The fix above only stops the janitor walking at it over and over.
- No janitor had soap or a wet mop, so the oil in the Cargo Bay was never cleaned and technicians called for it every ten minutes. Needs the water work in `LLM_CREW_PLAN_NO_CHEATS.md` section 4.4.
- A janitor asked face to face to open a door its own ID opens only talks. It has no way to open a door for someone.
- Janitors do not put anyone out of their own rooms. The owner wants them to: Pun Pun got into the Custodial Closet and set off a cleaner grenade.
- A technician found no route from the Cargo Bay to the Warehouse, twice. Not looked into.
- The Quartermaster's order book never showed the order as come in. That should follow from "said is not told". Not checked.
- The simulator's `nested` scenario fails now and then on "the cargo technician ends at the post": the technician is on its five-minute round when the run stops. It did so on `1939a113` too (1 run in 6), and more often after these changes in one batch (4 in 6). The door sequence in the failing run was right.

---

## 2026-11-18, 02:27: the Quartermaster (`1939a113`)

**The entry above builds on this one.** This was written after it, at the owner's request, for the commit before this file existed. Where the two differ, the one above is later and is how things are now: it changed how a technician passes word to the Quartermaster.

**Tested:** type check, server compile (0 errors, 0 warnings), simulator (every scenario passed in the last full run, in quiet, chatty and dead-LLM modes, except `nested`), and the tables of cases in `tools/llm_crew/book.ts` and `reports.ts`. **Not played in a round. No model tests.** The simulator does not run the server code, so everything in `crew_npc_quartermaster.dm` is compile-checked only.

**Plan:** `LLM_CREW_PLAN_QUARTERMASTER.md`. Its section 1 lists what the owner decided, and items marked **Mine** are my choices.

### What the crew does now

Orders:

- **Every order goes through the Quartermaster.** A head, or the Captain, sends it by PDA. The Quartermaster numbers it and sends back "Noted, order 3: ...". `takeOrder` in `jobs/quartermaster.ts`; the head's side is `requisitionStep` in `jobs/head.ts`.
- A technician takes no order from anyone else while there is a Quartermaster. A head who tries is told once to send it by PDA. `offers` and `overhears` in `jobs/cargo.ts`.
- The Quartermaster never places an order. It walks up to a technician and gives it face to face, word for word: "Cora, order 3: I need to order ..., for Hop Kins." The technician's body reads it from those words and answers "Order 3, right away." `giveStep` in `jobs/quartermaster.ts`; `GIVEN_WORDS` in `jobs/supply.ts`; the `GIVEN` task in `jobs/cargo.ts`.
- Nothing between the Quartermaster and a technician goes by PDA. A technician with word for it (an order has come in, a crate is waiting, a crate is lost) says so in person, and knocks at its office door if it is not in sight. `tellQuartermaster` in `jobs/cargo.ts`; the `KNOCK` task in `jobs/quartermaster.ts`.
- The Quartermaster passes that word on to whoever ordered, by PDA. A lost crate it has ordered again, once, as a new order. `overhears` and `crateLost` in `jobs/quartermaster.ts`.
- A head whose order gets no "Noted" in three minutes takes it to the counter and adds "The Quartermaster has not answered." A technician told that serves it as before. `QM_SILENT` in `jobs/supply.ts`.
- An order placed for the Quartermaster carries who it is for, who gave it and its book number. `tool_order` and `order_arrived` in `crew_npc_cargo.dm`.

The order book:

- It is a sheet of paper on the Quartermaster's clipboard, named "order book". Its first job of the shift is to fetch a sheet from the nearest paper bin it can reach. `tool_get_paper` and `take_paper` in `crew_npc_quartermaster.dm`.
- Each order gets a line when it is taken and a line each time something happens to it. Lines begin "Order 3." because paper sets a line beginning "3." as a numbered list item. `BOOK` in `jobs/quartermaster.ts`; `tool_note` in `crew_npc_quartermaster.dm`.
- To write, the clipboard has to be in a hand and a pen in its clip. The pen comes out of the PDA. `ready_to_write` in `crew_npc_quartermaster.dm`.
- With nothing in its head and writing in the book, as after the brain window is reopened, it reads the book and carries on. `readBook` in `jobs/quartermaster.ts`.
- If it finds no paper it orders a Bureaucracy Crate for itself and opens that crate itself once it is off the shuttle. `orderForItself` in `jobs/quartermaster.ts`; `tool_open_own_crate` in `crew_npc_quartermaster.dm`.

Money:

- Every order is paid from cargo's one budget. The Quartermaster knows the budget and prices only from the budget program on its PDA. `cargo_budget` and `crate_costs` in `crew_npc_quartermaster.dm`.
- A purchase of more than 1,000 credits, or more than half of what is free, is put to the Captain by PDA with the numbers, ending "Yes or no?". It asks twice, three minutes apart, then holds the order and tells whoever ordered. With no Captain aboard it clears it itself. `clearOrders` and `readAnswer` in `jobs/quartermaster.ts`.
- An order the budget cannot cover is held, not refused, until the money is there.

The supply staff:

- The Quartermaster holds a staff meeting in the bay thirty seconds into the shift and every ten minutes after, called aloud. `SUPPLY_WAY` in `jobs/quartermaster.ts`; `aloudCall` in `jobs/meetings.ts`.
- How a staff meeting is held is now shared by both heads. `MeetingWay`, `syncMeeting` and `meetStep` in `jobs/head.ts`.
- Technicians report crates in and crates out since their last report, from the server's counts. `work_crates_in` and `work_crates_out`, counted in `crew_npc_freight.dm` and `crew_npc_held.dm`; the two new tallies in `jobs/reports.ts`.
- At the first meeting it divides the standing work: the counter, the shuttle and the rooms. A technician leaves another's part alone while that workmate is about. `dutyStep` in `jobs/quartermaster.ts`; `dutiesFor` in `jobs/supply.ts`; `dutyOf` and `leftTo` in `jobs/cargo.ts`.
- The test crew spawned at round start has a Quartermaster. `spawn_test_crew` in `crew_npc_spawn.dm`.

### Known and not fixed

- **Short of the no-cheats rule:** taking the sheet from the bin, clipping it to the clipboard and writing a line are done by direct code, under the same conditions as a player's clicks, not through the clicks themselves. `take_paper` and `tool_note` in `crew_npc_quartermaster.dm`.
- The half rule asks the Captain about nearly every early order: the budget is 500 to 1,000 credits then and a crate is 400. That is the rule as the owner decided it.
- The counter itself is not given to one technician. Whoever is asked still hands over a crate or opens the door. Only shuttle and room work is left to whoever has it.
- "Crates out" counts crates put out for collection plus empties put aboard the shuttle. That is my reading of "in and out".
- The Quartermaster has no way to know a technician, or anyone, is dead. A dead Quartermaster is found out only by its not answering.
- In the simulator the full-crew scenario `qm` failed once in 16 runs, on the older check that the bay door is not opened over and over for a janitor. It did not recur and the cause was not found.
- The simulator counts cargo's budget only when a Quartermaster is aboard. Without one, a three-crate order early in a round passes in the simulator and would be refused by the real server.
- The second supply meeting falls at the very end of the longest simulator run, so it is only partly exercised.
- The Quartermaster's own lines have no cases in `tools/llm_crew/voice.ts`.
- Mining and the bitrunners are the Quartermaster's too, and are not at its meeting.

---

## Earlier work

One line each, from the commit subjects. Each plan file has a Status section with the detail.

| Date | Commit | What |
|---|---|---|
| 2026-11-18 02:27 | `1939a113` | A Quartermaster who takes every order, keeps an order book, and runs the supply staff. Plan: `LLM_CREW_PLAN_QUARTERMASTER.md`. |
| 2026-11-18 00:55 | `0e3ef1d6` | Nobody gets stuck in a doorway at a staff meeting. Plan: `LLM_CREW_PLAN_MEETING_FOLLOWUPS.md`. |
| 2026-11-17 23:56 | `44828dae` | Getting out of locked rooms, eviction orders, stepping aside, and crates kept clear of doors. Plan: `LLM_CREW_PLAN_SECURE_AREAS.md`. |
| 2026-11-17 22:54 | `ee409a95` | Staff meetings with reports, the Captain kept informed, and mixed orders. |
| 2026-11-17 21:47 | `2b3c1f4c` | Cargo holds ordered crates for collection instead of delivering. |
| 2026-11-17 20:47 | `d2670102` | Heads, guarding, orders, meetings, and a simpler brain window. |
| 2026-11-17 10:00 | `82810bef` | LLM-voiced crew NPCs: janitors and a cargo technician. Brief: `LLM_CREW_BRIEF.md`. |

Planned and not built: `LLM_CREW_PLAN_NO_CHEATS.md` (all but the mail chute), `LLM_CREW_PLAN_DROPPED_CRATES.md`, `LLM_CREW_PLAN_LIGHTS.md`.
