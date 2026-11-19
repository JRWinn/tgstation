---
id: KNB-09
title: The Quartermaster and the Chief Engineer call absent staff to a meeting by PDA but read neither the On my way back nor a report sent by PDA, and never tell them it is over
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1445, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:650, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1313, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:482
fix: Move the reading of On my way and of a report by PDA out of the Head of Personnel's readsMessage into one helper every head calls, and send the meeting-is-over word to anyone who was called by PDA
---

## What is wrong

Two heads hold their meetings "aloud": the Quartermaster and the Chief Engineer. Since the 12:00 entry, a member of staff who is out of sight when the meeting is called is sent the same PDA call the Head of Personnel uses (`meetStep`, "You are sending X a PDA message to come to the ..."). The staff side then behaves as for any PDA call: it sends "On my way to the Cargo Bay." and walks. But the other half was never built for these two heads.

Listed and left in the 2026-11-18 12:00 entry ("eleven faults from the 09:12 round"): "A technician called by PDA to a meeting that was called aloud sends 'On my way', and if it misses the meeting sends its report by PDA. The Quartermaster does not read either." The Chief Engineer, built an hour earlier, has the same gap, and nobody wrote that down.

Three things follow, all read from the code:

1. **The head does not wait for someone who said they are coming.** `awaited` waits up to three minutes (`GATHER_MAX_DS`) for staff whose answer is `'coming'`, and only 90 seconds (`WORD_BACK_DS`) for staff who have said nothing. Only the Head of Personnel's `readsMessage` sets `meeting.answers[from] = 'coming'` from the message. For the Quartermaster the technician's "On my way" falls through every branch of `readsMessage` and is dropped. A technician more than 90 seconds away (in the Delivery Office with a door to be let through, or hauling a crate it has to set down first) finds the meeting started or over.
2. **Nobody tells them it is over.** `endMeeting` sends "the staff meeting is over. Send me your report by PDA, please." to everyone invited who gave no report, except where the way is aloud: `for (const name of way.aloud ? [] : meeting.invited)`. The comment says "nothing between that head and its staff goes by PDA", which stopped being true when the PDA call was added. So the summons of whoever was called by PDA stands until it times out (`SUMMONS_STANDS_DS`, seven minutes from the call). It is an emergency task: the technician goes to the meeting room and waits there with its other work stopped.
3. **A report sent by PDA is lost.** If the staff member does send "Sorry I missed the meeting. ..." or "I could not get into the ... for the meeting. ...", the Quartermaster's `readsMessage` has no branch for it. The crates in and out are not counted and, worse, what it says it needs is not noted. The Chief Engineer passes any message from an engineer to `hearEngineer`, which reads engine words, not reports.

Concrete case: the Quartermaster calls its 10-minute meeting from the middle of the bay. One technician is at the counter in sight and is called aloud. The other is in the Delivery Office, out of sight, and is sent the PDA call. It answers "On my way to the Cargo Bay." and has to be let through a door. The Quartermaster waits 90 seconds, holds the meeting with one, and reports to the Captain "1 of 2 there". The second technician arrives, finds nobody calling on it, and stands in the bay until seven minutes after the call. The counter and the shuttle are its to work and are left.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1313`, in the Head of Personnel's `readsMessage` only:

        if (staff(brain).some((person) => person.name === from)) {
          // One of its staff sending word that they are coming to the meeting.
          if (COMING_WORDS.test(text)) {
            if (meeting) {
              meeting.answers[from] = 'coming';
            }
            return;
          }
          // One of them sending their report because they could not be there. ...
          const report = REPORT_BY_PDA.test(text) ? readReport(text) : null;

`jobs/quartermaster.ts:1445`, the whole of what the Quartermaster reads from a technician by PDA: `DOCKED_WORDS`, `ARRIVED_WORDS` and `SHUT_IN_WORDS`. No `COMING_WORDS`, no report.

`jobs/chiefengineer.ts:655`:

        if (isEngineer(job)) {
          hearEngineer(brain, from, text, false);
          return;
        }

`jobs/head.ts:480`, in `endMeeting`:

      // Called and not heard from: they send their report by PDA, and are told so the same way. Not
      // where the staff are called aloud: nothing between that head and its staff goes by PDA.
      for (const name of way.aloud ? [] : meeting.invited) {

`jobs/head.ts:375`, `awaited`:

      return answer === 'coming' || brain.now - meeting.calledAt < WORD_BACK_DS;

(The Head of Security has its own copy of the report reading, `jobs/headofsecurity.ts:226`, and also no `COMING_WORDS`.)

## How it was found

Read from the code. `grep COMING_WORDS jobs/*.ts` finds it used in `head.ts` alone. Not seen in a round: the logs were not searched for a technician standing in the bay after a missed meeting.

## How to fix it

1. In `jobs/head.ts`, lift the block quoted above into an exported function, `staffMeetingWord(brain, from, text, at): boolean`, that handles `COMING_WORDS` and `REPORT_BY_PDA` (with `readReport`, `addCounts`, `noteAsk`) and returns TRUE if the message was one of them. Call it from the Head of Personnel's `readsMessage` in place of the block.
2. Call it near the top of `readsMessage` in `jobs/quartermaster.ts`, `jobs/chiefengineer.ts` (before `hearEngineer`) and `jobs/headofsecurity.ts` (which can then drop its own copy, keeping `KEPT_AWAY` in the pattern).
3. In `endMeeting`, send the "meeting is over" word to those who were called by PDA whatever the way: keep a list on the meeting (`meeting.calledByPda`, pushed to where `meetStep` sends the PDA call) and loop over that when `way.aloud`.
4. The Quartermaster's need-taking: check that `noteAsk` does for it what it does for the Head of Personnel. The Quartermaster orders for its own staff through `orderForItself`, so a technician's need by PDA has to land wherever a spoken one lands (`hearReport`).

Keeps the rules: all of it is fixed lines read by code. Nothing waits on the model.

## How to test the fix

- Type check and lint.
- `tools/llm_crew/reports.ts`: add cases for "On my way to the Cargo Bay." and "Sorry I missed the meeting. ..." read by the Quartermaster's and the Chief Engineer's `readsMessage`.
- Simulator: `qm` with one technician started out of the Quartermaster's sight. Checks: the Captain's report counts 2 of 2, or 1 of 2 with "1 reported by PDA"; the late technician is back at its work within a minute of the meeting ending.
