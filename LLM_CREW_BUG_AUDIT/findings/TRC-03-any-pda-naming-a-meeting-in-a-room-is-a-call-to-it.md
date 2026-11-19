---
id: TRC-03
title: Any PDA message from the Captain or a head with meeting in the and a room in it is taken as a call to a meeting there, and the NPC drops its work and waits in that room seven minutes
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 8e2b20ee1b7
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:266, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:65, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:77, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:587
fix: In readSummons take a call only in the words a head calls by (Staff meeting in the X now) and take meeting is over only from a summons already standing from that sender
---

## What is wrong

Every PDA message an NPC gets goes first through `readSummons`, for every job. It treats as a call to a staff meeting any message from someone the NPC answers to (its head, or the Captain) that has the three words "meeting in the" anywhere in it and names a room. And it treats as word that a meeting it missed is over any such message with "meeting is over" anywhere in it.

The Captain is a player and writes as a player does. A message that only talks about a meeting is taken as calling one:

- To a janitor: "Did you get to the meeting in the Bar Lounge?" The janitor sends the Captain "On my way to the Bar Lounge.", drops whatever it was cleaning (a meeting is an `emergency` task), walks to the Bar Lounge, and stands there "waiting for Zim to call on you for your report" until the summons runs out, seven minutes after the message (`SUMMONS_STANDS_DS`). While it waits, talk with it is kept to "the meeting" (`inMeeting`).
- To the Head of Personnel: "Good work at the meeting in the Bar Lounge." `isMeetingOrder` is false (no "hold", "call" or "have" before "meeting"), so the head takes it as the Captain calling it to a meeting in the Bar Lounge. It answers "On my way to the Bar Lounge." and waits there seven minutes. Its own next meeting, orders and errands are held up behind an emergency task.
- "Tell me when the meeting is over." to anyone: `OVER_WORDS` matches, `brain.summons?.by` is not the Captain, so a new summons is made with `missed = true`. The NPC sends the Captain "Sorry I missed the meeting. I have no work to speak of yet. I need nothing." about a meeting that never was.

Nothing written by our own heads sets this off today: their PDA lines with these words are the call itself, "Staff meeting in the X now, please. ..." and "X, the staff meeting is over. Send me your report by PDA, please.". So the fault is the loose reading of a player's words, and of any line added later.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:266`, `readSummons`:

    if (!answersTo(brain.job, job)) {
      return false;
    }
    // The meeting is over and it was not there, or was not heard: its report goes by PDA instead.
    if (OVER_WORDS.test(text)) {
      const summons =
        brain.summons?.by === from
          ? brain.summons
          : called(from, placeNamedIn(brain, text.toLowerCase()) ?? '', at);
      if (summons.said) {
        summons.over = true;
      } else {
        summons.missed = true;
      }
      brain.summons = summons;
      return true;
    }
    // A head told by the Captain to hold a meeting is being given an order, not called to one.
    if (!CALL_WORDS.test(text) || isMeetingOrder(brain, text)) {
      return false;
    }
    const room = placeNamedIn(brain, text.toLowerCase());
    if (!room) {
      return false;
    }
    brain.summons = called(from, room, at);
    return true;

with `CALL_WORDS = /\bmeeting in the\b/i` (line 65) and `OVER_WORDS = /\bmeeting is over\b/i` (line 77). `answersTo` is TRUE for the Captain for every job (`hierarchy.ts`: `isJob(toTitle, 'Captain') || ...`).

`brain.ts:587` runs it before the job's own reading, so the message is not seen by anything else once it returns TRUE:

    if (
      !readSummons(brain, from, text, event.at, theirJob) &&
      !readPickup(brain, from, text, theirJob) &&

The calls it is meant for, `jobs/head.ts:712` and `jobs/head.ts:486`:

    text: `Staff meeting in the ${room} now, please. Send word that you are coming, and bring your report.`,
    line: `${firstName(name)}, the staff meeting is over. Send me your report by PDA, please.`,

## How it was found

Read from the code, then checked with a throwaway bun script (kept outside the repo) that imports `brain.ts` and `jobs/meetings.ts` and calls `readSummons` with a bare brain that knows the Bar Lounge, `from = 'Zim Fire'`, `job = 'Captain'`. All three lines returned TRUE: the first two made a summons `{"by":"Zim Fire","room":"Bar Lounge",...}`, the third one with `"room":""` and `"missed":true`. Not seen in a round: the round logs read had no Captain message with these words in it.

## How to fix it

1. Read a call only in the words a call is given in. Change `CALL_WORDS` for the PDA path to the start of the head's line, `/^staff meeting in the\b/i` tested on `text.trim()`, the same test `ALOUD_CALL_WORDS` already makes for the call said aloud.
2. Take "the meeting is over" by PDA only as an answer to a call: when `brain.summons?.by === from`, or when the message is in the head's words for it (`/\bthe staff meeting is over\. Send me your report\b/i`). Anything else with "meeting is over" in it is not about a meeting this NPC was called to.
3. Owner's question: should the Captain be able to call a meeting by PDA in free words ("All heads, meeting on the Bridge in five minutes")? If yes, that wants its own reading (the LLM as last-resort reader, as for warrants, see GAP-15), with "come" or a time in it, and not a three-word match. If no, step 1 is the whole fix.
4. Keep `isMeetingOrder` as it is, ahead of the call test: an order to a head to hold one is still an order.

## How to test the fix

- `tools/llm_crew/addressing.ts` or a new table: feed `readSummons` the head's two lines (both TRUE) and "Did you get to the meeting in the Bar Lounge?", "Good work at the meeting in the Bar Lounge.", "Tell me when the meeting is over." from the Captain (all FALSE, `brain.summons` unchanged).
- Simulator: a janitor working, sent the Captain's "Did you get to the meeting in the Bar Lounge?". It should not send "On my way" and should not leave its work.

## Check

Checked by Opus 5.5. `readSummons` (`meetings.ts:262-300`), `CALL_WORDS` (`meetings.ts:65`), `OVER_WORDS` (`meetings.ts:77`) and the call in `brain.ts:587` are as quoted. `answersTo` (`hierarchy.ts:111-117`) is TRUE for a Captain sender for every job but the Captain's own.

Ran it: a throwaway bun script in the scratchpad imported `jobs/meetings.ts` and called `readSummons` with a bare brain (`places` holding the Bar Lounge), `from` "Zim Fire", job "Captain". "Did you get to the meeting in the Bar Lounge?" (janitor) and "Good work at the meeting in the Bar Lounge." (Head of Personnel) both returned TRUE with a summons for the Bar Lounge; "Tell me when the meeting is over." returned TRUE with room "" and `missed: true`. The head's own call line returned TRUE, as it should.

Followed the summons on: `syncMeetings` adds an `emergency` meeting task; `planMeetings` sends "On my way to the Bar Lounge." first, then walks; for `missed` with no room it sends "Sorry I missed the meeting. ..." by PDA. With the Captain as `by`, `headGone` needs `summons.said`, which never comes, so the summons stands until `SUMMONS_STANDS_DS` (`meetings.ts:50`, 4200 ds).

Our own PDA lines with these words are only the two the write-up names: every PDA `toTell` line is sent word for word (`driver.ts:452`, the `message` act carries `tell.line`), so step 2's match on the head's exact over line is safe. Nothing in the change log or plans covers `CALL_WORDS` or `readSummons`.

Severity medium (needs a player to write one of these words to a crew member, then costs up to seven minutes of its work) and effort small (two patterns in `readSummons`) both stand.
