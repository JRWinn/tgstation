# Crew NPC plan: locked areas, hauling and patrols

Written 2026-11-17 from the round logged at `data/logs/2026/11/18/round-21.49.53`. **Planning only: nothing here is built.** Items marked **Decided** are the project owner's. Items marked **Proposed** are suggestions the owner has not yet answered. Items marked **Unknown** must be settled before anything depends on them.

## Status

**Built on 2026-11-17, the same evening, on the owner's go-ahead.** Checked by a server compile, a type check and the simulator. Not yet played in a round, and the new voice cases have not been run against the model. The sections below are the plan as it was written; where what was built differs, this list is what is true.

Built:

- Failed walks, shut-in tests and written-off crates are logged in the round's `game.log`.
- Plastic flaps no longer count as walkable when a route is planned for anyone on their feet.
- The trail, kept on the server: out means back where it began, a room already on it cuts it back, one failed walk is enough to go and ask, and the asking names where it is trying to get to.
- A locked room inside a locked room, both ways: sent for to the inner room, a visitor asks at the outer door first and is let through it.
- Nobody opens the door: after a minute, word goes to someone else whose ID opens it, then to its own head.
- "Leave", said by the Captain or its own head, and "throw X out", said to the staff of a room. Both are carried out by code and override having been sent for.
- A visitor whose job is done and who has not gone is seen out by the arm. The wait is 60 seconds, not the 30 suggested below.
- A technician does not go on its rounds with a visitor inside unless a workmate is at the post.
- One call per room: a janitor already in the department is the one told, a second is sent for only after the first sends word that it cannot shift the mess, and the bay call waits while the shuttle is in.
- Asked to step aside, an NPC moves there and then and stays clear for 15 seconds.
- A crate someone has set off for or is hauling is left alone by the others. A crate within a tile of a door is hauled clear by cargo staff, however it got there.
- A held crate that is destroyed, off the station, emptied, or twice out of reach is written off aloud and whoever ordered it is told by PDA. An errand to collect it ends when cargo says there is no such crate.
- Rounds: one technician at a time, said aloud, each room every five minutes.
- The voice is told the facts for each of these.

Not built:

- Leaving at once for bad air or an alarm in the room.
- The "my post is gone" state once out.
- Handing a visitor over to a workmate aloud.
- Backing out the way it came when there is nowhere to step aside to.
- Reordering a lost crate. Section 10 still asks who should.
- Walking someone out of a room other than the post: the server only does it there.
- Why the Cargo Bay never counted as shut in is still unknown. The trail no longer depends on that test, and the new log lines will show it.

Found on the way: a line that an NPC's work called for was not said when nobody had spoken lately. That was already failing three simulator scenarios on the committed code, and is fixed.

The examples are a janitor and two cargo technicians, because that is who was in the round. Every rule is meant for anyone visiting any room that is locked to them, and for anyone whose post is behind a locked door.

## 1. What went wrong in the round

- A janitor (Manuel) was called to four messes, all behind cargo's locked doors. He was let into the Cargo Bay, then from the bay into the Delivery Office.
- Asked to be let out of the Delivery Office, he was let out into the bay, which is also locked to him. He stayed in cargo for 20 minutes, reached the lobby once, and walked back in.
- He missed the staff meeting and told his head he "could not get into the Bar Lounge", when in truth he could not get out of cargo.
- The Captain's "Toss this janitor out" and "Manuel leave" were argued with, not obeyed.
- Both technicians took hold of the same crate at once and pulled it out of each other's hands. It was left in the dock airlock and lost to space. Nobody told the head who ordered it, and the janitor kept walking to the counter for it.
- The janitor stood in the hauling lane scrubbing oil his damp rag could not shift.
- Technicians asked each other to step aside. Nobody moved.
- The technicians looked in on the Delivery Office once in 25 minutes, and never reached the Warehouse.

## 2. Being in a locked area

### What "out" means

