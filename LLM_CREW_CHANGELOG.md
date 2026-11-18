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
