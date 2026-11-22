---
id: LOGA-06
title: The Quartermaster walks out of its meeting room to call a technician, begins the meeting from the lobby, walks off mid-turn and misses the first report, and tells the Captain 0 of 2 there
kind: bug
severity: medium
effort: medium
confidence: likely
status: fixed
fixed_in: 454fb2b988c, 6a1d46b85e6
found_by: Opus 5.5
checked_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1091, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:588, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:771
fix: Keep the head inside its meeting room while it calls and holds the meeting: walk up only to staff in that room, and do not begin the meeting or call on anyone until it is really in the room (CHK-07); then book the call-on for whoever is named and give a begun meeting a short grace before closing it
---

## What is wrong

See also: LOGA-02 (the same meeting code closing over a technician who stepped out of view after his turn was due), KNB-09, and CHK-07 (the cause in `ingest` of the 10 seconds of `stillIn` in point 1 here). This is a different way into the same loss, seen in the first supply meeting of a round.

Three things in `jobs/head.ts` meet here:

1. **The head walks out of its room to call someone.** For a meeting called aloud, `meetStep` walks up to "whoever is nearest of those it has yet to call" from `peopleInView`, with no look at which room they are in. Both technicians were in the Cargo Lobby, seen from the Quartermaster's Office, so the Quartermaster walked out of the Cargo Bay into the lobby. `stillIn` keeps it "in the Cargo Bay" for 10 seconds after it leaves (`NUDGED_OUT_MS`), so it called the meeting, and began it, from the lobby, with the step saying "you are in the Cargo Bay".
2. **A call-on is booked only for someone in view that instant.** `meetingSaid` pushes the turn for the one named in the line only if `present()` has them when the line goes out. The line is the model's turn (`needs`, not `exact`), so it goes out seconds after the step was planned. If the technician has stepped out of the head's sight meanwhile, no turn is booked, and `listening()` is false.
3. **A begun meeting is closed the moment nobody is in view.** `syncMeeting` closes it when `startedAt` is set, `here` is empty and it is not listening. There is no grace, no look at who was invited and has given no report, and no look at whether the head is in its room.

So the meeting closed a second or two after the call-on, before the technician answered. The report that followed fell on no meeting (`hearReport` needs `brain.meeting`) and was lost. The Captain was told "0 of 2 there. No reports given." Both technicians had heard the call, come into the bay, and one had given his report.

**Checker's correction (Opus 5.5).** Point 1 is what happened. Points 2 and 3 are true of the code but are not what happened in this round, and the paragraph above is wrong about it. The timing says Jaden's turn *was* booked and the meeting was *not* closed before his report: see `## Check`. What the log does show is that Jaden's report, said at 02:02:12 while the Quartermaster was walking from the lobby back into the bay, never reached `hearReport`; the Quartermaster then stood "listening" for the whole of `TURN_WAIT_DS` (45 s) and the meeting closed when that ran out (02:02:52, 45 s after the call-on at 02:02:07). The root of this case is point 1: the head held its meeting from outside the room (with CHK-07's ten seconds of `stillIn` letting it), and walked off mid-turn, because the `!inPlace` walk in `meetStep` comes before the `listening` wait. Why the report was not heard is not settled from the logs (HOLE-12): most likely the Quartermaster was out of hearing in the doorway between the rooms at that moment.

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

~~"0 of 2" is `meeting.turns.length`, so Jaden's turn was never booked.~~ Wrong: in `supplyReport` (`jobs/quartermaster.ts:709`) "there" is `meeting.turns.filter((turn) => turn.heard).length`, the turns whose report was heard, so "0 of 2" says only that no report was heard; it does not tell a booked turn from none. "No reports given" means `meeting.reports` was empty when `endMeeting` wrote the report. ~~So the meeting had been closed before Jaden spoke at 02:02:12.~~ Wrong too: a closed meeting puts the Captain's report on `toTell`, which the driver sends ahead of almost anything (`driver.ts:441`), and the Quartermaster was back in the bay by about 02:02:22 (Osbert sees it there). It sent nothing until 02:02:52. Between 02:02:10 and 02:02:52 it took no logged step at all, which in a begun meeting is only the `listening` wait.

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

Seen in a round log: `data/logs/2026/11/19/round-20.00.21`, `crew_brain.log` for the three of them from 02:01:45 to 02:02:55, `game.log` 02:02:01 to 02:02:12, `pda.log` 02:02:52. Read from the code: which of the closing paths fired is inferred, not logged. (The checker reads it differently from the finder: see the correction under "What is wrong" and `## Check`.)

## How to fix it

In order of what would have saved this case. Step 0 and step 3 are the ones that matter here; 1 and 2 close other ways into the same loss.

