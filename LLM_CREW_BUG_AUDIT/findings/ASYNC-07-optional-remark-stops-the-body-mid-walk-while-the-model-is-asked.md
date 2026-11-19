---
id: ASYNC-07
title: A remark the NPC may or may not make stops its body mid-walk, and holds back its next walk, for as long as the model takes to be asked
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:851, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:778, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1324, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:791, code/modules/llm_crew/crew_npc_doors.dm:14
fix: Do not send hold, and do not count the NPC as talking in drive, when all it is queued for is a remark of its own, and only stand still once the model has given a line to say
---

## What is wrong

Every minute or two (`REMARK_GAP_MIN_MS` 60 s plus up to 90 s), an NPC with someone in view is offered the chance to say something of its own accord. `passRemark` sets `remarkDue` and `wake`, and `ingest` then queues the NPC for the model exactly as if someone had spoken to it:

1. `stopToTalk` sends `hold` at once. On the server `tool_hold` calls `stand_still(CREW_NPC_TALK_HOLD)`: the body is given `TRAIT_AI_MOVEMENT_HALTED` and stops where it is for 4 seconds, in the middle of whatever walk or haul it is on.
2. While it is `queued` or `thinking`, `drive` counts it as being talked to (`brain.status !== 'idle'`), so any step that would take it somewhere is held back, for up to `TALK_HOLD_MAX_MS` (15 s).
3. When its turn comes, `think` sends `hold` again: another 4 seconds.
4. The remark is optional. The model is told it may say nothing, and a line that is filler or that it has said before is thrown away (`isFiller`, `saidBefore`). Often nothing is said at all, and the body stood still for nothing.

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

1. Keep a flag on the brain for why it is queued: in `ingest`, `brain.queuedFor = brain.remarkDue && brain.pendingSpeakers.size === 0 && brain.mustSay === null ? 'remark' : 'talk'`.
2. In `ingest` and at the start of `think`, call `stopToTalk` only when `queuedFor` is `'talk'`. A body that is going to make a remark stops when it has a line to make: `tool_say` on the server already calls `stand_still(CREW_NPC_TALK_PAUSE)` when it speaks, so nothing more is needed for the line to be said standing.
3. In `drive`, do not count a remark-only queue as talking: `brain.wake || brain.status !== 'idle'` becomes `(brain.wake || brain.status !== 'idle') && brain.queuedFor !== 'remark'`.
4. In `passRemark`, offer a remark only when the body is not on its way anywhere (`!brain.walking && !brain.lastAct`), or when it is working on the spot (`brain.doing`) beside its company. Passing someone in a hallway is not company to talk to. Which of these the owner wants is a question for the owner: chat while walking side by side is human too, but then it should not stop the walk.

None of this changes what is said or when someone who spoke to the NPC is answered.

## How to test the fix

- Simulator: an NPC walking a long route with a second person in view throughout. Count `hold` tool calls: before the fix about two per remark, after the fix none until a line is said.
- Type check from `tgui/`.
- Next round: watch a janitor walk the hallways with company; it should not stop unless it says something.
