---
id: LOGA-04
title: A knock that one technician has answered stays live for the other for a minute, so when the janitor is let back in it is let out again unasked and its scrub is cut short
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: df6573e9963, 1c791a9952a
found_by: Opus 5.5
checked_by: Opus 5.5
area: logs
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1404, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:615, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1970
fix: Stamp each let-out per room on the department list in expected.ts and drop any knock on that room older than the stamp, and take a knock from inside only for someone let in before it
---

## What is wrong

See also: LOGB-04

Every technician who hears a knock on a door of the department keeps it in its own `brain.knockAt`, for `DOOR_ASK_DS` (60 seconds). It is cleared only when **that** technician's own door task for the room ends (`cargo.ts:1970`). When the other technician answers the knock, this one's copy stays live.

A knock from inside names no one. `doorSought` takes it to be whoever the department has down as being inside that room (`stillInside`, the list both technicians share). So if the knocker is let out by one technician and let back in by the same or the other within that minute, the other technician reads the old knock as the janitor knocking again, walks to a door and holds it open "to let them out". The janitor, by its own rule, goes out through a door held open for it to leave (`The door is being held open to let you out of ...`), whatever it was doing. If it was scrubbing, the scrub is cut short and the mess is written off as beyond it (JAN-01, LIFE-02).

There is a second form of the same stale knock: once the knocker is out, nobody is on the list for that room and nobody is seen in it, so `doorSought` falls through to `!inside && brain.closedRooms.includes(knock.room) && mine(undefined)` and the other technician walks to the door "for someone inside" who has already gone. The server finds nobody at the door, so it costs a walk and a wait, not a wrong let-out.

The case needs: both technicians in knock range (`CREW_NPC_KNOCK_RANGE` from the door, `crew_npc_doors.dm` `tool_knock`); the other technician leaving it to the first while the first is in its view (or, with the work divided, for `KEEPER_WAIT_DS`); and then the first walking out of its view while the knock is under a minute old. Built from the code; **not seen in a round** (see the Check: the round below shows a different fault).

The round first given for this, `data/logs/2026/11/19/round-19.33.50`, Penelope Alekseev (janitor, space cleaner), Tamika Barrett and Marshall Alliman (cargo technicians). It shows the same harm, a janitor let out mid-scrub, but **not from a knock**:

1. 01:43:36, Penelope's brain: "You are shut in Cargo Bay with nobody in sight to ask. You are knocking at the door". Marshall did **not** hear it: his prompt at 01:44:25 lists every event he got from 19:42:58 to 19:44:22 (nine lines, none cut) and no knock from inside. Only Reuben Shirey's log has it.
2. 01:43:39 to 01:43:45: Tamika lets her out ("The door is being held open to let you out of Cargo Bay").
3. 01:44:02, `game.log`: "Tamika Barrett ... opened Quartermaster Maintenance to let Penelope Alekseev into Cargo Bay." Tamika's `noteLetIn` puts Penelope back on the shared list as inside the Cargo Bay.
4. 01:44:24, `game.log`: Tamika "opened Deliveries to let Penelope Alekseev into Delivery Office". 01:44:29, Penelope's brain: "You are cleaning up the mess here in Delivery Office ... with your space cleaner." The mess is vomit, which space cleaner washes off.
5. 01:44:22, `game.log`: Penelope, standing in the Cargo Bay at the Deliveries door, says to Marshall "Marshall, I'm stuck out here; could you open the door for me so I can scrub that mess?" `LET_OUT_WORDS` (`/\bout\b/`) matches "out here", so Marshall's `doorAsked` is `out: true` (PARSE-08's fault). Marshall heard only his own share of the divided work, so `roomsKeeper` is undefined for him and `doorIsMine` is TRUE. `mayPass` finds her `seenInside` the Cargo Bay and returns a let-out. 01:44:25 and 01:44:29, Marshall's brain: "Penelope Alekseev is inside the Cargo Bay and cannot get out by themselves: the door is locked to them. You are going to open the Deliveries door for them." 01:44:30 and 01:44:32, `game.log`: Marshall opens Deliveries "to let Penelope Alekseev into Cargo Bay", then "out of Delivery Office".
6. 01:44:42, Penelope: "The door is being held open to let you out of Delivery Office, and you are going out to Cargo Bay while it is." 01:44:50, `pda.log`: "I cannot shift the mess in the Delivery Office with my space cleaner."
7. The vomit was still on cargo's list at 01:57:58, when Marshall sent another janitor for it.

So that round belongs to PARSE-08. Fixing this finding would not have changed it.

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

