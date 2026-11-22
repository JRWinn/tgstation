---
id: CARGO-05
title: How many crates is read only when the number stands right before the word crate, so two janitorial crates is one crate, and five is one
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 04e2fea955d, 4217de7e56e
found_by: Fable 5.2
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1806, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1843, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:384
fix: Read the count from any number in the same clause as the kind (digits, one to ten, a couple, x2), and cap it at the server's four instead of falling back to one
---

## What is wrong

`itemsAskedFor` reads what an order asks for: each kind of crate, and how many. It is used for a head ordering at the counter (`fills`), for the Quartermaster's spoken order to a technician (`overhears`), and by the Quartermaster for an order a head or the Captain sends by PDA (`quartermaster.ts:384`). The Captain is a person typing in their own words.

The count comes from one pattern, `\b(\d+|one|two|three|four|an?)\s+crates?\b`. The number has to be the word directly before "crate" or "crates". Any other ordinary wording falls through to one crate, silently.

Run against the real function (the script is under "How it was found"):

| Said | Read as |
| --- | --- |
| two crates of janitorial supplies and a crate of light bulbs | 2 janitorial, 1 lights (right) |
| two janitorial supplies crates | 1 janitorial |
| i need 2 janitorial crates please | 1 janitorial |
| three lots of cleaning supplies | 1 janitorial |
| five crates of janitorial supplies | 1 janitorial |
| a couple of crates of light bulbs | 1 lights |
| janitorial supplies x2 | 1 janitorial |
| can i get two crates each of janitorial supplies and lights | 2 janitorial, 1 lights |

The fourth and fifth rows matter most. "Five" is not in `NUMBER_WORDS` and not digits, so the pattern does not match at all and the answer is 1, though the server would have capped five at four (`CREW_NPC_ORDER_MAX`). A head who asks for five gets one and is not told.

One concrete case: the Captain sends the Quartermaster "I need to order 2 janitorial supplies crates". `takeOrder` in `quartermaster.ts` calls `itemsAskedFor`, gets one crate, writes "Order 1. ... 1 Janitorial Supplies Crate" in the book and answers "Noted, order 1". One crate comes. The words the Quartermaster then gives the technician are in the fixed form ("2 crates of ..."), so that leg is not affected: the loss is where a person's own words are read.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1795`:

    const NUMBER_WORDS: Record<string, number> = {
      one: 1,
      a: 1,
      an: 1,
      two: 2,
      three: 3,
      four: 4,
    };

    /** How many crates were asked for: "two crates", "3 crates", "a crate". One, if no number was given. */
    function cratesAskedFor(said: string): number {
      const asked = said.match(/\b(\d+|one|two|three|four|an?)\s+crates?\b/);
      if (!asked) {
        return 1;
      }
      return NUMBER_WORDS[asked[1]] ?? Math.max(1, Number(asked[1]) || 1);
    }

and line 1843 in `itemsAskedFor`, the same pattern again:

    const numbered = /\b(\d+|one|two|three|four|an?)\s+crates?\b/.test(part);

## How it was found

A script that was run. It imports the real function and prints what it returns:

    tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe items.ts

with `items.ts` (kept outside the repo) calling `itemsAskedFor(said, ['Janitorial Supplies Crate', 'Replacement Lights', 'Bureaucracy Crate'])` for each line in the table. The right-hand column is what it printed. Not seen in a round. Not listed in the change log or the plans.

## How to fix it

1. In `cargo.ts`, write one helper, `countIn(part)`, and use it in both places:
   - a number word table that runs to ten at least, plus "a couple" (2), "a pair" (2), "both" (2), "a few" (3);
   - digits anywhere in the clause that are not a crate's manifest number or an order number (not after `#`, "crate", "number" or "order", and no more than two digits). The order number matters: the Quartermaster's own fixed lines begin "order 12: I need to order a crate of ...", and that first clause is not split off (`itemsAskedFor` splits on `,;.` and "and", not on `:`), so a careless digit reader would take 12 as the count;
   - "x2", "x 2", "2x";
   - prefer a number that comes before the kind's own words or before "crate", "crates", "lots", "boxes", "sets", "of".
