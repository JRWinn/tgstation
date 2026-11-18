# Crew NPC plan: eleven faults from the round of 2026-11-18, 09:12

Written 2026-11-18 from the round logged at `data/logs/2026/11/18/round-09.12.44`: MetaStation, 20 minutes, a Head of Personnel, a Quartermaster, two cargo technicians and three janitors, on commit `6b378160` (the crate-grip build). The owner asked for a plan for all eleven faults and no code.

Items marked **Decided** are the owner's. Items marked **Mine** are choices I made; section 7 lists the ones worth a second look. Items marked **Unknown** are not known yet. Times are the crew's own clock, which is six hours behind the stamps in the log files.

## Status

**Built 2026-11-18, on the owner's "write in all your fixes". Type check, server compile and the old simulator scenarios only. Not played in a round.** The entry at the top of `LLM_CREW_CHANGELOG.md` has the detail. The sections below are the plan as it was written.

The six choices in section 7 were not answered one by one. They were built as written there, except the two listed under "Not built".

Built:

- Janitors: a visit settles a room, and a clean that fails holds back the whole job (4.1).
- Meetings called aloud: the head walks up before it calls, calls again whoever was too far off, sends a PDA to whoever is out of sight, and staff called on by name report (4.2).
- The Captain's answer: asked about when it is unclear, more words for yes, held orders named in each report, and an order that is no longer a big purchase goes ahead (4.3).
- The Quartermaster's own crate, by PDA (4.4).
- "I cannot shift it" ends the call on both sides, and one line for a room (4.5, 4.6).
- A crate is moved from a doorway only if the body's ID opens the door (4.7).
- Cargo's doors: one technician answers, and nobody is let out unasked for three minutes (4.8).
- The Warehouse log line (4.9).
- What Pun Pun hands over is put down (4.10).
- The voice: who the Captain is, whose each crate is, no remark after an order, and a fellow NPC answered once in three minutes (4.11).

Where what was built differs from the plan:

- 4.1: "a walk once begun is finished" needed nothing. The driver already leaves a walk alone unless an emergency order comes.
- 4.1, added: the list of messes a body has given up on is cleared when it holds a different kind of thing to clean with. It was kept for good before.
- 4.2: there is no fifteen-second wait. The head walks up to anyone more than four tiles off before it calls, and again before it calls on them. Only the Quartermaster's report says "No reports given".
- 4.3: the question names the order: "is that a yes or a no to order 2: 1 Janitorial Supplies Crate?" It is asked at most twice for one order.
- 4.8: "nobody is let out until they ask" kept a long stop. Someone who has been inside three minutes with the mess gone, and has not asked, is still let out unasked.
- 4.9: the log line gives the doors of the room and the first thing on the straight line there, not "the first tile the planner could not pass". The planner does not say where it gave up.
- 4.11: handles and foreign characters needed nothing. See below.

Not built:

- **4.8, opening the door to see who knocked.** The door tool is built round a named person, and holding a door is one of the cheats still to come out. Rewriting it blind seemed worse than leaving it. The wrong-name knocks in the round came from janitors returning to a call they had answered, which 4.5 mends.
- **4.12, only shuttle crates put back.** Not built: it was the owner's to decide and was not answered.
- A thing put in a pocket (4.10) is left alone, as planned.
- The simulator scenarios in section 5.

Where the fault list in section 2 was wrong:

- 2.11: "Captain p3" was never said aloud. The brain log keeps the model's raw reply. What was said was "Captain Zim".
- 2.11: the Chinese character was in a reason given for a choice of job, not in speech.

Engineering was committed as `067acf69` before the build began, so nothing had to wait for it.

Five older faults showed again in this round: the Quartermaster down the mail chute twice, seven `movable_moved overridden` runtimes, a `get_turfs_by_zlevel(0)` runtime, "came out of the Service Deliveries", and a janitor walking at a door it cannot reach. Commit `5f6f5da6` was written for those after this round's build. It has not been played. They are not in this plan.

## 1. The rules, in short

1. A janitor settles a room in one visit, and a job that failed is left alone as a whole, walk and all.
2. A head who calls a meeting aloud makes sure each of its staff has heard.
3. What the Captain says about an order waiting on them is an answer, or is asked about. It is never a new order for nothing.
4. The Quartermaster's own crate is opened by the Quartermaster, however word of it comes.
5. "I cannot shift it" ends the call on both sides.
6. A janitor says one thing about a room, not two that disagree.
7. A body moves a crate from a doorway only if the door is one it can open.
8. One technician answers a door. Nobody is let out who has not asked. A knock is answered by looking.
9. The Warehouse: find the cause first.
10. What Pun Pun puts in a hand is put down.
11. The voice is told who the Captain is, whose each crate is, and when to add nothing.

