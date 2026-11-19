---
id: MEM-05
title: An order a superior gave someone else is taken on as its own when the superior next speaks to it
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:246, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:731
fix: In workInWords read only the superior's lines said to this NPC (said_to me, or group when it was the nearest), kept with each pending line, and only the latest of them
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

The window does not need to be short. A line not answered stays in `pending` (up to 30 lines, `PENDING_MAX_LINES`) until the NPC's next call of any kind, which for an NPC that is not spoken to can be minutes. With nine crew and one GPU, it is often longer. The same happens with a line the Captain said across the room to nobody in particular ("someone check the Kitchen") followed by anything said to this NPC. (Checker: `saidTo` gives that line `group`, so it is marked ", speaking to everyone there"; it woke only the NPC nearest the Captain, and this one takes it as well.)

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

1. In `workInWords`, keep only speech lines that were said to this NPC: `said_to` is `me`, or `group` **and** `nearest_bot` was true for this NPC (the same test `shouldWake` makes). Matching the bracket text cannot do this, because ", speaking to everyone there" does not say who was nearest; a text filter that keeps every group line leaves the "someone check the Kitchen" case as it is. So keep the values with the line: have the intake loop in `brain.ts` (where `describeEvent` is called and the line pushed, about line 730) record the lines that were for this NPC, for instance a `Set<string>` on the brain beside `pending`, or `pending` as `{ line, forMe }` records, and pass the report's "for me" lines to `buildTalk`. Mind the two places that put lines back into `pending` (`brain.ts` about line 1626, and the trim at `PENDING_MAX_LINES`). A line with no mark (said to nobody) is not an order to it.
2. Of those, use only the superior's lines (as now), and of those only the latest one or two: an order is the thing just said, not something said a minute ago.
3. Apply the same filter in `talk.ts` `wordsHeard` (what the job's `whenAsked` and `describeMemoryFor` are given) and in the `heardLines` list `think()` uses to decide what a move was called for by, so that nothing is agreed to on the strength of a line said to someone else.
4. There is no older-server case to keep: `said_to` is worked out in the window itself (`brain.ts`, the `saidTo(...)` call about line 604), for every line a person says. A table of cases that passes bare report strings must give the marks too.
5. Step 3 reaches CARGO-06 (the technician's `agrees` passes a line said to someone else); do the two together.

## How to test the fix

- Add the case above to a table of cases (`tools/llm_crew/`, beside `addressing.ts`): `buildTalk` with the line to Ann first and the line to Tolly second gives `ordered: null`. The same with the lines in one report but only the second line present still gives no order; "Tolly, go and check the Kitchen" alone gives `look Kitchen`.
- In the same table: "Someone check the Kitchen." (`group`, this NPC not the nearest) then "Tolly, stay here for now." gives no order; the same with this NPC the nearest gives `look Kitchen`.
- `bun tools/llm_crew/sim.ts quiet` on the order scenarios, to see orders said to the NPC are still taken.
- In a round: with two crew in view, give one an order by name and then speak to the other; the other must not set off.

## Check

Read `workInWords` (`tasks.ts:234-274`), `buildTalk` (`talk.ts:117-132`), the intake loop, `describeEvent` and `shouldWake` in `brain.ts` (about lines 600-612, 728-738, 895-975) and `think()`'s fallbacks (`brain.ts` about 1516 and 1603). The quotes are as the code is today. `shouldWake` returns false for `other`, and for `group` unless this NPC is the nearest, yet the line is pushed to `pending` first; `think()` takes all of `pending` as the report (`brain.pending.splice(0)`), and `workInWords` filters only on the speaker's name.

Ran a throwaway bun script (scratchpad, outside the repo) with `tools/llm_crew/fixtures.ts`'s `janitor()` in the Bar, the Captain (`superior: true`) and Ann Moss in view, `speakers: ['p1']`. `saidTo` gives `other: Ann Moss` for "Ann, go and check the Kitchen and report back.", `me` for "Tolly, stay here for now." and `group` for "Someone check the Kitchen.". `buildTalk` with [line to Ann, line to Tolly] gives `ordered: look Kitchen emergency` and the "has just given you an order: look at the Kitchen" text; with the Tolly line alone, `null`; with [group line, Tolly line], `look Kitchen` again. So the fault is as written. Nothing in the change log or plans speaks of it; CARGO-06 is the same mistake in the technician's `agrees`, a different function.

Severity stays high (the order meant for one crew member is carried out by another, and the owner, as Captain, speaks to several crew in turn as a matter of course). Effort raised to medium: the sound fix carries `said_to` and `nearest_bot` from the intake loop to `workInWords` through `brain.ts`, `talk.ts` and `tasks.ts`; a text filter on the bracket would be small but leaves the group case. Fix step 1 was mended for that, and step 4 (an "older server") dropped, since the marks are made in the window.
