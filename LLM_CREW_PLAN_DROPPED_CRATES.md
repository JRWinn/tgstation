# Crew NPC plan: dropped crates

Written 2026-11-18 from the round logged at `data/logs/2026/11/18/round-00.56.30`. Rewritten the same day after the project owner answered. **Planning only: nothing here is built, and nothing is to be built until the owner says so.**

Items marked **Decided** are the owner's. Items marked **Mine** are choices I made to fill in the rest; section 7 lists the ones worth a second look. Items marked **Unknown** are not known yet.

**Do not start until the Quartermaster work is committed.** That work now changes `crew_npc_tools.dm`, `crew_npc_cargo.dm`, `_defines.dm`, `types.ts`, `brain.ts`, `jobs/cargo.ts` and the simulator, and this plan touches every one of them.

## 1. The rules, in short

1. A body that loses its grip on a crate goes back and takes hold again. Three tries.
2. After three tries it does not walk away. It puts the crate somewhere clear of doors first.
3. To do that it pulls the crate if it can get round it, and pushes it if it cannot.
4. Anyone whose way is shut by a loose crate in a doorway moves that crate clear. Cargo staff also tidy crates on the shuttle deck, not only in their rooms.
5. The Quartermaster is the guide. It says which one technician has the shuttle, and it is who a technician tells when a crate will not come.
6. Every one of these is written to the round's log, with the tile the crate is on.

## 2. What went wrong in the round

Times are the local clock, as the NPCs see it. The log files are six hours ahead. There was no Quartermaster in this round.

- 01:13:52: Sam was asked which came first, unloading or putting the empties aboard, and picked the empties. At 01:13:58 Maria picked unloading. Both were now going through the dock at once.
- 01:14:05: Maria lost her grip on a crate she was hauling off, at the outer door of the dock (64,151). She was told Sam was in the way and asked him to step aside.
- 01:14:13: eight seconds later she had taken up another job, hauling an empty aboard. She lost that one too at 01:14:17, just inside the shuttle (60,154).
- 01:14:20 to 01:19:32: both were aboard. Every haul off the shuttle failed with "there is no way through; no route could be found". Nine tries in five minutes.
- 01:19:32: Maria got a crate out into the bay. The logs do not say what cleared the way.
- Neither of them said they were stuck. They went on telling each other they were about to haul crate #1091 off.

**Unknown:** which tile each dropped crate lay on. The log gives where the body stopped, not where the crate was. Two drops followed by no route at all fits one crate in each airlock, but that is a reading, not a record.

## 3. What the game gives us

- The dock on MetaStation has two airlocks for people, at y 151 and y 153. Each is one tile wide and three long (x 64 to 66), with a door at each end. The supply shuttle has a door facing each.
- A pull breaks the moment the load is more than one tile from whoever is pulling it. The load trails one step behind.
- Two people who meet in a passage change places. A crate cannot change places with anyone. So when a hauler and someone coming the other way swap, the crate is left a tile further back and the pull breaks. In a passage one tile wide this happens every time.
- Anyone can push a loose crate by walking into it. It moves one tile ahead of them. Read from the game's code (`PushAM` in `living.dm`); not yet tried with a crew body.
- A route is never planned through a loose crate. To the planner it is a wall.
- The supply shuttle will not leave with anyone standing aboard. A technician shut in on it is not carried off.
- What the crew code does today:
  - A lost grip ends the haul at once (`crew_npc_walk/perform` in `crew_npc_motor.dm`). The brain is told, and picks its next job. Nothing goes back for the crate.
  - The dropper keeps its claim on the crate for 45 seconds, so its workmate leaves the crate alone for that long.
  - "A crate left by a door" (`misplaced_crates` in `crew_npc_freight.dm`) is looked for only in cargo's own rooms and the lobby. The shuttle deck is not one of them.
  - An empty crate anywhere on the shuttle counts as already sent back. Nobody moves it again.
  - The crate tidy-up hauls by pulling, with the body in front. A body shut in behind a crate in a one-tile passage cannot get in front of it, so the tidy-up fails the same way the haul did.
  - A failed walk to a room counts towards a body knowing it is shut in. A failed haul does not.
