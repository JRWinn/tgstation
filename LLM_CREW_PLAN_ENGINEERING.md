# Crew NPC plan: the Chief Engineer and one engineer

Written 2026-11-18. **Planning only: nothing here is built.** Items marked **Decided** are the project owner's, from earlier plans. Items marked **Proposed** are mine. The six questions in section 7 were answered on 2026-11-18, all as suggested.

It builds on the Quartermaster (`1939a113`) and the staff meeting (`ee409a95`). Read the header comments of `jobs/head.ts`, `jobs/quartermaster.ts` and `jobs/supply.ts` first: the engineering staff are meant to be the same shape.

## 1. What was decided

These are from earlier plans and talks, not new.

- **Decided:** the Chief Engineer and one engineer come after the Quartermaster, and start simple.
- **Decided:** every department that has NPC staff has its head spawned with it.
- **Decided:** staff tell their own head what they need. The head orders it from the Quartermaster by PDA. It is paid from cargo's budget, and a big purchase needs the Captain's say.
- **Decided:** cargo delivers nothing. Whoever the head sends collects the crate at the counter.
- **Decided:** no cheats. A body acts only as a player could. What it needs it finds, or has ordered.
- **Decided:** code does the work and the LLM is the voice. A dead LLM must not stall the work.
- **Decided:** hand-offs between workmates are said out loud.
- **Decided:** a room that is dark with every tube intact is the power being off. That is engineering's business, not the light replacer's.
- **Decided:** work that needs several people waits for a head to divide it up.
- The owner's idea of 2026-11-16, not yet settled in detail: a fault is looked into and handed on between jobs. The lights are out, the janitor checks the bulb, says the power is out, and calls engineering.

## 2. What the game gives us

Read from the code, the MetaStation map and the local wiki on 2026-11-18. **None of it has been seen in a round.** Where a line is worked out and not read, it says so.

### Power

- Nothing on MetaStation makes power when a round starts.
- The station runs on three batteries (SMES) in Engineering, behind the Power Monitoring door. Each starts with 50 MJ and puts out 90 kW, which is about nine minutes at full draw. Rounds have gone dark at about fifteen.
- Each battery starts with its input on at 50 kW of a possible 200 kW.
- The engine is a supermatter crystal. Its energy leaves as arcs, two tesla coils in the chamber catch them, and the coils feed the grid. There are no radiation collectors on the map.
- The crystal makes nothing until it is hit. Three emitters, welded down and wired, already point at it.
- An emitter is switched on by a click with an empty hand. It has to be on a wire. Worked out, not read: with the batteries flat the emitters have nothing to fire with, so **the engine has to be lit before the batteries run out.**
- The four solar arrays have their panels built. Worked out from the map's cables and the wiki: none is wired to the station, and wiring them is a spacewalk.
- Twelve small generators stand fuelled in maintenance. Each makes 10 to 40 kW. The station draws up to 270 kW.

### Lighting the engine

The wiki's way, for this engine:

1. Turn the bypass pump off.
2. Wrench the two nitrogen canisters onto their connectors. Turn their pump on, full.
3. Turn the chamber and cooling loop pumps on, full.
4. Turn both filters on, full. One is set to nitrogen and the other to nothing.
5. At the air alarm by the chamber: set the scrubbers to draw everything out, and take the pressure limit off the vents.
6. Switch on each emitter.
7. Set each battery to 200 kW in and 190 kW out.

What that takes:

- Pumps and filters go on with one kind of click and to full with another. Both are a player's ordinary clicks.
- The canisters need a wrench. It is the only tool in the whole job.
- The engine room's air alarm starts unlocked, and answers to an engineering ID.
- The batteries and the air alarm are set in their own windows.
- The map starts with three pumps on and eight off, one filter set to nitrogen, and coolers that are off.

**Corrected when building, 2026-11-18:** the wiki's steps are not enough on this map. Traced from the map's pipes, the loop is broken in two places the wiki does not list: the filter with nothing set is off, and Mix Bypass is off, so nitrogen never gets back to the chamber. The steps the crew use are the traced ones, 21 of them on 16 machines: `METASTATION` in `jobs/engine.ts`. The coolers stay off.

