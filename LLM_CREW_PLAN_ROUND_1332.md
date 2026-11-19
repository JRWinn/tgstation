# Faults and alterations from the 13:32 round

**Round:** `data/logs/2026/11/18/round-13.32.16` (MetaStation, 50 minutes, on `a8578281`). It was the first round with door names, a carried bucket and the fixes from the 12:23 round.

The owner kept a numbered list through the round, asked for it grouped by how bad each fault is and, within a group, easiest first, and then said "write it up and code all changes we talked about". The numbers are the ones used in that conversation and do not change.

## 1. What worked in the round

- A janitor fetched a bucket, filled it (70 units), wetted its mop from it for twenty minutes without a walk back to the closet, and refilled it at a tank in a tunnel.
- Doors were asked for and answered by name.
- One order, one crate. Two mess calls in the first fourteen minutes.
- The Chief Engineer did not answer the parrot.
- The engineer's patrol reached every room.
- Power and PDA messages lasted the whole round: the engine was lit at 13:36.

## 2. The list

### High: someone is stuck or locked out

| # | Fault | Change | Ease |
|---|---|---|---|
| 2 | Let out of an inner room, a janitor was sent straight back into it. The "one ask all the way out" fix opened the same door again (13:54:02). | The next door is never one that leads back where they came from. It is opened only once they are through the first. | Easy |
| 4 | Refused re-entry after being let out: "nobody here sent for you" (13:40:40). | Letting someone out strikes only the note that they are inside: the call stands while the mess is there. A janitor stays in a room only while something is left that what it holds can shift (the owner: "what if they can no longer clean it?"). | Easy, then medium |
| 3 | Shut in with no answer. A second knock was ignored, the head did nothing with "I am shut in", and a door opened into the room for someone else was not used. One janitor was shut in the Bitrunning Den from 13:54 to the end of the round. | A second knock or ask counts as new. A head told that one of its staff is shut in sends word to someone whose ID opens that door. A shut-in body goes through any door of its room that opens. | Medium to hard |

### Medium: wasted trips, wrong words, wrong counts

| # | Fault | Change | Ease |
|---|---|---|---|
| 11 | Exploring picks rooms that are locked to the body. | Skip any room whose every door is locked to it. | Easy |
| 6 | A janitor in the meeting room, stuck in a doorway, was counted absent. | Nobody idles in a doorway or on the same tile as someone else, in any wait (the owner). Anyone in the meeting room counts as there. | Easy |
| 5 | "It needs soap or a wet mop" said by a janitor holding a wet mop, about rubble and a cobweb. Technicians then called every janitor in turn for it. | Say what would not come off, and what it wants. In the game's code cobwebs, rubble, decomposing garbage and gooey grey mass want scrubbing with soap and do not come off when the floor is mopped; everything else comes off with a wet mop or a spray. No second janitor is called for a mess the first could not shift with the right thing. | Easy |
| 13 | A janitor with only a space cleaner was called across the station to oil and a cobweb, and gave up eight seconds after being let in. | A janitor reads what the mess is from the call. It gets what the mess wants first, if it knows where some is (the owner: "maybe have them switch cleaning supplies?"), and declines by PDA if it cannot. | Medium |
| 7 | A janitor with "none of your work can be got on with", exploring for minutes. Cause not found. | First log why each mess job is not ready. | Easy to log |
| 10 | No route to the Warehouse from the bay. Its only airlock opens from the tunnel; the bay side is shutters. | Go by the tunnel door. | Medium |
| 8 | A crate dropped four times at the lobby door with a workmate standing just inside, then pushed out into the lobby. | The hauler asks the workmate to step aside. A crate put clear goes into the bay. | Hard |

### Low

| # | Fault | Change | Ease |
|---|---|---|---|
| 12 | Mess calls go one message a room. A bucket fill is logged twice. | One message listing the rooms. One log line. | Easy |
| 14 | Technicians send back every empty crate they find, the station's own among them. | Only crates that came off the shuttle go back. | Easy |
| 9 | "No way out" of the crowded closet for 12 seconds at the start of the round. | People in the way are waited for, not counted as a shut door. | Medium |

### Alterations the owner asked for

| # | Alteration | Ease |
|---|---|---|
| 17 | A loose crate in the bay that is not on a marked square is put on one ("I moved a mail one and they have just left it in the middle of the room"). | Easy once 16 exists |
| 16 | The marked squares on the bay floor hold crates waiting to be collected and empties waiting for the shuttle. On MetaStation they are 16 white squares at x 69 to 72, y 146, 148, 150 and 152: four rows of four with a lane between. | Medium |
| 15 | Abandoned crates go back. An empty left in the lobby is taken into the bay; when three wait, or one has waited ten minutes, the shuttle is called for them. An order nobody collects after three reminders goes back on the next shuttle, and the Quartermaster tells the head. | Medium |
| 1 | Crew Brain window: a separate "Locked rooms" section for rooms that are locked but that some of the crew are allowed in, each room's name in its department's colour and the people allowed in it in plain text; every NPC's name and job in its card's colour throughout the window. | Medium |

### Future, not to build now

| # | Alteration |
|---|---|
| 18 | When the supply shuttle comes, loose things left on the marked squares are sold. Later, anyone with something to sell can put it on a square. The owner: "a future TODO". |

## 3. Status

See the change log entry "2026-11-18, 15:00" in `LLM_CREW_CHANGELOG.md` for what was built from this list, how far it was tested, and what was left.