0. Fix CHK-07 first (`leftPlace` only when pushed out, not when walked out). In this round the Quartermaster chose to walk up to Osbert at 02:01:48 from its own office, eight seconds after walking out of the bay, and only `stillIn` made it count as in the meeting room. With CHK-07 fixed it would have gone to the bay first.
1. `meetingSaid`: book the turn for whoever of `staff(brain)` is named in the line, `${firstName(name)}, ${CALLING_ON}`, whether or not they are in view at that moment. They were in view when the step chose them.
2. `syncMeeting`: close a begun meeting for want of anyone in view only when the head is `inPlace`, the room has been empty of its staff for a short while (a new `EMPTY_FOR_DS`, say 150), and nobody invited is still `awaited` without a report. Keep a timestamp on the meeting of when `here` was last non-empty.
3. `meetStep`, the walk-up for an aloud call: only walk up to someone who is in the meeting room or a doorway of it (`seen.place === room || seen.place === undefined`, as `present()` reads it). Anyone elsewhere is called by PDA as now when out of sight; one in another room but in view can be called once they come in, or by PDA.
4. Keep: the general rule. `meetStep` and `syncMeeting` serve every head that calls aloud (Quartermaster, Chief Engineer, Head of Security), so make each change there, not in `jobs/quartermaster.ts`. A meeting where every member is in the room, called on in turn, closes as soon as the last report is heard.

## How to test the fix

- Type check and lint.
- A table case (new, or beside the meeting cases in `tools/llm_crew/`): `meetingSaid` with "Thank you for coming, everyone. Jaden, your report, please." and an empty `peopleInView` books Jaden's turn.
- Simulator: `qm`, the Quartermaster in its office and both technicians starting in the Cargo Lobby when the meeting falls due. Pass if the Quartermaster calls and holds the meeting from inside the Cargo Bay, takes no `approach` into the lobby, and the Captain's report says 2 of 2.
- Next round, `pda.log`: no "Supply staff meeting: 0 of 2 there" while the technicians are in the bay.

## Check

Read `inPlace`, `present`, `awaited`, `listening`, `syncMeeting`, `endMeeting`, `meetStep`, `hearReport` and `meetingSaid` in `jobs/head.ts`, `stillIn` and `NUDGED_OUT_MS` in `tasks.ts`, `supplyReport` and the `overhears` and `afterSaying` hooks in `jobs/quartermaster.ts`, `readReport` in `jobs/reports.ts`, the `toTell` pick in `driver.ts:441`, `logRoutine` in `brain.ts` (only steps that act or speak are logged; waits are not), and `on_pre_hear` in `crew_npc_senses.dm`. Read all three NPCs' records in `round-20.00.21/crew_brain.log` from 02:01:42 to 02:03:05 and `game.log` lines 160 to 200.

What holds: point 1 is in the code (`meetStep` walks up to the nearest uncalled member in `peopleInView` with no look at their room) and in the log (Leonardo in the Quartermaster's Office at 02:01:48, `approach` to Osbert; in the Cargo Lobby at 02:01:56 and 02:02:01 with steps that say it is in the Cargo Bay; `game.log` places both lines at Cargo Lobby (79,146)). Points 2 and 3 are true as code: `meetingSaid` books only someone `present()` returns, and `syncMeeting` closes a begun meeting the moment `here` is empty and it is not listening, with no grace. The loss is real: Jaden gave his report at 02:02:12 and the Captain was told "0 of 2 there. No reports given."

What does not hold: the finder's chain for this case. (a) "0 of 2" counts heard turns, not booked ones (`quartermaster.ts:709`). (b) Leonardo's model prompt at 02:02:07.890, just after the call-on was said at 02:02:07.481, lists both Jaden and Osbert in view, so "neither technician in its view at 02:02:07" is not so. (c) The Captain's report went at 02:02:52.36, which is 44.9 s after the call-on, and `TURN_WAIT_DS` is 450. Between 02:02:10 and 02:02:52 Leonardo logged no step, and was back in the bay by about 02:02:22; a closed meeting's `toTell` would have gone out within seconds. The only begun-meeting state that takes no step is the `listening` wait, so the turn was booked and the meeting closed by `head.ts:588` when the 45 s ran out. (d) `readReport("Leonardo, I have no work to speak of yet. I need nothing.")` returns a report (`\bI need\b`), so had `hearReport` seen the line with the meeting open, `reports` would hold it and the Captain would have been told "No crates in or out to count yet". It did not see it. That the Quartermaster did not hear the line is the likeliest reading (it was walking through the door between the two rooms at 02:02:10 to 02:02:12; Osbert at 02:02:17 could not see it); not proved, since what each body heard is not logged (HOLE-12). Why `here` was empty at 02:02:52 with both technicians in the bay was not settled either.

So: confirmed as a fault (an aloud-calling head that holds its meeting from outside its room loses the report and misreports to the Captain), with the mechanism corrected in the body, the fix reordered so the step that would have saved this case comes first (CHK-07, then keeping the walk-up inside the room), and effort raised to medium (CHK-07's `ingest` change plus three places in `head.ts`). Severity medium kept. Not run: nothing.
