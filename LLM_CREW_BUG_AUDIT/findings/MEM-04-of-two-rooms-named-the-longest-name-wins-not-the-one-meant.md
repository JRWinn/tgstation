---
id: MEM-04
title: Of two rooms named in one line the longest name is taken, not the one meant, so orders go to the wrong room
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:294, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:254, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132
fix: In placeNamedIn drop matches that lie inside a longer match, then take the first room named that is not set aside by not, forget, leave or instead of, rather than the longest name
---

## What is wrong

`placeNamedIn` finds the room a line names. It sorts every room aboard longest name first and returns the first that matches anywhere in the text. That was done "so 'Medbay Central' is not taken for 'Medbay'", but the sort decides between **any** two rooms in the line, not only between a name and a shorter name inside it. When a line names two rooms, the room with the longer name is taken, whichever one was meant.

It matters most in `workInWords`, which is how an order from the Captain or the NPC's head is made out **by code, before the model is asked anything** (`buildTalk` in `talk.ts`: `const ordered = superior ? workInWords(brain, report, toldBy, true) : null`). The model cannot put it right: it is told "has just given you an order: ... Your body is already seeing to it."

Run (script below), the Captain (a superior) to a janitor in the Central Primary Hallway:

| The Captain says | Task taken on | Meant |
| --- | --- | --- |
| Forget the Kitchen, there is blood all over the Bar. | clean Kitchen | clean Bar |
| Leave the Kitchen and go check the Bar. | look Kitchen | look Bar |
| Check the Bar, then come back to the Library. | look Library | look Bar |
| Go look at the Bar, not the Chapel. | look Chapel | look Bar |

The task is `emergency` urgency ("What someone over it tells it to do comes before everything else"), so the janitor drops what it is doing and walks to the wrong room, looks round, walks back and reports on a room nobody asked about.

The same reader picks the room for: who security is looking for and where they were seen (`jobs/wanted.ts:197`, `:232`), a warrant's place (`jobs/officer.ts:351`), where a meeting is (`jobs/meetings.ts:281`, `:294`, `:554`), where a crate is to be taken (`jobs/pickups.ts:80`), a mess reported by PDA (`jobs/janitor.ts:808`), the head's orders (`jobs/head.ts:1284`) and the desk (`jobs/desk.ts`). "Pun Pun ran from the Bar into the Kitchen" reports him in the Kitchen only because "Kitchen" is longer; "Pun Pun ran from the Kitchen into the Bar" reports him in the Kitchen as well.

A second, smaller fault in the same function: `workInWords` joins **every** quoted line the superior said in the report (`theirs`, up to ten lines when the NPC waited in the model's queue) before picking the room, so a room named in an earlier remark ("The Kitchen looks great.") competes with the one in the order that followed ("Now go check the Bar.").

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:294`:

    export function placeNamedIn(brain: NpcBrain, heard: string): string | undefined {
      // Longest names first, so "Medbay Central" is not taken for "Medbay".
      return allPlaces(brain)
        .sort((a, b) => b.length - a.length)
        .find((name) =>
          new RegExp(
            `\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`,
          ).test(heard),
        );
    }

`tasks.ts:246`, in `workInWords`, every line of the speaker's joined into one text:

    const heard = (theirs.length > 0 ? theirs : spoken)
      .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
      .join(' ')
      .toLowerCase();
    const place = placeNamedIn(brain, heard);

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/tasks.ts`, put a janitor (`janitor()`) in the hallway with the Captain marked `superior`, and called `workInWords` with each line above as a one-line report. The results are the table. Not seen in a round log.

## How to fix it

1. In `placeNamedIn`, find every room that matches, with the index where it matches (`RegExp.exec` gives `index`). Drop any match whose span lies inside a longer match's span: that is the "Medbay Central" against "Medbay" case the sort was for.
2. Drop a match preceded, within the three words before it, by a word that sets it aside: `not`, `forget`, `leave`, `instead of`, `from` (for "ran from the X into the Y", "come back from the X"). Keep the list short and general; it is a net, not a parser.
3. Of what is left, return the **first** by position. Most orders name the room they are about first ("Check the Bar, then come back to the Library").
4. In `workInWords`, read the room from the **last** line the speaker said that names a room and has the job's words or an order's words in it, not from all their lines joined. Test `job.soundsLike` and `ORDER_SOUNDS` against that same line.
5. Every other caller keeps calling `placeNamedIn` as now and gets the better answer for free.
6. A question for the owner: when a superior's line names two rooms and step 2 does not settle it, should code still take the first, or leave the order to the model's `work.where` answer (that is, skip the code path and let the model fill `work` as it does for anyone else)? I would take the first and let the model's line say which room it is going to, so a wrong pick is heard and can be corrected.

## How to test the fix

- A table of cases for `placeNamedIn` and `workInWords` (in the style of `tools/llm_crew/addressing.ts`): the four rows above want Bar; "Medbay Central is a mess" still wants Medbay Central over Medbay; "Pun Pun ran from the Kitchen into the Bar" wants Bar.
- Run `bun tools/llm_crew/sim.ts quiet` on the scenarios that give orders (see the list at the top of `sim.ts`) to see nothing else moved.
- Type check from `tgui/`.
