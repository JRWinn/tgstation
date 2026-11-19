---
id: LOGA-04
title: A knock that one technician has answered stays live for the other for a minute, so when the janitor is let back in it is let out again unasked and its scrub is cut short
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1404, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:615, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1970
fix: In doorSought take a knock from inside only if it came after the knocker was last let into that room, and drop a knock once anyone has let that person through that room's door
---

## What is wrong

Every technician who hears a knock on a door of the department keeps it in its own `brain.knockAt`, for `DOOR_ASK_DS` (60 seconds). It is cleared only when **that** technician's own door task for the room ends (`cargo.ts:1970`). When the other technician answers the knock, this one's copy stays live.

A knock from inside names no one. `doorSought` takes it to be whoever the department has down as being inside that room (`stillInside`, the list both technicians share). So if the knocker is let out by one technician and let back in by the same or the other within that minute, the other technician reads the old knock as the janitor knocking again, walks to a door and holds it open "to let them out". The janitor, by its own rule, goes out through a door held open for it to leave (`The door is being held open to let you out of ...`), whatever it was doing. If it was scrubbing, the scrub is cut short and the mess is written off as beyond it (JAN-01, LIFE-02).

Concrete case, `data/logs/2026/11/19/round-19.33.50`, Penelope Alekseev (janitor, space cleaner), Tamika Barrett and Marshall Alliman (cargo technicians):

1. 01:43:36, Penelope's brain: "You are shut in Cargo Bay with nobody in sight to ask. You are knocking at the door". Marshall is in the Cargo Bay and hears it.
2. 01:43:39 to 01:43:45: Tamika answers the PDA that follows and lets her out ("The door is being held open to let you out of Cargo Bay"). Marshall's `knockAt` for the Cargo Bay is untouched.
3. 01:44:02, `game.log`: "Tamika Barrett ... opened Quartermaster Maintenance to let Penelope Alekseev into Cargo Bay." Tamika's `noteLetIn` puts Penelope back on the shared list as inside the Cargo Bay.
4. 01:44:24, `game.log`: Tamika "opened Deliveries to let Penelope Alekseev into Delivery Office". 01:44:29, Penelope's brain: "You are cleaning up the mess here in Delivery Office ... with your space cleaner." The mess is vomit, which space cleaner washes off.
5. 01:44:29, Marshall's brain, 53 seconds after the knock: "Penelope Alekseev is inside the Cargo Bay and cannot get out by themselves: the door is locked to them. You are going to open the Deliveries door for them." 01:44:30 and 01:44:32, `game.log`: Marshall opens Deliveries "to let Penelope Alekseev into Cargo Bay", then "out of Delivery Office".
6. 01:44:42, Penelope: "The door is being held open to let you out of Delivery Office, and you are going out to Cargo Bay while it is." 01:44:50, `pda.log`: "I cannot shift the mess in the Delivery Office with my space cleaner."
7. The vomit was still on cargo's list at 01:57:58, when Marshall sent another janitor for it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:615`: every knock heard is kept, by every technician who hears it.

      if (typeof event.details.knock === 'string') {
        brain.knockAt = {
          room: event.details.knock,
          at: event.at,
          inside: !!event.details.knock_from_inside,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1404`, in `doorSought`: a knock from inside is pinned on whoever the shared list has in that room now, with no look at whether they were let in after the knock.

      const knock = brain.knockAt;
      if (
        knock &&
        brain.now - knock.at < DOOR_ASK_DS &&
        ownRooms(brain).includes(knock.room)
      ) {
        ...
        if (knock.inside) {
          const letIn = stillInside(post, knock.room, brain.now)[0];
          ...
          const inside = letIn ?? seen;
          if (inside && mine(letIn?.by)) {
            return { name: inside.name, room: knock.room, out: true };
          }

`mine(letIn?.by)` is TRUE for Marshall because Tamika, who let her in, was not in Marshall's view.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1970`: the only place a knock is dropped, on this technician's own door task.

        if (brain.knockAt?.room === task.place) {
          brain.knockAt = null;
        }

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-19.33.50`, `crew_brain.log` for Penelope, Tamika and Marshall from 01:43:30 to 01:44:50, `game.log` "opened ... to let" lines, `pda.log` 01:44:50. That Marshall's step at 01:44:29 came from the knock, and not from an ask, is worked out from the code: the asks Marshall had heard from Penelope by then were one to Tamika by name (`said_to` "other", so not kept) and one to Marshall at 01:44:17 to be let **into** the Delivery Office, which `mayPass` answers with nothing once she is standing in it. The second opening, at 01:44:32 ("out of Delivery Office"), was not traced.

## How to fix it

1. In `doorSought`, for a knock from inside, take `letIn` only if `knock.at > letIn.at`: the knock has to have come after they were let into that room (`noteLetIn` sets `at` to the time they were let in, through `expectSomeone`). The same for `seen`: skip anyone this technician or the list has as let in after the knock.
2. When a technician lets someone out of a room, any technician's knock on that room older than the let-out is spent. The simplest way that keeps to the senses rule: drop `knockAt` in `syncTasks` when this technician can see that the knocker's room has had its door opened since (the server already tells the window of a door opened in view), or when the person it would pin the knock on is seen outside the room.
3. Keep: a knock from someone who walked back into a room unseen (the case the comment at `cargo.ts:1434` was written for) must still be answered.

## How to test the fix

- Type check and lint.
- Simulator: `cargo` with two technicians and a janitor called to a room inside the bay: the janitor knocks to be let out, technician A lets it out and then in again within a minute, technician B can hear the knock. Pass if B does not open a door for it, and the janitor finishes its scrub.
- Next round, `game.log`: no "opened ... to let X out of Y" within half a minute of "opened ... to let X into Y" by the other technician.
