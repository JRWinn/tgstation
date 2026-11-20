---
id: PARSE-17
title: Someone threw up in the bar, said to a janitor's face, is taken as put to everyone there, and only the nearest crew member answers, who may not be the janitor
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:30, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:111, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:966
fix: Let a job's soundsLike words make its task from a line said to the group or to nobody, as overhears does for other jobs, so the one whose work it is takes it whoever answers; and count someone, anyone and the like as group words only when they are the one asked
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

How far the group words are to blame (checker's note): `nearest` here means nearest of the **NPCs** that heard the line (`nearestToSpeaker`, `brain.ts:981`), ties going to the lower id. With the janitor nearest, `group` wakes it as `me` would, and it takes the mess. With another NPC nearer, the rules after the group test also need `nearest` (the facing rule) or let the nearer one have it (the beside rule), so taking the group words away does not help: run with them removed, janitor faced from 2 tiles and the technician 1 tile off gives janitor `nobody`, technician `me`, the same outcome as today. The group words alone cost the janitor the line only when it is tied for nearest at 1 tile and loses on id. The wider fault is that a line about a mess said in front of several NPCs goes to whichever is nearest, not to the one whose work it is. Step 4 below is the fix for that; steps 1-3 are a smaller clean-up.

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
4. **The main fix.** The one whose work it is takes it, whoever answers. In `brain.ts`, in the `speech_heard` block beside `jobFor(brain.job).overhears?.(...)` (around line 660), for a line from a person whose `said_to` is `group` or `nobody` (never `other`): if the job has `soundsLike` and one of its patterns matches the quoted words and a room is named, call `takeToldWork` for that kind, as `workInWords` does for its first loop, with `toldBy` the speaker and `fromSuperior` false. Do not run `workInWords` whole here: its `ORDER_SOUNDS` loop would make a look-and-report order out of something the Captain said to someone else. This is general (any job with `soundsLike`), keeps senses only (it heard it aloud) and needs no model. With PARSE-01's wider `MESS_WORDS` it catches "clean the bar" too. Mind PARSE-09: a line that says the mess is dealt with must not make a task here either.
   Steps 1-3 then only stop "someone ..." from waking the nearest NPC to answer a remark that was not put to it; worth doing, but they do not by themselves get the janitor the work.

## How to test the fix

- Add the four rows above to `tools/llm_crew/addressing.ts` wanting `me` for the janitor when it is beside the speaker, or turned to within three tiles and nearest, as the existing no-name rows do, and keep "Can either of you help me?" and "anyone know where the bar is" as `group`.
- For step 4, a simulator case: the Captain says "someone threw up in the bar" with a technician 1 tile off and the janitor 2 tiles off, both NPCs. The technician may answer; the janitor must have a clean task in the Bar with `toldBy` the Captain, and must not have been woken. The same line said with no room in it ("someone threw up") makes no task.
- `bun tools/llm_crew/sim.ts quiet crew` must still pass.

## Check

Checked by Opus 5.5. The quotes at `addressing.ts:30-31`, `111-113` and `brain.ts:966-971` are what the code says. Re-ran `saidTo` (scratchpad `chk/p1617.ts`): "someone threw up in the bar" and "somebody spilled oil in the kitchen" give `group` at 1 and 2 tiles, facing, `nearest` true or false; "there is vomit in the bar" gives `me` except at 2 tiles with `nearest` false (`nobody`). The janitor job has no `overhears` (`jobs/janitor.ts`), and `workInWords` is reached only inside `think` (`talk.ts:132`, `brain.ts:1518`, `brain.ts:1604`), so a janitor that is not woken takes no task from the line. Cargo has no `soundsLike`, so a technician woken instead takes nothing either. Then ran a copy of `addressing.ts` with the six words taken out of `GROUP_WORDS` (scratchpad `chk/p17b.ts`): janitor faced at 2 tiles with the technician at 1 gives janitor `nobody`, technician `me`; only the tie at 1 tile changes. So the fault is real and confirmed, but the fix as first written would not cure the case in the title; I added the note under "What is wrong", made step 4 concrete and the main fix, and raised effort to medium (`addressing.ts` and `brain.ts`). Nothing in `LLM_CREW_CHANGELOG.md` or the plans covers it.
