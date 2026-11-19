---
id: LOGA-02
title: The Quartermaster closes its meeting the moment a technician it called is out of its view for three seconds, and that technician then stands seven minutes in the bay waiting for it
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:838, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:482, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:338
fix: Before the closing line, wait a short while for anyone invited who has given no report and was in view or said they were coming, and tell anyone invited and unheard by PDA that the meeting is over
---

## What is wrong

See also: KNB-09 (read from the code: the Quartermaster does not read "On my way" or "I am in the Cargo Bay already", and an aloud meeting never sends "the meeting is over" by PDA). This adds a round where it happened, and a second cause KNB-09 does not have: the meeting is not only started without someone, it is **closed** without someone who was at it a moment before.

Once the meeting has begun, `meetStep` calls on whoever `nextTurn` finds in view and not yet called on. When nobody is left in view, it goes straight to who security is looking for and the closing line. It does not look at who was invited and has given no report, or at whether they said they were coming. A technician who steps out of the Quartermaster's line of sight for a few seconds (to stand clear of a doorway, or walking to the middle of a big bay to find its head) is passed over, and the meeting is closed over its head.

The technician never hears the closing line: it is out of sight, so out of earshot in the Cargo Bay. The Quartermaster holds its meeting aloud, so nothing goes by PDA either (`endMeeting` skips the "meeting is over" message when `way.aloud`). Its summons stands until `SUMMONS_STANDS_DS`, seven minutes from the call, and all that time it stands in the bay doing nothing, with the counter and the shuttle left. The Captain is sent "1 of 2 there" when both were in the room.

Concrete case, `data/logs/2026/11/19/round-19.33.50`:

1. 01:46:43 and 01:46:46, `pda.log`: Gratian Stone (Quartermaster) calls Tamika Barrett and Marshall Alliman by PDA, from inside the Cargo Bay. Both answer "I am in the Cargo Bay already." (01:46:44, 01:46:46).
2. 01:46:50, `crew_brain.log`, Marshall: "You are in the Cargo Bay for the staff meeting and cannot see Gratian Stone from where you stand. You are going to the middle of the room to find them."
3. 01:46:52: the meeting begins, so `gathered` was true: Marshall, called less than 90 seconds before, was `awaited`, so he was among those Gratian could see. Gratian: "Thank you for coming, everyone. Tamika, your report, please." Tamika answers at 01:46:53.
4. 01:46:55, Gratian: "Your staff have reported. ... Security is looking for nobody now." `nextTurn` found nobody: Marshall had walked out of its view.
5. 01:47:02, Gratian: "Between you, that is 1 crate brought in. The meeting is over, thank you." and to the Captain: "Supply staff meeting: 1 of 2 there."
6. 01:46:59 and 01:47:13, Marshall: "approach Tamika Barrett, to stand with the others", then "You are in the Cargo Bay for the staff meeting, waiting for Gratian Stone." Nothing else from Marshall's brain but "You are in: Cargo Bay" until **01:54:04**, seven minutes after the call, when the summons ran out and it went back to work.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:838`, in `meetStep`: with no one in view left to call on, it ends.

      const next = nextTurn(brain, meeting);
      if (next) {
        ...
      }
      // Who security is looking for is read out at every head's meeting: see jobs/wanted.ts.
      const wanted = wantedMeetingStep(brain, meeting.wantedSaid ?? 0);
      if (wanted) {
        return wanted;
      }
      ...
      const line = way.closing(brain, meeting);

`nextTurn` (`head.ts:387`) looks only at `present`, which is who is in view this second:

      return present(brain, meeting).find(
        (name) => !meeting.turns.some((turn) => turn.who === name),
      );

`head.ts:482`, in `endMeeting`: nobody called aloud is told by PDA.

      for (const name of way.aloud ? [] : meeting.invited) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:338`: the staff side keeps its summons for seven minutes.

      brain.now - summons.at > SUMMONS_STANDS_DS

## How it was found

Seen in a round log: `data/logs/2026/11/19/round-19.33.50`, `pda.log` 01:46:43 to 01:47:02, and `crew_brain.log` for Gratian Stone and Marshall Alliman from 01:46:39 to 01:54:04. That Marshall was in Gratian's view at 01:46:52 is inferred from the meeting having begun (`gathered` in `syncMeeting` needs every awaited member in `present`); the server's view lists are not in the logs.

## How to fix it

1. In `meetStep`, before `wantedMeetingStep`, find those `meeting.invited` who have no turn and no report and either have `answers[name] === 'coming'` or are `awaited`. If there are any, and the last turn was heard less than about 30 seconds ago (a new constant, `STRAGGLER_DS = 300`), return `{ ready: false, wait: true, inside: true, step: "You are waiting for X, who is somewhere in the room, before you end the meeting." }`. After that, go on to close as now.
2. For a Quartermaster, that needs KNB-09 step 1 first, so that "I am in the Cargo Bay already" sets `answers[name] = 'coming'`.
3. In `endMeeting`, send the "the staff meeting is over. Send me your report by PDA, please." word to everyone invited who gave no report, also when `way.aloud` (KNB-09 step 3). That alone would have sent Marshall back to work at 01:47.
4. Keep the Head of Personnel's meeting as it is: its staff are called by PDA already and are told the meeting is over.

## How to test the fix

- Type check and lint.
- Simulator: `qm`, with the second technician made to step out of the Quartermaster's view for five seconds just after the meeting begins. Pass if it is called on when it comes back into view, or, if it does not, it is sent "the staff meeting is over" by PDA and is back at its work within a minute.
- Next round, `crew_brain.log`: no technician with "waiting for <Quartermaster>" for more than a minute after the Quartermaster's "The meeting is over, thank you."
