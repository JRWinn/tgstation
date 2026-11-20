---
id: CARGO-14
title: Light bulbs for the janitor is ordered as a Janitorial Supplies Crate, because each clause gives one kind only, the first on the list, and janitor names the janitorial crate
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 05ec985e397, dab666d37af
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1839, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:101, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2072, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:384
fix: In itemsAskedFor strip who the order is for before matching, split on question and exclamation marks too, and take every kind a clause names by its own words rather than the first kind on the list
---

## What is wrong

What is ordered, and how many, is read from the words by `itemsAskedFor`, not left to the model (`fills` puts the result over whatever crate the model picked). It cuts what was said into clauses, and for each clause takes **one** kind: the first kind in `brain.orderable` whose words are in the clause. `brain.orderable` comes from the server in the order `orderable_crates()` builds it, so the Janitorial Supplies Crate is always tried first.

The Janitorial Supplies Crate is asked for by `/janitor|cleaning|cleaner|\bmops?\b|\bsoap\b/i`. Saying who the crate is for, "for the janitor", "for the janitors", "for the cleaner", is therefore read as asking for the janitorial crate, and the lights or paper actually named in the same clause are never ordered. People say who an order is for all the time, and lights for the janitors (who fit them) is the most natural way to put a lights order.

Concrete case, with no Quartermaster aboard: the Captain (the human player) at the counter, to a technician: "Can you order some light bulbs for the janitors?" The model agrees and picks `crate: "Replacement Lights"`. `fills` runs `itemsAskedFor("can you order some light bulbs for the janitors?", orderable)`. The whole line is one clause ("?" is not a split). `orderable.find` tries the janitorial words first; "janitor" is in "janitors"; the result is `[{crate: "Janitorial Supplies Crate", count: 1}]`. `fills` overwrites the model's choice with it. A janitorial crate is bought and the Captain is sent its number; no lights come.

The same reader is used by the Quartermaster for orders sent to it by PDA (`quartermaster.ts:384`), so a head or the Captain typing "Please order replacement lights for the janitor" to the Quartermaster has a janitorial crate written in its book, given to a technician, and bought.

