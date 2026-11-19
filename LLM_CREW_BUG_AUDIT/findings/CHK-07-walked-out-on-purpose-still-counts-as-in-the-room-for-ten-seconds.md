---
id: CHK-07
title: A body that walks out of a room on purpose still counts as in it for ten seconds, so a Quartermaster in its office calls its meeting by PDA as if it stood in the bay
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:420, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:285, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:731, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:800, tools/llm_crew/sim.ts:1570
fix: Record leftPlace in ingest only when the body was not walking and brain.lastAct holds no walk the driver sent (any tool outside STAYS but step_aside), so stillIn means pushed out and not walked out
---

## What is wrong

See also: LOGA-06, which found the same 10 seconds letting a Quartermaster begin a meeting from the Cargo Lobby. This finding gives the cause in `ingest`, a second way it goes wrong (a meeting called by PDA from the wrong room), and a repeatable simulator case.

`stillIn(brain, place)` is meant for a body "pushed a tile out of a room" that "is back in it the next second". It is true for 10 seconds (`NUDGED_OUT_MS`) after the body is last seen in `place`. But `ingest` sets `leftPlace` on **every** change of room, including a walk the body was sent on. So for ten seconds after it walks out of a room on purpose, every check that uses `stillIn` thinks it is still there.

`meetStep` uses it, through `inPlace`, to decide that the head is in its meeting room and may call its staff. For a meeting called aloud (the Quartermaster's, the Chief Engineer's, the Head of Security's), the next branch finds none of the staff in sight, because the head is in another room, and sends the call by PDA instead: "None of those left to call is in sight. A voice will not reach them, so the call goes by PDA". The step it gives says nothing about where it is.

The concrete case, repeatable with a seed (see How it was found). A Quartermaster gives Cora an order face to face in the Cargo Bay, walks back to its office, sends the Captain "I am holding a staff meeting in the Cargo Bay now", and then:

    00:17:21 Ada Finch: ROUTINE (no LLM) in Quartermaster's Office, holding nothing: It is time for a staff meeting, and Cora Tech is not in sight to be called to it. You are sending Cora Tech a PDA message to come to the Cargo Bay.  ->  message("Cora Tech", "Staff meeting in the Cargo Bay now, please. Send word that you ar...
    00:17:26 Ada Finch: ROUTINE (no LLM) in Quartermaster's Office, holding nothing: You have called your staff to a meeting in the Cargo Bay, and are going there.  ->  go_to("Cargo Bay")

At 00:17:21 it is in its office, about eight seconds after leaving the bay, so `stillIn(brain, 'Cargo Bay')` is true and it gets past `if (!inPlace(brain, meeting))`. Five seconds later the ten seconds are up and it sets off for the bay it had just "called" from. Cora had been standing in the bay the whole time and would have been called aloud a few seconds later. The plan says nothing passes between a Quartermaster and its technicians by PDA (`jobs/head.ts:481`, and the simulator's check). In a round where PDAs have gone down (see the note in the change log about PDAs stopping about 26 minutes in) the call reaches nobody.

The same window opens wherever `stillIn` is read: `syncMeeting` (`inRoom` at `head.ts:575`) may begin or close a meeting with the head outside the room, which is what LOGA-06 saw in a round, and `atMeeting` / `inMeeting` in `meetings.ts:145` and `:172` keep a member of staff "at the meeting" for ten seconds after it walks off.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:414`, in `ingest`, for every change of room:

    if (brain.location !== npc.location) {
      brain.inPlaceSince = now;
      brain.outAsks = null;
      brain.cameFrom = brain.location || brain.cameFrom;
      // Where it was a moment ago, and when it left. Someone pushed a tile out of a room has not left it.
      if (brain.location) {
        brain.leftPlace = { place: brain.location, at: Date.now() };
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:277`:

    const NUDGED_OUT_MS = 10000;
    ...
    export function stillIn(brain: NpcBrain, place: string): boolean {
      return (
        brain.location === place ||
        (brain.leftPlace?.place === place &&
          Date.now() - brain.leftPlace.at < NUDGED_OUT_MS)
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:351` and `:731`, in `meetStep`:

    function inPlace(brain: NpcBrain, meeting: Meeting): boolean {
      return stillIn(brain, meeting.room) || !!meeting.fromHere;
    }
    ...
      if (!inPlace(brain, meeting)) {
        return { ready: true, step: `You have called your staff to a meeting in the ${room}, and are going there.`, act: { tool: 'go_to', place: room } };
      }

and `:798`, the branch it then reaches:

    // None of those left to call is in sight. A voice will not reach them, so the call goes by
    // PDA, as a head whose staff are spread about the station sends it.
    const absent = uncalled[0];
    if (brain.hasPda) {

## How it was found

The simulator was run in dead mode for every scenario, once each: 46 of 47 passed, and `dead qmpaper` failed two checks:

    FAIL nothing passes between the Quartermaster and its technicians by PDA
    FAIL first thing in the shift, the Quartermaster calls its technicians together aloud, in the bay where they work  never called

To repeat it, `Math.random` was replaced by a seeded one with a preload file kept outside the repo (a 9-line mulberry32 that reads `SEED`; the earlier CHK reviewer wrote it). The same seed gives the same run, byte for byte (checked by running seed 1 twice and diffing). Over seeds 1 to 16, `dead qmpaper` fails on seed 5 only; quiet `qmpaper` passed 3 runs of 3 in the first pass. The trace above is from

    SEED=5 TRACE=Ada tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe --preload <temp>/seed.ts tools/llm_crew/sim.ts dead qmpaper

The cause was then read in `ingest`, `stillIn` and `meetStep`: at 00:17:21 the body is in the Quartermaster's Office, `meeting.fromHere` is not set (no looped walk), so the only way past `inPlace` is `leftPlace`. Not seen in a round as such; LOGA-06 shows the same window at work in `round-20.00.21`.

## How to fix it

1. In `ingest` (`brain.ts:419`), record `leftPlace` only when the body was **not** on a walk of its own. Two signs, either is enough to skip it:
   - `brain.walking` as it stood before this update (it is overwritten at line 436, after this block, so at line 419 it still holds the last value). Note that the server leaves its own walk back to the post out of this flag (`crew_brain_link.dm:195`, `npc.walk_tool != CREW_TOOL_RETURN`), and neither sign below catches that walk, as the server starts it; it is short and seldom crosses a room's edge (see Check);
   - a walk the driver sent and has not yet heard the end of. This is already kept: `brain.lastAct` is set when the driver sends a step (`driver.ts:825`) and cleared when its result comes back or after `LOST_ACT_MS` (`driver.ts:1035`, `:672`). A walk is any tool not in `STAYS` (`driver.ts:68`). Export `STAYS` (or a small `isWalk(tool)`) from `driver.ts`, which `brain.ts` already imports from, and in `ingest` write `if (brain.location && !brain.walking && !(brain.lastAct && isWalk(brain.lastAct.act.tool) && brain.lastAct.act.tool !== 'step_aside'))`. No new field is needed.
   - Keep recording `leftPlace` for `step_aside`: a body stepping clear of a doorway at a meeting may cross the room's edge for a moment, and that is the case `stillIn` was built for (commit 0e3ef1d6).
2. If a new field is added after all, add it to the blank brain in `ingest` and to `tools/llm_crew/fixtures.ts` (see CHK-01: the fixture brain is built by hand).
3. Leave `NUDGED_OUT_MS` and `stillIn` as they are: what they are for (a body bumped out of the doorway by someone walking past) still works.
4. Check the LOGA-06 case after the change: a Quartermaster that walks out into the lobby to call a technician must no longer count as in the Cargo Bay. Whether it should call from the lobby at all is LOGA-06's question.

## How to test the fix

- `SEED=5 ... sim.ts dead qmpaper` with the preload above: all passed, and the Quartermaster's trace shows it walking to the Cargo Bay before any call. Then seeds 1 to 16 again.
- `quiet doorway` and `quiet headdoor`: these push a body out of the meeting room into the doorway, which is what `stillIn` is for. Both must still pass.
- `quiet qm`, `quiet engine`, `quiet warrant`, `quiet crew` for the other meetings.
- In a round: grep `crew_brain.log` for "is not in sight to be called to it" and check that the record's room is the meeting room.

## Check

Checked by Opus 5.5 on 2026-11-19. Confirmed.

- The quotes are what the code says today: `ingest` sets `leftPlace` on every change of room (`brain.ts:414` to `:422`), before `brain.walking` is overwritten (`:436`); `stillIn` and `NUDGED_OUT_MS` at `tasks.ts:277` to `:291`; `inPlace` at `head.ts:351`; the `go_to` branch at `head.ts:731`, the PDA branch at `head.ts:798`; `syncMeeting`'s `inRoom` at `head.ts:575`; `meetings.ts:145` and `:172`.
- `leftPlace` was added in commit 0e3ef1d6 ("nobody gets stuck in a doorway at a staff meeting") for a push out of the room. Nothing in the change log or the plans says a walk out was meant to count, and no later entry touches it.
- Ran the simulator alone, `dead qmpaper`, with a seeded `Math.random` (mulberry32, my own preload outside the repo, so the seeds do not give the finder's runs). Seeds 2, 4 and 5 all show the fault: at 00:17:21 to 00:17:23 the Quartermaster is "in Quartermaster's Office" and is given "You are in the Cargo Bay for your staff meeting, and are going to stand in the middle of it" (the `calledIn` branch after `inPlace`). In my runs that walk to the middle happened to put it right, and all checks passed (seeds 1 to 5). The finder's PDA call is the same cause reaching the next branch, when the walk to the middle is not offered (`wentIn` or `triedMiddle` set). Both are the head treated as in a room it walked out of seconds before.
- Fix judged: the cause is in `ingest`, and the driver already keeps the walk it sent in `brain.lastAct`, so the finder's new `walkSent` field is not needed. The server leaves its own walk back to the post out of `walking` (`crew_brain_link.dm:195`), and that walk is started by the server, not the driver (`crew_npc_cargo.dm:241`, `crew_npc_doors.dm:793`), so `lastAct` does not cover it either. It matters little: the cargo one only runs when the body is already in its post's area (`crew_npc_cargo.dm:237`), and the one after opening a door is a few tiles. If it is wanted, have the server send `walking` true for it as well and leave the brain's other users of `walking` to be checked. A body bumped out of the doorway while it is itself mid-walk will no longer count as still in; that is rare, and the head then just walks back in. Severity medium is right: the meeting still happens, a little late or by PDA. Effort small.
