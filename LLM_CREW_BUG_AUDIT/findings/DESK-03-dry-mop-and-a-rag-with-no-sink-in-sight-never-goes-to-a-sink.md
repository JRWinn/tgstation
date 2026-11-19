---
id: DESK-03
title: A janitor with a dry mop and a rag and no sink in sight never goes to a sink, and every mess task is stuck on wetting it here
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:565, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:269, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:500, code/modules/llm_crew/crew_brain_link.dm:113, code/modules/llm_crew/crew_npc_cleaning.dm:31
fix: In plan, take the mopNeedsWater step only when brain.sinkInView, and with no water in sight send a dry mop to a known sink room as supplyStep does, before going to a mess elsewhere
---

## What is wrong

The window has two answers to a dry mop, and with a rag in the other hand neither is reached:

- `supplyStep` walks a janitor with a dry mop to a room it knows has a sink (`brain.dryMop`). It only runs for the SUPPLIES task, and that task is closed while the janitor is not short of a tool (`lacksTool`). With a rag in hand, `cleaning_tool` is "rag", and `has_poor_tool` is FALSE on purpose while a mop is dry (the 16:00-ish fix, change log "(16) A dry mop is not only a rag"). So `lacksTool` is FALSE, the SUPPLIES task is finished, and `supplyStep` never runs.
- The CLEAN task's `plan` checks `brain.mopNeedsWater` before anything else. The server sends that TRUE for any dry mop with no proper tool, "whether or not there is a sink in sight" (crew_brain_link.dm:112). The step says "Your mop is dry and there is a sink right here" and sends `clean`.

Server side, `tool_clean` finds no water, and since a rag is held it goes on to clean what the rag will shift in the room the body is standing in. If the mess task is for another room, there is usually nothing here: it fails with "There is no mess here that your rag will shift", the step is backed off, and the next plan for that task is the same `clean`. The `go_to` the mess is never reached, because the `mopNeedsWater` branch comes first for every CLEAN task. Every mess task it has is stuck the same way, so it idles (explore or search) until it happens to see a sink.

Concrete case. A janitor holds a mop and a rag, as the change log entry above saw in a round. The mop runs dry in Arrivals, away from any sink. It knows of a mess in the Bar and a sink in the Custodial Closet.

1. `syncTasks`: `cleaningTool = 'damp rag'`, `poorTool = false`, so the SUPPLIES task is closed.
2. `plan` for the Bar task: `mopNeedsWater` is TRUE, `waterFrom` is null, so "Your mop is dry and there is a sink right here. You are wetting it before you set off for the mess in Bar." `act: clean`.
3. `tool_clean`: no water, rag held, no mess in Arrivals the rag will shift: fails. The step key is backed off.
4. Next time round, the same step. The janitor never goes to the Bar, and never goes to the Custodial Closet sink.

The log also says a sink is right here when there is none, which misleads whoever reads `crew_brain_link` output.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:565`, in `plan`:

    if (brain.mopNeedsWater) {
      const water = brain.waterFrom ?? 'sink';
      const from = /^bucket$/i.test(water)
        ? 'you have water in your bucket'
        : `there is a ${water} right here`;
      return {
        ready: true,
        ...
        act: { tool: 'clean' },
      };
    }

`janitor.ts:269`, the only walk to a sink, inside `supplyStep`:

    if (brain.dryMop) {
      const sinkRoom = [...brain.places.entries()].find(
        ([name, place]) =>
          name !== brain.location &&
          [...place.things.keys()].some((thing) => /sink/i.test(thing)),
      )?.[0];

`janitor.ts:500`, the SUPPLIES task closed when not short of a tool:

    if (!lacksTool(brain)) {
      if (supplies) {
        finishTask(brain, supplies);
      }
      return;
    }

`code/modules/llm_crew/crew_brain_link.dm:113`:

    // Holding a mop with no water on it and nothing else that cleans, whether or not there is a sink in sight.
    "mop_needs_water" = !isnull(npc.dry_mop()) && isnull(npc.proper_tool()),

`code/modules/llm_crew/crew_npc_cleaning.dm:31`, `has_poor_tool`:

    return istype(working_tool(), /obj/item/rag) && isnull(dry_mop())

`code/modules/llm_crew/crew_npc_cleaning.dm:438`, `tool_clean` with no water and a rag: goes on to the rag.

## How it was found

Read from the code on both sides, and the window side run in a throwaway bun script in the system temp folder: a janitor in Arrivals holding a dry mop and a damp rag, `mopNeedsWater` TRUE, `sinkInView` FALSE, a mess known in the Bar and a sink remembered in the Custodial Closet. The only open task, and its step:

    clean Bar | Your mop is dry and there is a sink right here. You are wetting it before you set off for the mess in Bar. {"tool":"clean"}

No SUPPLIES task is open. The server's answer to that `clean` was not run. The mop-and-rag hold was seen in a round (change log, "(16) A dry mop is not only a rag"); the stuck step that follows was not looked for in a log.

## How to fix it

1. Move the sink walk out of `supplyStep` into a helper, say `waterStep(brain): Plan | null`, that returns the go-to-sink or explore step when the mop is dry and no water is in sight (`brain.mopNeedsWater && !brain.sinkInView`).
2. In `plan`, keep the `mopNeedsWater` wetting step but only when `brain.sinkInView` is TRUE.
3. After it, when `waterStep` gives a step and the mess is not in the room it stands in, return that step: wet the mop first, as a person would before walking to the mess. When the mess is in the room it stands in, let it fall through to the clean with the rag (the server will use the rag).
4. Keep `supplyStep` calling the same helper for a janitor with a dry mop and nothing else.
5. Owner question: with a rag and a dry mop, should the janitor go to a mess elsewhere with the rag and wet the mop later, or wet the mop first? Step 3 proposes the second, since a rag shifts little.

## How to test the fix

- Simulator: a janitor holding a dry mop and a rag, no sink in view, a mess known in another room and a sink known in a third. It must walk to the sink room first, then to the mess. Before the fix it sends `clean` where it stands.
- Type check from `tgui/`.
- Next round: grep `crew_brain_link` steps in `crew_brain.log` for "there is a sink right here" and check `game.log` shows a sink by the body at that time.
