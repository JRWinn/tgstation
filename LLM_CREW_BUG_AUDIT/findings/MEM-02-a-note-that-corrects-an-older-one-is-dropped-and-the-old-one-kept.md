---
id: MEM-02
title: A note that corrects an older one is dropped as a copy of it, and the old one is kept
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/memory.ts:108, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:56, tgui/packages/tgui/interfaces/CrewBrain/memory.ts:45
fix: When a new note is the same as an old one, put the new note in the old one's place instead of dropping the new one
---

## What is wrong

A crew member keeps up to 12 notes of things it was told ("news, gossip, trouble, a promise", the reply part `note` in `prompt.ts`). `addNote` refuses a new note if `sameNote` says an existing note already says the same thing, and keeps the old one.

`sameNote` counts two notes as the same if one's letters hold the other's, or if 60% of the "telling words" of the shorter are in the longer. Telling words are words of **four letters or more**, so "not", "no", "now", "off", "bar", "out" never count. A note that corrects or updates an older one shares nearly all its words with it, so it is always "the same", and it is always the newer one that is thrown away.

What the NPC then does: every later call that the note is ranked into (`notesFor`, up to six notes in the system prompt under "Your notes:") tells the model the stale fact, and the model says it out loud as true. The prompt's rule is "Say only what is true: what the report and your memory tell you", so it does.

Run (script below), each pair is "note kept first" then "note offered later":

| First note | Later note | Result |
| --- | --- | --- |
| Bob is allowed in the Bar. | Bob is not allowed in the Bar. | later DROPPED |
| The staff meeting is in the Bar at 14:00. | The staff meeting was moved to the Bridge. | later DROPPED |
| The Captain wants the Kitchen mopped first. | The Captain no longer wants the Kitchen mopped first. | later DROPPED |
| Engine is lit and running fine. | Engine is not running. | later DROPPED |
| Captain says Pun Pun is wanted for theft. | Captain says Pun Pun is no longer wanted. | later DROPPED |

Concrete case in a round: the Captain tells the janitor "Pun Pun is wanted for theft"; the model writes the note. Twenty minutes later the Captain says "Pun Pun is pardoned, he is no longer wanted"; the model writes "Captain says Pun Pun is no longer wanted." `addNote` returns '' and the brain log shows no `remember` call. Asked "is Pun Pun in trouble?", the janitor is sent its note "Captain says Pun Pun is wanted for theft." and answers that he is wanted.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/memory.ts:108`, in `addNote`:

    if (brain.notes.some((existing) => sameNote(existing, trimmed))) {
      return '';
    }
    brain.notes.push(trimmed);

`memory.ts:45`, `tellingWords`, which leaves out every word of three letters or fewer, negations among them:

    .filter((word) => word.length > 3)

`memory.ts:56`, `sameNote`:

    const shared = [...wordsA].filter((word) => wordsB.has(word)).length;
    return shared / smaller >= SAME_NOTE_SHARE;

The caller, `brain.ts` in `think()`: `if (!addNote(brain, String(action.note ?? ''))) { continue; }`, so a dropped note leaves no trace in the decision log either.

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/memory.ts`, called `addNote` with each pair above on a fresh janitor brain, and printed the notes. Every later note was dropped. Not seen in a round log.

## How to fix it

1. In `addNote`, when `sameNote(existing, trimmed)` is true for some note, **replace** that note with the new one (remove it from where it is and push the new one at the end, so it ranks as newest in `notesFor`), and return the new note. The newer of two notes about one thing is the one to keep: that is what was said last. Notes the model copies from its last note (the reason the check exists, per the comment in `buildReplySchema`) still do not pile up, since they replace rather than add.
2. If there are two or more existing notes that match, remove them all and keep the new one.
3. Keep the length cap and the `NOTES_MAX` shift as they are.
4. Do not try to detect negation: replacing on "same" covers it and keeps the code small.
5. One refinement worth the extra line: if the new note's `noteKey` is wholly inside an old note's key (a shorter copy of it, the case the model makes most when it repeats itself), keep the old one and drop the new, as now, so a full note is not cut down to a fragment of itself. None of the five pairs above is a containment of that kind ("bob is allowed in the bar" is not inside "bob is not allowed in the bar"), so they are still replaced.

## How to test the fix

- A small table like `tools/llm_crew/addressing.ts` for `addNote`: the five pairs above each end with only the later note; a note offered twice in the same words is kept once; two unrelated notes are both kept.
- Type check from `tgui/`.
- In a round: tell an NPC a fact, then the opposite; ask it about it; the answer follows the second.

## Check

Checked by Opus 5.5. The quotes in `memory.ts` (`tellingWords`, `sameNote`, `addNote`) and the caller in `brain.ts` (`if (!addNote(...)) { continue; }`) are what the code says today. `addNote` is the only way a note is kept (`brain.notes` is written nowhere else), and the reply schema has no way to take a note back or change one, so there is no other path by which a correction could land. Nothing in `LLM_CREW_CHANGELOG.md` or the plans speaks of it.

Ran a throwaway script (bun, in the scratchpad) on a fresh `janitor()` from `tools/llm_crew/fixtures.ts`: all five pairs in the table drop the later note, and so does "Cargo has no soap left." then "Cargo got soap in, ask Donna." (two of three telling words shared). "The Captain is away." then "The Captain is back on the station." is kept, so the fault needs most of the long words to be shared, which a correction nearly always does. Confirmed. Severity medium stands: the NPC keeps saying a stale fact out loud, but no job stops. Effort small. Added step 5 so a shorter copy does not replace the full note.