The window code's own fixed lines dodge it only because they say "for my staff" (`head.ts:974`) or put the name after a comma that `GIVEN_WORDS` cuts off.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1838`, in `itemsAskedFor`:

      for (const part of said.split(/[,;.]|\band\b|\bplus\b|\balso\b|\bas well as\b/)) {
        const crate = orderable.find((kind) => asksFor(kind, part));
        if (!crate) {
          continue;
        }

`cargo.ts:100`, the words each kind is asked by:

    const CRATE_ASKED_AS: Record<string, RegExp> = {
      'Janitorial Supplies Crate': /janitor|cleaning|cleaner|\bmops?\b|\bsoap\b/i,
      'Replacement Lights': /\blights?\b|\bbulbs?\b|light tubes?/i,
    };

`cargo.ts:2071`, in `fills`, which puts the result over the model's pick:

      const said = spokenIn(heard).toLowerCase();
      const items = itemsAskedFor(said, brain.orderable);
      if (items.length > 0) {
        action.items = items;
        action.crate = items[0].crate;

`code/modules/llm_crew/crew_npc_cargo.dm:31`, the order `orderable` comes in:

    for(var/pack_type in list(/datum/supply_pack/service/janitor, /datum/supply_pack/service/lightbulbs, /datum/supply_pack/misc/paper))

## How it was found

A throwaway script (bun, in the scratchpad, importing `brain.ts` first and then `itemsAskedFor` from `jobs/cargo.ts`, with orderable `['Janitorial Supplies Crate', 'Replacement Lights', 'Bureaucracy Crate']`) printed:

    "can you order some light bulbs for the janitors?" => [{"crate":"Janitorial Supplies Crate","count":1}]
    "order a crate of replacement lights for the janitor, please" => [{"crate":"Janitorial Supplies Crate","count":1}]
    "order two crates of light bulbs for the cleaner" => [{"crate":"Janitorial Supplies Crate","count":2}]
    "could you order a crate of lights? the janitor says the bar is dark" => [{"crate":"Janitorial Supplies Crate","count":1}]
    "a crate of paper for the janitor" => [{"crate":"Janitorial Supplies Crate","count":1}]

Not seen in a round: the test rounds' heads use the fixed "for my staff" line. PARSE-06 is about kinds that are not recognised at all; this is a kind recognised in place of another, and is not the same fault.

## How to fix it

1. In `itemsAskedFor`, before matching, take out who the order is for: a phrase `for (the |my |our |a )?(janitors?|cleaners?|custodians?|staff|crew|department)\b`, and `for <a name>` where the name is someone in `brain.pdaPeople` (pass the names in, or do it in the callers). Keep the phrase out of the match only; nothing else reads it.
2. Split on `?` and `!` as well as `[,;.]`, so "Order some lights? The janitor..." is two clauses.
3. Within one clause, push every kind whose words are in it rather than the first one found (`orderable.filter` in place of `orderable.find`), with the same count rule. "A crate of lights and soap" is then still two kinds, and a clause naming one kind is still one.
4. Optionally make the janitorial words name the supplies, not the person: `/janitorial|cleaning|cleaner\b(?! (says|wants|needs))|\bmops?\b|\bsoap\b/`. With step 1 this is a belt to the braces; with step 1 alone "for the janitor" is already gone.
5. The Quartermaster's reader (`quartermaster.ts:384` and `:525`) gets the fix for free, as it calls the same function.

## How to test the fix

- Add the five lines above, and the existing multi-kind line "two crates of janitorial supplies and a crate of light bulbs", as cases in the items table in `tools/llm_crew/reports.ts` (the `items` helper at line 50), wanting Replacement Lights, Replacement Lights, 2 Replacement Lights, Replacement Lights, Bureaucracy Crate (once PARSE-06 gives paper its words), and the two kinds.
- Type check the window code.
- In a round, ask a technician "Can you order some light bulbs for the janitors?" and check `game.log` for the order line naming Replacement Lights.

## Check

Read on 2026-11-19 against `crew-bug-audit` at 2501deacd0c, and ran a throwaway bun script in the scratchpad (imports `brain.ts`, then `itemsAskedFor` from `jobs/cargo.ts`, orderable in the server's order).

- The quotes are what the code says: `CRATE_ASKED_AS` (`cargo.ts:100`), the `orderable.find` in `itemsAskedFor` (1838-1839), `fills` overwriting the model's crate (2071-2075), and the Quartermaster's `takeOrder` calling the same reader (`quartermaster.ts:384`). The server sends the names in the order of `orderable_crates()` (`crew_npc_cargo.dm:31`, via `assoc_to_keys` in `crew_brain_link.dm:144`), so the Janitorial Supplies Crate is always tried first.
- The script printed `Janitorial Supplies Crate` for "can you order some light bulbs for the janitors?", "... replacement lights for the janitor, please", "two crates of light bulbs for the cleaner" (count 2) and "could you order a crate of lights? the janitor says ...". "can you order some light bulbs?" gives Replacement Lights, so it is the "for the janitor" that does it.
- Not in the change log or the plans. PARSE-06 is a different fault (kinds with no words); its fix (janitor words as word starts, `\bjani`) still matches "janitors", so it does not mend this one.

Confirmed. On the fix: step 1 is the one that matters, and step 3 must not go in without it, or "lights for the janitor" becomes an order for both crates. Keep step 1 to the job words (janitor, cleaner, custodian, staff, crew, department) and leave out "for <a name>" unless a case needs it; it needs the PDA names passed in and gains little. Drop step 4's lookahead: it is easy to get wrong and step 1 already covers it. The table to add the cases to is the items table in `tools/llm_crew/reports.ts` (`items(said)`, line 50), which already imports `itemsAskedFor`.
