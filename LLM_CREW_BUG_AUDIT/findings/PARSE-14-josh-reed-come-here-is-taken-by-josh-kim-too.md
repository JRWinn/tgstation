---
id: PARSE-14
title: Josh Reed, come here is taken by Josh Kim as said to him, so a full name used to tell two crew apart does not, and Al, open the door is said to nobody
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:95, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:40, tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:66
fix: In saidTo, before rule 1, find the longest known full name the line calls on, and if it is someone else's the line is theirs; and let a first name of one or two letters be called on when it stands at the start or is set off by a comma
---

## What is wrong

See also: MEM-01 (any word of the NPC's own name anywhere in the line is "said to me"). Its fix, using `callsOn` for the NPC's own name, does not cure either case here.

**Two crew with one first name.** With two janitors, Josh Reed and Josh Kim, in the room, the Captain does what a person does to tell them apart and uses the full name. Both still take it:

    "Josh Reed, come here"    Josh Kim: me    Josh Reed: me
    "Josh Kim, mop the bar"   Josh Kim: me    Josh Reed: me
    "Reed, come here"         Josh Kim: nobody  Josh Reed: me   (right)

Rule 1 (`usesName` on the NPC's own name) is tried before anyone else's name, and "josh" is a word in the line. `callsOn` would also say yes: it looks only at the first name. So the Captain's order to Josh Kim is taken on by both janitors (`buildTalk` makes it out by code for each), both answer, and both walk off. The only way to address one of them is by surname alone.

**A first name of one or two letters.** `nameParts` and `callsOn` both drop every part of a name that is not longer than two letters. A crew member called Al Stone (or Cy, Ty, Jo, Ed, Bo; `strings/names/first_male.txt` has Cy and Ty) cannot be called on by first name at all:

    "Al, open the door"       Al Stone: nobody
    "Hey Al, come here"       Al Stone: nobody
    "Stone, open the door"    Al Stone: me

With anyone else in the room, the line is "for nobody" and is not answered.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/addressing.ts:40`:

    function nameParts(name: string): string[] {
      return name
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((part) => part.length > 2);
    }

`addressing.ts:65`, `callsOn`:

    const first = name.split(/[^A-Za-z]+/).find((part) => part.length > 2);

`addressing.ts:95`, rule 1 before rule 2:

    if (
      usesName(lower, brain.name) ||
      (!!brain.post && usesName(lower, brain.job))
    ) {
      return { to: 'me' };
    }
    ...
    for (const name of known) {
      if (name !== brain.name && name !== speaker && callsOn(heard, name)) {
        return { to: 'other', name };
      }
    }

## How it was found

Run. A throwaway script (`parse/same.ts` in the scratchpad) called `saidTo` with the fixture brain for Josh Kim and Josh Reed in turn, the Captain four tiles off and turned away, and printed both; then for Al Stone with Josh Reed in the room. The rows above are its output. Not seen in a round log.

## How to fix it

1. At the top of `saidTo`, before rule 1: of every known name (`brain.name`, those in view, `brain.people`, `others`), find those whose **full** name is used as words in the line (case-insensitive, any punctuation between the parts). Take the longest. If it is the NPC's own, `me`; if it is someone else's, `other` with that name. Only if no full name is used do rules 1 and 2 run as now (with MEM-01's change).
2. In rule 1 and in `callsOn`, a first name that another known person also has is not enough on its own: when two known people share the first name used, and no surname is given, return `group` so that only the nearest answers (`nearest` already decides that), rather than `me` for both.
3. In `nameParts` and `callsOn`, keep parts of one or two letters, but only use them in the strict shapes `callsOn` allows (at the start after an opener, or set off by a comma), never in `usesName`'s anywhere-in-the-line test, so "Al" is not found in "also" or "all".
4. Add the rows above to `tools/llm_crew/addressing.ts`; it already has a `hears()` helper. Keep every row there passing.

## How to test the fix

- `bun tools/llm_crew/addressing.ts` with the new rows: "Josh Reed, come here" wants `other:Josh Reed` from Josh Kim's side and `me` from Josh Reed's; "Josh, come here" with both in the room wants `group`; "Al, open the door" wants `me` for Al Stone; "I also want it" wants nothing for Al Stone.
- `bun tools/llm_crew/sim.ts quiet crew` (three janitors) must still pass.
