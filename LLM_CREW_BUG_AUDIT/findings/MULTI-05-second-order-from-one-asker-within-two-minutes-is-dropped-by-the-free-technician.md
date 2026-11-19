---
id: MULTI-05
title: A second order from the same person within two minutes is refused by the free technician because the busy one took the first, and nobody places it though the voice says it will
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/expected.ts:151, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2059, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1486
fix: Key an order claim by the asker and what was asked for, or let a claim go as soon as the claimer has placed its order, so a second asking can be taken by a technician who is free
---

## What is wrong

When two technicians both hear an order, `takeOrder` (expected.ts) lets only one of them place it. The claim is keyed by the post and the asker's name only, and stands for two minutes (`ONE_ASKING_DS`). Anything the same person asks for in those two minutes is taken to be the same asking.

So when someone orders one thing from one technician and then a second thing from the other, the second is lost:

- The first technician placed the first order. Its `orderPending` is now TRUE, so `offers` gives it no order option: it cannot take the second.
- The second technician is free, is offered the order, and its model agrees. `agrees` calls `takeOrder`, which finds the first technician's claim on that asker and returns FALSE. `brain.ts` drops the call: "[nothing said called for it: not done]".
- The second technician's spoken reply was written with the order offered, so it says something like "Of course, I'll get that ordered for you." The asker goes away believing it.

Nothing is placed, nothing is said, and the asker's next word about it is a reminder minutes later, if at all. The Captain, who is a player and talks the way a player does, is the likeliest to do this.

One concrete case, no Quartermaster aboard:

1. The Captain at the counter, to Sam: "Sam, order a crate of janitorial supplies for the janitors." Sam's model agrees. `agrees` → `takeOrder(post, "Captain Name", "Sam")`: no claim yet, so it takes one and returns TRUE. Sam places the order. Sam's `orderPending` is TRUE.
2. Thirty seconds later, to Maria: "Maria, can you order some replacement lights as well?" Sam's `offers` is empty (`brain.orderPending`). Maria's `offers` has the order. Maria's model replies with the order and "Sure, Captain, lights on the way."
3. `agrees(Maria, order, line)`: `SUPPLY_WORDS` matches "order", `takeOrder(post, "Captain Name", "Maria")` finds Sam's claim, less than 1200 deciseconds old, `claim.by === "Sam"`: FALSE. The call is dropped. No lights are ordered.

The same holds for a head of department asking at the counter, for a second asking by PDA read aloud, and for the dead-model fallback (`hears`, cargo.ts:2351), which goes through the same `takeOrder`.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/expected.ts:151`, `takeOrder`, keyed by asker alone:

    export function takeOrder(
      post: string,
      asker: string,
      by: string,
      now: number,
    ): boolean {
      const claim = taken.find(
        (it) =>
          it.post === post && it.asker === asker && now - it.at < ONE_ASKING_DS,
      );
      if (claim) {
        return claim.by === by;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2059`, `agrees`:

    agrees: (brain, action, heard) =>
      action.tool !== 'order' ||
      (SUPPLY_WORDS.test(heard) &&
        // Coming for a crate that is here is not asking for one to be ordered.
        !COLLECT_WORDS.test(spokenIn(heard)) &&
        takeOrder(brain.post ?? '', speakerOf(heard), brain.name, brain.now)),

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1493`, where the refusal ends it without a word:

    if (calledFor === undefined && action.tool !== 'say') {
      decision.calls.push(
        `${formatAction(action)} [nothing said called for it: not done]`,
      );
      continue;
    }

## How it was found

Read from the code. Not seen in a round. GAP-06 is about this list being shared in code at all; TRA-02 is the head asking again and being sold a second crate (the opposite fault); CARGO-06 is an order taken from someone who is no head. None of them covers a second, different asking being refused.

## How to fix it

1. In `takeOrder`, take the line that was heard as well as the asker, and key the claim by the asker and the crate kinds read from it (`itemsAskedFor`, or the line itself trimmed and lower-cased). Two askings for different things are two orders; the same thing said twice, or said once and heard by both, stays one.
2. Simpler and nearly as good: a claim stands only until its claimer has placed the order (or for 20 seconds, whichever is first). Once Sam has placed it, a new asking from the Captain is a new order. The two technicians hearing the same line at the same moment is the case the claim is for, and that is settled in the first seconds.
3. Either way, when `agrees` refuses an order the model chose, the reply it wrote should not be said as it stands: either hold it back and have the NPC say plainly "Sam is seeing to that" (when the claim is a workmate's), or keep the line but mark it in the decision record. The owner may prefer the first.

## How to test the fix

- Add a case to `tools/llm_crew/` (a small table like `book.ts`): `takeOrder` with the same asker and two different lines within two minutes returns TRUE for both technicians; the same line twice returns TRUE for one only.
- Simulator: two technicians, the Captain asks one for janitorial supplies and thirty seconds later the other for lights. Both orders must be placed.
- In a round, `crew_brain.log` lines with "[nothing said called for it: not done]" on an `order` call after a second asking.
