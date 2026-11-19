---
id: CARGO-07
title: With the model down, a head who says the word order or crate for any reason has a Janitorial Supplies Crate ordered for them
kind: bug
severity: medium
effort: small
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2344, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1578
fix: In hears, place an order only when the words name a kind of crate that can be ordered and are put as an ask, and never fall back to the first crate on the list
---

## What is wrong

`hears` is what stands in for the model when a call to it fails (`brain.ts`, the `catch` in the talk call). It is meant to keep a dead model from leaving the counter deaf. As built it takes any line from a head that has one of the words order, crate, supply, soap, cleaner or mop in it as an order, and asks for `brain.orderable[0]`, which is the Janitorial Supplies Crate (the first pack in `orderable_crates` on the server). `fills` then reads kinds and counts from the words, and if the words name no kind, the first crate on the list stands, one of it.

Nothing checks that the line asks for anything, that it names something cargo can get, or that it was said to this technician (`heard` is the last line anyone said in the report).

Lines from a head or the Captain that place an order for a 400 credit crate while the model is down, with no Quartermaster aboard:

- "Has my order come in yet?"
- "Where is my crate?"
- "Cancel that order."
- "Do not order anything until I say."
- "Who left this mop here?"

The body then says "I will see to it." and walks to the console. Early in a round the budget is 500 to 1,000 credits, so one of these takes most of it. Once that crate has come, the next such line orders another.

One concrete case: the graphics card is busy and the call times out. The Captain, at the counter, says "Sam, has my order come in yet?". `speakers` is not empty, `heard` is that line, `hears` finds the Captain in view, `offers(brain, [captain])` is not empty (a head, something orderable, no order pending, no door wanted, nobody collecting), the pattern matches "order", `takeOrder` claims it. The action is `{ tool: 'order', crate: 'Janitorial Supplies Crate' }`. `fills` finds no kind in the words and sets `count` to 1. The server places it for the Captain.

With the model up the same lines get as far as the model's judgement, and then `agrees`, which passes on the bare word as well (`SUPPLY_WORDS` has "order", "crate", "stuff", "gear", with no word edges). `agrees` was written as the net under the model. For these lines it has no mesh.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2343`:

    // Plain words for supplies, said to it, are an order for the crate, if it can take one.
    hears: (brain, heard) => {
      const asker = brain.peopleInView.find(
        (person) => person.name === speakerOf(heard),
      );
      return asker &&
        offers(brain, [asker]).length > 0 &&
        /\b(order|crate|suppl\w*|soap|cleaner|mop)\b/i.test(heard) &&
        takeOrder(brain.post ?? '', asker.name, brain.name, brain.now)
        ? { tool: 'order', crate: brain.orderable[0] }
        : null;
    },

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1578`, the caller:

    const heard =
      report
        .filter((line) => line.includes('(person ') && line.includes(' says: '))
        .at(-1) ?? '';
    const request =
      speakers.length > 0 ? jobFor(brain.job).hears?.(brain, heard) : null;
    if (request) {
      ...
      if (request.tool === 'order') {
        jobFor(brain.job).fills?.(brain, request, heard);
      }
      runTool(brain, request);
      runTool(brain, { tool: 'say', text: 'I will see to it.' });

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2077`, in `fills`, where the first crate is left standing:

    } else {
      action.count = cratesAskedFor(said);
    }

## How it was found

Read from the code. What `itemsAskedFor` makes of such lines was run: "has my order of janitorial supplies come in" returns one Janitorial Supplies Crate (see the script in CARGO-05). Not seen in a round. `LLM_CREW_PLAN_NO_CHEATS.md` section 4.2 is about this same function, for a different fault (an ask lost while the tool is withheld).

## How to fix it

1. In `hears`, work on the words alone: `const said = spokenIn(heard).toLowerCase()`.
2. Require a kind: `const items = itemsAskedFor(said, brain.orderable)`, and return null if it is empty. Return `{ tool: 'order', crate: items[0].crate }`. Never `brain.orderable[0]`.
3. Require an ask, and no sign that the line is about an order already made. A workable pair: the line matches `/\b(order|need|want|get|send|bring|could|can|please|requisition)\b/` and does not match `/\b(my|the|that|this|your|an?) (order|crate)\b.*\b(come|in|here|arrived|ready|yet)\b|\b(cancel|do not|don't|never mind|not)\b|\bwhere\b/`. The head NPC's own fixed line, "I need to order ..." (`ORDERING` in `supply.ts`), must pass.
4. Require that it was said to this technician: return null if the report line is marked ", speaking to" someone else.
5. When the words ask and name no kind cargo can get, the plain answer is the Quartermaster's: say what can be had (`CANNOT_ORDER` in `supply.ts` and the list of `brain.orderable`), and order nothing.
6. Give `agrees` the same two tests (a kind named, or the model's own choice of crate together with an ask), so the path with the model up is no looser than the one without.

## How to test the fix

- Simulator with a dead model (`dead` as the last argument, as the change log's runs do): a head says each of the five lines above, and no `order` call must reach the sim. Then "I need to order a crate of janitorial supplies", and one must.
- The `orders.ts` table proposed in CARGO-05 can hold these as cases of `hears`.
- Type check.
