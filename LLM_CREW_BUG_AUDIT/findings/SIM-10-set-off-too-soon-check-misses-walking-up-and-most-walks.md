---
id: SIM-10
title: The check that nobody sets off right after speaking does not count walking up to someone, working a machine, an arrest or five other walks
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:258, tools/llm_crew/sim.ts:528, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:68, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:788
fix: Build the stand-in's LEAVES from the driver's own rule - every tool but say, hold and those in STAYS - by exporting STAYS from driver.ts
---

## What is wrong

Every scenario ends with `check('nobody sets off within two seconds of speaking', ...)`. It counts a tool call as setting off only if the tool is in the stand-in's own list `LEAVES`. The window decides the same thing the other way round: in `driver.ts` a step "leaves" unless its tool is in `STAYS` (`clean`, `message`, `search`, `find_supplies`, `grenade`, `note`, `word_passed`), and only a leaving step is held back for `AFTER_SAYING_MS` after the body has spoken.

The two lists disagree. These tools leave by the window's rule, take the stand-in's body off walking, and are not in `LEAVES`:

`walk_to` (the driver's `approach`), `step_aside`, `stow_crate`, `tidy`, `get_paper`, `open_own_crate`, `work_machine`, `arrest`, and, though they do not walk in the stand-in, `knock`, `reset_alarm` and `locate`.

So if the hold after speaking stopped working for any of these, the check would not see it. `approach` is the one that matters most: it is how the head walks up to a janitor at a meeting, the technician to the Quartermaster, and the officer to the person on its warrant, and each of those comes right after a line said (`meetings.ts:471`, `cargo.ts:373`, `arrests.ts:794`). An officer that says "you are under arrest" and is on its way across the room the same instant, or a head that calls a name and walks off before the answer, passes.

## Where

`tools/llm_crew/sim.ts:258`:

    const LEAVES = new Set(['throw_out', 'go_to', 'go_to_door', 'explore', 'release', 'collect_crate', 'check_held', 'unload', 'recycle', 'send_shuttle', 'order', 'take_back', 'pick_up', 'hand_mail', 'collect_mail', 'open_door', 'get_kit', 'jail', 'free']);

`tools/llm_crew/sim.ts:528`, where it is used:

    if (LEAVES.has(tool) && clock > body.lastSaidAt && clock - body.lastSaidAt < 2000) { body.setOffTooSoon++; ... }

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:764` and `:788`, the window's rule:

    const leaves = !!step.act && !STAYS.has(step.act.tool);
    ...
    if (leaves && now - brain.lastSayAt < AFTER_SAYING_MS) {
      return null;
    }

Note also `clock > body.lastSaidAt`: a step sent in the same simulated instant as the line is not counted. That is meant (the comment above it: what it says it will do and then at once does is one act), but it means the check cannot see a leaving step sent in the same `think` as the line, which is exactly where an LLM's `go_to` move would come from.

## How it was found

Read from the code: the two lists side by side, and where the window sends `approach` right after a line. Not run with a fault put in.

## How to fix it

1. Export `STAYS` from `driver.ts`.
2. In `sim.ts`, replace `LEAVES` with `const leaves = (tool: string) => tool !== 'say' && tool !== 'hold' && !STAYS.has(windowName(tool))`, where `windowName` maps the server tool back (`walk_to` to `approach`, `locate` to `find_supplies`).
3. Keep the same-instant exemption for steps the driver sent (`issue`) after a line the same body said by `say` in the same `think` only if the owner wants it; say so in a comment either way.

## How to test the fix

Run `quiet crew`, `quiet qm` and `quiet warrant`; they should still pass. Then, in a scratch copy of the window code (`BRAIN=`), add `'approach'` to `STAYS` and run `quiet crew`: the check must now fail where the head walks up to a janitor straight after calling its name.