- **Decided:** rooms can be locked inside other locked rooms. The Delivery Office has no door to the public side.
- **Decided:** nothing may assume a room stays locked. Walls and doors can be blown open.
- **Proposed:** an NPC is *out* when it is back where it last stood before going through a door it could not open itself. That room is the start of its trail.
- **Proposed:** if at any point it finds it can walk to its own post by itself, it is out early.
- **Proposed:** "I cannot get into a room, but I can still get home" is a different case, *locked out*. That is the knock-and-ask case that already works.

### The trail

- **Decided:** when locked in, the NPC asks itself "where did I enter from?", follows the nesting back, and then forgets it.
- **Proposed:** the trail holds each room it came through since it was last out, with the door and who opened it.
- **Proposed:** coming back into a room already on the trail cuts the trail back to that room. This round's Lobby, Bay, Delivery Office, Bay becomes "I entered the Bay from the Lobby".
- **Proposed:** the trail is kept on the server, beside the existing record of who let it in. A reload of the brain window must not lose it.

### Getting out

1. Try to walk. If a wall is gone or a door stands open, it simply leaves.
2. If the walk fails once, go to the door it entered this room by and ask.
3. When asking, name where it is trying to get to ("back out to the Cargo Lobby"), so the host can see it the whole way.
4. Through the door, try again. Repeat until it is out, then drop the trail.

- **Proposed:** if the trail is empty or the way it came is sealed, it does what it does today: the nearest door, preferring one onto a hallway, and ask whoever is there.

### When it wants out

- The job it was let in for is done, or cannot go on with the tool it holds.
- Its own head has called it (a meeting, an errand).
- The Captain or its head tells it to leave.
- Its welcome has ended (section 3).
- There is bad air or an alarm in the room. This comes before the job.

### Nobody opens the door

- **Proposed:** a ladder, each rung tried once with a wait between: whoever let it in, then anyone in that department by PDA, then its own head. Anyone passing who can open the door is still asked, as now.

### Danger and a lost home

- **Proposed:** unsafe tiles are never part of the way back. If the trail's door leads into danger, it tries another door.
- **Proposed:** if its post is destroyed or cut off, the trail still gets it out. Once out, "my post is gone" is its own state: it tells its head and carries on with work that does not need the post.

### The route test

- **Unknown:** in the Cargo Bay the server's test said the janitor had a way out when he did not.
- **Unknown:** the technicians' walks to the Warehouse failed every time. Likely cause: the route finder treats plastic flaps as walkable for a standing person, and the game does not let them through. The map has flaps between the Delivery Office and the Warehouse. Not confirmed in game.
- **Proposed:** the test never decides anything by itself. A route counts only if the body walks it.
- **Proposed:** every failed walk is logged with the tile it was heading for, whether a route was found, and where it stopped.

## 3. Visitors and hosts

- **Proposed:** a visitor is let in for one named job in one named room. Another room is a new ask.
- **Proposed:** the host who lets a visitor in has a standing job, "see them out", until the visitor is out. The host does not leave the post unless a workmate takes the visitor over, said aloud.
- **Proposed:** the welcome ends when the job is done or cannot go on. If the visitor has not started to leave within about 30 seconds, the host walks them out by the arm. This is also how a stuck visitor gets out.
- **Decided:** a trespasser is hauled out. Today, having been sent for counts for 20 minutes across the whole post, so the janitor never became one.
- **Proposed:** two orders handled by code, from the Captain or the NPC's own head: "leave", said to a person, and "throw X out", said to the staff of the room. Both override having been sent for. The chat model only voices the answer.
- **Proposed:** one open call per room, kept on the department's shared list of who is expected. A second janitor is sent only if the first declines or cannot do it. "I need soap for that" parks the call until supplies arrive.
- **Proposed:** cargo does not send for a janitor to the bay while the shuttle is being unloaded.

### The visitor's side

- **Proposed:** a call from its own head comes before more work inside.
- **Proposed:** it does not scrub what its tool will not shift. It tells the caller what it needs and leaves.
- **Proposed:** regrets for a meeting give the true reason and what it needs.

## 4. People in the way

