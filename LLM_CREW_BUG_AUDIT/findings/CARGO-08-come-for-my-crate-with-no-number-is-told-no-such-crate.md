---
id: CARGO-08
title: Someone who comes for their own crate and does not give the number in a set form is told no crate is held by that number
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:423, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2219, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:59, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:38
fix: In crateMeant fall back to the crates held for the speaker, read more ways of giving a number, and say there is no crate for you instead of by that number when none was given
---

## What is wrong

A crate is found from what the collector says in two ways: by a manifest number, and failing that by a name in the words (who the crate is for, their first name, or their job). The one name that is never tried is the speaker's own. So the person the crate is for, standing at the counter, has to give the number in a form the pattern knows, or name themselves.

Run against the real functions:

| Said | Number read | Taken as collecting |
| --- | --- | --- |
| I'm here for my crate | none | yes |
| I have come for my crate, number is 12 | none | yes |
| here to collect crate no. 12 | none | yes |
| picking up crate twelve | none | yes |
| here for #12 | 12 | yes |
| can i have crate 12 | 12 | no |
| I am here to get crate 12 | 12 | no |
| come to grab crate 12 | 12 | no |
| I need to pick my crate up | none | no |

For the first four rows `crateMeant` is called with no number. It then looks for the name of whoever each crate is for in the words, finds none, and returns nothing. The technician says "Sorry, Hedley, I am not holding a crate by that number." to the Captain whose crate is sitting in the bay, and `pickupAsked.number` is null so no `handover` task is made.

For the rows that are not taken as collecting at all, nothing in code happens. The model answers as it likes, and with no Quartermaster aboard a head's "can I have crate 12" is offered to it as a possible new order (`offers` only withholds `order` when `pickupAsked` is set, which needs a collecting word).

One concrete case, no Quartermaster aboard: the Captain orders a crate of lights at the counter. It comes, and the Captain is sent "Your order has come in: crate #37 (Replacement Lights). Send someone to the Cargo Lobby counter with the number to collect it." The Captain walks over and says "I'm here for my crate." `overhears`: `COLLECT_WORDS` matches "here for", `/\bcrates?\b/` matches, `crateNumberIn` is null. `crateMeant(brain, null, heard)`: `says('Hedley Bowchiew')`, `says('Hedley')` and `says('Captain')` are all false for these words. Result: the "not holding a crate by that number" line, and the crate stays where it is.

The crew NPCs always use the fixed line ("Sam, I am here to collect crate 12 for Hop Kins, please."), so this only bites a person. The owner has said typed words are to be understood with loose wording.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:423`, `crateMeant`:

    const said = heard.toLowerCase();
    const says = (words: string) =>
      !!words &&
      new RegExp(`\\b${words.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(
        said,
      );
    return brain.heldCrates.find((crate) => {
      if (!crate.for || crate.out || crate.takenBy) {
        return false;
      }
      const job =
        brain.pdaPeople.find((person) => person.name === crate.for)?.job ?? '';
      return says(crate.for) || says(firstName(crate.for)) || says(job);
    });

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2235`, in `overhears`, where the speaker is known and not passed on:

    const crate = crateMeant(brain, number, heard);
    brain.pickupAsked = {
      name: speaker,
      number: crate?.number ?? null,
      at: brain.now,
    };
    const first = firstName(speaker);
    if (!crate) {
      brain.toTell.push({
        to: speaker,
        line: `Sorry, ${first}, I am not holding a crate by that number.`,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:38` and `:59`:

    export const COLLECT_WORDS =
      /\b(collect|collecting|pick(ing)? (it |that |one )?up|pickup|here for|come for|came for|fetch)\b/i;

    const named = text.match(
      /(?:\bcrate|\bnumber|\bmanifest|#)\s*(?:number\s*)?#?\s*(\d{1,6})\b/i,
    );

A second, smaller fault in `crateMeant`: `says(firstName(crate.for))` is a bare word test on the whole line. A crate held for someone whose first name is an ordinary word (Will, Art, Mark, May, Grant) is matched by "I will collect a crate" from anyone, when the number given is wrong or missing.

## How it was found

A script that was run: it imports `crateNumberIn` and `COLLECT_WORDS` from `jobs/pickups.ts` and prints the table above (same script as CARGO-05, kept outside the repo). The rest is read from the code. Not seen in a round. Not listed in the change log or the plans.

## How to fix it

1. Give `crateMeant` the speaker's name. After the number and before the names in the words, try the crates held for the speaker: if there is exactly one that is not out and not taken, that is the one. If there are several, bring out the one that has waited longest (`waited` is on `HeldCrate`) and let them ask again for the next, or bring each in turn: owner's choice, see below.
2. `crateNumberIn`: allow "no", "no." and "num" before the number, "is" between ("number is 12"), and number words one to twenty. Keep `\d{1,6}`.
3. `COLLECT_WORDS`: add "get", "grab", "take", "have" when followed within a few words by "crate" or a number, and "pick my crate up" (any one or two words between "pick" and "up").
4. When no number was given and nothing was found, say "Sorry, Hedley, I am holding no crate for you. Which number is it?" The line "by that number" is for when a number was given.
5. Make the first-name test in `crateMeant` need the name to come after "for" ("for Will", "for Will Hale", "Will's crate"), which is how a crate's owner is named at a counter.

Owner's question: a head who comes in person with several crates waiting and gives no number. Bring them all out one after another, or one and ask which next?

## How to test the fix

- Add the table above to a table of cases (`tools/llm_crew/orders.ts`, proposed in CARGO-05, or beside `addressing.ts`), with `crateMeant` exported for it.
- Simulator: `collect` style scenarios must still pass with the fixed line. Add one in which the orderer comes in person and says "I'm here for my crate", and check a `release` call for their crate.
- Type check.
