---
id: CARGO-06
title: With a head among those who just spoke, an order can be taken from a line someone else said, and is placed for them
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2059, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1486
fix: In agrees, pass only a line whose speaker is in view and may order (a head or the Captain, and with a Quartermaster aboard the head who said it did not answer), and said to this technician
---

## What is wrong

With no Quartermaster aboard a technician takes orders "only from the Captain and the heads of department". The code keeps that rule in one place only: `offers` leaves the `order` move out unless one of those who has just spoken to the technician is a head. Once the move is on offer, `agrees` is the check that the order was really asked for, and it does not look at who said the line. It walks back through every line heard in the report, from anyone, said to anyone, and passes the first one that has a supply word in it and no collecting word.

Then `brain.ts` takes the speaker of that line as who the order is for.

So if a head and someone who is not a head have both just spoken, and the model picks `order`, the order can be matched to the other person's line and placed for them. The budget pays 400 credits for a crate held "for" a janitor, and the rule the technician has just been told to keep is broken by its own body.

One concrete case, no Quartermaster aboard:

1. A janitor, Jan Mopp, says at the counter: "Sam, could you order me a crate of soap?" The Head of Personnel walks up and says: "Morning, Sam."
2. Both are in `speakers`. `offers(brain, askers)` finds a head among the askers, so `order` is offered. The prompt says "what a head of department has just asked you for", and a small model reading the janitor's plain ask may still pick `order`.
3. `agrees` is tried on "Morning, Sam." first: no supply word, false. Then on the janitor's line: `SUPPLY_WORDS` matches "order", "crate", "soap"; `takeOrder` claims it. True.
4. `brain.ts` sets `action.for` to the janitor's handle, `fills` reads one Janitorial Supplies Crate from the janitor's words, and `tool_order` places it with `order_for` the janitor's name.

A line said to someone else counts as well: the report keeps lines marked "speaking to Maria", and `agrees` does not look at that either.

With a Quartermaster aboard the same hole is there for the one way round it: `offers` checks that `qmSilent.by` is among the askers, and `agrees` does not check that the line is theirs.

The fall-back with no model (`hears`) does check: it looks the line's speaker up and calls `offers(brain, [asker])` for that one person. So the careful path is the one used when the model is dead.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2059`:

    agrees: (brain, action, heard) =>
      action.tool !== 'order' ||
      (SUPPLY_WORDS.test(heard) &&
        // Coming for a crate that is here is not asking for one to be ordered.
        !COLLECT_WORDS.test(spokenIn(heard)) &&
        takeOrder(brain.post ?? '', speakerOf(heard), brain.name, brain.now)),

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1873`, in `offers`, the only place a head is asked for:

    if (
      !askers.some((person) => !!person.command || isHead(person.job)) ||

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1482`:

    const heardLines = report.filter(
      (line) => line.includes('(person ') && line.includes(' says: '),
    );
    const job = jobFor(brain.job);
    const calledFor = job.agrees
      ? [...heardLines]
          .reverse()
          .find((line) => job.agrees?.(brain, action, line) !== false)
      : (heardLines.at(-1) ?? '');
    ...
    if (action.tool === 'order' && calledFor !== undefined) {
      const saidBy = calledFor.match(/\(person (\w+)/)?.[1];
      const asker =
        brain.peopleInView.find((seen) => seen.handle === saidBy) ??

Note also that `SUPPLY_WORDS.test(heard)` is run on the whole report line, which begins with the speaker's name and ends with "(person p3, 2 tiles away, speaking to you)". `COLLECT_WORDS` is run on `spokenIn(heard)`, the words alone. A speaker whose name holds one of the words (a "Gearhart", a "Buyer") passes the supply test on every line.

## How it was found

Read from the code, not seen in a round and not tried against the model. Whether the model picks `order` in the case above is its own doing: the fault is that the check built to catch it does not. Not listed in the change log or the plans.

## How to fix it

1. In `cargo.ts`, write `mayOrderFrom(brain, person)`: true if `person.command || isHead(person.job)`, and, when `quartermasterAboard(brain)`, only if `brain.qmSilent` is still standing and `person.name === brain.qmSilent.by`. Use it in `offers` (in place of the two tests there) so that the rule is in one place.
2. In `agrees`, find the speaker by the handle in the line, as `brain.ts` does when it sets `action.for`: `const handle = heard.match(/\(person (\w+)/)?.[1]; const speaker = brain.peopleInView.find((person) => person.handle === handle)`. Return false if there is none or `!mayOrderFrom(brain, speaker)`. By handle rather than by `speakerOf`: two people can share a name, and TRUST-09 is about the name being read out of the line's own text.
3. Also return false for a line the report marks as said to someone else: `/, speaking to (?!you|everyone)/.test(heard)`. The wording comes from `describeEvent` in `brain.ts`.
4. Run `SUPPLY_WORDS` on `spokenIn(heard)`, as `COLLECT_WORDS` is.
5. `takeOrder` is called inside the test, and claims the asking as a side effect. Keep it last in the chain so that a line that fails the new tests claims nothing.

## How to test the fix

- Simulator: a scenario with a chatty model set to answer `order`, a janitor who asks for soap and a head who says good morning. The check: no `order` tool call reaches the sim. Then the same with the head asking, where one must.
- A table of cases is better: `agrees` is a pure function of the brain and a line. Add it to the `orders.ts` table proposed in CARGO-05.
- Type check.

## Check

Confirmed, on Opus 5.5.

- The quotes match the code today: `agrees` at `jobs/cargo.ts:2059`, the head test in `offers` at `:1873`, the reverse walk over `heardLines` at `brain.ts:1482-1490`, and `action.for` taken from the `(person pN` handle of `calledFor` at `brain.ts:1500`.
- `offers` is put in the prompt through `availableOptions` (`options.ts:42`), called from `buildTalk` (`talk.ts:137`) with everyone in `speakers` who is in view. `speakers` holds only those who spoke to this technician (`shouldWake`, `brain.ts:965`), but `report` holds every line heard, so a line said to someone else is still walked by `agrees`.
- Nothing later checks who the order is for: `tool_order` (`crew_npc_cargo.dm:323`) takes `for_handle` as given and places it.
- Ran a throwaway bun script outside the repo that calls the real `CARGO.agrees` (through `jobs/index.ts`, to get round the import cycle). It printed `false` for the head's "Morning, Sam.", `true` for the janitor's "Sam, could you order me a crate of soap?", `true` for "Maria, bring the crate over." marked "speaking to Maria Lee", and `true` for "Morning, Sam." said by a "Bob Gearhart". So the line-from-anyone, line-to-anyone and name-in-the-line points all hold.
- Not in the change log or the plans. `LLM_CREW_PLAN_NO_CHEATS.md` 4.2 uses the same supply-words test for a kept ask, and does not change this.
- Confidence raised to sure: the check passing a non-head's line was run, not guessed. Whether a model picks `order` in the case is still the model's doing. Severity stays medium: it needs a head and a non-head speaking to the technician in the same moment, with no Quartermaster or one said not to answer.
- Fix step 2 changed to find the speaker by handle. The rest of the fix is sound: `hears` already goes by `offers(brain, [asker])` for one person, so the window has the pieces.