2. Cap the result at 4 in the window (the server's `CREW_NPC_ORDER_MAX`) so that what is read back to whoever ordered ("Noted, order 3: 4 Janitorial Supplies Crate") is what will be placed. Today a count over four is cut by the server after the book has it written down as asked.
3. "Two crates each of janitorial supplies and lights": when a clause has "each", carry its count to the kinds in the clauses that follow which have no number of their own.
4. Keep the rule that a kind only named again is not ordered twice (`else if (numbered)`).

Owner's question: when someone asks for more than four of a kind, should the body say so ("four is the most I can order at once") rather than quietly order four? That would be a fixed line, not the model's.

## How to test the fix

- There is no table of cases for ordering words. Add one, `tools/llm_crew/orders.ts`, in the style of `addressing.ts`, with the rows above and the ones that already work.
- `tools/llm_crew/book.ts` must still pass: the Quartermaster's fixed line "order 3: I need to order 2 crates of janitorial supplies and a crate of replacement lights, for Hop Kins." must read as before.
- Type check.

## Check

Checked by Opus 5.5. The quotes are what the code says today: `NUMBER_WORDS` and `cratesAskedFor` (`cargo.ts:1796`), and the same pattern in `itemsAskedFor` (`cargo.ts:1843`). Callers: the head at the counter (`cargo.ts:2072`), the technician reading the Quartermaster's spoken order (`cargo.ts:2145`), and `takeOrder` for a PDA order (`quartermaster.ts:384`, the Captain's or a head's own words).

Ran a throwaway bun script in the scratchpad that imports `driver.ts` first (importing `jobs/cargo.ts` alone fails on a circular import, "Cannot access 'CARGO' before initialization") and then calls `itemsAskedFor` with `['Janitorial Supplies Crate', 'Replacement Lights', 'Bureaucracy Crate']`. Every row of the table printed as written, and "i need to order 2 janitorial supplies crates" printed one crate. The Quartermaster's fixed form ("order 3: i need to order 2 crates of janitorial supplies and a crate of replacement lights, for hop kins.") reads 2 and 1, so that leg is right, as the write-up says. The server caps at four (`CREW_NPC_ORDER_MAX`, `crew_npc_cargo.dm:307`). Nothing in the change log or plans names `cratesAskedFor` or this fault.

Severity medium stands: the wrong number of crates comes, silently, but the order goes through. Effort raised to medium: a helper with a number table, "x2", digits with exclusions and the "each" carry, plus a new table of cases, is more than twenty lines. Added to step 1 that "order N" must be skipped as well as manifest numbers.

## Fix so far

Done on branch `m-cargo` (window only; new table `tools/llm_crew/cargo-counts.ts`, 23 cases; `book.ts`, `cargo-orders.ts`, `reports.ts` pass; simulator qm, qmbig, qmpoor, mixed passed; not played):

- Steps 1 to 4: `countIn` in `jobs/cargo.ts` replaces `cratesAskedFor` in `itemsAskedFor` and `fills`. It reads "x2"/"2x", else the first number in the clause: digits of one or two figures, one to ten, both, couple, pair, few, or "a"/"an" just before "crate". It first takes out numbers that are not counts (`NOT_A_COUNT`: "#12", "crate 12", "number 12", "order #3", "order 3:", three figures or more). A count said with "each" goes with the clauses after it that give none. Each kind is capped at four (`ORDER_MAX`, the server's `CREW_NPC_ORDER_MAX`), also when a kind named twice is added up.

Not done: the owner's question on saying "four is the most I can order at once" when more is asked. Today four is quietly ordered, and what is read back says four.
