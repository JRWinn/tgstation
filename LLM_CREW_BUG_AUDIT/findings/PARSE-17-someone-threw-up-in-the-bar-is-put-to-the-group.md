---
id: PARSE-17
title: Someone threw up in the bar, said to a janitor's face, is taken as put to everyone there, and only the nearest crew member answers, who may not be the janitor
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:30, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:111, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:966
fix: Count someone, somebody, anyone, anybody and everyone as putting a line to the group only when they are the one asked (can someone, does anyone, is anybody, anyone know), not as the subject of the sentence, and test the beside and facing rules before the group words
---

## What is wrong

`GROUP_WORDS` decides that a line with no name in it is "put to several people at once", and then only the NPC nearest the speaker answers (`shouldWake` wakes the others only if `said_to === 'me'`). The list holds "someone", "somebody", "anyone", "anybody", "everyone", "everybody", "guys", "folks", anywhere in the line, as words.

Those are as often the **subject** of what is said as the one it is said to. "Someone threw up in the bar" is said to the janitor, about someone else. The test for them also runs **before** the rules about who the speaker is beside or turned towards, so a line said one tile from the janitor's face is still `group`.

So with a cargo technician as near the Captain as the janitor (they are often side by side in the bay or at a meeting), the technician answers "someone threw up in the bar" and the janitor is not woken, does not answer, and takes no task: `workInWords` is only reached through `buildTalk`, for an NPC that was woken.

Run, the Captain speaking, a janitor and a technician in view, facing the janitor:

    someone threw up in the bar                   janitor 2 tiles: group
    somebody spilled oil in the kitchen           janitor 1 tile:  group
    everyone is so lazy today, the bar is filthy  janitor 3 tiles: group
    someone stole my id, arrest them              janitor 2 tiles: group

`group` whether or not the janitor is nearest. Where the janitor is not, it does nothing.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:30`:

    const GROUP_WORDS =
      /\b(either of you|both of you|any of you|one of you|all of you|you two|you both|you all|you lot|you guys|everyone|everybody|anyone|anybody|someone|somebody|guys|folks)\b/i;

`addressing.ts:111`, before the beside and facing rules:

    if (GROUP_WORDS.test(heard)) {
      return { to: 'group' };
    }
    // With no name used, who is there decides it.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:966`, in `shouldWake`:

    if (
      event.details.said_to !== 'me' &&
      !(event.details.said_to === 'group' && event.details.nearest_bot)
    ) {
      return false;
    }

## How it was found

Run. A throwaway script (`parse/group.ts` in the scratchpad) called `saidTo` for a fixture janitor with the Captain and a technician in view, at 1 to 3 tiles, facing, with `nearest` true and false. Every row gave `group`. Not seen in a round log. The test table `tools/llm_crew/addressing.ts` has only "Can either of you help me?".

## How to fix it

1. Split the list. Keep as group words wherever they stand: "either of you", "both of you", "any of you", "one of you", "all of you", "you two", "you both", "you all", "you lot", "you guys", "guys", "folks".
2. Count "someone", "somebody", "anyone", "anybody", "everyone", "everybody" only where they are the one asked: after "can", "could", "would", "will", "does", "did", "has", "is", "can't", or at the start followed by "know", "seen", "got", "here", "want", "help" (`^(?:hey\s+)?(anyone|anybody|someone|somebody)\s+(know|seen|got|here|want|help)\b`), or followed by a comma at the start ("Everyone, listen up").
3. Move the group test after the "beside" rule: a line said to the NPC's face from a tile away is for it, unless it is plainly to all ("you two").
4. With PARSE-01 and PARSE-09, a janitor that is not woken still misses work said in its hearing. Consider letting a job's `soundsLike` words be caught by its `overhears` for a line said to the group, so that the one whose work it is takes it even if another NPC answers.

## How to test the fix

- Add the four rows above to `tools/llm_crew/addressing.ts` wanting `me` for the janitor when it is beside the speaker, or turned to within three tiles and nearest, as the existing no-name rows do, and keep "Can either of you help me?" and "anyone know where the bar is" as `group`.
- `bun tools/llm_crew/sim.ts quiet crew` must still pass.
