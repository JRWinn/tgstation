---
id: KNA-34
title: Anyone whose name is anywhere in a line asking someone to move aside steps aside, so the hauler the way was being cleared for walked off as well
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:32, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:90
fix: In asideOverhears take a line as asking this NPC only when it is said to it, or its name is the one called on at the head of the line, not when the name turns up later in it
---

## What is wrong

See also: MEM-01 (any word of an NPC's own name anywhere in a line is taken as said to it, in `saidTo`). This is the same mistake made a second time, in the step-aside reader, which has its own test and is not mended by MEM-01's fix.

`asideOverhears` takes a line as asking this NPC to move if it is said to it, **or if its name appears anywhere in the line** (`namesPerson`). A line asking one person to move so that another can get past names both, and both step aside.

Seen in `data/logs/2026/11/19/round-20.43.32`, in the part of the round after the change log entry of 2026-11-18, 20:53 to 21:05 stopped reading (it read to 20:55; the round ran to 21:02). That stretch is in no change log entry. Walter Marshall had given up hauling crate #332 out to the lobby because Walker Koster stood at the counter in its way. The Quartermaster then said, to Walker:

    [03:01:54.267] ... (Peter Willey) ... was told by its brain to say: Walker Koster! Move aside so Walter can get that crate! And tell Jean-Luc we need that Delivery Office cleaned up immediately!

and both bodies took it as asked of them (`crew_brain.log`):

    [03:02:01.183] ... "Walker Koster" ... Peter Willey has asked you to step aside: you are in their way. ... => step_aside("p2")
    [03:02:03.986] ... "Walter Marshall" ... in Cargo Lobby ... Peter Willey has asked you to step aside: you are in their way. ... => step_aside("p2")

Walter, the one the way was being cleared for, stepped off towards a corner of the lobby and then held still for `ASIDE_HOLD_MS` (15 seconds), with its own work waiting. A line like "Sam, move aside for Dana, she has a crate" sends Dana, the hauler, away from the door it is hauling through.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/aside.ts:26`, `asideOverhears`:

    const heard = String(event.details.message ?? '').toLowerCase();
    if (!speaker || speaker === brain.name || !ASIDE_WORDS.test(heard)) {
      return;
    }
    if (event.details.said_to !== 'me' && !namesPerson(heard, brain.name)) {
      return;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:90`, `namesPerson`: true if any part of the name over two letters is a word anywhere in the line:

    export function namesPerson(heard: string, name: string): boolean {
      return name
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((part) => part.length > 2)
        .some((part) => new RegExp(`\\b${part}\\b`).test(heard));
    }

## How it was found

Seen in the round log (the lines above), then traced to the code. That `said_to` was not `me` for Walter is inferred: the line begins "Walker Koster!", which `saidTo` takes as said to Walker; either way the `namesPerson` clause lets Walter's name through.

## How to fix it

1. In `asideOverhears`, drop the `namesPerson` test over the whole line. Take the line when `event.details.said_to === 'me'`, which already covers a line that opens with this NPC's name and one said to its face with no name (`saidTo` in `addressing.ts`).
2. If a name in the middle is to count ("Excuse me, Walker, could you step aside?", which `driver.ts:481` itself says), test only the stretch before the aside words: the name must come before "step aside", "move aside" and the like, and no other person's name may come between it and them. "Move aside so Walter can get that crate" then names Walter after the words, and does not ask him.
3. Keep working: the hauler's own line "Excuse me, Walker, could you step aside, please? I need to get this past you." must still move Walker.

## How to test the fix

Add cases to the aside scenario in `tools/llm_crew/`: "Walker Koster! Move aside so Walter can get that crate!" moves Walker and not Walter; "Excuse me, Walker, could you step aside, please?" moves Walker. Next round, `crew_brain.log`: each "has asked you to step aside" should belong to the body that was in the way.
