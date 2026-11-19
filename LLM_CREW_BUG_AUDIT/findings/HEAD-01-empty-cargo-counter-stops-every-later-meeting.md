---
id: HEAD-01
title: An order the Head of Personnel cannot get anyone at the counter to take stops every later staff meeting, the Captain's own included
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:624, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:952, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:924, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:534
fix: Hold meetings back only while the head is actually waiting at the counter for an answer, give the counter errand a total time limit after which the order is parked until after the next meeting and the Captain is told once, and pass over a technician who is down
---

## What is wrong

While the Head of Personnel has an order it has not yet had answered, it calls no staff meeting at all. That is meant to be a short hold: "Not while it is on its way to the counter with an order, or at it waiting for cargo's answer: that is seen through first." But nothing puts an end to the order when nobody at the counter takes it. The hold then lasts the rest of the round.

`ordering` is true for as long as there is a requisition whose `askedAt` is null or whose `heardBack` is false. At the counter, with no cargo technician in view, `requisitionStep` waits 60 seconds and then returns "Nobody from cargo came to the counter. You will try again shortly." It resets `order.startedAt` (which nothing reads) and leaves `askedAt` null. Nothing else clears the order: `ORDER_OVERDUE_DS` only acts when `askedAt` is not null, and the Quartermaster's refusal and "has come in" branches need a message from cargo.

Concrete case: a round with janitors, the Head of Personnel and the Captain, and no cargo crew (or both technicians in the bay hauling off the shuttle, at their own meeting, or shut in somewhere, for long spells). At the 2-minute meeting a janitor says "I need something to clean with." The meeting ends; `syncTasks` makes the requisition. The head walks to the Cargo Lobby, waits a minute, gives up, the `back_to_office` task takes it to its office, the requisition task sends it back to the lobby, and so on. `syncMeeting(brain, HOP_WAY, ordering)` is called with `held = true` every time, so the 12-minute meeting, and every one after it, is never called.

The same happens when a technician is in view but cannot answer: a body lying down or dead at the counter is "a technician" to `requisitionStep` (`peopleInView` lists every human in sight, with `down` set, and the step does not look at it). The head says its order, waits `ANSWER_WAIT_DS` (30 seconds), sets `askedAt` back to null and says it again, every 30 seconds, for good. Since `askedAt` is reset each time, `ORDER_OVERDUE_DS` never fires either.

It also makes the head lie to the Captain. Told aloud to hold a meeting, `whenAsked` has the LLM say "Your body is calling a staff meeting for that now", and `meetingOrderedBy` is set. `syncMeeting` moves `nextMeetingAt` to now, but `!held` still stops the call, so no meeting comes and no report follows.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:624`, in `syncTasks`:

    const ordering =
      !!brain.requisition &&
      (brain.requisition.askedAt === null || !brain.requisition.heardBack);
    syncMeeting(brain, HOP_WAY, ordering);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:534`, in `syncMeeting`, the hold:

    if (
      !brain.meeting &&
      !held &&
      people.length > 0 &&
      brain.now >= brain.nextMeetingAt
    ) {

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:949`, in `requisitionStep`, the empty counter:

    const technician = brain.peopleInView.find((person) =>
      isTechnician(person.job),
    );
    if (!technician) {
      // Nobody at the counter. It waits a while, and then tries again later.
      if (brain.now - brain.inPlaceSince > COUNTER_WAIT_DS) {
        order.startedAt = brain.now;
        return {
          ready: false,
          step: 'Nobody from cargo came to the counter. You will try again shortly.',
        };
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:924`, the answer that never comes, asked again with no cap:

    if (order.askedAt !== null && !order.heardBack) {
      if (brain.now - order.askedAt < ANSWER_WAIT_DS) {
        ...
      }
      order.askedAt = null;
    }

`order.startedAt` is written in four places in `head.ts` and read in none; `grep -n "requisition" *.ts jobs/*.ts` shows the requisition is used nowhere outside `head.ts`.

## How it was found

Read from the code, not seen in a round. Not checked: how often in a played round both technicians are out of the lobby's view for long; the case with no cargo crew aboard at all is certain.

## How to fix it

1. In `syncTasks`, make the hold narrow: `held` should be true only while the head is standing at the counter with the order said and the answer not yet in (`order.askedAt !== null && !order.heardBack && brain.now - order.askedAt < ANSWER_WAIT_DS`), or while it is waiting at most `NOTED_WAIT_DS` for the Quartermaster's word. Walking to the counter, or between visits, is not a reason to put a meeting off. When a meeting falls due mid-errand, `MEET` (urgency `asked`) runs and the order is taken up again after it.
2. Give the requisition a first-asked time that is never reset (`order.firstAt`, set in `orderFor`) and a visit count. In `requisitionStep`, after, say, three empty visits or `ORDER_OVERDUE_DS` from `firstAt` with no answer, park it: set `order.parkedUntil = brain.nextMeetingAt` and return not ready while parked. Leave the asks `ordered: false` so the next meeting's order picks them up again.
3. When it parks an order for the first time, push one `toTell` to the Captain by PDA: "Nobody at the cargo counter will take my order for <wanted>. I will try again after the next staff meeting." That keeps a dead counter from being silent, and keeps to "a dead model must not stall anything" (it is plain words).
4. In the technician pick, skip anyone with `down` set: `peopleInView.find((person) => isTechnician(person.job) && !person.down)`.
5. Count the asks again at the counter as at the Quartermaster: cap the number of times the same order is said at the counter in one visit (two), then leave the counter as in step 2.
6. In `whenAsked`, say the meeting is being called only when it will be: use the same test `syncMeeting` uses (not held, room known).

## How to test the fix

- Add a simulator scenario to `tools/llm_crew/sim.ts`: one Head of Personnel, two janitors, no cargo crew. One janitor reports a need at the first meeting. Pass if a second meeting is called within 11 minutes of the first and the Captain is sent the parked-order line once.
- A second scenario with a technician in view at the counter who is `down`: pass if the head says its order no more than twice and leaves.
- Type check from `tgui/`.
- In the next round's `game.log`, grep the Head of Personnel's lines for "Staff meeting in the" and check there is one every ten minutes after the first order.
