---
id: HEAD-06
title: A head that is shut in, or cannot get to the meeting room, still calls its meeting and keeps all its staff standing there for seven minutes
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:534, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:574, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:338
fix: Call no meeting while the head is shut in, and once the gathering wait has run out with the head still not in place, end the meeting so its staff are told by PDA and send their reports
---

## What is wrong

`syncMeeting` calls a meeting whenever one is due and the room is known. It does not look at whether the head can get there. Once the call has gone out, nothing ends the meeting early because the head is not in the room. The only ends are: the head in place with someone present (begin), nobody present and either everyone said they cannot come or the head is in place and has waited (close), or `MEETING_MAX_DS` (seven minutes) from the call.

So when the head is shut in somewhere (`brain.shutIn`), or its walk to the room keeps coming to nothing, every one of its staff:

- answers "On my way", drops its work (the meeting task is `urgency: 'emergency'`), and walks to the room;
- waits there, "saying nothing", for a head who never comes. Its own way out is `headGone`, which needs it to have given its report, or `SUMMONS_STANDS_DS`, seven minutes from the call;
- after seven minutes is sent "the staff meeting is over. Send me your report by PDA, please." and sends the report it could have sent at the start.

The Captain is then sent "Staff meeting in the Bar Lounge: 0 of 3 there." which reads as the staff not turning up.

Concrete case: the Head of Personnel walks into a maintenance room or a department whose door shuts behind it, and is `shutIn` at the moment the 12-minute meeting falls due. It sends the three janitors and the Captain their messages (they need no walking), then the meeting step is `go_to` the Bar Lounge, which the driver holds back while it is shut in (`walksOut && brain.shutIn && !wayOutOpen`). The janitors reach the lounge within a minute and stand there until minute 19. Six minutes of three janitors' work are lost each time, and the head, once let out, has a meeting with nobody listening.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:534`, in `syncMeeting`, the call:

    if (
      !brain.meeting &&
      !held &&
      people.length > 0 &&
      brain.now >= brain.nextMeetingAt
    ) {
      const room = way.room(brain);
      if (room && knowsPlace(brain, room)) {
        brain.meeting = {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:574`, the only early ends:

    if (meeting.startedAt === null && everyoneCalled) {
      const inRoom = inPlace(brain, meeting);
      const gathered =
        waited || expected.every((person) => here.includes(person.name));
      if (inRoom && here.length > 0 && gathered) {
        meeting.startedAt = brain.now;
      } else if (here.length === 0 && (noneCan || (inRoom && waited))) {
        meeting.closedAt = brain.now;
      }
    }

With the head not in the room, `inRoom` is false, so neither branch is taken however long it has waited.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:329`, the staff side, which can only leave by having reported or by the seven minutes running out:

    const headGone =
      summons.said &&
      there &&
      summons.headSeenAt !== null &&
      brain.now - summons.headSeenAt > HEAD_GONE_DS;
    if (
      summons.over ||
      sentWord ||
      headGone ||
      brain.now - summons.at > SUMMONS_STANDS_DS
    ) {
      brain.summons = null;
    }

## How it was found

Read from the code, not seen in a round. How often a head is shut in when a meeting falls due was not measured; the Head of Personnel has wide access, the Quartermaster and Chief Engineer less.

## How to fix it

1. In `syncMeeting`, add `!brain.shutIn` to the test that calls a meeting. It falls due as soon as the head is out.
2. In the gathering block, add a branch: `else if (waited && !inRoom)`, set `meeting.closedAt = brain.now`. The head has had three minutes to get there. `endMeeting` then sends every invited person without a report "the staff meeting is over. Send me your report by PDA, please.", which the staff side already reads (`readSummons` sets `missed`, and `planMeetings` sends the report by PDA). Its staff are free four minutes sooner.
3. Optional, for the Captain's copy: in `reportToCaptain`, when the meeting never began (`startedAt === null`), say so: "I could not get to the <room> for the staff meeting; reports are coming by PDA." rather than "0 of 3 there".
4. This is shared by every head that uses `syncMeeting` (Head of Personnel, Quartermaster, Chief Engineer, Head of Security), so the fix covers all of them. For a head that calls aloud (`way.aloud`), `endMeeting` sends nothing by PDA (see KNB-09); its staff were called to their faces in the room the head is in, so this case does not arise for them.

## How to test the fix

- Simulator: a scenario where the fake server keeps the head `shut_in` from before its first meeting is due. Pass if no "Staff meeting in the" message is sent until it is let out.
- A scenario where the head's `go_to` to the meeting room always fails: pass if the janitors are sent "the staff meeting is over" about three minutes after the call and send their reports by PDA.
- Type check from `tgui/`.
- In a round's `pda.log`, the time between a head's "Staff meeting in the" and its "the staff meeting is over" should never be more than about four minutes when its staff have arrived.
