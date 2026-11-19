---
id: CARGO-15
title: An order that says who will come for the crate, I'll send someone to pick it up, is taken for someone come to collect, told no crate is held, and not placed
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2222, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2063, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1880, tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:38
fix: Take a line as someone come for a crate only when it does not also ask for one to be ordered, and read the collect words only when they are about a crate that is already here
---

## What is wrong

A technician decides that someone at the counter has come to collect a held crate when the line has one of the collect words (`collect`, `pick it up`, `here for`, `come for`, `fetch` ...) and either a crate number or the word "crate". Nothing checks that the line is not an order. Orders often say who will come for the crate, or say "here for" before what is wanted, so an ordinary order is read as a pickup. Three things follow, all wrong:

1. `overhears` sets `brain.pickupAsked` with no number (no crate matches), and queues "Sorry, <name>, I am not holding a crate by that number." for the person who was ordering.
2. `offers` gives the model no `order` option at all for the next two minutes (`PICKUP_ASK_DS`), for anyone, because a pickup ask is standing. So the order is not placed, even if the model wanted to. With the model down, `hears` calls the same `offers` and also places nothing.
3. Even if the order option were offered, `agrees` refuses an order whose words match `COLLECT_WORDS`.

Concrete case, no Quartermaster aboard: the Captain (human player) at the counter: "Sam, order a crate of cleaning supplies, I'll send someone to pick it up." `COLLECT_WORDS` matches "pick it up"; `/\bcrates?\b/` matches "crate"; `takeOrder(post, "<Captain>, for a crate", ...)` claims it for Sam. `crateMeant` finds nothing (no number, no held crate for the Captain). Sam's `pickupAsked = {name: <Captain>, number: null}` and Sam says "Sorry, <first>, I am not holding a crate by that number." The model is then woken with no order option, and the cue "has come to collect a crate, and you are holding none by the number they gave". No crate is ordered. The Captain asked for one and was told something that makes no sense.

The other technician hears the same line; `takeOrder` refuses it the same key for two minutes, so it does nothing either.

Lines the window's own NPCs use do not hit it (the head's fixed line has none of the words), which is why the test rounds have not shown it. Human players will.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2222`, in `overhears`:

    if (
      speaker &&
      !isCargo(theirJob) &&
      event.details.said_to !== 'other' &&
      COLLECT_WORDS.test(heard) &&
      (number !== null || /\bcrates?\b/i.test(heard)) &&
      takeOrder(
        brain.post ?? '',
        `${speaker}, for a crate`,
        brain.name,
        brain.now,
      )
    ) {
      const crate = crateMeant(brain, number, heard);
      brain.pickupAsked = {
        name: speaker,
        number: crate?.number ?? null,
        at: brain.now,
      };

`cargo.ts:1880`, in `offers`, any standing pickup ask takes the order option away from everyone:

    // Likewise someone come to collect a crate: "I am here for crate 12" is not an order for one.
    (!!brain.pickupAsked && brain.now - brain.pickupAsked.at < PICKUP_ASK_DS)

`cargo.ts:2063`, in `agrees`:

    // Coming for a crate that is here is not asking for one to be ordered.
    !COLLECT_WORDS.test(spokenIn(heard)) &&

`tgui/packages/tgui/interfaces/CrewBrain/jobs/pickups.ts:38`:

    export const COLLECT_WORDS =
      /\b(collect|collecting|pick(ing)? (it |that |one )?up|pickup|here for|come for|came for|fetch)\b/i;

## How it was found

A throwaway bun script (scratchpad, importing `brain.ts` first, then `COLLECT_WORDS` and `crateNumberIn` from `jobs/pickups.ts`) printed, for each line: collect words matched, number, "crate" present:

    "I'm here for a crate of janitorial supplies, can you order one?" true null true
    "Can you fetch me a crate of light bulbs from the console?" true null true
    "Could you order a crate of soap? I'll come for it later." true null true
    "Order a crate of cleaning supplies, I'll send someone to pick it up." true null true
    "Order me a crate of lights, the janitor will collect it." true null true
    "I need to order 2 crates of janitorial supplies for my staff, please. Send me the manifest number when it comes in." false null true

The rest is read from the code. Not seen in a round. GAP-08 is the wider fault that a standing pickup ask takes the order option away from someone else; this one is the order line itself being taken for the pickup.

## How to fix it

1. In `pickups.ts` add `export const ORDER_ASK_WORDS = /\b(order|requisition|buy|purchase|get (me|us) (some|a)|can (i|we) (get|have))\b/i` (or reuse `ORDERING_WORDS` from `cargo.ts`, with `can I get` added).
2. In `overhears`, read a line as a pickup only if `number !== null` (a number was given), or if it has collect words and **not** `ORDER_ASK_WORDS`, and there is a held crate it could mean (`crateMeant` finds one). A line that names no number, names no held crate, and asks for something to be ordered is an order, and is left to the model with the order option.
3. In `agrees`, refuse an order on collect words only when the line also gave a number or `crateMeant` finds a held crate: "here for crate 12" is not an order; "order a crate, I'll send someone to pick it up" is.
4. Keep "Sorry, I am not holding a crate by that number" for a line that gave a number which is no crate's.

## How to test the fix

- Add the five lines above to the order-reading table in `tools/llm_crew/` with no crate held, wanting: not a pickup, order offered and agreed. Add "I'm here for crate 12" and "I'm here to collect crate #12" with crate 12 held, wanting a pickup.
- Type check.
- In a round, say to a technician "Order a crate of cleaning supplies, I'll send someone to pick it up." and look in `game.log` for the order being placed and no "not holding a crate by that number".
