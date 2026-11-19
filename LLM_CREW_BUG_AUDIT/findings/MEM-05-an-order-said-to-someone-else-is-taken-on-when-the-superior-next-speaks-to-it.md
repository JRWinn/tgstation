---
id: MEM-05
title: An order a superior gave someone else is taken on as its own when the superior next speaks to it
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:246, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:731
fix: In workInWords read only the lines the report marks as speaking to you or to everyone there, and only those said since the NPC last answered
---

## What is wrong

When the Captain or the NPC's head speaks to it, `buildTalk` has code make out any order in what was said, before the model is asked (`workInWords(brain, report, toldBy, true)`), and takes it on as an `emergency` task. The model is then told "has just given you an order ... Your body is already seeing to it. Do not refuse".

`workInWords` reads **every line in the report that the superior said**, whoever it was said to. The report is everything sensed since the NPC last spoke to the model, and a line said to someone else does not wake the NPC (`shouldWake` in `brain.ts` returns false unless `said_to` is `me`, or `group` and it is nearest). So a line the Captain said to another crew member sits in this NPC's `pending` until the Captain next says anything to it, and is then read as an order to it.

Concrete case, run (script below). The Captain, the Head of Personnel Ann Moss and the janitor Tolly Field are in the Bar.

1. The Captain says "Ann, go and check the Kitchen and report back." `saidTo` for Tolly gives `other: Ann Moss`. Tolly is not woken; the line goes into `brain.pending` as `... (person p1, 2 tiles away, speaking to Ann Moss)`.
2. Three seconds later the Captain says "Tolly, stay here for now." That is `me`, and Tolly is woken.
3. `buildTalk`: `superior` is the Captain. `workInWords` takes both of the Captain's lines (`theirs`), joins their quoted words, finds "Kitchen" and "check": `look Kitchen`, urgency `emergency`.
4. Tolly is told "Zara Holt has just given you an order: look at the Kitchen and report back ... tell Zara Holt you are on it", says so, and walks off to the Kitchen: the one thing it was told not to do, on an order that was Ann's.

The report line even says "speaking to Ann Moss"; `workInWords` does not look at it.

The window does not need to be short. A line not answered stays in `pending` (up to 30 lines, `PENDING_MAX_LINES`) until the NPC's next call of any kind, which for an NPC that is not spoken to can be minutes. With nine crew and one GPU, it is often longer. The same happens with a line the Captain said across the room to nobody in particular ("someone check the Kitchen") followed by anything said to this NPC.

The LLM path has the same reach: `think()` falls back to `workInWords(brain, report, toldBy, !!superior)` when the model gave no `work` (`if (told && !tookWork)`), and again in the error path.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:246`, in `workInWords`:

    const spoken = report.filter((line) => line.includes('(person '));
    const theirs = toldBy
      ? spoken.filter((line) => line.includes(`] ${toldBy} says: `))
      : [];
    const heard = (theirs.length > 0 ? theirs : spoken)
      .flatMap((line) => line.match(/"[^"]*"/g) ?? [])
      .join(' ')
      .toLowerCase();

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132`, in `buildTalk`:

    const ordered = superior ? workInWords(brain, report, toldBy, true) : null;

`brain.ts`, `describeEvent`, which marks each line with whom it was said to (`', speaking to you'`, `` `, speaking to ${...said_to_name}` ``, `', speaking to everyone there'`, or nothing for nobody), and `shouldWake`, which does not wake for `other` or `nobody`.

## How it was found

Read from the code, then run: a throwaway script in the scratchpad imported `tools/llm_crew/fixtures.ts` and `CrewBrain/talk.ts`, set up `janitor()` in the Bar with the Captain (`superior: true`) and Ann Moss in view, and called `buildTalk` with the two report lines above and `speakers: ['p1']`. It printed `ordered: look Kitchen emergency` and the "has just given you an order: look at the Kitchen" line. Not seen in a round log.

## How to fix it

1. In `workInWords`, keep only speech lines that were said to this NPC: those whose bracket ends `, speaking to you)` or `, speaking to everyone there)`. Better than matching the text: have `describeEvent` keep the `said_to` value with the line (for instance, keep `brain.pending` as `{ line, saidTo }` records, or keep a parallel set of the report lines that were for this NPC) and filter on that. A line with no `said_to` mark (said to nobody) is not an order to it.
2. Of those, use only the superior's lines (as now), and of those only the latest one or two: an order is the thing just said, not something said a minute ago.
3. Apply the same filter in `talk.ts` `wordsHeard` (what the job's `whenAsked` and `describeMemoryFor` are given) and in the `heardLines` list `think()` uses to decide what a move was called for by, so that nothing is agreed to on the strength of a line said to someone else.
4. Keep the fallback for a report with no marks at all (an older server): treat it as now.

## How to test the fix

- Add the case above to a table of cases (`tools/llm_crew/`, beside `addressing.ts`): `buildTalk` with the line to Ann first and the line to Tolly second gives `ordered: null`. The same with the lines in one report but only the second line present still gives no order; "Tolly, go and check the Kitchen" alone gives `look Kitchen`.
- `bun tools/llm_crew/sim.ts quiet` on the order scenarios, to see orders said to the NPC are still taken.
- In a round: with two crew in view, give one an order by name and then speak to the other; the other must not set off.