## 2. What the round showed

Each fault has what was seen, and the cause as far as it was traced. "Read in the code" means I found the lines and they fit what was seen. Nothing here was proved by running it.

### 2.1 Janitors walking back and forth

- Gerardo went between the Service Hallway and Lesser Starboard Maintenance about 30 times from 09:15:18 to 09:23:48, then between the Service Hallway and the Cargo Bay door nine times until 09:32:06. Each leg to the door took about 27 seconds.
- Alaina went between the Service Hallway and Lesser Starboard Maintenance about 20 times from 09:28:10 to 09:32:20.
- Lance went between the Service Hallway and the door of the Mining Office eight times from 09:24:36 to 09:31:54.
- All three stopped within 30 seconds of each other (09:31:51, 09:32:04, 09:32:17), each sending "I cannot shift the mess in the Service Hallway".
- Their bodies reported "You could not get to it." two seconds into a clean in the Service Hallway (Gerardo 09:25:48, Lance 09:27:17).

Cause, read in the code:

- A clean that cannot reach its mess, or cannot shift it, rules out that one mess and ends (`crew_npc_fail_errand` in `crew_npc_hands.dm`, `clean_mess` in `crew_npc_cleaning.dm`). The room stays on the list while any other mess is remembered there (`workable_mess_places`).
- The brain then holds back only that step, the clean in that room, for 20 seconds and longer each time (`fail` and `inBackoff` in `driver.ts`, keyed on job and step together).
- The walk to the same room is a different step and is not held back. So as soon as the body is anywhere else, the job is ready again, and if it is the older call it comes first (`workInOrder` in `tasks.ts`).
- One mess was ruled out for each trip. The trips ended when the last one was.

### 2.2 A staff meeting nobody heard

- The Quartermaster called its second meeting aloud at 09:27:04, on arriving in the Cargo Bay from its office.
- Neither technician's event list has the call. Victor was about eight tiles away. Neither body gave a report, and Victor walked off to the Bitrunning Den while being called on.
- The Quartermaster still began ("Your staff are here"), waited out each turn, and sent the Captain "2 of 2 there. No crates in or out to count yet." One crate had come in and three had gone out.

Cause, read in the code: a technician learns of the meeting only by hearing the call (`meetingsOverhear` in `jobs/meetings.ts`). The Quartermaster counts its staff as there when it can see them.

### 2.3 The Captain's spoken yes read as an order

- 09:17:21: the Quartermaster asked by PDA about order 2 (janitorial supplies, 400 credits).
- 09:17:22: the Captain said, one tile away, "Bryan, places that order you asked me about".
- 09:17:23: the Quartermaster sent "I cannot order that, Zim. What cargo can get just now: ...".
- Order 2 stayed "waiting on the Captain's say" to the end of the round. By 09:29 the budget was 1,960 credits. The janitors never got supplies.

Cause, read in the code (`jobs/quartermaster.ts`):

- `readAnswer` found no word from its yes list or its no list, so the line was not an answer.
- `takeOrder` then took it as an order, because it has the word "order" in it, found no crate named, and answered as it would to an order for something cargo cannot get.
- `clearOrders` skips an order that is waiting on the Captain. It never looks again at whether the order still needs the Captain's say.

### 2.4 The Quartermaster's own crate never opened

- Crate #1779 (the Quartermaster's own Bureaucracy Crate, order 1) docked at 09:20:19.
- Victor went to the Quartermaster's door twice. The Quartermaster was shut in the Service Hallway.
- 09:22:31: Victor fell back to a PDA: "Your order has come in: crate #1779 (Bureaucracy Crate). Send someone to the Cargo Lobby counter with the number to collect it."
- The crate sat to the end. Victor checked it and went to tell the Quartermaster at 09:28 and 09:33. The Quartermaster said "Victor, I have that." each time and did nothing.

Cause, read in the code: the Quartermaster's book marks an order as come in only on hearing a technician say "order N has come in: ..." (`DOCKED_WORDS` in `jobs/supply.ts`, read in `overhears`). The PDA fallback is worded for whoever ordered and does not match. "Still waiting to be collected" is passed on to whoever ordered, and for its own order that is nobody.

