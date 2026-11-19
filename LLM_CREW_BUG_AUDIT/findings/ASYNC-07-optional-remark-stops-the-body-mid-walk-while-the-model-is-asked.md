---
id: ASYNC-07
title: A remark the NPC may or may not make stops its body mid-walk, and holds back its next walk, for as long as the model takes to be asked
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:851, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:778, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1324, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:791, code/modules/llm_crew/crew_npc_doors.dm:14
fix: Do not send hold, and do not count the NPC as talking in drive, when all it is queued for is a remark of its own, and only stand still once the model has given a line to say
---

## What is wrong

Every minute or two (`REMARK_GAP_MIN_MS` 60 s plus up to 90 s), an NPC with someone in view is offered the chance to say something of its own accord. `passRemark` sets `remarkDue` and `wake`, and `ingest` then queues the NPC for the model exactly as if someone had spoken to it:

1. `stopToTalk` sends `hold` at once. On the server `tool_hold` calls `stand_still(CREW_NPC_TALK_HOLD)`: the body is given `TRAIT_AI_MOVEMENT_HALTED` and stops where it is for 4 seconds, in the middle of whatever walk or haul it is on.
2. While it is `queued` or `thinking`, `drive` counts it as being talked to (`brain.status !== 'idle'`), so any step that would take it somewhere is held back, for up to `TALK_HOLD_MAX_MS` (15 s).
3. When its turn comes, `think` sends `hold` again: another 4 seconds.
4. The remark is optional. The model is told it may say nothing, and a line that is filler or that it has said before is thrown away (`isFiller`, `saidBefore`). Often nothing is said at all, and the body stood still for nothing. A remark that comes to nothing is not counted against the next one either: `remarksUnanswered` goes up only when a `say` was sent (`brain.ts:1535`), so the limit of two unanswered remarks never stops these empty ones, and they come round every 60 to 150 seconds for as long as anyone liked is in view.

`passRemark` does not look at whether the body is busy: walking, hauling, on its way to a call. Anyone in view counts as company, including someone passing the other way in a hallway. So bodies on their way somewhere stop dead for a few seconds every minute or two, and a body hauling a crate stops with it. With a busy model (several NPCs queued, or one slow call), the hold on its next walk runs to the full 15 seconds.

Concrete case: a janitor called to a mess in the Bar is walking down the Central Primary Hallway, with an assistant walking the same way a few tiles behind. `nextRemarkAt` comes round. `passRemark`: someone in view, liked well enough, nothing said for 30 s: `remarkDue = true`, `wake = true`. `ingest`: `status = 'queued'`, `hold` sent, the janitor stops. The model is answering a technician for 6 seconds. The janitor's walk ends at a door; the next step (`go_to` the Bar) is a leaving step, and `talking` is TRUE, so `drive` returns null. At its turn `think` sends `hold` again. The model gives "Busy day, huh?", which `isFiller` drops. The janitor has stood about 10 seconds on the way to a call, and said nothing.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:851`, `passRemark`, which never asks whether the body is busy:

    if (
      now < brain.nextRemarkAt ||
      !brain.awake ||
      brain.wake ||
      brain.status !== 'idle' ||
      now - brain.lastSayAt < REMARK_QUIET_MS
    ) {
      return;
    }
    ...
    brain.remarkDue = true;
    brain.wake = true;

