---
id: QM-05
title: Told that a technician is shut in, the Quartermaster sends another to see to it, and the one sent only takes on the shuttle and the rooms and never goes to the door
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1481, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2126, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1393, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:396
fix: Have the technician who hears it is to see to someone shut in note it as a let-out ask for that room, the way a PDA from the shut-in person is noted, so it walks to that door, and let the Quartermaster go itself when no other technician is about
---

## What is wrong

A technician shut in a room, who has knocked and written to whoever can open the door and still has nobody come, at last sends its head a PDA message: "I am shut in the Warehouse and nobody has come to the door. Could you send someone to let me out to the Cargo Bay, please?" (`driver.ts:396`).

The Quartermaster reads that in `readsMessage` and does what the comment says: "It sends another technician to see what is shutting the way." It walks to the bay and tells the other technician, word for word: "Sam, Cora is shut in the Warehouse. See to it, please."

On Sam's side that line is read only by the `SEE_TO_WORDS` test in `cargo.ts` `overhears`, and all it does is set `brain.seeToUntil`. `seeToUntil` is read in one place, `leftTo` (`cargo.ts:273`): for five minutes the shuttle and the rooms count as Sam's work as well as his own. Nothing notes that Cora is in the Warehouse, nothing sets `brain.doorAsked`, and no step takes Sam to the Warehouse door. Sam goes on with his own work. Cora stays shut in; the head was the last person it writes to (`nextToWrite`), so nobody else is coming.

The same "See to it" line was built for a crate that would not come (`crateHeldUp`), where taking on the shuttle and the rooms is the right answer. Reused for a person shut in, it does nothing.

Two smaller faults in the same branch:

- With only the one technician (the one who is shut in), `other` is undefined and nothing at all is done, though the Quartermaster's own ID opens every cargo room.
- `other` is the first technician in view or on the PDA list who is not the sender: it may be dead or a human player (see QM-02), and it may not be able to open that room.
- Anyone else shut in one of the department's rooms (a janitor in the Warehouse, say) who writes to the Quartermaster because its ID opens the door (`nextToWrite` writes to door keepers before the head) gets nothing at all: the branch reads only messages from technicians, and the Quartermaster has no step that goes to a door.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1481`, in `readsMessage`:

    const shutIn = isTechnician(job) ? text.match(SHUT_IN_WORDS) : null;
    if (shutIn) {
      const other = technicians(brain).find((name) => name !== from);
      if (other) {
        ledgerOf(brain).sendFor = {
          to: other,
          line: seeToLine(
            firstName(other),
            `${firstName(from)} is shut in the ${shutIn[1].trim()}`,
          ),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2126`, all that hearing it does:

    const seeTo = isQuartermaster(speakerJob)
      ? heard.trim().match(SEE_TO_WORDS)
      : null;
    if (seeTo) {
      if (seeTo[1].toLowerCase() === firstName(brain.name).toLowerCase()) {
        brain.seeToUntil = brain.now + SEE_TO_DS;
      }
      return;
    }

`cargo.ts:1393`, the path that would have taken Sam to the door, used only for a PDA from the person shut in:

    if (
      asked.out &&
      asked.byPda &&
      asked.room &&
      brain.closedRooms.includes(asked.room)
    ) {
      return { name: asked.name, room: asked.room, out: true };
    }

## How it was found

Read from the code on both sides of the line: the Quartermaster's branch, then every use of `SEE_TO_WORDS` and `seeToUntil` in the window code (there are two). Not run, not seen in a round. Not in the change log as known: the 09:12 entry (`LLM_CREW_CHANGELOG.md:980`) describes the line for a crate only.

## How to fix it

1. Give the shut-in case its own line in `supply.ts`, e.g. `letOutLine(first, who, room)`: "Sam, Cora is shut in the Warehouse. Could you let them out, please?", and a regex `LET_OUT_WORDS` to read it back (who, room).
2. In `cargo.ts` `overhears`, when the Quartermaster says that line to this technician by name, set `brain.doorAsked = { name: <full name of who>, room, out: true, byPda: true, at: brain.now }` (the full name found among technicians by first name, as the duty line does). The existing branch at `cargo.ts:1393` then walks it to that door and opens it if they are found inside. Keep `seeToUntil` for the crate line only.
3. In `quartermaster.ts`, pick `other` only from technicians who are not `down` or `cuffed` and who are in view or were seen lately; with nobody to send, and the room one of the department's, let the Quartermaster go itself: a `SEND`-like task whose step is `go_to_door` for that room and then `open_door` (check that `open_door` in `crew_npc_doors.dm` lets the Quartermaster open a door to let someone out: CARGO-04 says it only does so for a janitor with a mess, which would need the same change).
4. Whether a head should open doors for its staff itself is a design point for the owner; step 3 is the part to ask about.

## How to test the fix

Add a case to `tools/llm_crew/book.ts`: a Quartermaster gets the shut-in PDA from Cora; the line it says to Sam must read as a let-out ask on Sam's side, giving Sam a door step to the Warehouse. In `tools/llm_crew/sim.ts`, shut a technician in the Warehouse with nobody near: the other technician should walk to the Warehouse door within a few minutes. In a round, grep `pda.log` for "I am shut in the" sent to the Quartermaster, and `game.log` for the other technician's walk to that room after it.