### 2.5 "I cannot shift it" ends the call on one side only

- Lance told Victor he could not shift the mess in the Cargo Bay (09:19:14). Alaina told him the same (09:20:36).
- Both came back to the Cargo Bay door (Alaina 09:23:09, Lance 09:24:31) and were told "nobody here sent for you".
- Victor called Alaina, and then Gerardo, to the same cobweb.
- 09:31:51: Lance sent Alaina "I cannot shift the mess in the Service Hallway". She took it as a call to that mess, went, and sent the same words back to him at 09:32:17.

Cause, read in the code: the technician strikes its call when told (`jobs/cargo.ts`, near line 2052). The janitor marks the job as told (`toldBeyond` in `jobs/janitor.ts`) and keeps it. A PDA that names a mess in a room is read as a call, whatever else it says (`readsMessage` in `jobs/janitor.ts`).

### 2.6 Two messages that disagree

- 09:18:16: Lance sent Victor "I cannot shift the mess in the Cargo Lobby with my mop."
- 09:18:20: Lance said "Victor, the mess in the Cargo Lobby is cleaned up."

He had cleaned one mess and could not shift another. Each message is true of one of them.

### 2.7 A crate moved because of a locked door

- 09:22:40: Lance, shut in the Mining Office by a door locked to him, pulled a crate from (64,164) to (67,163): "found no way to Custodial Closet and is moving the crate clear".

This is the risk the change log entry for `6b378160` listed. The crate was not what stopped him.

### 2.8 Cargo's doors

- Both technicians answered one ask: the Cargo Bay door for Lance at 09:18:27 (Victor was told "The door will not open for you"), and the maintenance door for Alaina at 09:20:10 and 09:20:16.
- 09:22:14: Amaryllis set off to let Lance out of the Mining Office at the moment Victor let him in. She opened it at 09:22:37. He had not asked.
- A knock was taken to be whoever was last sent for: at 09:19:47 Victor tried the door for Alaina when Lance had knocked, and at 09:23:51 Amaryllis tried it for Gerardo, called that same second. Both got "there is nobody of that name at the door".

### 2.9 The Warehouse

- Victor's walk to the Warehouse failed twice (09:25:11 from (76,145), 09:31:04 from (77,147)): "no route could be found". **Unknown** why. Nothing was logged as moved near that door.

### 2.10 Things in hand after a meeting in the Bar Lounge

- Addison came away holding a salt shaker, Alaina a banana cream pie, Lance a deck of cards, Gerardo a bar seating indicator placer. None of their logs has a pick-up.

