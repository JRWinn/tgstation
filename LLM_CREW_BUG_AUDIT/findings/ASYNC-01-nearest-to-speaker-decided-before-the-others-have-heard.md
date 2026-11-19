---
id: ASYNC-01
title: Who is nearest a line put to several is decided before the others have heard it, so two NPCs often both answer
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:981, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:602, code/modules/llm_crew/crew_brain_link.dm:55, code/controllers/subsystem/tgui.dm:226, code/modules/llm_crew/crew_npc_senses.dm:442
fix: Decide nearest on the server for the hearers of one line, or have the window hold a group line a second and decide once every hearer's event is in
---

## What is wrong

A line put to several people ("can either of you give me a hand?") is meant to be answered by one crew member: the nearest of those that heard it (rule 3 in `addressing.ts`, and the comment in `shouldWake`: "Without this a roomful of NPCs never stops talking, and answers for each other"). `nearestToSpeaker` works that out by looking for the same line among the other NPCs' events **in the same update from the server**.

But the server sends a separate update for each NPC as it hears the line, and the update for the first hearer is built before the second has heard anything. So the first NPC to be told always finds nobody else who heard it, and takes itself to be the nearest. When the second NPC's update comes, the first one's event is there, the distances are compared properly, and if the second is the nearer it also takes itself to be the nearest. Both are woken and both answer.

Which NPC the server tells first is the order the hearing signal reaches them in, which has nothing to do with distance. With two NPCs in the room, about half the group lines are answered twice.

Concrete case: the Captain stands in the cargo bay between technician A (5 tiles away) and technician B (1 tile away) and says "Can one of you order me a medical crate?".

1. `say()` reaches A first. A's `on_pre_hear` calls `emit_sense`, which calls `brain_link.on_sense_event`, which calls `SStgui.update_uis`, which runs `ui.process` at once by `INVOKE_ASYNC`. `ui_data` is built now: A's events hold the line, B's do not yet.
2. The window gets update 1. In `ingest`, for A, `saidTo` gives `group`; `nearestToSpeaker(A)` looks through B's events, finds no matching line, `continue`s, and returns TRUE. A's `shouldWake` returns TRUE: A is queued to answer.
3. B hears the line; update 2 is sent. For B, `nearestToSpeaker(B)` finds the line in A's events (A's whole history of 30 events is sent each time), A's distance 5 is not less than B's 1, so it returns TRUE. B is woken too.
4. Both say yes, and both cargo jobs' `agrees` take the order. What the code was written to stop happens.

The case only goes right when the server happens to tell the nearer NPC first. If the window is slow enough to fold two updates into one render (React may batch them), the second update has both events and the answer is right: so how often it happens depends on timing, which is the fault.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:981`, `nearestToSpeaker`:

    for (const other of npcs) {
      if (other.id === npc.id) {
        continue;
      }
      const same = other.events.find(
        (heard) =>
          heard.kind === 'speech_heard' &&
          heard.details.speaker === event.details.speaker &&
          heard.details.message === event.details.message &&
          Math.abs(heard.at - event.at) <= SAME_LINE_DS,
      );
      if (!same) {
        continue;
      }

`brain.ts:602`, where it is worked out once and never again:

    if (event.kind === 'speech_heard' && event.details.source === 'person') {
      ...
      event.details.nearest_bot = nearestToSpeaker(npc, event, npcs);

`code/modules/llm_crew/crew_brain_link.dm:55`, one update per event:

    /datum/crew_brain_link/proc/on_sense_event(datum/ai_controller/crew_npc/npc)
    	SStgui.update_uis(src)

`code/controllers/subsystem/tgui.dm:226`, which builds and sends it at once, inside the hearing signal:

    INVOKE_ASYNC(ui, TYPE_PROC_REF(/datum/tgui, process), wait * 0.1, TRUE)

`code/modules/llm_crew/crew_npc_senses.dm:442`, `on_pre_hear` (a `SIGNAL_HANDLER`) ends in `emit_sense`, one hearer at a time.

## How it was found

Read from the code: the window side, and the server path from `on_pre_hear` through `emit_sense`, `on_sense_event`, `update_uis` and `/datum/tgui/process` (which calls `ui_interact`, then `send_update`, which builds `ui_data` there and then). Not seen in a round. Whether React folds two updates that come close together into one render was not checked: if it sometimes does, the fault shows less often, not never.

## How to fix it

Two ways. I would take the first: it does not depend on timing at all.

1. **Server decides (preferred).** In `on_pre_hear`, the hearers of one `say` are all reached in the same tick. Keep on the brain link a short list per line: key `"[speaker ref]|[message]|[world.time]"`, value the crew NPCs that heard it and their distances. Instead of `emit_sense` straight away for a `person` line, add the hearer to that list and, the first time a key is made, `addtimer` (0) a proc that emits all the hearers' events together, each with `details["nearest_crew"] = TRUE` for the one nearest (ties: lowest `npc_id`). Then one update carries them all. In the window, `nearestToSpeaker` becomes `!!event.details.nearest_crew` when that field is there, and keeps the present search as the fallback. This also mends the cross-owner case in HOLE-10 if the list is kept globally rather than per link.
2. **Window waits.** Leave a `group` line unanswered for one update (or about 1 second): in `ingest`, put it on the brain as `groupPending = { event, at }` instead of deciding at once, and on each later `ingest` decide it with every NPC's events then in hand. Cheaper to build, but every group line is answered a second later, and it still depends on the second hearer's update coming within the wait.

Either way, keep the rule that of two at the same distance the lower id answers.

## How to test the fix

- Simulator: `tools/llm_crew/sim.ts` delivers events for all NPCs in one update, so it cannot show this today. Add a mode or a scenario that sends one update per hearer, farther NPC first, for a line with "one of you" in it, and check that only the nearer one is woken (look for one `say` in reply, not two).
- Type check from `tgui/`.
- Next round: two technicians and the Captain in the bay, the Captain says "can one of you..." a few times from different spots. In `crew_brain_log`, count decisions whose trigger quotes that line: there should be one per line. Before the fix about half the lines have two.
