# Crew NPC plan: a light replacer, assigned by the head

Written 2026-11-17. **Planning only: nothing here is built.** Items marked **Decided** are the project owner's. Items marked **Proposed** are mine and want a yes or no.

It builds on the staff meeting committed as `ee409a95`: read the header comments of `jobs/head.ts`, `jobs/meetings.ts` and `jobs/reports.ts` first.

## 1. What was decided

- **Decided:** nobody is given the job at spawn. The Head of Personnel hands out jobs at the first staff meeting.
- **Decided:** one person is the light replacer, and it must be a janitor.
- **Decided:** it is about dead fixtures: a light that is broken, burned out or missing. A room that is dark because the power is off is not this job.
- **Decided:** janitors, or anyone else, who find a dead or missing light report it. The Head of Personnel tells its light replacer.
- **Decided:** if the light replacer needs anything, it comes from cargo, through the head, like everything else.

## 2. What the game gives us

- Every light fixture knows its own state: working, empty, broken or burned out, and whether it takes a tube or a bulb.
- A new tube or bulb used on a fixture goes in, provided it is the right kind for that fixture.
- Cargo's Replacement Lights crate is three boxes, each with 14 tubes and 7 bulbs. Cargo can already order it.
- A light replacer does the same in one use and takes either kind, and is refilled from those boxes. On MetaStation nothing a janitor can reach has one: there is no custodial locker with one on the map, the janitor wardrobe vendor stocks two but NPCs cannot use vendors, and no cargo crate contains one.
- NPC bodies only carry things in their hands. They cannot put a tool on a belt and take it out again.
- The crew's eyes skip light fixtures today, on purpose, as clutter found in every room.

## 3. How it would work

### The job is handed out

- **Proposed:** at the first meeting, after the reports and before the summing up, the head names one of the janitors in the room: "Finn, the lights are yours from now on." That line is said word for word, like the summing up, because the janitor acts on hearing its own name in it.
- **Proposed:** which janitor is picked at random from those in the room. With nobody in the room, the first one to send a report by PDA is told by PDA.
- **Proposed:** the job is kept for the shift. If the light replacer is no longer on the head's PDA at a later meeting, another janitor is named.
- **Proposed:** the head's report to the Captain says who has the lights.
- **Proposed:** the light replacer still cleans. Lights it has been sent to come before messes it has found for itself, and after a mess someone called it to.

### A dead light is reported

- **Proposed:** every crew NPC, whatever its job, notes a dead or missing light it sees, by room. It reports each room to the Head of Personnel once, by PDA: "Lights out in the Bar Lounge: 2." Not again for that room until it has been seen fixed, or ten minutes have gone by.
- **Proposed:** cargo staff report to the Head of Personnel too, though they do not answer to it, because the lights are its staff's job. This is the same as cargo calling a janitor to a mess today.
- **Proposed:** a player telling the head that lights are out in a room, out loud or by PDA, is noted the same way.
- **Proposed:** the light replacer does not report what it sees itself. It puts it on its own list.

### The head tells its light replacer

- **Proposed:** the head keeps one list of rooms with dead lights. Each room new to the list is passed on by PDA: "Finn, lights out in the Bar Lounge." A room already on the list is not passed on twice.
- **Proposed:** rooms reported before anyone has the job are held, and passed on the moment the job is handed out.
- **Proposed:** when a room is done, the light replacer sends the head one PDA message saying so, and the head takes it off the list.

### The work

- **Proposed:** for each room on its list the light replacer goes there and fits a light in each dead fixture it can reach, one after another, the way a janitor works through the messes in a room.
- **Proposed:** the body does one fitting as one action: it takes the right kind of light out of the box it is holding, fits it, and puts the dead one back in the box. No dead tubes or glass are left on the floor.
- **Proposed:** a room locked to it is left alone and the head is told so. Getting into locked rooms is the other plan's subject.

### What it needs comes from cargo

- **Proposed:** the first thing it needs is a box of lights. It looks where the cleaning gear is kept, as a janitor does for a mop. If there is none, that is what it is short of: it tells the head by PDA, and says so at the next meeting.
- **Proposed:** the head orders a crate of Replacement Lights from a technician by name, in the same order as anything else its staff need. It is collected and unpacked in the Custodial Closet by the existing collection run.
- **Proposed:** a box that runs out of the kind a fixture needs is the same shortage, and is reported the same way.

### The report

- **Proposed:** the server counts each light fitted. "Replaced 4 lights" becomes a third counted kind in a staff report, beside items and spots, and goes into the head's summing up and the Captain's report.

## 4. What has to be built

In the order I would build it. Each step can be checked in the simulator before the next.

1. **Server: seeing lights.** Stop skipping fixtures that are dead. Remember dead ones by room, as messes are remembered, and forget one when it is seen working. Send each body the rooms it knows have dead lights, and how many.
2. **Server: fitting a light.** One new action, with a count of lights fitted added to the work totals. It fails plainly when the body holds no box, or the box has none of the right kind.
3. **Brain: reporting.** A shared duty, not a job's: any NPC with a PDA reports a room's dead lights to the Head of Personnel once. It sits beside the meeting code, which is also everyone's.
4. **Brain: the head.** The list of rooms, passing them on, handing the job out at the meeting, naming someone else if the light replacer is gone, and a second kind of supply to order: Replacement Lights, for whoever has the lights.
5. **Brain: the light replacer.** The janitor job gains a duty it only has when it has been given it: a task per room, the step to go and fit lights, fetching a box, what it is short of, and word back to the head when a room is done.
6. **Reports.** One more counted kind in `reports.ts` and its case table.
7. **Simulator.** Fixtures with states in the fake station, a scenario, and checks: exactly one janitor is given the job, at the first meeting; a technician's report goes to the head and not to a janitor; the head passes it on once; the light replacer gets a box through cargo when there is none; the lights get fitted; the count in its report is the server's; nobody else fits a light.

Rough size: larger than I first said. Two sittings, not one, then a round to see what the body really does with a box in its hand.

## 5. Settled questions

All six were put to the project owner with a suggestion, and all six suggestions were accepted on 2026-11-17 ("Yes, all six"). They are **Decided**.

| Question | Decided |
|---|---|
| By hand from a box, or with a light replacer? | By hand from a box. Everything it needs can already be ordered from cargo. A light replacer is quicker, but cargo cannot order one unless a crate is added for it. |
| Does the light replacer keep cleaning? | Yes, when it has no lights to fit. |
| How does the head pick? | At random from the janitors in the room. |
| One hand is the box. What if both hands are full? | It puts down the cleaning tool it is not using, in the Custodial Closet, before it sets out. |
| Do other jobs get handed out at the first meeting too? | Not in this plan. The same step can hand out more later, such as who cleans which rooms. |
| What about a room that is dark with every tube intact? | Left out. That is the power being off: the earlier idea of the janitor checking the bulb and calling engineering. |

The items in section 3 marked **Proposed** have not been gone through one by one. They were in front of the project owner when the six were accepted, and none was objected to.

## 6. Not in this plan

- Getting the light replacer into rooms locked to it.
- Power cuts, and calling engineering.
- Raises for the best performer.