Cause, read in the code: Pun Pun. The game's own monkey behaviour puts what it holds into a nearby person's hand or pocket (`code/datums/ai/generic_behaviors/give.dm`; Pun Pun's chance is set to 30 in `monkey_controller.dm`). Pun Pun was seen in the room at both meetings. Nothing in the crew code is at fault. The crew just never put the things down.

### 2.11 The voice

- The Quartermaster told the Captain "If you need supplies for your department, take it to the head of yours", and said it had seen no paper while holding its order book.
- Both technicians said, many times, that they were holding #1779 for the Captain. It was the Quartermaster's.
- Right after its body gave Victor order 1 word for word, the Quartermaster's voice added "that crate isn't coming yet".
- Victor said "Captain p3" aloud. One reply had a Chinese character in it.
- Victor and Amaryllis answered each other with the same lines about every ten seconds for most of the round.

## 3. What has to be true of any fix

- **Decided** earlier: a crew body acts only as a player could. It finds a thing or orders it. Nothing is made, moved or switched in code.
- Nothing below gives a body knowledge it could not have. Where a fix leans on what a body knows, it says how the body knows it.
- The simulator runs the brain and not the server. Anything in a `.dm` file is compile-checked only until it is played.

## 4. How it would work

### 4.1 Janitors

- **Mine.** One visit settles a room. When a mess cannot be reached or will not come off, the body goes on to the next mess it remembers in that room. It reports only when it has tried each one. (Server: `tool_clean`, `next_mess`, `crew_npc_fail_errand`.)
- **Mine.** A clean that fails holds back the whole job for that room, not the one step. The walk back is held with it. (Brain: `fail` and `keyOf` in `driver.ts`, for clean jobs.)
- **Mine.** A walk once begun is finished. Only a staff meeting, an emergency or an order from its head turns a body round on the way.

### 4.2 Meetings called aloud

- **Mine.** The head walks up to within a few tiles of its staff before it calls, and calls where it can see them.
- **Mine.** "Said is not told", as for word passed to the Quartermaster: a member of staff who does not come over within 15 seconds is walked up to and told again by name. One who is out of sight gets the PDA call the Head of Personnel already sends.
- **Mine.** Staff called on by name for a report, by their own head, give it, whether or not they heard the call.
- **Mine.** With no report given, the summary and the Captain's copy say "No reports given", not "No crates in or out to count yet". A member of staff who gave none is not counted as there.

### 4.3 The Captain's answer

- **Mine.** While any order is waiting on the Captain, a line from the Captain to the Quartermaster that is no clear yes or no and names no crate gets a question back, in the way it came: "Captain, is that a yes or a no to order 2?" It is asked once for each such line.
- **Mine.** The yes list gains: "place it", "place that order", "put it through", "buy it", "get it", "go on".
- **Mine.** An order held for no answer is named again in each meeting report to the Captain: "Order 2 is still waiting on your say."
- **Mine, and the owner's to overrule.** An order that no longer counts as a big purchase, because the budget has grown, goes ahead without the Captain. The book gets a line and the Captain a PDA saying so.

### 4.4 The Quartermaster's own crate

- **Mine.** When the Quartermaster ordered it, the technician's PDA fallback uses the words it would have said aloud: "Bryan, order 1 has come in: crate #1779 (Bureaucracy Crate)."
- **Mine.** The Quartermaster's book reads those words from a technician's PDA as it does from speech, and it goes to open the crate.
- **Mine.** "Still waiting to be collected" about a crate of its own does the same, if the book does not have it as come in.

### 4.5 "I cannot shift it"

- **Mine.** The janitor's own job for that room closes when it sends the message. It opens again only on a new call.
- **Mine.** The technician calls one more janitor, and the call names what is needed: "It needs soap or a wet mop. Come if you have one." A janitor without it answers "I have neither" by PDA and stays where it is. After that the technician leaves the mess until it is told supplies have come.
- **Mine.** A PDA with "I cannot shift" in it is never read as a call.
- **Mine.** A mess another janitor only spoke of counts as noticed, not as a call. Nobody is owed word about it.

### 4.6 One message about a room

- **Mine.** When some was cleaned and some would not shift, the janitor sends one line and says nothing else: "I have done what I can in the Cargo Lobby. The rest needs soap or a wet mop." "Cleaned up" is said only when nothing is left.

### 4.7 A crate in the way

- **Mine.** A body moves a crate from a doorway only if its own ID opens that door. A player knows what their card opens. (Server: `clear_the_way`, `crate_in_the_way` in `crew_npc_grip.dm`.)

### 4.8 Cargo's doors

This area was changed by `5f6f5da6` after the round. Read it again before building.

- **Mine.** The technician who has the rooms for the shift answers knocks and asks. The other answers only if named, or if the first is out of sight and has said nothing for 15 seconds.
- **Mine.** Nobody is let out until they ask: a knock from inside, a PDA, or a word.
- **Mine, and the owner's to overrule.** A knock from outside is answered by going to the door and opening it to see who is there. Someone sent for is let in. Anyone else is told so and the door is left to shut. The body stops finding a person by name through a door it cannot see through. This also mends the fault the change log lists under `5f6f5da6`: a knock from inside by someone the department has no note of.

### 4.9 The Warehouse

- **Unknown.** First read the map at the door between the Cargo Bay and the Warehouse, and what was standing by it.
- **Mine.** Add to the "walk failed" log line the first tile the planner could not pass. The next round then says where.

### 4.10 What Pun Pun hands over

- **Mine.** The body notices that it is holding something it did not pick up, and its event list says so: "You find a salt shaker in your hand."
- **Mine.** When it next has a free moment it puts the thing on the nearest table, as a technician tidying already does. A tool of its own trade it keeps.
- **Unknown.** Whether a body should notice a thing put in its pocket. Left alone in this plan.

### 4.11 The voice

- **Mine.** The Quartermaster's cue names the Captain: "Zim Fire is the Captain. They may order, and theirs is the say you are waiting on for order 2." It also says "Your order book is on the clipboard in your hand."
- **Mine.** A technician's cue lists each crate it is holding with whose it is, and says "Nobody else has a crate here."
- **Mine.** When the body gives an order to a technician word for word, the voice adds nothing, as with "I have that."
- **Mine.** Handles such as "p3" are replaced with the person's name before a line is said, and characters outside Latin script are dropped.
- **Mine.** A crew member does not answer another's reply to its own remark more than once, unless it was asked a question or told something new.

### 4.12 Selling the station's own crates

- The station's trash cart and a freezer went on the shuttle as empties and were sold for 600 credits with one other crate.
- **Mine, and the owner's to overrule.** A technician puts back only crates that came off the shuttle. It knows which those are: it hauled them off.

## 5. What has to be built

Brain (`tgui/packages/tgui/interfaces/CrewBrain/`):

- `driver.ts`: hold back a clean job as a whole (4.1); finish a walk once begun (4.1).
- `jobs/janitor.ts`: close the job on "cannot shift", answer a call that names what is needed, do not read "cannot shift" as a call, one message for a room (4.5, 4.6).
- `jobs/meetings.ts`, `jobs/head.ts`, `jobs/quartermaster.ts`: the call made near staff and made again, a report given when called on, "No reports given" (4.2).
- `jobs/quartermaster.ts`, `jobs/supply.ts`: the Captain's answer, held orders looked at again, its own crate by PDA (4.3, 4.4).
- `jobs/cargo.ts`: the fallback words for the Quartermaster's own crate, one more janitor called with what is needed, who answers a door, nobody let out unasked, only shuttle crates put back (4.4, 4.5, 4.8, 4.12).
- `prompt.ts`, `talk.ts`, the `cues` of the Quartermaster and the technician: the voice (4.11).
- `brain.ts`: the event for a thing found in the hand (4.10).

Server (`code/modules/llm_crew/`):

- `crew_npc_cleaning.dm`, `crew_npc_hands.dm`: try each remembered mess in the room before reporting (4.1).
- `crew_npc_grip.dm`: the door has to be one the body's ID opens (4.7).
- `crew_npc_doors.dm`: open to see who knocked (4.8); the first tile not passed, in the log (4.9).
- `crew_npc_senses.dm`, `crew_npc_tidying.dm`: notice a thing in the hand, and put it on a table (4.10).

Simulator (`tools/llm_crew/`), one scenario each where the brain alone can show it:

- A janitor with two rooms where the clean fails: it must not go back and forth.
- A meeting call the staff do not hear.
- The Captain's "place that order" while an order waits.
- The Quartermaster's own crate told of by PDA.
- "I cannot shift it" from one janitor to a technician, and from one janitor to another.

## 6. Order of building

1. Janitors (4.1): it cost the most of the round.
2. The Captain's answer (4.3) and the Quartermaster's own crate (4.4): both are in `jobs/quartermaster.ts`.
3. "I cannot shift it" and one message (4.5, 4.6).
4. Cargo's doors (4.8) and a crate in the way (4.7), after reading `5f6f5da6`.
5. The Warehouse log line (4.9).

To wait for the engineering work to be committed, because it has the same files open: meetings (4.2, `jobs/reports.ts`), the voice (4.11, `prompt.ts`), and what Pun Pun hands over (4.10, `brain.ts` and `types.ts`).

## 7. Say so if you want these otherwise

1. An order that is no longer a big purchase goes ahead without the Captain (4.3).
2. A technician calls one more janitor, naming what is needed, and then leaves the mess (4.5).
3. A technician opens the door to see who knocked (4.8).
4. A thing found in a pocket is left alone (4.10).
5. Technicians put back only crates that came off the shuttle (4.12).
6. A body finishes a walk once begun, short of a meeting, an emergency or its head's order (4.1).

## 8. Not in this plan

- The five older faults, which `5f6f5da6` was written for.
- Who a line is spoken to. At 09:17:49 the Captain said "The Bureaucracy Crate, order it for yourself" two tiles from the Quartermaster, and Amaryllis, seven tiles away, took it as said to her. **Unknown** why.
- A janitor asked face to face to open a door its own ID opens. The Quartermaster asked three janitors in the Service Hallway. Listed as known in the change log.
- Water for mops, and supplies for the janitors, which `LLM_CREW_PLAN_NO_CHEATS.md` covers.

## 9. What to look for in the next round

- `crew_brain.log`: no janitor with more than two walks in a row between the same two rooms.
- `pda.log`: no "I cannot order that" to the Captain after a question to the Captain; no "nobody here sent for you" to a janitor who had been called.
- `game.log`: one "opened ... to let ... into" for each ask; "walk failed ... to Warehouse" with the tile named.
- The Quartermaster's meeting report with crates counted, or "No reports given".
- Nobody holding a salt shaker at the end.
