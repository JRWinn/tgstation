---
id: PARSE-06
title: Order paper, order lightbulbs and order jani supplies name no crate, and are answered I cannot order that
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: edb6d9ee2bd, fd386eec9e7
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:100, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1815, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:384
fix: Give every orderable crate words it goes by in CRATE_ASKED_AS, the Bureaucracy Crate paper, pens and stationery, lights lightbulbs, and match the janitor words as word starts
---

## What is wrong

`asksFor` decides whether an order names a kind of crate. Two of the three kinds cargo can get have a list of the words people use (`CRATE_ASKED_AS`). The third, the Bureaucracy Crate, has none, so it is named only by the word "bureaucracy". And the two lists there are matched as whole words, so run-together and shortened words miss.

Run against the real function, with the three crates the server offers (`orderable_crates()` in `crew_npc_cargo.dm`: janitor, lightbulbs, paper):

| Said | Read as |
| --- | --- |
| order paper | nothing |
| order lightbulbs | nothing |
| order jani supplies | nothing |
| order light bulbs | Replacement Lights |
| order cleaning supplies | Janitorial Supplies Crate |
| order a crate of mops | Janitorial Supplies Crate |
| order janitorial suplies | Janitorial Supplies Crate |

When nothing is read, `takeOrder` in `quartermaster.ts` sends back "I cannot order that, X. What cargo can get just now: Janitorial Supplies Crate, Replacement Lights and Bureaucracy Crate." The Captain or head has to guess that "paper" is called "Bureaucracy". The same reader serves a head at the counter (`fills`) and the technician hearing the Quartermaster.

The Quartermaster itself knows the paper crate by `PAPER_CRATE = /bureaucracy|paper|stationery/i` (`quartermaster.ts:146`) for its own order book. The reader of everyone else's orders does not.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:100`:

    const CRATE_ASKED_AS: Record<string, RegExp> = {
      'Janitorial Supplies Crate': /janitor|cleaning|cleaner|\bmops?\b|\bsoap\b/i,
      'Replacement Lights': /\blights?\b|\bbulbs?\b|light tubes?/i,
    };

`cargo.ts:1815`:

    function asksFor(crate: string, said: string): boolean {
      const words =
        CRATE_ASKED_AS[crate] ??
        new RegExp(
          crate
            .toLowerCase()
            .replace(/\bcrate\b/, '')
            .trim()
            .replace(/[^a-z0-9 ]/g, '.'),
        );
      return words.test(said);
    }

