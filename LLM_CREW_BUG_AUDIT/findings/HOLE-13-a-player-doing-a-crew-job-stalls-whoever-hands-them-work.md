---
id: HOLE-13
title: A player holding a crew job is handed work like an NPC, and work waits for ever on set words a player will never say
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:799, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:179, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:88, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:176, tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:39
fix: Take any answer from the person a job was given to as their word that they have it, give a job that goes unanswered to someone else after a set number of tries, and call to a staff meeting only those who have answered a call before
---

## What is wrong

The crew find their workmates by job title, in view or on the PDA list. A player with that title is one of them. Nothing tells a player from an NPC, and the hand-offs between crew are built on set words that only the crew's own code says. Every round so far has had one human, the Captain, so none of this has been met. With a friend aboard as a cargo technician, a janitor or an assistant, it will be.

**1. The Quartermaster gives an order to a player technician and waits on it for good.**

`technicians(brain)` is everyone in view or on the PDA whose job is Cargo Technician. An order is given to whoever has the shuttle duty, else one in sight, else by turns (`free[order.n % free.length]`): with two NPC technicians and one player, one order in three goes to the player.

The Quartermaster then listens for `TAKEN_WORDS`: `/\border (\d+)\b[^.]*\bright away\b/i`. A player says "ok", or "on it", or nothing. After a minute (`TAKEN_WAIT_DS`) the order is given again, "to the same technician, who may have it in hand and only not have been heard", and again, with no limit. The code says why it never moves on: "Only word that it could not be placed frees it for someone else", and that word is another set phrase (`NOT_PLACED_WORDS`, "order N did not go through").

While any order is in that state the Quartermaster holds no staff meeting: `syncMeeting(brain, SUPPLY_WAY, ledger.orders.some((order) => order.state === 'given' && !order.taken))`.

So one player technician answering in their own words stops that order, every later order that falls to them, and every supply staff meeting, until the round ends. If the player does place the order at the console, nothing tells the Quartermaster: word that it has come in is `DOCKED_WORDS`, by PDA, in set words.

**2. The Head of Personnel calls every service player to every meeting.**

`staff(brain)` for the Head of Personnel is everyone on the PDA whose job has any of these in it: Janitor, Bartender, Cook, Botanist, Assistant, Clown, Mime, Chaplain, Curator, Lawyer, Psychologist (`DEPARTMENTS` in `hierarchy.ts`). Assistant is the job most players take.

Every ten minutes each of them is sent "Staff meeting in the Bar Lounge now, please. Send word that you are coming, and bring your report." The meeting does not begin until every one of them has been sent it (`everyoneCalled`), one PDA message at a time. At the end each one who gave no report in the set form is sent "the staff meeting is over. Send me your report by PDA, please", and each who was not there is sent who security is looking for (`wantedAbsent`). That is two or three PDA messages to every service player every ten minutes, for the whole round. The Captain's copy reads "3 of 14 there".

A player who does come is called on by name and has 45 seconds (`TURN_WAIT_DS`) to give a report the code can read (`readReport`). Whatever they say, the head moves on. That part holds up.

**3. The same shape elsewhere.**

- A warrant given to a player security officer is given three times and then "taken as heard" (HOLE-08 has this).
- A head's notice of who is wanted, sent to a player head, waits for `NOTICE_ACK_WORDS`, is sent twice, and then the Captain is told "the security notice did not reach X". That one ends, and tells someone: it is the right shape.
- The Head of Personnel's order to a player Quartermaster waits three minutes for "noted, order N" and then goes to the counter. Also the right shape.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:799`, `syncTasks`:

      // A technician given an order that has not said they have it is given it again.
      for (const order of ledger.orders) {
        if (
          order.state === 'given' &&
          !order.taken &&
          order.givenAt !== null &&
          brain.now - order.givenAt > TAKEN_WAIT_DS
        ) {
          // To the same technician, who may have it in hand and only not have been heard: `givenTo`
          // is kept, and giveStep goes by it. ... Only word that it could not be placed frees it for
          // someone else.
          order.state = 'cleared';
          order.pick = order.givenTo;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:88`:

    export const TAKEN_WORDS = /\border (\d+)\b[^.]*\bright away\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:191`, `staff`:

      return brain.pdaPeople.filter((person) =>
        department.jobs.some((job) =>
          person.job.toLowerCase().includes(job.toLowerCase()),
        ),
      );

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:702`, `meetStep`: one `message` step for each `uninvited` person, before anything else.

## How it was found

Read from the code. Not seen in a round: there has been no second human.

## How to fix it

1. **Any answer is an answer.** Where a job has been handed to a named person and their word is waited on (`order.state === 'given'` in the Quartermaster, `warrant.given === 'said'` at the desk, a head's turn at a meeting), take anything that person says to this NPC or sends it by PDA within the wait as "I have it", unless it reads as a no. The set words stay as the sure case. A small helper `acknowledges(text)`: false for words like no, cannot, can't, busy, not now; true otherwise. The crew's own lines pass it as they are.
2. **A limit and a way on, everywhere.** In the Quartermaster's `syncTasks`, count the gives (`order.gives`, as the desk's `warrant.gives` does). After three with no answer of any kind, free the order for another technician (`order.givenTo = null`), write a line in the book ("Order N. No answer from X: given to Y."), and do not pick X again for a while. This is the same rule as HOLE-08's `countsOn`, and should be the same code.
3. **The meeting is not held back by an order nobody has taken.** Change the `held` argument to be true only while the order was given in the last `TAKEN_WAIT_DS`.
4. **Call to a meeting only those who are likely to come.** Call everyone to the first meeting. After it, call those who answered the call, came, or sent a report at any earlier one, and send the rest nothing. Keep the count honest in the Captain's report: "3 of 3 called; 11 others on the list did not answer the first call". `brain.reliance` from HOLE-08 holds what is needed.
5. With HOLE-10's `npc` flag on people in view, the crew could tell a player from an NPC outright and treat them differently. I would not lean on that here: steps 1 to 4 work the same for a player, an NPC from another window, and an NPC whose brain is gone, and that is the general rule the project asks for.

Questions for the owner:
- Should a player in a crew job get orders from NPC heads at all? It is more like a real crew if they do. If not, the lookups can skip anyone who is not an NPC, once the server says who is.
- Should assistants be the Head of Personnel's staff? By the game's table they are. Called to a meeting every ten minutes, players will find it tiresome.

## How to test the fix

- `tools/llm_crew/book.ts` or a new table: an order given to a technician who answers "ok", who answers "can't, busy", and who says nothing. Expected: taken, freed at once, freed after three gives.
- Simulator: `qm` with one technician's brain replaced by a scripted "player" that answers "ok" and does nothing. Checks: the next order goes to the other technician after the limit, and the Quartermaster still holds its meeting.
- `reports.ts`: a meeting where two of five staff never answer the first call. The second meeting sends three calls, not five.
- Type check.