`mine(letIn?.by)` is TRUE for the other technician once the one who let them in is out of its view (or, with the work divided, once `KEEPER_WAIT_DS` has passed with the keeper out of view).

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1970`: the only place a knock is dropped, on this technician's own door task.

        if (brain.knockAt?.room === task.place) {
          brain.knockAt = null;
        }

## How it was found

First put down as seen in `data/logs/2026/11/19/round-19.33.50`. On checking, that round shows a different cause (PARSE-08, above). The stale knock itself is read from the code, not seen in a round. The second opening there, at 01:44:32 ("out of Delivery Office"), was not traced.

## How to fix it

1. In `doorSought`, for a knock from inside, take `letIn` only if `knock.at > letIn.at`: the knock has to have come after they were let into that room (`noteLetIn` sets `at` to the time they were let in, through `expectSomeone`). The same for `seen`: skip anyone this technician or the list has as let in after the knock.
2. When a technician lets someone out of a room, any technician's knock on that room older than the let-out is spent. The simplest way: in `expected.ts`, have `noteLetOut` stamp the time per post and room (`lastLetOut[post + room] = now`; the cargo.ts caller has `brain.now`, so pass it in). In `doorSought`, before the knock branch, drop `knockAt` when its `room` has a let-out stamp later than `knock.at`. This list is already the department's shared clipboard by the counter (`expected.ts` header), which is how the second technician knows who is inside at all, so it adds no new channel. This also covers the second form, where the stale knock sends the other technician to the door for `SOMEONE_INSIDE` after the knocker has gone. Step 1 alone does not cover that.
3. Keep: a knock from someone who walked back into a room unseen (the case the comment at `cargo.ts:1434` was written for) must still be answered. A knock that comes after the let-out is newer than the stamp and still stands.
4. Fix PARSE-08 as well. It is what let Penelope out mid-scrub in round-19.33.50, and this fix does not touch it.

## How to test the fix

- Type check and lint.
- Simulator: `cargo` with two technicians and a janitor called to a room inside the bay: the janitor knocks to be let out, technician A lets it out and then in again within a minute, technician B can hear the knock. Pass if B does not open a door for it, and the janitor finishes its scrub.
- Simulator, second form: A lets the knocker out and walks out of B's view within the minute. Pass if B makes no door task for the room.
- Next round, `game.log`: no "opened ... to let X out of Y" within half a minute of "opened ... to let X into Y" by the other technician. Before you blame this fault for one, check that technician's `crew_brain.log` prompt for a "Someone is knocking ... from inside" line. Without one, the cause is an ask (PARSE-08, CARGO-10), not a knock.

## Check

Checked by Opus 5.5. Confirmed: the fault can happen as the code stands. But the round case given for it is wrong, and I rewrote it.

- The quotes are what the code says today. `brain.ts:615` keeps every knock heard in one slot per brain. `doorSought` (`cargo.ts:1375`) reads it for `DOOR_ASK_DS` (600 ds). It is cleared only at `cargo.ts:1970`, on this brain's own DOOR task, and nowhere else in cargo (`grep knockAt`: lines 975, 1404, 1970). `doorWanted`'s `lastOpened` guard is per technician (`lastOpened.get(brain.id)`), so it does not see the other's let-out. `stillInside` reads the shared `expected.ts` list, which `noteLetIn` puts back to `inside` with `at` set to the let-in time. Traced step by step, B's stale knock gives `{ name, room, out: true }` once A, who let them back in, is out of B's view. Without a re-entry it gives `SOMEONE_INSIDE` through the `closedRooms` branch. I added that second form.
- The round: Marshall never had the 01:43:36 knock. His LLM prompt at 01:44:25 (`crew_brain.log`) lists all nine pending events since 19:42:58. Nothing was dropped: `PENDING_MAX_LINES` is 30, `REPORT_MAX_LINES` is 10, and `brain.ts` skips no event before `pending.push`. None of them is a knock from inside. Only Reuben Shirey's log has that knock. Penelope's "Marshall, I'm stuck out here; could you open the door" (game.log 01:44:22) was taken as a let-out by `LET_OUT_WORDS`. Marshall's `duties` held only his own share ("Yours: the counter", with no "Tamika has ..."), so `roomsKeeper` was undefined and `doorIsMine` TRUE. `mayPass` then saw her standing in the Cargo Bay and let her out. That is PARSE-08 (confirmed).
- No round shows the stale knock itself, so confidence stays likely. Severity medium stands for when it happens: a janitor walked out mid-scrub. It is rarer than the old case made it look. Effort small: a stamp in `expected.ts` and one check in `doorSought`.
- Nothing in `LLM_CREW_CHANGELOG.md` covers a knock kept by the other technician. LOGB-04 is the Quartermaster's own knock and a different place (`quartermaster.ts`).

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: df6573e9963.

- LOGA-04: part done. A knock from inside is taken as from someone on the department's list only if they were let in before the knock. Anyone let in after it, on the list or seen, is not the knocker, and the 'someone inside' fallback is not used for a knock older than a later let-in. Look in jobs/cargo.ts, doorSought, the knock.inside branch. Left: expected.ts: noteLetOut(post, name, room, now) stamps lastLetOut[post + room] = now (a new exported getter, e.g. lastLetOutAt(post, room)); the cargo.ts caller passes brain.now. Then in cargo.ts doorSought, before the knock branch, drop brain.knockAt when lastLetOutAt(post, knock.room) > knock.at. That cargo.ts part is small and can come back to this group.

Round two (branch crew-bug-fixes-medium): 1c791a9952a. This finishes the parts left above, apart from any step that waits on the owner.