What goes wrong:

- Lit with no cooling, the crystal heats, loses integrity, and at the end destroys Engineering. The warnings go out on the Engineering radio channel.
- With the emitters off its energy dies away by itself. Off is the safe state.
- A lit crystal gives off radiation, and people who look at it see things. The engineer's outfit has no radiation suit and no meson goggles. Three radiation shutters in the chamber start open. **Not known: how much a body takes standing in the engine room.**

### The two jobs

- **Station Engineer:** a full tool belt (wrench, screwdriver, welder, crowbar, cutters, multitool, cable), insulated gloves, and a PDA with the alarm program and the engine monitor program.
- **Chief Engineer:** a belt of power tools, plain gloves, and a PDA with the same two programs.
- Both IDs open Engineering, the engine room, the gravity generator, maintenance, the outer airlocks, air alarms and room power controllers (APCs). Only the Chief Engineer opens its own office.
- The Chief Engineer's office has a station alert console. It lists every room whose power controller has fallen below 30 percent.
- Neither PDA can show the power grid. That is a console in Engineering.
- Cargo sells a Power Cell Crate (600), a generator crate (1,000), insulated gloves (1,600), a Solar Panel Crate (1,600) and emitters (1,400).

### What the crew code has, and does not

- The chain of command already lists Engineering under the Chief Engineer (`hierarchy.ts`). It has no meeting room set.
- How a head holds a meeting is shared (`MeetingWay` in `jobs/head.ts`). So are reports, needs, orders to the Quartermaster, collecting a crate, and the rules for locked rooms.
- **A body cannot take a tool from its belt.** It uses its hands and its bag.
- **A body cannot work a machine.** The only things it operates are doors, the fire alarm and the supply console.
- **A body does not hear its radio** (`crew_npc_senses.dm`, "Radio is a separate sense that comes later").
- A body's eyes skip power controllers as clutter.
- PDA messages stop when station power goes.

## 3. What carries over from the other sections

| Piece | How supply does it | Engineering |
|---|---|---|
| Head and staff | Quartermaster, technicians | Chief Engineer, one engineer |
| Staff meeting | In the bay, called aloud, 30 seconds in, then every ten minutes | Same, in Engineering |
| Standing work handed out | The counter, the shuttle, the rooms, at the first meeting | The engine, at the first meeting |
| Head's orders to staff | Face to face, word for word, read by code | Same |
| Word back to the head | Face to face, and not counted as told until answered | Same |
| The head's source of truth | The order book and the PDA's budget program | The PDA's engine monitor and the alert console |
| Report at the meeting | Crates in and out, the server's counts | The engine's state, then jobs done |
| What staff need | To the head, who orders by PDA from the Quartermaster | Same, unchanged |
| The Captain | Told of each meeting and sent the report | Same, and told at once if the engine is in trouble |
| Locked rooms | Visitors asked, expected, or put out | Same rules, as built |
| Dead LLM | Every line has a plain fallback | Same |

## 4. How it would work: stage 1, the engine

Everything here is **Proposed**.

### The aim

- One thing: the station still has power thirty minutes into a round.
- That means the engine is lit inside the first nine minutes, and lit safely.

### The first meeting

- Thirty seconds in, the Chief Engineer calls its staff together in Engineering, aloud.
- There is nothing to report yet, so it goes straight to the work: "Sam, the engine is yours. Light it now, please."
- The engineer answers "The engine, right away." and goes.
- The engineer's standing order is the engine. If it has heard nothing from the Chief Engineer two minutes in, it starts anyway.

### Lighting it

- The engineer works down a checklist. The checklist is data, written for MetaStation's engine room, with each machine known by the name it has on the map.
- Each step is one real action: a click, a wrench on a canister, a setting in a machine's own window.
- After each step the body looks at the machine and sees that it took. A step that did not take is tried once more.
- **The emitters are last, and are switched on only when every step before them has been seen done.**
- A step that fails twice stops the job. The emitters stay off, and the engineer tells the Chief Engineer which step it was: "Chief, I cannot light the engine: the nitrogen canister will not connect."
- When it is lit the engineer leaves the engine room and says so: "Chief, the engine is lit." The Chief Engineer answers "Sam, I have that."
- On a map whose engine has no checklist, the engineer says it does not know this engine, and the Chief Engineer tells the Captain.

