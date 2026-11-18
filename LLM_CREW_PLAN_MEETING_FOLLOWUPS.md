# Crew NPC plan: staff meeting follow-ups

Written 2026-11-17 from the round logged at `data/logs/2026/11/18/round-22.29.47`, the first one played with the new staff meeting (commit `ee409a95`). **Planning only: nothing here is built.** The project owner asked for everything in sections 2 and 3 to be on this plan. The details of how are mine.

## Status, 2026-11-18

Sections 2 and 3 were built on top of the secure-areas commit (`44828dae`). A first build of them was played once, in `data/logs/2026/11/18/round-00.41.37`: the meeting ran from the call to the closing line and the Captain's report, with three reports and a correct total. That round showed two faults, which were fixed afterwards and have **not been played**:

- The server counted a walk as arrived two tiles short of its spot, so bodies still stopped beside the door, and a step aside of a tile or two was reported done without the body moving. One janitor was told to step clear eight times.
- A janitor called on while still walking in answered its head with small talk before giving its report.

Seen in that round and left alone: the head telling waiting staff, and the Captain, to get back to work (a line was added to what the head is told; untried on the model), and a janitor waiting over a minute to be let out of the Cargo Bay (secure-areas work).

- **Section 2, all eight items: built.** One is narrower than written. Item 3 ("nobody waits in a doorway") is asked for by each wait that wants it (`Plan.inside`), and only the meeting waits ask, because some waits are at a door on purpose: a janitor waiting to be let in, a body that is shut in. The server half does cover every job: no body is sent to a spot beside a door.
- **A likely cause was found on the server.** The spot a room is known by was the nearest free tile, which is the one just inside the door (`safe_spot_in`, `note_place`). That is changed. What pushed the janitor out each time is still not proven.
- **Untrue talk: built.** Not tried on the real model.
- **Mixed order: 10 runs, 10 passed.** The earlier failure did not come back, so nothing was changed.
- **The remark on the real model: not done.** It needs the graphics card with no round running.
- **Checks:** type check clean; server compile 0 errors, 0 warnings; simulator `doorway` and `headdoor` 4 of 4 each, the main set 16 of 16.
- **Two secure-areas scenarios fail about as often with these changes as without them:** `nested` (3 of 7 with, 3 of 6 on a clean copy of `44828dae`) and `aside` (2 of 7 with, 2 of 6 without). They are not part of this work.

What follows is the plan as it was written before the work.

**Do not start until the secure-areas work is committed.** It is being built in the same working tree and the same files. The first step is a simulator run on that commit, before anything is changed.

## 1. What went wrong in the round

- The call, the three "On my way" replies and the Captain's copy all worked. All three janitors set off within seconds.
- One janitor (Uriel) reached the Bar Lounge in 21 seconds and never counted as there. The server told him "You arrive in Bar Lounge", his own state said he was back in the Central Primary Hallway about three seconds later, and his brain sent the walk again. That happened 11 times. The project owner saw him standing in the doorway the whole time, with the bar's monkey jumping about.
- Because every walk "succeeded", nothing gave up: no back-off, no report by PDA.
- The head only counts staff standing inside the room, so he waited for someone who was in front of him.
- The monkey threw a potted plant at the head, who caught it. That is fixed in `ee409a95`: a body puts down anything that hides who it is, and reads its job from its own ID.
- Two janitors said they were scrubbing dirt while they waited. They were standing still.

Known about the doorway, from the code:

- The server only reports arrival when the body is standing in the room.
- "You are already in" is answered from the place the body last noted, not from where it stands at that instant (`crew_npc_tools.dm`, `tool_go_to`).
- The spot a body remembers a room by is the first tile it stood on in it: the edge.

Not known: what moved him back out each time. No brain step did. Several bodies making for the same edge tile, and the monkey, are the likely causes, not proven ones.

## 2. Nobody gets stuck on the threshold

The head walks to the room the same way a janitor does, so he can fall into the same loop and never start the meeting. These apply to the head and the staff alike.

1. **A proper place to stand.** The server already picks the meeting room for the head. It also picks a spot well inside it, clear of the doors, with the finder it already uses for setting crates down. The head stands there.
2. **Staff walk up to the head.** Once a janitor can see its head, it walks to the head, not to the room. That ends inside the room, away from the edge.
3. **Nobody waits in a doorway.** Any body whose next step is to wait, and which is within a tile of a door, steps inside first. This is for every job, not only meetings.
4. **A nudge does not restart the walk.** Once a body has been in the room, being bumped a tile out changes nothing. It walks back only if it has been outside for about ten seconds.
5. **Told it has arrived, it has.** A janitor told it has arrived, with its head in view, counts itself at the meeting even with its feet over the line. It can hear being called on from there.
6. **The head counts who it can see.** Staff who said they were coming and are in the head's view count as present, whichever side of the room's boundary they stand on.
7. **A loop guard in the driver.** If the same step succeeds three times running and nothing has changed, the driver treats it as not working: it backs off, and a meeting carries on from where the body stands. This is the safety net for causes not yet found.
8. **"Already there" is checked against where the body stands**, not against the place it last noted.

Simulator: a scenario where the fake server bumps a body back out of the room after every arrival. The walk is sent no more than three times, and the meeting is still held.

## 3. Smaller things

| Item | What to do | Size |
|---|---|---|
| Untrue talk while waiting | At a meeting, leave out the "there is a mess here, it is yours to clean" hint, and tell the LLM it is at a meeting and not cleaning | Small |
| Mixed order: one run in four ended with a PDA notice unsent, and one run gave no output | Rerun the `mixed` scenario ten times with step logs and find the cause before changing anything | Small to find; fix unknown |
| The remark on the real model | Add the word-for-word moment to `tools/llm_crew/voice.ts`: three personalities, a report line and the closing line. Measure how often a remark survives the filter | About five minutes of the graphics card, with no round running |
| The second half of the meeting has not been played | Nothing to build. After the next round, read the logs for the call-ons, the reports against the server's counts, the closing line and the Captain's message | A round |

## 4. Order

1. Simulator run on the secure-areas commit.
2. Section 2, items 7, 5, 6, 4 and 2: these are in the brain window's code and can be checked in the simulator at once.
3. Section 2, items 1, 3 and 8: these are in the server, and want a compile and then a round.
4. The untrue-talk fix.
5. The mixed-order reruns.
6. The model test, when the graphics card is free.
7. Then the light replacer: `LLM_CREW_PLAN_LIGHTS.md`.

## 5. Not in this plan

- Finding what moved the janitor out of the room. Section 2 is written to hold whatever it was.
- Anything in the secure-areas plan: being shut in, being let out, hauling lanes, patrols.
