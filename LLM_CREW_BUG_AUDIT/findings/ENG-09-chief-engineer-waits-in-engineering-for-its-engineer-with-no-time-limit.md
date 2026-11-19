---
id: ENG-09
title: When an order will not go by PDA the Chief Engineer goes to Engineering and waits there for its engineer with no time limit, doing nothing else
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:413, tgui/packages/tgui/interfaces/CrewBrain/jobs/chiefengineer.ts:730, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:513
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

`jobs/chiefengineer.ts:730`, `afterActing`: one failure and the PDA is never tried for that order again.

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

1. Add `lookedAt?: number` to `ChiefWork['order']`. Set it when the Chief Engineer reaches `staffPost` and the engineer is not in sight (the first time the `wait` branch is returned).
2. After, say, 300 deciseconds of looking, set `order.sent = false` and `lookedAt = undefined`, so the PDA is tried again, and return a ready plan rather than a wait.
3. For the shut order, on the second time round with no engineer found, tell the Captain once: "I cannot reach Sam to switch the emitters off. The engine is still firing." That is what a person can act on.
4. While waiting, let the wait be broken by the door-forcing work and anything else ready: make the plan `wait: false` (not ready, no hold) once it has waited its time.

## How to test the fix

- `tools/llm_crew/engine.ts`: a Chief Engineer with a shut order whose PDA send failed, at Engineering with no engineer in view, advanced 30 seconds: its next step must be the PDA again.
- Simulator: make the sim's PDA refuse messages for two minutes during the shut-off scenario, with the engineer away from Engineering. The Captain must be told within a few minutes, and the emitters must go off when the PDA works again.