### The batteries

- The Chief Engineer sets the three batteries itself: input to full, output to 190 kW.
- It does this straight after the first meeting. It is harmless before the engine is lit.
- This is the one piece of hands-on work it has. See question 2.

### Watching the engine

- The Chief Engineer reads the engine monitor on its PDA once a minute. That is its only knowledge of the engine: no PDA, no knowledge.
- **Integrity falling** is the one emergency in stage 1. It tells the engineer, face to face or by PDA: "Sam, the engine is losing integrity. Emitters off, now."
- The engineer drops whatever it is doing, switches the emitters off, and says so. Nothing comes before this.
- The Captain is told by PDA when the emitters are shut off, and why.
- The engine is not lit again that round unless the Captain orders it. Nothing cleverer is tried.
- **Energy fallen to nothing with integrity sound** means the emitters have stopped. The engineer is sent to switch them on again.

### Talking when apart

- In Engineering everything is said aloud.
- Apart, they use the PDA, as the other heads do.
- The PDA dies with the power. So nothing in the first nine minutes depends on a message: the engine is a standing order, and the batteries are the Chief Engineer's own.
- Radio is left out of stage 1. See question 3.

### The meetings after the first

- Every ten minutes, in Engineering, called aloud.
- The engineer reports the engine: "Chief, the engine is lit and I need nothing."
- The Chief Engineer closes with the monitor's reading: "The engine is at 100 percent integrity. The meeting is over, thank you."
- The Captain is sent the same: who came, the engine's state, and anything asked for.

### What they need

- The engineer tells the Chief Engineer what it is short of. The Chief Engineer orders it from the Quartermaster by PDA, like any head.
- In stage 1 there is nothing it should need. The order path is there so that stage 2 has it.

### Where they are

- The engineer's post is Engineering. With nothing to do it stands there, and looks in on Engineering's rooms now and then as cargo staff do.
- Nobody looks in on the engine chamber itself.
- The Chief Engineer goes to its office with nothing to do. The alert console is there.

### The test crew

- One Chief Engineer and one engineer are added to the crew that spawns at round start. That makes nine bodies.

## 5. Later stages, in outline

Not to be built until stage 1 has been played in a round.

**Stage 2: calls.**

- The Chief Engineer learns of a room without power from the alert console in its office, or from anyone who tells it.
- Any crew NPC that finds a room dark with its tubes intact tells the Chief Engineer by PDA, once. This is the owner's janitor example.
- The Chief Engineer keeps a list of calls and gives them to the engineer one at a time.
- The engineer goes, reads the room's power controller, and does what the reading calls for. A breaker that is off it turns on. Anything else it reports.
- Gravity: after the blackout event the generator's breaker is off. The engineer goes to the Gravity Generator Room and turns it back on.
- The engineer reports calls answered at the meeting, counted by the server.

**Stage 3: more.**

- Swapping a dead cell in a power controller, with cells ordered from cargo.
- A generator hauled to a dead room and wired in.
- The solar arrays: a suit, a spacewalk, wiring.
- A radiation suit and goggles before going into a lit engine room.
- Radio.
- A second engineer, and the work divided between them.

## 6. What has to be built for stage 1

In the order I would build it. Each step can be checked before the next.