- What the Quartermaster work gives us (built 2026-11-18, not yet played):
  - A technician tells the Quartermaster face to face when an order has come in, and knocks at its office door if it is not in sight.
  - Nothing passes between the Quartermaster and a technician by PDA.
  - The Quartermaster hands out each order. It does not yet hand out the standing work: counter, shuttle and rooms.

## 4. How it would work

### 4.1 Taking it up again

- **Decided:** a body that loses its grip takes hold again.
- **Decided:** three tries for one haul. The count starts again with the next crate.
- It turns back, walks to the crate, takes hold, and goes on to where it was going.
- It does not try when a workmate has the crate in hand, or the crate is gone. That is reported as it is now.
- When a person was in the way, it takes hold again first, so the crate is not left lying. It then asks them to step aside, they step aside (both built), and it goes on.
- The brain is told "you lost your grip on the crate and took it up again" as a plain event. The LLM is not woken for it.
- **Mine:** every kind of haul works this way, not only unloading: empties going aboard, a crate brought out to the lobby, a crate collected, an empty taken back, and a crate being moved from a door.

### 4.2 When it will not come

- After the third try the body does not walk away from the crate. It puts the crate on the nearest tile that is clear of doors and that the crate can be got to. Then it reports.
- **Decided:** a body may push a crate, and only when it cannot get round the crate to pull it.
- Pulling is tried first. The body pushes when the crate lies between it and the open floor in a passage one tile wide: it walks into the crate until the crate is out of the passage, then hauls it clear.
- The report says where the crate now is: "You could not get the crate to the bay. You have left it aboard the shuttle, clear of the doors."
- **Decided (from the locked-areas plan):** a crate is never left next to a door. This is that rule, kept when a haul fails as well as when it ends well.

### 4.3 A crate in the way

- **Decided:** anyone moves a crate that shuts their own way, not only cargo staff.
- A body whose walk fails with no way through looks for a loose crate lying in a doorway in view. If there is one and nobody has it in hand, it moves that crate clear, as in 4.2, and tries the walk once more. If the way is still shut, the failure is reported as it is now.
- Only cargo staff go looking for crates to tidy. Everyone else moves one only when it shuts their own way.
- The cargo tidy-up also covers the shuttle deck while the shuttle is docked. An empty crate lying by a shuttle door is moved to the middle of the deck, where empties go.
- The cargo tidy-up can push as well as pull. This is what lets a technician who is shut in behind a crate get out.

### 4.4 The Quartermaster is the guide

- **Decided:** the Quartermaster will be aboard, and it is the guide. The dock is not shared out by a rule between technicians.
- **Mine:** one technician has the shuttle at a time, and the Quartermaster says who.
  - When a technician tells it an order has come in, the Quartermaster answers, word for word: "Maria, the shuttle is yours: unload it and load the empties."
  - That technician alone unloads, loads the empties and sends the shuttle back. The other keeps the counter and the rooms, and does not go through the dock to haul.
  - With one technician aboard, the shuttle is theirs without being told.
- **Mine:** a technician who has given up on a crate (4.2) tells the Quartermaster face to face, in a line written by code: "Ada, I could not get crate #1091 off the shuttle. It is aboard, clear of the doors."
  - The Quartermaster sends the other technician for it, by name and face to face. With only one technician, it tells that one to try again, once.
  - If that fails too, the Quartermaster tells whoever ordered the crate that it is held up, by PDA.
- **Mine:** a technician shut in by a crate it cannot shift tells the Quartermaster by PDA. This is the one case where they do not speak face to face, because the technician cannot walk to it. The Quartermaster sends the other technician to move the crate from the outside, or comes itself if there is none.
- **Mine:** a failed haul with no way through counts towards a body knowing it is shut in, the same as a failed walk does. In the round neither technician knew for five minutes.
- With the Quartermaster dead or gone, nobody hands out the shuttle. Both technicians work it as they do today, and rules 1 to 4 are what keep the dock clear.

