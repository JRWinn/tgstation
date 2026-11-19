---
id: HEAD-01
title: An order the Head of Personnel cannot get anyone at the counter to take stops every later staff meeting, the Captain's own included
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: head
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:624, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:952, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:924, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:534, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:657
fix: Hold meetings back only while the head is at the counter waiting for an answer (in syncMeeting and in toSee), park an order nobody at the counter takes until after the next meeting and tell the Captain once, and pass over a technician who is down
---

## What is wrong

While the Head of Personnel has an order it has not yet had answered, it calls no staff meeting at all. That is meant to be a short hold: "Not while it is on its way to the counter with an order, or at it waiting for cargo's answer: that is seen through first." But nothing puts an end to the order when nobody at the counter takes it. The hold then lasts the rest of the round.

`ordering` is true for as long as there is a requisition whose `askedAt` is null or whose `heardBack` is false. At the counter, with no cargo technician in view, `requisitionStep` waits 60 seconds and then returns "Nobody from cargo came to the counter. You will try again shortly." It resets `order.startedAt` (which nothing reads) and leaves `askedAt` null. Nothing else clears the order: `ORDER_OVERDUE_DS` only acts when `askedAt` is not null, and the Quartermaster's refusal and "has come in" branches need a message from cargo.

How often: the standing test crew (`spawn_test_crew` in `crew_npc_spawn.dm`) has a Quartermaster and two technicians. With a Quartermaster aboard and a working PDA the order goes by PDA, `askedAt` is set at once, and the Quartermaster's "Noted" sets `heardBack`, so the hold is short. The counter path, and with it this fault, is taken only with no Quartermaster aboard, a head with no PDA, or a Quartermaster that has said nothing for `NOTED_WAIT_DS`. The technicians' post is at the counter, so with them at work they are usually in view from the lobby. So this is a less common case, not most rounds. The same `ordering` test is also what holds meetings for good in HEAD-05 (PDA will not send), which is the commoner way in.

Concrete case: a round with janitors, the Head of Personnel and the Captain, and no cargo crew (or both technicians away from the counter for long spells: in the bay hauling off the shuttle, at their own meeting, or shut in somewhere). At the 2-minute meeting a janitor says "I need something to clean with." The meeting ends; `syncTasks` makes the requisition. The head walks to the Cargo Lobby, waits a minute, gives up, the `back_to_office` task takes it to its office, the requisition task sends it back to the lobby, and so on. `syncMeeting(brain, HOP_WAY, ordering)` is called with `held = true` every time, so the 12-minute meeting, and every one after it, is never called.

The same happens when a technician is in view but cannot answer: a body lying down or dead at the counter is "a technician" to `requisitionStep` (`peopleInView` lists every human in sight, with `down` set, and the step does not look at it). The head says its order, waits `ANSWER_WAIT_DS` (30 seconds), sets `askedAt` back to null and says it again, every 30 seconds, for good. Since `askedAt` is reset each time, `ORDER_OVERDUE_DS` never fires either.

The same hold, for good, comes from `requisitionStep`'s "You do not know the way to the cargo counter." (not ready, nothing changed): a map with no room called `Cargo Lobby` (`CARGO_LOBBY` is a fixed name in `memory.ts`) leaves every order, and so every meeting after the first need, stuck.

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

