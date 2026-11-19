---
id: PARSE-09
title: No need to clean the blood in the bar, I did it, from the Captain or a head is an order to clean the Bar, and the janitor is told it may not say otherwise
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:261, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:489
fix: In workInWords, for a superior's line, skip a clause that is a question, is negated (no need, don't, do not, never mind), or says the mess is gone (cleaned, gone, fine now, got it), and leave those to the model's work field
---

## What is wrong

See also: MEM-08, which is the same fault for the look-and-report order ("check", "look"). This is the job's own work: a mess to a janitor.

`buildTalk` makes out a superior's order by code before the model is asked anything: `const ordered = superior ? workInWords(brain, report, toldBy, true) : null`. For a janitor, `workInWords` takes **any** line from the Captain or its head that has a mess word (`MESS_WORDS`) and names a room, and makes a clean task there at `emergency` urgency. Nothing in the line is read but those two things. Then the model is told, in `describeOrdered`:

    ${superior} has just given you an order: ${what}. You answer to ${superior}, so you are doing it, now, ahead of everything else you have to do, your post included. Your body is already seeing to it. In "say", tell ${superior} you are on it. Do not refuse, and do not say it is not your job.

So a Captain who says the mess is dealt with, asks a question about it, or says not to bother, gets "On my way!" and the janitor drops what it is doing and walks there.

The comment over `workInWords` accepts a wrong task as costing one walk. For an ordinary speaker it does, because the model is then asked freely. For a superior it costs the walk **and** the janitor's answer, which is forced to agree.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:260`, in `workInWords`:

    // The job's own work first: "check the Bar, there is blood everywhere" is a mess to a janitor.
    for (const [kind, words] of Object.entries(job.soundsLike ?? {})) {
      if (job.takes?.[kind] && words.test(heard)) {
        return takeToldWork(brain, job.takes[kind], place, toldBy, fromSuperior);
      }
    }

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:132`, in `buildTalk`:

    const ordered = superior ? workInWords(brain, report, toldBy, true) : null;

`tasks.ts:489`, `describeOrdered`, quoted above.

## How it was found

Run. A throwaway script (`parse/work2.ts` in the scratchpad) built a janitor holding a mop in the Central Primary Hallway with the Captain (superior) in view, and called `workInWords` on one line from the Captain:

    "no need to clean the blood in the bar, i did it"        -> clean Bar (emergency)
    "the bar was a mess but its fine now"                    -> clean Bar (emergency)
    "dont worry about the mess in the kitchen"               -> clean Kitchen (emergency)
    "great job on the bar, no more blood"                    -> clean Bar (emergency)
    "is there any blood in the bar?"                         -> clean Bar (emergency)
    "did you clean up the vomit in the kitchen?"             -> clean Kitchen (emergency)
    "there was oil in engineering earlier, someone got it"   -> clean Engineering (emergency)
    "I spilled my drink but cleaned it, dont go to the bar"  -> clean Bar (emergency)
    "the dirt in the library is gone thanks"                 -> clean Library (emergency)

That `buildTalk` then puts the forced-agreement line in the prompt is read from the code, not run. Not seen in a round log.

## How to fix it

1. In `workInWords`, when `fromSuperior` is true, split what the superior said into clauses (on `.`, `?`, `!`, `,`, " but ", " and then ") and test each clause on its own for the mess word and the room, as MEM-04 proposes for the room.
2. Drop a clause that:
   - ends with `?` (a question: "is there any blood in the bar?");
   - has a negation before the mess word: `\b(no need|don'?t|do not|never mind|no more|not)\b`;
   - says the mess is gone: `\b(cleaned|clean now|gone|fine now|got it|dealt with|sorted|took care|taken care)\b`;
   - is past and about someone else: `\b(was|were|earlier)\b` with no "still".
3. If every clause is dropped, return null. The model is then asked freely, with the `work` field, as for anyone else; it can still put the clean on the list if it reads the line as an order.
4. Keep the plain cases: "blood in the bar", "the bar is a mess", "someone threw up in the bar", "check the Bar, there is blood everywhere" must still make the task. With PARSE-01's wider word list, "clean the bar" must too.

## How to test the fix

- A table in `tools/llm_crew/` with the nine lines above wanting nothing, and the four plain cases wanting `clean <room>`.
- `bun tools/llm_crew/sim.ts quiet orders` and `quiet captain` must still pass.
- Next round, grep `crew_brain.log` for `[an order, made out from what was said]` and read the line before each.
