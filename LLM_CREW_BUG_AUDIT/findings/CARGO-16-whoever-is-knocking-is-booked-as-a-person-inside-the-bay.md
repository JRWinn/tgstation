---
id: CARGO-16
title: Let out of an inner room after an unnamed knock, the stand-in name whoever is knocking is booked as a person inside the outer room, and stays there for the round
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1995, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1438, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1144, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1729
fix: In afterActing never book SOMEONE_INSIDE in the department's list, and better book whoever the server says it opened for
---

## What is wrong

See also: LOGB-03 (a door opened for someone else is booked to the name the brain gave) and CARGO-09 (a note that someone is inside never lapses). This is the one case where the name booked is not a person at all.

When someone knocks from inside a locked room of the department and nobody is down as being in there, `doorSought` opens the door for `SOMEONE_INSIDE`, the words "whoever is knocking", and lets the server find who is standing at the door. That is fine for the door. But `afterActing` then books the stand-in as if it were a name:

- `noteSentFor(brain, "whoever is knocking")`;
- for a room that lies inside another (`brain.roomsThrough[task.place]`, the Delivery Office or Mining Office inside the Cargo Bay on the test map), `noteLetIn(post, "whoever is knocking", outer, ...)`: the department's shared list now has a person called "whoever is knocking" inside the Cargo Bay.

Nothing ever takes that entry out. The loop in `syncTasks` that strikes people seen elsewhere goes by the names of people in view, and nobody has that name. If the outer room has a mess the janitor has work in (`workThere`), no follow-up ask is even made. If it has none, a follow-up `doorAsked` is made for "whoever is knocking"; if the server cannot find anyone shut in at a door of the bay at that moment, the open fails, `doorAsked` is cleared, and the entry stays. Entries with `inside` set never age out of `expected.ts` (`current` keeps them), so this lasts the round.

What it does from then on, for every technician at that post:

1. `visitorToMind` is TRUE whenever no other cargo worker is in the post in view, so `syncRounds` is never allowed to start a look round the department. A lone technician never makes rounds again.
2. `cues` tells the model in every prompt "whoever is knocking is inside your department's locked rooms because someone who works here let them in", which it may repeat aloud.
3. For a room two deep (inner room inside an inner room), `tidyStep` takes the entry for a janitor standing in the room ("whoever is knocking, a janitor, is here and can see the mess in the ...") and never calls one to that room.

Concrete case, the one the changelog's entry for `SOMEONE_INSIDE` was written for: a janitor let out of the Delivery Office walks back in, the door shuts, it knocks from inside. Nobody is down as inside the Delivery Office. Sam's `doorSought` returns `{name: "whoever is knocking", room: "Delivery Office", out: true}`. `open_door` finds the janitor at the door and lets it out: ok. `afterActing`: `wasInside` is `task.out`, TRUE; `outer` is "Cargo Bay"; `noteLetIn("Cargo Bay", "whoever is knocking", "Cargo Bay", "Sam", now)`. The bay still has the oil the janitor was called for, so `workThere` is TRUE and no further ask is made. "whoever is knocking" is inside the Cargo Bay for the rest of the round.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1975`, in `afterActing`:

      if (ok && task.item && task.place && brain.post) {
        noteSentFor(brain, task.item);
        ...
        if (wasInside) {
          // Out of a room that lies inside another, they are still in the outer one.
          const outer = brain.roomsThrough[task.place];
          noteLetOut(brain.post, task.item);
          if (outer) {
            noteLetIn(brain.post, task.item, outer, brain.name, brain.now);

`cargo.ts:1437`, in `doorSought`, where the stand-in name is made:

      if (!inside && brain.closedRooms.includes(knock.room) && mine(undefined)) {
        return { name: SOMEONE_INSIDE, room: knock.room, out: true };
      }

`cargo.ts:1149`, in `visitorToMind`:

      const inside =
        brain.peopleInView.some((person) => !!seenInside(brain, person)) ||
        ownRooms(brain).some((room) => stillInside(post, room, brain.now).length > 0);

`tgui/packages/tgui/interfaces/CrewBrain/expected.ts:40`, entries inside never lapse:

    function current(now: number): Expected[] {
      list = list.filter((entry) => entry.inside || now - entry.at < EXPECTED_DS);

The server's answer does carry who it really opened for, but only in the text: `crew_npc_doors.dm:629` "You open the door for [person.name] and hold it ...", with no details field.

## How it was found

Read from the code, following the `SOMEONE_INSIDE` path named in `LLM_CREW_CHANGELOG.md` (the entry for "(3) A knock from inside a locked room is answered whether or not anyone is down as being in there"). Not seen in a round log; grep the next round's `game.log` and `crew_brain.log` for "whoever is knocking is inside".

## How to fix it

1. Best, as LOGB-03 proposes: have `hold_door_for` add `"for" = person.name` to its result details, and in `afterActing` book that name instead of `task.item`. Then the janitor who really came out is booked in the Cargo Bay, and is struck off when seen elsewhere, like anyone else.
2. Until then, the small guard: in `afterActing`, when `task.item === SOMEONE_INSIDE`, call neither `noteSentFor` nor `noteLetIn`/`noteLetOut`, and do not set the follow-up `doorAsked`. The real person is in view in the outer room once through, and `seenInside` finds them there if they need letting out.
3. Either way, keep `lastOpened` as it is: it only stops the same door being opened twice in a row.

## How to test the fix

- A simulator scenario: a janitor not on the list knocks from inside the Delivery Office with oil still in the Cargo Bay. Want the door opened once, and afterwards no entry named "whoever is knocking" in `stillInside` (print the expected list at the end), and the technician starting a round of the department when it is next idle.
- Type check.
- In a round, grep `crew_brain.log` for "whoever is knocking is inside your department".
