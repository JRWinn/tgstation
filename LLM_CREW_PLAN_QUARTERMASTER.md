# Crew NPC plan: the Quartermaster

Written 2026-11-17, answered and built 2026-11-18. Items marked **Decided** are the project owner's. Items marked **Mine** are choices I made where the owner had not said, and can be overruled. Section 5 says what is built and what is not.

It builds on the staff meeting (`ee409a95`), the locked-areas work (`44828dae`) and the doorway fixes (`0e3ef1d6`). Read the header comments of `jobs/quartermaster.ts`, `jobs/supply.ts`, `jobs/cargo.ts` and `jobs/head.ts` first.

## 1. What was decided

- **Decided:** the Quartermaster is the head of the supply staff.
- **Decided:** anyone who wants something ordered goes through the Quartermaster. All orders from the other heads run through it.
- **Decided:** it delegates. It divides up the work of its technicians. A technician places the order at the console, not the Quartermaster.
- **Decided:** a head reaches it by PDA.
- **Decided:** between the Quartermaster and a technician everything is face to face. Nothing goes by PDA. A technician with word for it knocks on its office door.
- **Decided:** it keeps notes on orders, and they are physical: paper on a clipboard. It has to find or buy the paper.
- **Decided:** no cheats. What a body needs it finds, and if there is none to find it is ordered from cargo the usual way.
- **Decided:** every order is paid from one budget, cargo's.
- **Decided:** big purchases need the Captain's say: more than 1,000 credits, or more than half of what is left.
- **Decided:** if the Captain does not answer, it asks twice and then holds the order.
- **Decided:** with no Captain aboard it approves the purchase itself.
- **Decided:** every department that has NPC staff has its head spawned with it, so the Quartermaster is always aboard. If it dies or does not answer, a head orders from a technician by name, as before.
- **Decided:** there may be one technician or three. The split of their work has to hold for any number.
- **Decided:** at their staff meeting the technicians report the number of crates in and out, for now.
- **Decided:** it also runs mining, but not yet.
- **Decided:** the Chief Engineer and one engineer come after it, and start simple.

## 2. What the game gives us

- The Quartermaster is a head of staff who answers to the Captain. `hierarchy.ts` lists it as head of Supply.
- It starts the shift with a clipboard and no paper. Its PDA has a pen in it, and the program heads read the budget and prices from.
- The test crew's spawn puts what a body holds into its bag, so the clipboard starts there.
- Its office opens only off the Cargo Bay, and only the Captain and the Quartermaster can get in.
- On MetaStation the nearest paper bin is in the Delivery Office, inside cargo. There is none in its office. Cargo's Bureaucracy Crate has a paper bin and pens in it, and costs 640 credits.
- Paper takes text written by code, up to 5,000 characters a sheet. Paper sets a line that begins "3." as an item in a numbered list and renumbers it, so the book's lines begin "Order 3."
- Money, from the code and the cargo logs of two rounds:
  - Cargo's budget gains 500 credits as the round starts and 500 every five minutes. It stands at 1,000 from the five-minute mark.
  - Each empty crate sent back on the shuttle earns 200.
  - A crate is paid for when the shuttle loads it, not when it is ordered.
- What the crates in play cost: Janitorial Supplies 400, Replacement Lights 400, Bureaucracy 640.

## 3. How it works

### An order comes in

- A head, or the Captain, sends the Quartermaster an order by PDA. One said to its face is taken the same way.
- It gives the order a number, writes it in its order book, and sends word back by PDA: "Noted, order 3: 2 Janitorial Supplies Crate, 800 credits. I will send you the crate numbers when it comes in."
- An order for something cargo cannot get is answered with what it can.
- The same order from the same person while one is in hand is not taken twice.
- Someone who is not a head is not served. The voice tells them to go to their own head.

### The order book

- It is a sheet of paper on its clipboard, named "order book". A player who takes the clipboard can read it.
- Its first job of the shift is to fetch a sheet from the nearest paper bin it can reach.
- **No cheats:** to write, the clipboard comes out of its bag into a hand, and the pen comes out of its PDA into the clipboard's clip. With no free hand, or no pen, nothing is written.
- **No cheats:** it knows the budget and what a crate costs from the budget program on its PDA. Without the PDA it does not know, and clears orders without regard to money.
- Each order gets a line when it is taken and a line each time something happens to it:

  ```
  Order 3. From Hop Kins, Head of Personnel: 2 Janitorial Supplies Crate, 1 Replacement Lights. 1200 cr.
  Order 3. Asked the Captain.
  Order 3. The Captain said yes.
  Order 3. Given to Cora Tech.
  Order 3. Docked: crates #4521 and #4522 (Janitorial Supplies Crate); crate #4523 (Replacement Lights).
  Order 3. Lost: crate #4523. Ordered again as order 4.
  ```

