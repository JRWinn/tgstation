---
id: BRAIN-06
title: Anyone the NPC names in its own line, even in passing or by a word like hope or may, becomes who it is talking with, and the one it was answering is dropped
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1543, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:128, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1038
fix: After saying a line, set inTalkWith only to someone the line calls on (callsOn from addressing.ts) or else leave it on the speaker it was answering
---

## What is wrong

`inTalkWith` is how an NPC knows that a line with no name in it is still meant for it: "what they say next, with no name in it, is still for this NPC". `hearSpeaker` sets it to whoever has just spoken to the NPC (`brain.ts:1038`). Then, after the model's answer is said, `think` sets it again, to the first person in view whose first name appears anywhere in the NPC's own line:

- "Anywhere" is a plain word match, case-blind. Speaking of someone is not speaking to them ("I'll ask Ann to let me in"), and `addressing.ts` itself says so (`callsOn`: "Speaking of someone is not speaking to them"). Here it counts.
- First names in the game's name lists are often ordinary words: `strings/names/first_female.txt` and `first_male.txt` have May, Hope, Grace, Faith, Mark, Bill, Rose, Art, Sue, Summer, Lane, Grant, Chase, Hunter and Sam. "I hope so", "I may need soap", "I'll mark it down" all name someone.
- It overwrites the person the NPC was answering. The model often does not say that person's first name back (it says "Captain", "sir", or nothing), so whenever it names anyone else in the same line, the one who really is in talk with it loses it.

`inTalkWith` decides a line only at the end of `saidTo` (`addressing.ts:128`), for a speaker who used no name, is more than a tile away (or turned away), and is not facing it from within 3 tiles as the nearest. That is the Captain speaking across a room with other people in it, which is common.

One concrete case:

1. The janitor Bob Lane is in the Bar with Hope Reyes, Bartender, beside the counter. The Captain, 4 tiles away, says "Bob, the kitchen floor is filthy." `saidTo` gives `me` (his name). `hearSpeaker` sets `inTalkWith = { name: Captain's name }`.
2. The model answers, and Bob says "Right away, Captain. I hope the Kitchen is open." The loop at `brain.ts:1543` tests each person in view; `\bHope\b` with the `i` flag matches "hope". `inTalkWith` becomes Hope Reyes.
3. The Captain, still 4 tiles off, adds "And do the Bar after." No name, others in the room, not beside: `saidTo` comes to the `inTalkWith` test, which is for Hope now, and returns `nobody`. Bob does not wake, and the Bar is not put on his list (`workInWords` only runs when he is woken, and the next time he is, MEM-05's stale-line problem is the only way it would be read).
4. For the next 20 seconds (`STILL_TALKING_MS`), anything Hope says with no name in it, to anyone at the bar, from 2 or more tiles away or turned away from him, is taken as said to Bob. (From beside him, with no one nearer, it counts as said to him anyway, by the `BESIDE` rule.) He is woken and answers it, he is woken and answers it, and if Hope is someone he answers to, `workInWords` can read an order out of it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1537`, in `think`:

      for (const action of actions) {
        if (action.tool === 'say') {
          const text = String(action.text ?? '');
          noteSaid(brain, text);
          // Whoever it has just spoken to by name is who it is talking with: what they say next,
          // with no name in it, is meant for this NPC.
          const spokeTo = brain.peopleInView.find((person) =>
            new RegExp(`\\b${person.name.split(' ')[0]}\\b`, 'i').test(text),
          );
          if (spokeTo) {
            brain.inTalkWith = { name: spokeTo.name, at: Date.now() };
          }

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:128`, the only reader:

      const talk = brain.inTalkWith;
      if (
        talk &&
        talk.name === speaker &&
        Date.now() - talk.at < STILL_TALKING_MS
      ) {
        return { to: 'me' };
      }

`addressing.ts:65`, `callsOn`, the stricter test that already exists for "calls on this person by name": the first name at the start of the line, or set off by a comma.

## How it was found

Read from the code, and the name lists checked with grep (`strings/names/first_female.txt`, `first_male.txt`). Not seen in a round: the brain log keeps raw model replies, not `inTalkWith`, so a lost follow-up line does not show as such.

## How to fix it

1. Export `callsOn` from `addressing.ts` (it is a private function now).
2. In `think` (`brain.ts:1543`), replace the plain word match with `callsOn(text, person.name)`, so only someone the line calls on by name counts. "Ann, I'll get my mop" sets Ann; "I'll ask Ann" and "I hope so" set nobody.
3. When no one is called on, leave `inTalkWith` as it is (set by `hearSpeaker` for whoever it answered), but refresh its time to now if `speakers` is not empty, so the 20 seconds run from the answer, not from the question. The speaker's name is in `brain.inTalkWith.name` already; check that it is one of `speakers` (by handle, through `brain.peopleInView`) before refreshing.
4. This also takes the unescaped name out of a `new RegExp` (one of the eleven places DRV-06 lists).
5. Widen `callsOn`'s opening so that it fits how the model talks. Its own lines often open "Oh hello Arielle!" or "Oh hey Arielle!" (see `game.log` of `round-21.49.53`, Manuel Sheets at 04:14:41 and 04:14:54). `atStart` takes only one opener, `oh` is not one, and `!` does not set off a name. So today `callsOn` fails on those lines, and after step 2 such a line would set nobody. Add `oh` to `OPENERS` and allow up to two of them: `(?:${OPENERS}\W+){0,2}`. Calling on someone is still only the start of the line or a comma. Do not let `!` count anywhere in the line: in `saidTo`, "I saw Billy!" would then call on Billy.

## How to test the fix

Add a case to the addressing table in `tools/llm_crew/` (or a small sim scenario): a janitor, the Captain 4 tiles away, and a crew member named Hope 2 tiles from the janitor and turned away from it. Not beside it: from beside, a line with no name is the janitor's under the `BESIDE` rule whatever `inTalkWith` says. The Captain says "Bob, the kitchen floor is filthy."; the stand-in model answers "Right away, Captain. I hope the Kitchen is open."; then the Captain says "And do the Bar after." Before the fix the third line is `nobody`; after it, `me`, and the Bar goes on the list. Then a line by Hope with no name in it, said within 20 seconds, must stay `nobody`. Run the type check.