- **Decided:** a person who is asked to move tries to move.
- **Proposed:** the person asked steps to a free tile clear of the door and the load, and stays off it for a few seconds. It works the same when a player asks an NPC.
- **Proposed:** the hauler then takes the load up again. Today the job is dropped.
- **Proposed:** the person named is whoever is on the blocked tile, not the nearest person. A workmate who took the load is not "in the way".
- **Proposed:** with nowhere to step, whoever has no load backs out the way they came.
- **Proposed:** a player who does not move is asked twice. The NPC then goes round if it can, or waits and tells its head.

## 5. Crates

- **Proposed:** a crate someone is walking to or pulling is taken. Nobody else goes for it.
- **Proposed:** a dropped crate stays the dropper's job until it is put away.
- **Decided:** a crate is never left next to a door. No haul counts as finished with the crate within a tile of one.
- **Decided:** cargo staff who see a loose crate by a door, in cargo's rooms or the lobby, move it a tile away. **Proposed:** to the nearest clear spot, which the code can already find.

### Lost crates

A crate is lost when cargo can no longer hand it to whoever comes for it.

| Case | Written off |
|---|---|
| Destroyed | At once |
| Off the station (space, another level, back on the shuttle) | At once |
| Emptied by someone | At once |
| A technician cannot reach it | After two tries a few minutes apart |
| Gone from cargo's rooms and the lobby, uncollected | After two looks a few minutes apart |

- Waiting a long time, lying in the bay, or sitting by a door is not lost.
- **Proposed:** the write-off happens when a technician goes to look or to fetch, and is said aloud.
- **Proposed:** whoever ordered it is told by PDA, and the errand to collect it is cancelled or given the new number.
- **Proposed:** cargo reorders it once by itself, since it is the order the head already gave.

## 6. Patrols

- **Decided:** the technicians should be seen to look in on the Delivery Office, the Mining Office and the Bitrunning Den.
- What they do today: one room at a time, each room at most every ten minutes, only after a minute with nobody speaking to them, for about five seconds. Both go to the same room.
- **Proposed:** one goes and says so aloud; the other stays at the post. This is the same pattern as the check on waiting crates.
- **Proposed:** each room every five minutes.
- **Unknown:** why the Warehouse cannot be reached (see the route test).

## 7. The voice

The chat model invented rules this round: that the door stays shut until the janitor finishes, and that a technician was holding the crate back.

- **Proposed:** each rule above gets a one-line fact for the voice, placed where it applies. For example "Manuel may leave whenever he asks" and "you are not holding any crate".
- **Proposed:** each gets a test case against the real model.

## 8. The staff meeting

Not part of this plan. The meeting redesign has its own notes, and when this was written the working tree held uncommitted changes to the meeting and head code that this plan's author did not make. Two things from this round belong with it: a called NPC that is in a locked area asks to be let out first, and sends regrets only if that fails.

## 9. Order of building

Wait until the uncommitted meeting work has landed. It touches several of the same files.

1. **Logging and the route test.** Log failed walks. Confirm or rule out the plastic flaps. Done when a round's log explains every "no way through".
2. **Locked areas.** The trail, what "out" means, the ladder, danger. Done when the nested lock-in and the destroyed-home cases pass in the simulator.
3. **Visitors and hosts.** One job per entry, see them out, the welcome ending, the two orders, one call per room.
4. **In the way and crates.** Step aside, the claim, the dropped crate, crates by doors, lost crates.
5. **Patrols.**
6. **The voice.** Facts and test cases for everything above.

Each stage gets a simulator scenario before a round is played: nested lock-in, home destroyed, nobody to open the door, Captain's order, double grab, crate by a door, lost crate, step aside.

## 10. Decisions wanted

| Question | Suggested answer |
|---|---|
| Is "out" the start of the trail, with "can walk home" as a shortcut? | Yes |
| How long after the welcome ends before the visitor is walked out? | About 30 seconds |
| Does cargo reorder a lost crate by itself, or does the head decide? | Cargo, once |
| Does cargo hold a bay cleaning call until the shuttle is unloaded? | Yes |
| How often is each room looked in on? | Every five minutes, one technician at a time |