- Every line is written by code in a fixed form. The LLM never writes in it.
- **Mine:** the book is also what it knows. With nothing in its head and writing in the book, as after the brain window is closed and opened again, it reads the book and carries on from where each order stood.
- Orders taken while it has no paper are carried in its head and written up when it has some.
- A sheet with no room left counts as no paper, and it fetches another.

### Buying paper

- If it can find no paper, it orders a Bureaucracy Crate for itself. That order goes in the book and through the same money rules as anyone's, and is given to a technician to place.
- When that crate has been hauled off the shuttle, it opens it itself, where it stands in the bay. It does not collect at the counter what is already in its own department.
- It then takes its sheet from the paper bin that was in the crate.

### Money and the Captain

- A big purchase is more than 1,000 credits, or more than half of what is free in the budget.
- Early in a round that is nearly every order: the budget is 500 to 1,000 credits and a crate is 400. That is the rule as decided.
- For a big purchase it asks the Captain by PDA, with the server's numbers: "Captain, order 3: the Head of Personnel Hop Kins wants 2 Janitorial Supplies Crate, 1 Replacement Lights: 1,200 credits of 2,000 in the budget. Yes or no?"
- The Captain's answer is read by code, by PDA or aloud. A number in it picks the order; with none it is the one asked about first.
- With no answer in three minutes it asks once more. Three minutes after that it holds the order and tells whoever ordered. A late answer still counts.
- With no Captain aboard it clears the order itself and writes that down.
- An order the budget cannot cover is held, not refused. Whoever ordered is told what it costs and what is free. It is given out as soon as the money is there.
- Money already promised to orders that have been given out and have not come in is not counted as free.
- The Captain's own order needs no asking.

### Giving the order to a technician

- It walks to the bay, walks up to a technician, and says, word for word: "Cora, order 3: I need to order 2 crates of janitorial supplies and a crate of replacement lights, for Hop Kins."
- The technician's body reads who it is for, what, how many and the number from those words. No LLM is asked whether it was an order.
- The technician says "Order 3, right away." If the Quartermaster does not hear that within a minute, it gives the order again.
- A technician with an order on the go is not given another. With every technician busy the order waits.
- Which technician: whoever has the shuttle, then one in sight, then they take turns.
- A technician takes no order from anyone else while there is a Quartermaster. A head who tries is told, once: "Hal, orders go through the Quartermaster, Ada Finch. Send it by PDA, please."

### Word back to the Quartermaster

All of it is face to face. If the Quartermaster is not in sight, the technician goes to its office door and knocks. The Quartermaster comes out to the bay and waits a little to hear what is wanted. If nobody comes to the door in a minute and a half, the technician sends word to whoever ordered by PDA itself, as it did before.

- **An order has come in:** "Ada, order 3 has come in: crates #4521 and #4522 (Janitorial Supplies Crate)." The Quartermaster writes the numbers in the book and sends them to whoever ordered.
- **A crate is still waiting to be collected:** "Ada, still waiting to be collected: crate #4521 for Hop Kins." The Quartermaster reminds whoever ordered.
- **A crate is lost:** "Ada, crate #4521 for Hop Kins is lost: it has been destroyed." The Quartermaster tells whoever ordered, writes it in the book, and has the same ordered again, once, as a new order. This settles the open question in the locked-areas plan.
- **An order could not be placed:** the Quartermaster gives it again after two minutes.
- **Said is not told** (added 2026-11-18, after the round below): the Quartermaster answers each of the first three by name, "Jameson, I have that." Until the technician hears that, its word is not passed on. With nothing back in 25 seconds it walks up to the Quartermaster and says it again; after two tries with no answer it sends word to whoever ordered by PDA itself. In the round the technician could see the Quartermaster through the office window, said its line in the bay, and counted it as told. The Quartermaster never heard it.

### The staff meeting

- Thirty seconds into the shift, and every ten minutes after, it goes to the bay and calls its technicians together aloud: "Staff meeting in the Cargo Bay now, please. Gather round and have your reports ready."
- It is held with the same steps as the Head of Personnel's: each is called on by name, reports, and stays until it is over.
- A technician reports crates in and crates out since its last report: "Ada, I have brought in 3 crates and sent out 2 crates. I need nothing."
  - **Mine:** in is crates hauled off the shuttle. Out is crates brought out to whoever came for them, plus empty crates put aboard the shuttle to go back.
  - The numbers are the server's.
