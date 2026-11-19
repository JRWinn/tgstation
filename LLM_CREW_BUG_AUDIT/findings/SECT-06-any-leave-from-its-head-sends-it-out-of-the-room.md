---
id: SECT-06
title: Any line from its head or the Captain with leave, get out or out of here in it sends a crew member out of the room it is in and keeps it out ten minutes
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:73, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:687, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:202, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:507
fix: Take it as an order to leave only when the leave word has the room, here, or nothing after it as its object, with no negation before it
---

## What is wrong

`guardOverhears` takes a line as "leave this room" when it comes from someone the body answers to, is said to it, and has any of the `LEAVE_WORDS` anywhere in it. The word "leave" with something else as its object, a negation in front, or "out of here" said of a thing, all count.

The body then says "Yes, Walker. I am going.", walks out to where it came from, and for ten minutes (`KEPT_OUT_MS`) does no work in that room: `barred` is true and the driver skips every task placed there.

The test that it is not at its post (`brain.location !== brain.post`) does nothing for anyone without a post. Janitors and the Head of Personnel have none (`post_place` is set only in `crew_npc_cargo.dm`, `crew_npc_engineering.dm` and `crew_npc_security.dm`), so for a janitor every room counts.

Concrete cases, each said to the janitor Tolly Field in the Bar by the Head of Personnel, Walker Wolfe, standing beside it:

- "Tolly, don't leave the bar until it is clean."
- "Tolly, leave the mop bucket by the door."
- "Tolly, please leave the wet floor signs out."
- "Get that vomit out of here, Tolly."
- "Tolly, the bar is unauthorized for the clown, keep an eye out"

Every one set `toldToLeave` for the Bar, made `barred(b, 'Bar')` true, and gave the step "Yes, Walker. I am going." The first is the exact opposite of what was asked. The mess it was told to clean is left for ten minutes.

The same holds for the Captain and every crew member, since the Captain is `superior` to all of them, and for any head's lines put in words by the model.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:73`:

    const LEAVE_WORDS =
      /\b(leave|get out|go away|clear off|clear out|out of here|out you go|off you go|not authori[sz]ed|unauthori[sz]ed)\b/;

`guarding.ts:687`, in `guardOverhears`:

    if (
      superior &&
      LEAVE_WORDS.test(heard) &&
      (event.details.said_to === 'me' || namesPerson(heard, brain.name)) &&
      brain.location !== brain.post
    ) {
      brain.toldToLeave = {
        by: speaker,
        room: brain.location,
        at: Date.now(),
        said: false,
      };
      brain.keptOut[brain.location] = Date.now() + KEPT_OUT_MS;
    }

`guarding.ts:202`, `barred`, and `tgui/packages/tgui/interfaces/CrewBrain/driver.ts:507`, where it stops the work:

    if (task.place && barred(brain, task.place)) {
      continue;
    }

## How it was found

A bun script in the system temp folder (brain from `tools/llm_crew/fixtures`) put a janitor in the Bar with the Head of Personnel in view (`superior: true`) and fed each line above to `guardOverhears` with `said_to: 'me'`. Each printed `toldToLeave {"by":"Walker Wolfe","room":"Bar",...} barred Bar: true step: "Yes, Walker. I am going."`. Not seen in a round.

## How to fix it

1. Replace the bare `LEAVE_WORDS` test with a reader of the order itself. Take it as an order to leave only when one of these holds:
   - "leave" is followed by nothing, by "now", "please", "at once", by "here", "this room", "the <room it is in>", "us", "me", or by the room name the body is in;
   - "get out", "go away", "clear off", "clear out", "off you go", "out you go" with no object between the verb and "out" (so "get that vomit out" is not one);
   - "out of here" only when the verb before it is "get", "go" or "you" with no object ("get out of here", "you, out of here").
2. Return no order if a negation stands in the few words before the verb: `not`, `don't`, `dont`, `never`, `no need to`.
3. Drop "not authorized" and "unauthorized" from the words that send the body itself out: they describe someone, and the put-out words already carry them for strangers. If the owner wants "you are not authorized in here" to work, test for "you" before it.
4. Keep the rest as it is: who may say it (`superior`), said to it, and nobody told to leave its own post.
5. Have the voice keep its part: when the reader takes no order, the line goes to the model as talk, as any other line does.

## How to test the fix

Add a table of cases for `guardOverhears` (in `tools/llm_crew/security.ts` or a new one): each line above leaves `toldToLeave` null; "Tolly, leave.", "Leave the bar, Tolly.", "Tolly, get out of here.", "Off you go, Tolly." each set it. In a round, grep `game.log` for "I am going." said by a crew member and read the line said to it just before.
