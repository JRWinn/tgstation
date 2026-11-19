---
id: LOGA-06
title: The Quartermaster walks out of its meeting room to call a technician, begins the meeting from the lobby, and closes it before the first report, telling the Captain 0 of 2 there
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1091, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:588, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:771
fix: Record the turn of whoever is named in the call-on line among all staff, not only those in view that instant, and close a begun meeting for want of anyone in view only after a short grace with the head in the room
---

## What is wrong

See also: LOGA-02 (the same meeting code closing over a technician who stepped out of view after his turn was due), KNB-09, and CHK-07 (the cause in `ingest` of the 10 seconds of `stillIn` in point 1 here). This is a different way into the same loss, seen in the first supply meeting of a round.

Three things in `jobs/head.ts` meet here:

1. **The head walks out of its room to call someone.** For a meeting called aloud, `meetStep` walks up to "whoever is nearest of those it has yet to call" from `peopleInView`, with no look at which room they are in. Both technicians were in the Cargo Lobby, seen from the Quartermaster's Office, so the Quartermaster walked out of the Cargo Bay into the lobby. `stillIn` keeps it "in the Cargo Bay" for 10 seconds after it leaves (`NUDGED_OUT_MS`), so it called the meeting, and began it, from the lobby, with the step saying "you are in the Cargo Bay".
2. **A call-on is booked only for someone in view that instant.** `meetingSaid` pushes the turn for the one named in the line only if `present()` has them when the line goes out. The line is the model's turn (`needs`, not `exact`), so it goes out seconds after the step was planned. If the technician has stepped out of the head's sight meanwhile, no turn is booked, and `listening()` is false.
3. **A begun meeting is closed the moment nobody is in view.** `syncMeeting` closes it when `startedAt` is set, `here` is empty and it is not listening. There is no grace, no look at who was invited and has given no report, and no look at whether the head is in its room.

So the meeting closed a second or two after the call-on, before the technician answered. The report that followed fell on no meeting (`hearReport` needs `brain.meeting`) and was lost. The Captain was told "0 of 2 there. No reports given." Both technicians had heard the call, come into the bay, and one had given his report.

Concrete case, `data/logs/2026/11/19/round-20.00.21`, Leonardo Johnson (Quartermaster), Jaden Prechtl and Osbert Mortland (technicians), `crew_brain.log` and `game.log`:

1. 02:01:45 to 02:01:51: Jaden and Osbert are in the Cargo Lobby, both on their way back to the bay ("You are away from your post, the Cargo Bay, and are on your way back to it").
2. 02:01:48, Leonardo, in the Quartermaster's Office: "Osbert Mortland is too far off to be sure of hearing you call it, so you are walking up to them first." => `approach`.
3. 02:01:56, Leonardo, **in Cargo Lobby**: "It is time for a staff meeting, and you are in the Cargo Bay, where your staff work. Your body is calling them together". Said at 02:02:01.
4. 02:02:01, Leonardo, in Cargo Lobby: "Your staff are here and the meeting begins. It is Jaden Prechtl's turn". The same moment, Jaden and Osbert, in the Cargo Bay: "You are standing in a doorway or on top of someone, in the way, and are stepping clear to wait."
5. 02:02:07, `game.log`: Leonardo says "Thank you for coming, everyone. Jaden, your report, please."
6. 02:02:10, Leonardo, in Cargo Lobby: "You have called your staff to a meeting in the Cargo Bay, and are going there." The 10 seconds of `stillIn` are up.
7. 02:02:12, `game.log`: Jaden says "Leonardo, I have no work to speak of yet. I need nothing." 02:02:12, Jaden's model: "The meeting drags on, but I'm content just standing here."
8. 02:02:17 to 02:02:39, Osbert, in the Cargo Bay: "You are at the staff meeting in the Cargo Bay, and Leonardo Johnson is here. You are walking up to Leonardo Johnson".
9. 02:02:52, `pda.log`: Leonardo to the Captain, "Supply staff meeting: 0 of 2 there. No reports given. No orders in hand. Budget: 500 credits."