1. In `syncTasks`, make the hold narrow: `held` should be true only while the head is standing at the counter with the order said and the answer not yet in (`order.askedAt !== null && !order.heardBack && brain.now - order.askedAt < ANSWER_WAIT_DS`, and not `viaCounter` false with a Quartermaster, where `askedAt` is the PDA send), or while it is waiting at most `NOTED_WAIT_DS` for the Quartermaster's word. Walking to the counter, or between visits, is not a reason to put a meeting off. Use the same narrow value in the `toSee` line (`head.ts:657`, `!(brain.meeting && !ordering)`): with the old broad `ordering` there, a meeting called mid-errand would leave the `REQUISITION` task standing beside `MEET`, both urgency `asked`, and the head could walk out of its own meeting to the counter. With the narrow value the requisition task is dropped while the meeting is on and comes back after it.
2. Give the requisition a first-asked time that is never reset (`order.firstAt`, set in `orderFor`; `startedAt` is reset in four places and read in none, so either rename it or add a new field) and a count of empty visits. In `requisitionStep`, after, say, three empty visits or `ORDER_OVERDUE_DS` from `firstAt` with no answer, park it: set `order.parkedUntil = brain.nextMeetingAt` and return not ready while parked. Do not just set `brain.requisition = null`: with `metOnce` true and asks waiting, `syncTasks` makes the same order again on the next tick. The asks on this path are still `ordered: false` (only `afterSaying` and an `ok` `afterActing` set it), so dropping the parked order after the next meeting lets that meeting's order pick them up again.
3. When it parks an order for the first time, push one `toTell` to the Captain by PDA: "Nobody at the cargo counter will take my order for <wanted>. I will try again after the next staff meeting." That keeps a dead counter from being silent, and keeps to "a dead model must not stall anything" (it is plain words).
4. In the technician pick, skip anyone with `down` set: `peopleInView.find((person) => isTechnician(person.job) && !person.down)`.
5. Count the asks again at the counter as at the Quartermaster: cap the number of times the same order is said at the counter in one visit (two), then leave the counter as in step 2.
6. In `whenAsked`, say the meeting is being called only when it will be: use the same test `syncMeeting` uses (not held, room known).

## How to test the fix

- Add a simulator scenario to `tools/llm_crew/sim.ts`: one Head of Personnel, two janitors, no cargo crew. One janitor reports a need at the first meeting. Pass if a second meeting is called within 11 minutes of the first and the Captain is sent the parked-order line once.
- A second scenario with a technician in view at the counter who is `down`: pass if the head says its order no more than twice and leaves.
- A third: a meeting falls due while the head is walking to the counter. Pass if the head goes to the meeting and not on to the counter, and goes to the counter after it.
- The throwaway scripts in the Check below are a quick table-of-cases start: build the head with `makeBrain` from `tools/llm_crew/fixtures.ts`, step it with `at()`, and count meetings called.
- Type check from `tgui/`.
- In the next round's `game.log`, grep the Head of Personnel's lines for "Staff meeting in the" and check there is one every ten minutes after the first order.

## Check

Checked by Opus 5.5. Every quote is what `jobs/head.ts` says today (lines 624, 534, 949 to 966, 924 to 933). Traced: `ordering` (624) is true while `askedAt` is null; on the counter path `askedAt` is set only by `afterSaying` when the order is said (1347); `requisitionStep` with no technician in view returns not ready and leaves `askedAt` null (954 to 959); `ORDER_OVERDUE_DS` (646) needs `askedAt` set; the only other ways the requisition goes are cargo's "has come in", "still waiting" (needs `askedAt`), refusal or cannot-order (need `askedAt`). Nothing clears it with nobody at the counter. `peopleInView` carries `down` (`types.ts:63`, `crew_npc_senses.dm:191`) and the technician pick does not look at it. `CARGO_LOBBY` is the fixed name `'Cargo Lobby'` (`memory.ts:193`); the base area is named that (`code/game/area/areas/station/cargo.dm:47`), so the no-lobby case is only for maps without it.

Ran two throwaway scripts (scratchpad, bun, importing `tools/llm_crew/fixtures.ts` and `jobs/head.ts`): a head with one janitor, no cargo crew, an ask waiting and the next meeting due at 30000. Stepped to 60000, half the time in the Cargo Lobby: 0 meetings called, `askedAt` null, step "Nobody from cargo came to the counter." With a technician in view who is `down`: the order was said 43 times in 1700 seconds and no meeting called.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans chooses this. Lowered to medium: with the standing test crew the order goes by PDA to a Quartermaster who answers, so the counter path is the less common case (the PDA-failure way in is HEAD-05). Effort medium: several changes in `head.ts` and a field in `types.ts`. Added the `toSee` line to the fix: narrowing `held` alone would let the order pull the head out of its own meeting.