- At the first meeting it divides the standing work, each technician told by name: "Cora, the counter is yours this shift." "Vik, the shuttle and the rooms are yours this shift."
- It ends with the totals: "Between you, that is 3 crates brought in and 2 crates sent out. The meeting is over, thank you."
- The Captain is told by PDA when one is held, and sent a report after: who came, crates in and out, orders in hand and the budget.
- The Captain can order one, as with the Head of Personnel.
- **Mine:** the first one is at thirty seconds, not two minutes. At one minute the technicians were shut up in it when the first janitor came to the bay door, and that janitor was then called away to its own meeting.

### Dividing the technicians' work

- The standing work is in three parts: the counter, the shuttle, the rooms.
  - **The shuttle:** unloading it, taking the mail out, loading the empties, sending it back. Orders from the Quartermaster go to whoever has it.
  - **The rooms:** looking in on the department, putting things away, moving crates left by doors, checking on crates left waiting.
  - **The counter:** staying at the post. **Mine:** work at the counter itself, handing a crate over or opening the door, is still done by whoever is asked. Gating it risked someone standing unserved.
- One technician has all three. Two have the counter, and the shuttle and the rooms. Three have one each. Any more help with the shuttle. They are taken in order of name, so the same people get the same work.
- A technician leaves another's part alone while that workmate is about. If the workmate has been out of sight for a minute, it sees to it.
- A technician who was not at the meeting has not heard, and works as before.

### When the Quartermaster does not answer

- A head whose order gets no "Noted" in three minutes takes it to the counter and adds: "The Quartermaster has not answered."
- A technician told that serves the head as it did before there was a Quartermaster.

### Where it is

- Its office is where it goes with nothing to do. It has no post at the counter and does not work it.

## 4. Where things live

- Brain window: `jobs/quartermaster.ts` (the job), `jobs/supply.ts` (the words every line is known by, shared by whoever says and whoever hears, and how the work is dealt out), the technician's side in `jobs/cargo.ts`, the head's side in `jobs/head.ts`. How a staff meeting is held is shared by both heads: `MeetingWay` in `jobs/head.ts`. The call aloud is in `jobs/meetings.ts`. Crates in and out are two more counted kinds in `jobs/reports.ts`.
- Server: `crew_npc_quartermaster.dm` (office, staff room, paper, order book, budget, opening its own crate), `tool_order` and `order_arrived` in `crew_npc_cargo.dm`, the counts in `crew_npc_freight.dm` and `crew_npc_held.dm`, and four new tools: `note`, `get_paper`, `word_passed`, `open_own_crate`.
- Tests: `tools/llm_crew/book.ts` (the book and the words, no model), and simulator scenarios `qm`, `qmbig`, `qmno`, `qmquiet`, `qmpoor`, `qmgone`, `qmpaper`, `qmlost`, `qmwait`.

## 5. Status

Built 2026-11-18. **Type check, server compile, the tables of cases and the simulator only. Not played in a round, and nothing new has been tried against the real model.**

Built: everything in section 3, and the Quartermaster in the test crew that spawns at round start.

Played once since, in `data/logs/2026/11/18/round-01.53.17`, on the build from before the second sitting's work. What that round showed, and what was changed for it the same night (type check, server compile and simulator only, not played):

- Word that a crate had come in never reached the Quartermaster, so the head was not told for six minutes. Fixed: see "Said is not told" above.
- The head went on asking for an order that had come, every ten minutes, because only "your order has come in" closed it. Fixed: "still waiting at cargo" closes it too (`readsMessage` in `jobs/head.ts`).
- The head sent a second janitor for the one crate four and a half minutes after the first. Fixed: whoever was sent has five minutes before someone else is (`sendFor` in `jobs/head.ts`).
- The janitor sent for the crate went to a mess it had been called to instead. Fixed: a crate to collect comes before a mess it was called to (`workInOrder` in `tasks.ts`).
- The Quartermaster's book never showed the order as come in. That follows from the first fault, and should not happen now. Not checked in a round.

Not built:

- Voice cases against the real model for the Quartermaster's lines.
- Mining and the bitrunners at its meeting.
- Giving the counter itself to one technician. See "Dividing the technicians' work".

Known limits:

- **No cheats, still open:** a technician's crate label is made from nothing. That is in the no-cheats plan, not this one.
- In the simulator a mixed order of three crates early in a round is placed without regard to money when no Quartermaster is aboard. The real server would refuse it. The simulator counts the budget only when a Quartermaster is aboard.
- The Quartermaster's knowledge of who is dead is nil. A dead Quartermaster is found out only by its not answering.
- A second staff meeting ten minutes in falls at the very end of the longest simulator run, so it is only partly exercised there.

## 6. Not in this plan

- Mining and the bitrunners.
- The Chief Engineer and the engineer. Their plan comes after this one.
- Selling things to earn money: exports and bounties.
- Stamping manifests.
- Raises for the best performer.