`brain.ts:778`, in `ingest`, the same for a remark as for being spoken to:

    if (brain.wake && brain.awake && brain.status === 'idle') {
      brain.status = 'queued';
      queue.push(brain.id);
      stopToTalk(brain);

`brain.ts:1324`, in `think`:

    // It may have waited its turn for the LLM a good while. It stands still from here until it has spoken.
    stopToTalk(brain);

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:791`, in `drive`:

    const talking =
      now - brain.lastSpokenToAt < TALK_PAUSE_MS ||
      brain.wake ||
      brain.status !== 'idle';

`code/modules/llm_crew/crew_npc_doors.dm:14`, `stand_still`, which halts movement:

    talk_hold_until = max(talk_hold_until, world.time + time)
    ADD_TRAIT(body, TRAIT_AI_MOVEMENT_HALTED, CREW_NPC_TALK_TRAIT)

## How it was found

Read from the code on both sides. Not timed in a round. `tool_hold` writes nothing to `game.log`, so the round logs do not show the stops; `crew_brain.log` shows the remark decisions, and those with no `say` in the reply are the stops that bought nothing.

## How to fix it

1. Work out "only a remark" when it is needed, not once at queue time: a speaker or a line to say can join while the NPC is already queued. Add a helper `remarkOnly(brain) = brain.remarkDue && brain.pendingSpeakers.size === 0 && brain.mustSay === null`.
2. In `ingest`, call `stopToTalk` on queueing only when `!remarkOnly(brain)`; and when a queued NPC that was only to remark gains a speaker or a `mustSay`, send `hold` then. In `think`, the `remark` const is already worked out just above, so `stopToTalk(brain)` becomes `if (!remark) stopToTalk(brain)`; the same at the re-queue at the end of `think`. A body that is going to make a remark stops when it has a line to make: `tool_say` on the server already calls `stand_still(CREW_NPC_TALK_PAUSE)` when it speaks (`crew_npc_tools.dm:170`), so nothing more is needed for the line to be said standing.
3. In `drive`, do not count a remark-only queue as talking: `brain.wake || brain.status !== 'idle'` becomes `(brain.wake || brain.status !== 'idle') && !remarkOnly(brain)`. While `think` runs, `remarkDue` has already been cleared; keep a `brain.remarking` flag set in `think` when `remark` is TRUE and cleared when the reply is done, and use it there too.
4. In `passRemark`, offer a remark only when the body is not on its way anywhere (`!brain.walking && !brain.lastAct`), or when it is working on the spot (`brain.doing`) beside its company. Passing someone in a hallway is not company to talk to. Which of these the owner wants is a question for the owner: chat while walking side by side is human too, but then it should not stop the walk.

None of this changes what is said or when someone who spoke to the NPC is answered.

## How to test the fix

- Simulator: an NPC walking a long route with a second person in view throughout. Count `hold` tool calls: before the fix about two per remark, after the fix none until a line is said.
- Type check from `tgui/`.
- Next round: watch a janitor walk the hallways with company; it should not stop unless it says something.

## Check

Checked by Opus 5.5, from the code. Confirmed.

- The quotes are what the code says today: `passRemark` (`brain.ts:851`), the queueing in `ingest` (`brain.ts:778`), `stopToTalk` in `think` (`brain.ts:1324`, and again at the re-queue at `:1640`), `talking` in `drive` (`driver.ts:791`), `stand_still` (`crew_npc_doors.dm:14`).
- Traced: `passRemark` checks only that the brain is idle, awake, not already woken and has not spoken for 30 s, then that someone liked is in view; nothing about walking, hauling or `lastAct`. `stopToTalk` always sends `hold` with the first person in view when there is no speaker. `tool_hold` calls `stand_still(CREW_NPC_TALK_HOLD)` (4 s) and adds `TRAIT_AI_MOVEMENT_HALTED`, with no check on what the body is doing; `keep_still` resets `consecutive_pathing_attempts` so the walk waits rather than failing. In `drive` the talking hold applies to leaving steps only, up to `TALK_HOLD_MAX_MS` (15 s), as written. In `think`, `remark` is set only when no speaker is waiting and no line is called for, and the prompt tells the model it may give null (`prompt.ts:90`).
- Added: an empty remark does not count towards `REMARKS_UNANSWERED_MAX`, so the stops keep coming.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers it.
- Mended the fix: a flag set once at queue time goes stale when someone speaks to the NPC while it waits, so the steps now work it out when needed and say where to send `hold` in that case. Step 4 stays a question for the owner. Severity medium and effort small stand.
