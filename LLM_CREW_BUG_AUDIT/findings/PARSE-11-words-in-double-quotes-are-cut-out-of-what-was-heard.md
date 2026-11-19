---
id: PARSE-11
title: Words a speaker puts in double quotes are cut out of what the crew hear, so there is "blood" all over the bar names no mess
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:251, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:94, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1502
fix: Take the words from the event's details.message, or from the first quote after says to the last quote before (person, never by pairing quote marks
---

## What is wrong

The window turns each line someone says into a report line, `[time] Name says: "words" (person p3, 2 tiles away, speaking to you)` (`describeEvent` in `brain.ts`, from the server's `"[speaker_name] says: \"[message]\""` in `crew_npc_senses.dm:442`). The server does not escape a `"` inside `message`, and the message is `html_decode`d, so a player's own double quotes are in the line as they typed them.

Two readers then dig the words back out of that line by pairing quote marks, `line.match(/"[^"]*"/g)`:

- `workInWords` (`tasks.ts:251`), which makes out orders and told work by code, the superior's order included;
- `wordsHeard` (`talk.ts:94`), which gives the words the job's `whenAsked`, the notes and the memory are chosen by.

Pairing quotes gives the text **outside** the speaker's quotes and throws away what is inside them, which is usually the part that matters:

    Zim Fire says: "there is "blood" all over the bar"      -> "there is ", " all over the bar"
    Zim Fire says: "the bar is a "mess""                    -> "the bar is a ", ""
    Zim Fire says: "Josh said "there is vomit in the kitchen"" -> "Josh said ", ""

None of the three makes a clean task. Players use quotes for scare quotes, for passing on what someone said, and for names of things.

A smaller thing in the same place: `brain.ts:1502` finds who asked for an order with `calledFor.match(/\(person (\w+)/)`, the **first** "(person " in the line. A speaker who types "(person p1" into their line has the order taken as being for p1.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:250`:

    const heard = (theirs.length > 0 ? theirs : spoken)
      .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
      .join(' ')
      .toLowerCase();

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:91`:

    function wordsHeard(report: string[]): string[] {
      return report
        .filter((line) => line.includes(' says: ') && line.includes('(person '))
        .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
        .map((quoted) => quoted.slice(1, -1));
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1502`:

    const saidBy = calledFor.match(/\(person (\w+)/)?.[1];

## How it was found

Run. A throwaway script (`parse/quote.ts` in the scratchpad) built report lines with the fixtures' `says()`, which has the same shape as `describeEvent`, printed `line.match(/"[^"]*"/g)` and called `workInWords` for a janitor with the Captain as superior. All three printed the parts above and made no task; the same lines without the inner quotes make `clean Bar` / `clean Kitchen`. Not seen in a round log.

## How to fix it

1. Best: keep the words beside the line. `describeEvent` already has `event.details.message`; keep the report as objects (`{ line, speaker, message, handle }`) or keep a parallel list, so readers never parse their own output. That is the larger change.
2. Small: one helper in `tasks.ts`, `quotedWords(line)`, that takes from the first `"` after `says: ` (or `whispers: `) to the **last** `"` before ` (person ` (or ` (a machine`, ` (someone you cannot see`). Use it in `workInWords` and `wordsHeard`.
3. For `brain.ts:1502`, take the handle from the **last** `(person ` in the line: `[...calledFor.matchAll(/\(person (\w+)/g)].at(-1)?.[1]`.

## How to test the fix

- A table in `tools/llm_crew/` that runs `workInWords` on the three lines above and wants `clean Bar`, `clean Bar`, `clean Kitchen`.
- All existing tables (`addressing.ts`, `security.ts`, `book.ts`) and `bun tools/llm_crew/sim.ts quiet` must still pass.
