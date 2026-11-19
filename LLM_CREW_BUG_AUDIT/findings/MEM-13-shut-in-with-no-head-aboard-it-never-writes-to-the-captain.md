---
id: MEM-13
title: Shut in a room with no head of its department aboard, a crew member never sends word to the Captain
kind: bug
severity: low
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:208, tgui/packages/tgui/interfaces/CrewBrain/hierarchy.ts:106, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:109
fix: In nextToWrite look the head up with headName from jobs/meetings.ts, which falls back to the Captain, instead of headOf and a search of the PDA list
---

## What is wrong

A crew member shut in a room it cannot open writes by PDA to whoever let it in, then to others whose ID opens the door, and last to "its own head" (`nextToWrite` in `driver.ts`). The head is found by `headOf(brain.job)`, the job title only, and then by searching the PDA list for someone whose job holds that title. If nobody aboard holds it, there is nobody to write to, and `nextToWrite` returns null: it stops asking.

The chain of command goes on past a missing head to the Captain (`answersTo` in `hierarchy.ts`: "for a head, the Captain", and everyone answers to the Captain). `headName` in `jobs/meetings.ts` already does this: "Its own head before the Captain", falling back to the Captain on the PDA list. `nextToWrite` does not use it.

Concrete case: a round with no Head of Personnel aboard (the crew was spawned without one, or the one aboard has no PDA on the list). A janitor is let into the Bar's back room by the bartender, who leaves. The door shuts. The janitor knocks and writes to the bartender, then to the other keepers it knows of (`brain.doorKeepers`), up to `KEEPERS_WRITTEN_TO`. Nobody comes. `headOf('Janitor')` is "Head of Personnel"; nobody on the PDA list has that job; null. It writes to nobody else for the rest of the round. The Captain, whose ID opens every door, is never asked.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:208`, end of `nextToWrite`:

    const headJob = headOf(brain.job);
    const head = headJob
      ? brain.pdaPeople.find((person) =>
          person.job.toLowerCase().includes(headJob.toLowerCase()),
        )
      : undefined;
    return head && !written(head.name) ? { name: head.name, head: true } : null;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:109`, the lookup that does fall back:

    export function headName(brain: NpcBrain): string | null {
      ...
      const listed = brain.pdaPeople
        .filter((person) => answersTo(brain.job, person.job))
        .sort(
          (a, b) => Number(/captain/i.test(a.job)) - Number(/captain/i.test(b.job)),
        );
      return listed[0]?.name ?? null;
    }

## How it was found

Read from the code. Not run, not seen in a round log. Whether the janitor's other ways out (a door seen standing open, someone new coming into view) get it out anyway in most rounds was not checked: hence `likely`.

## How to fix it

1. In `nextToWrite`, replace the `headOf` lookup with the PDA part of `headName` (export a `headOnPda(brain)` from `jobs/meetings.ts`, or move `headName` to `hierarchy.ts` beside `answersTo`, which is where the chain of command belongs). It gives its own head if aboard, otherwise the Captain.
2. Mark `head: true` for either: the wording of the message to a head and to the Captain is the same ask.
3. Then grep for the same pattern elsewhere (`headOf(` and `.includes(headJob`) and use the one lookup.

## How to test the fix

- Simulator: a scenario with a janitor shut in and no Head of Personnel among the PDA people; after the keepers it writes to the Captain.
- Type check from `tgui/`.
