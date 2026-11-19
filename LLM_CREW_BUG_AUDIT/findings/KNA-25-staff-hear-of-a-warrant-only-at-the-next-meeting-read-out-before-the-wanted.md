---
id: KNA-25
title: Staff hear of a warrant only at their head's next meeting, up to ten minutes late, and the list is read out with the wanted person standing in the room
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:155, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:363, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:494
fix: Have a head pass a new name on the list to its staff by PDA at once, and leave out of the meeting line anyone on the list who is in the room, if the owner agrees
---

## What is wrong

Two items from the change log, both still as listed:

- 2026-11-18, 14:15, Known and not fixed: "Staff learn of a warrant at their head's next meeting, up to ten minutes late, and learn it is over just as late."
- 2026-11-18, 16:50 to 17:35, Not built: "A wanted person read out the list at a meeting they are standing in. Only the PDA copy leaves their name off."

(The second half of the first, staff still sending sightings after it is over, is SECT-26.)

**How the list reaches staff.** Security sends the notice to every head by PDA. The head takes it in (`readWanted`), answers "Security notice received.", and its own cue says "You read it out at your next staff meeting." Nothing else is done with it. Its staff learn it only by hearing the head read it at a meeting (`wantedMeetingStep`, `wantedOverhears`), or, if they were called and not there, by the PDA copy sent at the meeting's close (`wantedAbsent`). Meetings are every ten minutes (`MEETING_EVERY_DS = 6000` in `jobs/head.ts`), and the Head of Personnel's first is two minutes into the round.

So for up to ten minutes after a warrant, the people most likely to see the suspect (janitors walking every room, technicians at the counter) do not know there is one. `syncWanted` sends security a sighting only from someone who holds the list. The case: the Captain declares a warrant on Pun Pun at minute 12, one minute after the Head of Personnel's meeting. Three janitors walk past the monkey in the Bar Lounge for the next nine minutes. None of them sends a sighting. The officer, with no sighting, walks the hallways (KNA-07). At minute 21 the head reads the list, and only then do sightings start.

**Reading the list in front of the wanted.** `wantedMeetingStep` reads every name on the list out loud. It does not look at who is standing there. A warrant on one of the head's own staff (a janitor said to have wrecked the closet) is read out to that janitor at the meeting it was called to: "Security is looking for Dana Reyes. If you see them, send security a PDA message saying where." A player in that place would be warned. The PDA copy to absent staff already leaves out the person's own name (`wantedAbsent`, L5 in the 16:50 entry), so the two disagree.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:161`, in `readWanted`, all a head does with the notice:

    const notice = isSecurity(job) ? readNotice(text) : null;
    if (notice) {
      takeList(brain, notice.entries, notice.more);
      if (isHead(brain.job) && !isSecurity(brain.job)) {
        ...
        brain.toTell.push({
          to: from,
          line: NOTICE_ACK,
          why: `${from} of security has sent you the list of who is wanted. You are sending word back that you have it. You read it out at your next staff meeting.`,

`wanted.ts:363`, `wantedMeetingStep`, which reads every name:

    const names = known.entries.map((entry) => entry.name);
    ...
    const lines = meetingLines(names);
    const line = lines[said];

`jobs/head.ts:494`, the only other way it reaches staff, at the close of a meeting:

    wantedAbsent(
      brain,
      staff(brain)
        .map((person) => person.name)
        .filter((name) => !meeting.turns.some((turn) => turn.who === name)),
    );

## How it was found

Read from the code. Not seen in a round as a missed sighting: the rounds read so far had the Captain or a head send the sighting.

## How to fix it

The owner's questions:

1. **Should a head pass a new warrant on to its staff at once, by PDA, rather than wait for its meeting?** The cost is one PDA message for each of its staff each time the list grows. The rule that hand-offs go by speech or PDA is kept either way.
2. **Should a name be left out of the meeting line when that person is in the room?** And if they are, should the head send security a sighting instead (it is seeing them: `syncWanted` will already do that if it holds the list)?

If yes to 1 (what I would do):

1. In `readWanted`, after `takeList`, work out which names are new to this head (not in its list before the call). If any, queue one message to each of its staff on its PDA list (`staff(brain)`), in the meeting's own words so `readMeetingLine` on the staff side takes it as it is: the line `meetingLines(newNames)` gives. Leave out each member's own name, as `wantedAbsent` does, and anyone the list is on.
2. Do the same for a name struck off, so that sightings stop (that is also the fix for SECT-26): "Security is looking for nobody now", or the shortened list.
3. Keep the meeting line as it is for anyone who missed the PDA.

If yes to 2:

4. In `wantedMeetingStep`, drop from `names` anyone in `brain.peopleInView` by `sameName`. If that leaves none, skip the line.

## How to test the fix

Cases in `tools/llm_crew/security.ts`: a head given the notice with two staff on its PDA queues two messages with the new name, none to the wanted person; a meeting with the wanted person in view leaves their name out of the line. Simulator: `warrant` with a janitor who passes the monkey before the next meeting must send a sighting. Next round, `pda.log`: "Security is looking for" from a head within seconds of "Security notice." to it.
