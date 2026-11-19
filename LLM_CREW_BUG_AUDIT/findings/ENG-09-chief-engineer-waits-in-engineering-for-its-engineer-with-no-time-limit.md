---
id: ENG-09
title: When an order will not go by PDA the Chief Engineer goes to Engineering and waits there for its engineer with no time limit, doing nothing else
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:421, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:732, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:513
fix: Give the look-for-the-engineer wait a time limit, after which the order is sent by PDA again and, for the shut order, the Captain is told the engineer cannot be reached
---

## What is wrong

`giveStep` gives an order to the engineer to its face if it is in sight, and by PDA if not. If the PDA message fails, `afterActing` sets `order.sent = true` and the next plan is to walk to Engineering ("You cannot reach Sam by PDA, so you are going to the Engineering to find them"). Once there, with the engineer not in sight, the plan is:

    return {
      ready: false,
      wait: true,
      step: `${why} You are looking for ${name}.`,
    };

There is no time limit and nothing ever sets `order.sent` back. The driver treats a not-ready `wait` on a task that is not routine as "stay and wait": when it is the first work in order, nothing else is done (`if (!plan.ready && plan.wait && task.urgency !== 'routine') { if (ready.length === 0) { ... return null; } break; }`). The shut order is an emergency and always first. So the Chief Engineer stands in Engineering for as long as its engineer is out of sight, doing none of its other work: no door jobs for security, no batteries, no going back to its office. Its meeting is held off too (`syncMeeting(brain, ENGINE_WAY, chief.order?.what === 'shut')`). The light and relight orders are `'asked'` and hold everything below them the same way when nothing more urgent is ready.

Nobody is told. The Captain was told "I am having the emitters switched off" and hears no more.

When a PDA message fails the server keeps it and tries it again every 20 seconds (`resend_unsent` in `crew_npc_cargo.dm`), but drops one with " now" in it after 90 seconds (`CREW_NPC_UNSENT_NOW_KEPT`). "Emitters off, now." and "Light it now, please." both say "now". So in a network outage over 90 seconds the order is gone on the server and the brain is waiting in Engineering.

The engineer comes back to Engineering in the end only if it can: it is its post. If it is dead, in a cell, shut in a room, or a player (ENG-03), it does not.

One case: a communications blackout (the event seen in the 15:09 round) begins. Integrity falls under 95. The engineer is in the Bar forcing a door for security. The Chief Engineer is in its office. `giveStep` sends the shut order by PDA: it fails. `order.sent = true`. It walks to Engineering. The engineer is not there. The Chief Engineer waits. The blackout ends after five minutes; the server gave up on "Emitters off, now." at 90 seconds. The engineer, its door done, does its rounds of the department (`syncRounds`) and may pass through Engineering, or may not. Until it does, the Chief Engineer stands still and the emitters fire.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:406`, `giveStep`:

    if (brain.hasPda && !order.sent) {
      return {
        ready: true,
        step: `${why} ${name} is not in sight, so you are sending it by PDA: "${line}"`,
        act: { tool: 'message', person: name, text: line },
      };
    }
    // No PDA, or the message would not send. It goes to where its staff work to find them.
    if (brain.staffPost && brain.location !== brain.staffPost) {
      ...
    }
    return {
      ready: false,
      wait: true,
      step: `${why} You are looking for ${name}.`,
    };

`jobs/chiefengineer.ts:730` (the `sent` line is :732), `afterActing`: one failure and the PDA is never tried for that order again.

    if (act.tool === 'message') {
      if (!ok) {
        chief.order.sent = true;
        return;
      }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:513`: a waiting task that is first holds everything.

    if (!plan.ready && plan.wait && task.urgency !== 'routine') {
      if (ready.length === 0) {
        ...
        return null;
      }
      break;
    }

## How it was found

Read from the code, with the server's resend rule read in `crew_npc_cargo.dm`. Not seen in a round.

## How to fix it

1. Add `lookedAt?: number` to `ChiefWork['order']` (`types.ts`, near line 680). Set it when the Chief Engineer is at `staffPost` and the engineer is not in sight (the first time the `wait` branch is returned). This is the same shape the engineer already uses to find the Chief Engineer: `soughtAt` and `SOUGHT_DS` in `tellChief`, `engineer.ts:315` to `:323`, which waits 20 seconds at its post and then goes by PDA. Copy that.
2. After, say, 300 deciseconds of looking, set `order.sent = false` and `lookedAt = undefined`, so the PDA is tried again, and return a ready plan rather than a wait.
3. For the shut order, on the second time round with no engineer found, tell the Captain once: "I cannot reach Sam to switch the emitters off. The engine is still firing." That is what a person can act on.
4. While waiting after that, let the wait be broken by the door-forcing work and anything else ready: return the plan without `wait` (not ready, no hold) once it has waited its time, so the driver's loop at `driver.ts:513` skips it instead of holding. The PDA retry of step 2 still comes round each time the wait runs out.
5. During a long blackout this tries the PDA every 30 seconds or so. Each failed try is kept by the server only once (`already_kept` in `tool_message`), so it adds no spam, and once the server has dropped a " now" line after 90 seconds the next try keeps it again.

The Head of Security's warrant hand-off has the same wait with no limit (`giveStep` in `jobs/desk.ts`, "You are looking for X to give it to"); whoever fixes this should look at that one too, and check whether another finding already covers it.

## How to test the fix

- `tools/llm_crew/engine.ts`: a Chief Engineer with a shut order whose PDA send failed, at Engineering with no engineer in view, advanced 30 seconds: its next step must be the PDA again.
- Same, advanced past the wait with a forcing job open: the forcing step must be chosen, not `null`.
- Type check.
- Simulator: make the sim's PDA refuse messages for two minutes during the shut-off scenario, with the engineer away from Engineering. The Captain must be told within a few minutes, and the emitters must go off when the PDA works again.

## Check

Checked by Opus 5.5 on 2026-11-19. The quotes match the code; the line numbers have moved a little (the wait is returned at `chiefengineer.ts:421` to `:425`, `order.sent = true` is at `:732`). Traced it: `giveStep` falls to the PDA only while `!order.sent`; `afterActing` sets `sent` on a failed message and returns, and nothing but a new `chief.order` object (from `syncTasks` when `order` is null, or `lightAgain`) clears it. For the shut order, `chief.order` is cleared only by `OFF_WORDS` from the engineer, by a said or sent `SHUT_WORDS` line (`afterSaying`, `afterActing` on success), or by no engineer aboard; the `SHUT_AGAIN_DS` repeat needs `!chief.order` and `shutGivenAt` set, so it never fires here. In the driver (`driver.ts:513` to `:534`) a not-ready `wait` plan on a non-routine task holds everything after it, and returns `null` if nothing before it was ready; `workInOrder` sorts emergency first (`tasks.ts:349`), so the shut order holds all its other work. Meetings are held off by `syncMeeting(brain, ENGINE_WAY, chief.order?.what === 'shut')`. Read the server's resend (`resend_unsent`, `crew_npc_cargo.dm:755`): a line with " now" in it is given up after `CREW_NPC_UNSENT_NOW_KEPT`, 90 seconds, and both "Emitters off, now." and "Light it now, please." have it. Queued `toTell` lines are still sent while it waits, since the driver takes them before the work list. Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers a time limit on this wait. Not a duplicate of ENG-03 (which engineer is picked) or ARR-05 (the officer's word to its head). Severity medium and effort small stand. Not run.