"0 of 2" is `meeting.turns.length`, so Jaden's turn was never booked (step 2 above). "No reports given" means `meeting.reports` was empty when the report was written, so the meeting had been closed before Jaden spoke at 02:02:12: by step 3, between 02:02:07 and 02:02:12, with Leonardo in the lobby and neither technician in its view. The Captain's message waited behind the walk back and went at 02:02:52.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:771`, in `meetStep`: the nearest uncalled staff member in view, wherever they stand, is walked up to.

        const nearest = uncalled
          .map((person) =>
            brain.peopleInView.find((seen) => seen.name === person.name),
          )
          .filter((seen): seen is PersonInView => !!seen)
          .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0];
        if (
          nearest &&
          (nearest.distance ?? 0) > CALL_NEAR &&
          !(meeting.walkedTo ?? []).includes(nearest.name)
        ) {
          return { ... act: { tool: 'approach', person: nearest.handle } };

`head.ts:1091`, in `meetingSaid`: the turn is booked only for someone `present` at that instant.

      if (called.includes(CALLING_ON)) {
        const who = present(brain, meeting).find((name) =>
          called.includes(`${firstName(name)}, ${CALLING_ON}`),
        );
        if (who && !meeting.turns.some((turn) => turn.who === who)) {
          meeting.turns.push({ who, askedAt: brain.now, heard: false });
        }
      }

`head.ts:588`, in `syncMeeting`: closed at once when nobody is in view.

        if (
          meeting.startedAt !== null &&
          here.length === 0 &&
          !listening(brain, meeting)
        ) {
          meeting.closedAt ??= brain.now;
        }

`head.ts:1050`, `hearReport`: a report heard with no meeting open is dropped.

      if (
        !meeting ||
        !report ||

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-20.00.21`, `crew_brain.log` for the three of them from 02:01:45 to 02:02:55, `game.log` 02:02:01 to 02:02:12, `pda.log` 02:02:52. Read from the code: which of the closing paths fired is inferred, not logged. It is the only one that fits both "0 of 2" (no turn booked) and "No reports given" (closed before 02:02:12): `MEETING_MAX_DS` had not run, and the meeting had begun, so `noneCan` and the not-begun path do not apply. That neither technician was in Leonardo's view at 02:02:07 is inferred from the turn not being booked; the server's view lists are not logged.

## How to fix it

1. `meetingSaid`: book the turn for whoever of `staff(brain)` is named in the line, `${firstName(name)}, ${CALLING_ON}`, whether or not they are in view at that moment. They were in view when the step chose them.
2. `syncMeeting`: close a begun meeting for want of anyone in view only when the head is `inPlace`, the room has been empty of its staff for a short while (a new `EMPTY_FOR_DS`, say 150), and nobody invited is still `awaited` without a report. Keep a timestamp on the meeting of when `here` was last non-empty.
3. `meetStep`, the walk-up for an aloud call: only walk up to someone who is in the meeting room or a doorway of it (`seen.place === room`). Anyone elsewhere is called by PDA as now when out of sight; one in another room but in view can be called once they come in, or by PDA.
4. Keep: a meeting where every member is in the room, called on in turn, closes as soon as the last report is heard.

## How to test the fix

- Type check and lint.
- `tools/llm_crew/reports.ts` or a new table: `meetingSaid` with "Thank you for coming, everyone. Jaden, your report, please." and an empty `peopleInView` books Jaden's turn.
- Simulator: `qm`, both technicians starting in the Cargo Lobby. Pass if the Quartermaster calls the meeting from inside the Cargo Bay, and the Captain's report says 2 of 2.
- Next round, `pda.log`: no "Supply staff meeting: 0 of 2 there" while the technicians are in the bay.