### 4.5 The log

Written to `game.log`, beside the failed walks:

- A lost grip: which crate, the tile it was left on, the tile the body was on, and who or what was next to the crate.
- A crate taken up again, and which try it was.
- A crate given up on, where it was put, and whether it was pulled or pushed there.
- A crate moved because it shut someone's way, and whose.

### 4.6 The voice

- A technician is told the facts: its body takes a dropped crate up again by itself, a crate it could not get through has been put clear and where, and who has the shuttle.
- It does not say a crate is on its way to the counter while the crate is still aboard.

## 5. What has to be built

Server, `code/modules/llm_crew`:

- The four log lines, in `crew_npc_tools.dm` beside `log_walk_failed`.
- One shared "haul came to nothing" step used by `freight_hauled`, `crate_released`, `crate_collected` and `crate_taken_back`: try again, or give up and put it clear. A try count on the controller.
- "Put it clear": find the nearest tile clear of doors that the crate can be got to, and pull or push it there. A push is a short walk into the crate, a tile at a time, stopped when the crate is clear, when it will not move, or after a few seconds.
- `misplaced_crates` and `storage_spot`: the shuttle deck while docked. One tile of clearance from doors there, the deck being small.
- `walk_finished`: on no way through, look for a loose crate in a doorway in view, move it, walk once more.
- `freight_hauled`: a haul that fails with no way through counts towards being shut in.
- Who has the shuttle, kept on the server and sent to the brain with the rest of the freight state.

Brain window, `tgui/packages/tgui/interfaces/CrewBrain`:

- `jobs/supply.ts`: the words for "the shuttle is yours", "I could not get crate N", "fetch crate N" and "try again", read by code on both sides like the order lines.
- `jobs/quartermaster.ts`: giving out the shuttle, and what it does when told a crate will not come or a technician is shut in.
- `jobs/freight.ts`: unloading, loading and sending wait unless the shuttle is this technician's, while there is a Quartermaster.
- `jobs/cargo.ts`: telling the Quartermaster, and the cues for 4.6.
- `types.ts`, `brain.ts`: the new field and the new event lines.
- `tools/llm_crew/fixtures.ts`: the new field, or the model tests break.

Checks:

- Server compile and type check.
- The table of cases in `tools/llm_crew/book.ts` for the new lines.
- Simulator scenarios: `regrip`, `putclear`, `shuttleyours`, `wontcome`, `shutaboard`. They show what the brains do with each report. **They cannot show a crate moving:** pulling and pushing happen only in the game.
- Played in a round with a Quartermaster, two technicians and an order of three or more crates, then read back from the new log lines. Until that is done this is not known to work.

## 6. Order of building

1. The log lines (4.5).
2. Taking it up again (4.1).
3. Putting it clear, by pulling or pushing (4.2).
4. A crate in anyone's way, and the shuttle deck (4.3).
5. The Quartermaster hands out the shuttle and is told of trouble (4.4).
6. The voice (4.6).

Steps 1 to 4 are server code and do not need a Quartermaster to work. Step 5 does.

## 7. Say so if you want these otherwise

These are the choices marked **Mine** that change what you would see in a round:

- The shuttle goes to whichever technician reports that it has docked. The other does not haul through the dock at all while there is a Quartermaster.
- A crate that will not come is reported to the Quartermaster, who sends the other technician. It is not written in the order book.
- A technician shut in by a crate uses the PDA to reach the Quartermaster. Everything else between them stays face to face.

## 8. Not in this plan

- The rest of the standing work: who has the counter and who looks in on the rooms. That is the Quartermaster plan's, and is not built there yet. This plan hands out the shuttle only.
- Lanes: out by one airlock and in by the other. The route planner picks the shorter way and would have to be taught otherwise.
- Using the conveyors and flaps beside the airlocks to move crates.
- A crate that drifts out of the dock into space. The locked-areas work already writes it off and tells whoever ordered it.
