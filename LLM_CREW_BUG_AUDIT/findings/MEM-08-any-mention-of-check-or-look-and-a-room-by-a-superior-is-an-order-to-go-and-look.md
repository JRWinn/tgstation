---
id: MEM-08
title: Any line from a superior with check, look or see if in it and a room named is an order to drop everything and go and look
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:266, tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:27, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132
fix: Make out a look order by code only when the look word is said to the NPC as a request with the room as its object, and leave everything else to the model's work answer
---

## What is wrong

When the Captain or the NPC's head speaks to it, `buildTalk` makes out an order by code **before** the model is asked (`workInWords(brain, report, toldBy, true)`). For anyone whose job does not take the work in its own words first, the last net is `ORDER_SOUNDS`: if the superior's words match

    /\b(look|check|inspect|see what|see if|see how|find out|report back|go and see|go see)\b/

anywhere, and any room aboard is named anywhere, it is the order "go and look at that room and report back", taken on at `emergency` urgency. The model is then told: "has just given you an order: look at the X and report back. ... Your body is already seeing to it. In "say", tell X you are on it. Do not refuse".

`workInWords` says it "errs towards taking the work on. A task taken on by mistake costs one walk". For a superior's line it costs more: it comes before everything else the NPC has (post included), it walks there, looks about, walks back to where it was given the order, waits, sends a PDA report if the superior has gone, and it is made to say "I'm on it" to whatever was said.

Run (script below), the Captain (superior) to the janitor Tolly in the Central Primary Hallway:

| The Captain says | Taken on |
| --- | --- |
| I'll check the Bar myself, Tolly. | look Bar, emergency |
| Tolly, did you check in at the Bar this morning? | look Bar, emergency |
| Look, Tolly, the Kitchen staff are upset with you. | look Kitchen, emergency |
| Don't bother looking at the Bar, it's fine. | nothing ("looking" is not in the list, by luck) |

The model would have read these right if asked: the `work` reply part exists for this. The code path skips it for a superior (`told` is null when `ordered` is set).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/orders.ts:27`:

    export const ORDER_SOUNDS: Record<string, RegExp> = {
      [LOOK]:
        /\b(look|check|inspect|see what|see if|see how|find out|report back|go and see|go see)\b/,
    };

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:266`, in `workInWords`:

    if (fromSuperior) {
      for (const [kind, words] of Object.entries(ORDER_SOUNDS)) {
        if (words.test(heard)) {
          return takeToldWork(brain, ORDERS[kind], place, toldBy, true);
        }
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132` and `:150`:

    const ordered = superior ? workInWords(brain, report, toldBy, true) : null;
    ...
    const told =
      feelAbout.length > 0 && !ordered ? workTold(brain, !!superior) : null;

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/tasks.ts`, put `janitor()` in the hallway with the Captain marked `superior`, and called `workInWords` with each line above. Not seen in a round log. Not listed in the change log or plans; GAP-15 lists `ORDER_SOUNDS` among the readers that loose wording goes through, but not this over-reach.

## How to fix it

1. Narrow what code takes as a look order without the model: the look word must come before the room with only "at", "on", "in", "the" between (`\b(look at|check|check on|inspect|go and see|go see|see what is in|find out what is in)\s+(?:the\s+)?<room>`), the line must not have "I'll", "I will", "I'm going to", "myself", "don't", "do not", "no need" before it, and it must not be a question ("?" at the end of the sentence that holds it).
2. Anything that does not pass step 1 is left to the model: `ordered` stays null, so `told` is set and the model is asked `work` with the order kinds on offer, as it is for anyone else. Its answer still goes through `takeToldWork` with `fromSuperior`, so a real order still comes before everything.
3. The fall-back after the model (`if (told && !tookWork)` in `think()`) keeps using the narrow test of step 1, not the wide one, so a model that rightly said "nothing" is not overruled by the old net.
4. This keeps "code does the work": code still takes a plain order on its own, and the model is the reader only for the doubtful lines, in the call it is already making.

## How to test the fix

- A table of cases for `workInWords`: the four rows above give nothing; "Tolly, go and check the Bar", "Check on the Kitchen for me, Tolly", "Tolly, look at the Library and report back" each give `look` in that room.
- `bun tools/llm_crew/sim.ts quiet` on the scenarios that give look orders.
- Type check from `tgui/`.