1. **Server: tools from the belt.** Take a tool out into a hand and put it back. Every job gains by it.
2. **Server: working a machine by hand.** Walk to a named machine, stand by it, and click it one way: plain, the "on" click, the "full" click, or with the tool in hand. It goes through the same code a player's click reaches. The body then reads the machine's state back.
3. **Server: a machine's own window.** The battery's levels, the air alarm's modes, a filter's gas. Under the game's own checks, with the body as the user: its ID, its distance, the machine's lock.
4. **Server: the engine room in the engineer's eyes.** The checklist's machines by name and state, sent only to engineering staff standing in the room.
5. **Server: reading the engine monitor** from the PDA, as the Quartermaster reads the budget.
6. **Brain: the words.** `jobs/engineering.ts`: every fixed line, shared by whoever says it and whoever hears it, like `jobs/supply.ts`.
7. **Brain: the checklist.** `jobs/engine.ts`: MetaStation's steps as data, and the rule that the emitters come last.
8. **Brain: the two jobs.** `jobs/chiefengineer.ts` and `jobs/engineer.ts`, added to `jobs/index.ts`. The Chief Engineer goes first in the list, because its title contains "Engineer". Engineering's meeting room goes in `hierarchy.ts`.
9. **Spawn.** The two outfits and their rooms in `spawn_test_crew`.
10. **Simulator.** An engine room with machines that have states, and scenarios:
    - the engine is lit, and the emitters are the last thing touched;
    - a step fails twice, the emitters are never switched on, and the Chief Engineer is told;
    - integrity falls, and the emitters go off before anything else is done;
    - the Chief Engineer never speaks, and the engineer starts anyway;
    - the LLM is dead, and all of the above still happens.
11. **A round.** Read `game.log` for each step, and for radiation.

Rough size: three sittings. Steps 2 and 3 are the large part. They are the first time a body works a machine, and every later department needs them too.

To be checked while building, because the plan leans on them:

- Which named pump does which job in the wiki's steps.
- That the engineer's ID opens every door between its post and the engine room.
- That the emitters start unlocked.
- Whether the cooler has to be on.
- How to reach a machine's window honestly from server code.

## 7. Settled questions

All six were put to the project owner with a suggestion, and all six suggestions were accepted on 2026-11-18 ("All six as you suggest"). They are **Decided**.

The items in section 4 marked **Proposed** have not been gone through one by one. They were in front of the project owner when the six were accepted, and none was objected to.

| # | Question | Decided |
|---|---|---|
| 1 | Is the engine the right first job? The other choices are smaller but do not stop the power failing: gravity and room power calls only, or small generators. | The engine. It is the only thing aboard that can carry the station, and the fault it fixes is the one that spoils every round. |
| 2 | Does the Chief Engineer work with its hands? The Quartermaster never does. | Only the batteries and the watching. With one engineer and nine minutes, a head who only stands by costs too much. It never works the engine room while an engineer is aboard. |
| 3 | How do they talk when apart? | PDA for now, with nothing urgent depending on it. Radio is a new sense for every job and wants its own plan. |
| 4 | Does the engineer suit up against radiation first? Bodies cannot put on clothes yet. | Not in stage 1. It goes in before the engine is lit, when there is no radiation, and stays out after. The first round's log says whether that is enough. |
| 5 | When integrity falls, is "emitters off and tell the Captain" enough? | Yes. A dark station is better than no Engineering. |
| 6 | Nine bodies on one graphics card: is that all right? | Yes. The LLM is asked only for talk, and the engine work asks it nothing. |

## 8. Status

Stage 1 built 2026-11-18. **Type check, server compile, the table of cases and the simulator only. Not played in a round, and nothing has been tried against the real model.** The top entry of `LLM_CREW_CHANGELOG.md` for that date says what was built, where, and what is known to be unproven.

Built: everything in section 4, and both jobs in the test crew that spawns at round start.

Decided while building, by the owner: the batteries and the engine air alarm are set by sending the machine what its window would send, because the game will not open a window for a body with no player ("Send what the window would send").

Mine, while building, and can be overruled:

- The first meeting is held as every head's is, so the engineer is called on for a report before it is given the engine. That costs about twenty seconds.
- The engineer does not knock at the Chief Engineer's office door. Word it cannot say to the Chief Engineer's face goes by PDA.
- Integrity under 95 percent is when the emitters go off. No energy in a sound crystal two minutes after lighting is when they are switched on again, at most once in five minutes.
- A step is tried twice before the job stops.

Not built: stages 2 and 3 (section 5).

Wants a round. What to look for in `game.log`: "worked the" for each machine set, in order, with the emitters last; "could not work the" for any that failed, with the reason; and whether the power is still on at thirty minutes.

## 9. Not in this plan

- Atmospheric technicians, and the air.
- Hull breaches, fires, and building or repairing anything.
- Telecomms.
- Any engine setup other than nitrogen.
- Saving an engine that is past switching off.
- Hacking doors.