`quartermaster.ts:384`, in `takeOrder`:

    const items = itemsAskedFor(said.toLowerCase(), brain.orderable);
    if (items.length === 0) {
      // Only an outright order for something it cannot get is answered. Anything else is talk.
      if (/\b(order|ordering|requisition)\b/i.test(said)) {
        sendWord(
          brain,
          from,
          `${CANNOT_ORDER}, ${firstName(from)}. What cargo can get just now: ${listed(brain.orderable) || 'nothing'}.`,

## How it was found

Run. A throwaway script (`parse/items.ts` in the scratchpad) called `itemsAskedFor` with the lines above, lower-cased, and `['Janitorial Supplies Crate', 'Replacement Lights', 'Bureaucracy Crate']`. The table is its output. Not seen in a round log. CARGO-05 covers the count in the same function; this is only which crate.

## How to fix it

1. In `CRATE_ASKED_AS`, add the paper crate: `'Bureaucracy Crate': /bureaucra|paper|stationery|\bpens?\b|clipboards?|office supplies|folders?/i`. Use the same list for `PAPER_CRATE` in `quartermaster.ts` so the two cannot drift: export it from `cargo.ts` (or `supply.ts`).
2. Widen the lights words to word starts: `/\blight\s*(bulb|tube)s?\b|\blights?\b|\bbulbs?\b|\btubes?\b/i`, so "lightbulbs" and "light tubes" are lights.
3. Widen the janitor words: `/\bjani|janitor|custodial|cleaning|cleaner|\bmops?\b|\bsoap\b|\bbuckets?\b|\bbrooms?\b|\brags?\b/i`.
4. The table is keyed by the pack's name, which comes from the server. A pack renamed upstream falls back to its own name silently: add a check in a table test that every name `orderable_crates()` can give has an entry.
5. Keep "the cargo bay lights are out" from ordering lights. Most callers only call `itemsAskedFor` once the line is already an order (`takeOrder`, `fills`, the Quartermaster's `GIVEN_WORDS` line). One does not: `askWhatWasMeant` (`quartermaster.ts:525`) calls it on any line of the Captain's about an order waiting on its say, and takes a crate named there as a new order rather than a yes or a no, so it does not ask "is that a yes or a no". Wider words ("paper", "tubes", "buckets") make that skip a little more often. Add a row to the test: the Captain saying "yes, the paper one" to an order waiting on its say is still read as an answer by `readAnswer` first (check the order in `quartermaster.ts` that `readAnswer` runs before `askWhatWasMeant`).

## How to test the fix

- Add the rows above to a table in `tools/llm_crew/book.ts` (it already imports the Quartermaster's readers), each wanting the crate named.
- Run `bun tools/llm_crew/book.ts` and the cargo scenarios of the simulator with a head saying "order paper".

## Check

Opus 5.5, 2026-11-19. Confirmed.

- `CRATE_ASKED_AS` (`cargo.ts:100`), `asksFor` (`cargo.ts:1815`), `itemsAskedFor` (`cargo.ts:1833`) and `takeOrder` (`quartermaster.ts:377`) are as quoted. `orderable_crates()` (`crew_npc_cargo.dm:27`) offers exactly `/datum/supply_pack/service/janitor`, `/service/lightbulbs` and `/misc/paper`, whose names in `code/modules/cargo/packs/` are "Janitorial Supplies Crate", "Replacement Lights" and "Bureaucracy Crate". So the paper crate falls back to its own name, `/bureaucracy/`.
- Ran a throwaway script in the scratchpad (bun, importing `jobs/index.ts` first to get past a load-order error, then `itemsAskedFor`). Results: "order paper", "order lightbulbs", "order jani supplies", "order some pens", "order stationery", "order a crate of paper" all give nothing; "order light bulbs", "order a bureaucracy crate", "order cleaning supplies" give the right crate; "order a crate of janitorial supplies and a crate of paper" gives the janitor crate only, so the paper is dropped from a two-kind order without a word.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans touches these words. "Loose wording for orders" (an LLM as last-resort reader) is approved but not built, so nothing catches the miss today.
- Severity medium stands: the reply names "Bureaucracy Crate", so the head can ask again and the work gets done, but a player would notice. Effort small: one table and one shared constant.
- Added to step 5: `askWhatWasMeant` is a caller that does not need an order word, so wider words change it slightly. `readAnswer` runs before it (`quartermaster.ts:1446` and `1605`), so a plain yes or no is not affected.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: edb6d9ee2bd.

- PARSE-06: part done. Every kind of crate cargo can get has words it is asked for by. The Bureaucracy Crate takes paper, stationery, pens, clipboards, office supplies and folders (PAPER_WORDS, exported). Lights take lightbulbs, light tubes and tubes. Janitorial supplies take jani, custodial, buckets, brooms and rags. Look in jobs/cargo.ts: CRATE_ASKED_AS, PAPER_WORDS. Left: quartermaster.ts: replace PAPER_CRATE with `import { PAPER_WORDS } from './cargo'` so the two lists cannot drift. book.ts: a case where the Captain says 'yes, the paper one' to an order waiting on its say, still read as a yes.

Round two (branch crew-bug-fixes-medium): fd386eec9e7. This finishes the parts left above, apart from any step that waits on the owner.
