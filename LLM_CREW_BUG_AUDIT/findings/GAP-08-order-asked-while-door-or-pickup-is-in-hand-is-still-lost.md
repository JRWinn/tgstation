---
id: GAP-08
title: An order asked of a technician while someone wants a door or a crate is still lost (no-cheats plan 4.2, approved, not built)
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2344, LLM_CREW_PLAN_NO_CHEATS.md:107
fix: Keep the ask in code when hears() is turned away by a door or a pick-up, tell the LLM the truth meanwhile, and place it from the kept words once the door is done
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.2 ("the dropped order", one of the three round faults the owner said to fix as suggested): an ask from the Captain or a head that passes the supply-words test while the order tool is withheld is kept by code, the LLM is told "X has asked you for an order. You have not placed it: you are seeing to the door first", and the body places it from the kept words when the door or the collection is done. A kept ask lapses after three minutes.

Nothing was built. `offers` still returns nothing while a door is wanted or a crate was asked for in the last while, and `hears` (the plain-words fallback) still calls `offers` as its test, so both ways of taking an order are shut in the same window and the ask is dropped.

The case that started it is in the plan: `round-00.56.30`, 1:00:58, the Head of Personnel asked Maria for a crate of janitorial supplies while a janitor was knocking. Maria said "I am placing that order now". Nothing was placed.

How often it still bites: only when no Quartermaster is aboard, or the head has said "The Quartermaster has not answered" (`brain.qmSilent`). With a Quartermaster, `offers` returns `[]` at its first test and orders come by the Quartermaster's spoken line, read by code. The standing test crew always has a Quartermaster, so this is the fallback path. It is still the only path for a crew spawned without one ("Spawn Crew NPC" with a technician and a head), and for the round after the Quartermaster is killed or jailed.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873`, in `offers`:

    if (
      !askers.some((person) => !!person.command || isHead(person.job)) ||
      brain.orderable.length === 0 ||
      brain.orderPending ||
      // Someone at the door wants the door. Offered an order as well, the LLM sometimes takes it.
      doorWanted(brain) ||
      // Likewise someone come to collect a crate: "I am here for crate 12" is not an order for one.
      (!!brain.pickupAsked && brain.now - brain.pickupAsked.at < PICKUP_ASK_DS)
    ) {
      return [];
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2344`, `hears`:

    return asker &&
      offers(brain, [asker]).length > 0 &&
      /\b(order|crate|suppl\w*|soap|cleaner|mop)\b/i.test(heard) &&
      takeOrder(brain.post ?? '', asker.name, brain.name, brain.now)
      ? { tool: 'order', crate: brain.orderable[0] }
      : null;

Note also `brain.orderPending` in the same test: an ask made while another order is on the go is lost the same way, and the plan does not mention that one.

## How it was found

Read from the code against the plan. No change log entry mentions 4.2. Not rerun in the simulator.

## How to fix it

1. Add `keptAsk: { by: string; words: string; at: number } | null` to `NpcBrain` (`types.ts`, initialised in `brain.ts` beside `pickupAsked`).
2. In `hears` (`jobs/cargo.ts`): split the test. If the speaker is a head or the Captain, the supply-words regex matches, a Quartermaster does not stand in the way (the first block of `offers`), and the only reason `offers` is empty is `doorWanted(brain)`, `pickupAsked` or `orderPending`, set `brain.keptAsk` and return null. Pull the three "busy" reasons out of `offers` into a helper `busyWith(brain)` so both can use it.
3. In `syncTasks`: when `brain.keptAsk` is set, `busyWith(brain)` is clear, and it is under three minutes old (`KEPT_ASK_DS = 1800`), add an `ORDER` task as `hears` returning an order does today, with the items read from the kept words by the code that reads kinds and counts (`itemsAsked` or whatever `plan` uses for the `ORDER` kind: it is the block above `offers` ending `return items;` at line 1851). Clear `keptAsk`. Say the fixed line when it is placed: "Hedley, your order is in: 1 Janitorial Supplies Crate." (first name by `firstName`).
4. In `cues` (the lines the LLM is given): while `keptAsk` is set, add "X has asked you for an order. You have not placed it: you are seeing to the door first, and will place it after." Do not tell it that it is placing one.
5. Clear `keptAsk` when an order is placed for the same person by any path, and after three minutes.
6. `takeOrder` (the shared claim in `expected.ts`) must be called when the ask is kept, not when it is placed, or the workmate will take the same ask in the meantime.

This keeps the rules: code reads the order, the model only says it, and a dead model changes nothing because step 3 does not wait for a reply.

## How to test the fix

- Simulator: the plan's scenario "a head orders while someone is knocking, and the order is placed after" (`tools/llm_crew/sim.ts`, no Quartermaster in the cast, a janitor knocking at the bay door, a head saying "Could I get a crate of janitorial supplies?"). Run it with a quiet, a chatty and a dead LLM. Check one order is placed, after the door, and the head hears the fixed line.
- A second run where the door takes more than three minutes: no order, and the head is not told one is in.
- Type check. `tools/llm_crew/voice.ts` case from the plan's step 12 ("an order asked for at the door") when the graphics card is free.
