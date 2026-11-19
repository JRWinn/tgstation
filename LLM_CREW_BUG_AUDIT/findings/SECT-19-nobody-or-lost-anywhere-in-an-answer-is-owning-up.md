---
id: SECT-19
title: An answer with nobody, no one or lost anywhere in it, such as Nobody was at the counter so Donna let me in, is taken as owning up to having no business there
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:53, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:768
fix: Look for a workmate's name first and let it win, and take nobody or no one only at the start of the answer or as nobody sent me
---

## What is wrong

A stranger's answer to "why are you in here?" is read for a workmate's name, and for "owning up" words. The owning-up words are matched anywhere in the line, and include "nobody", "no one" and "lost". The name is looked for first, but a name of the guard itself, or no name, followed by one of those words, ends it: the stranger is told to go.

Concrete cases, a player in the Cargo Bay answering the technician Donna Sholl:

- "No one was at the counter, so I came in to ask about my crate." No workmate named; "no one" matches; settled "go" at once. The player is walked out without the second ask.
- "I lost my ID in here earlier, I am looking for it." The same, on "lost".
- "Nobody answered my knock, so Quin let me in." Quin is a workmate, so this one is checked with Quin, as it should be. Only lines with no workmate's name are hit.

A crew NPC's own answer ("Nobody sent for me. I should not be in here, I know.") is meant to be caught, and is. The fault is only that ordinary answers with a reason in them are caught with it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:53`:

    const NO_REASON_WORDS =
      /nobody|no one|should not be|shouldn'?t be|no business|no reason|just looking|only looking|lost/;

`guarding.ts:768`, in `guardOverhears`:

    const voucher = workmateNamedIn(brain, heard, [speaker]);
    if (voucher && voucher !== brain.name) {
      asked.voucher = voucher;
    } else if (voucher || NO_REASON_WORDS.test(heard)) {
      settle(brain, speaker, asked, 'go');
    }

The pattern has no word edges, so "lost" also matches inside "lostock" and "nobody" inside "nobodys"; that matters less.

## How it was found

Read from the code. Not run and not seen in a round.

## How to fix it

1. Anchor the owning-up words: "nobody sent", "no one sent", "nobody asked", "no one asked", "should not be", "shouldn't be", "no business", "no reason", "just looking", "only looking", "i got lost", "i am lost", "i'm lost", each with word edges.
2. Keep "nobody" and "no one" alone only at the very start of the answer ("Nobody.", "No one, sorry").
3. Anything else that names no workmate stays "no answer yet", and the second ask follows as now, so a player has one more chance to name who let them in.

## How to test the fix

Cases for `guardOverhears` with a stranger who has been asked: "Nobody sent for me. I should not be in here, I know." and "I got lost" settle "go"; "No one was at the counter, so I came in to ask about my crate." and "I lost my ID in here earlier" leave the verdict unset.
