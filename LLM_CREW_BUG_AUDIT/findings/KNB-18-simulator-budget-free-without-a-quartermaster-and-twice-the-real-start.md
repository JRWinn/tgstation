---
id: KNB-18
title: The simulator charges nothing for an order when no Quartermaster is aboard, and starts cargo's budget at 2,000 credits where a real round starts with 500 to 1,000
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: tools
files: tools/llm_crew/sim.ts:651, tools/llm_crew/sim.ts:272, code/modules/llm_crew/crew_npc_cargo.dm:352
fix: Charge every order to the simulated budget as the server does, whoever is aboard, and start it at what a real round starts with, raised only in the scenarios that need more
---

## What is wrong

Listed in the 2026-11-18 02:27 entry ("the Quartermaster"), Known and not fixed: "The simulator counts cargo's budget only when a Quartermaster is aboard. Without one, a three-crate order early in a round passes in the simulator and would be refused by the real server." It is still so.

The server always checks the money. `tool_order` in `crew_npc_cargo.dm` asks the cargo department account, with or without a Quartermaster:

    	var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
    	if(budget && !budget.has_money(cost))
    		action_result(CREW_TOOL_ORDER, FALSE, "There is not enough money left in the cargo budget to order [order_in_words(wanted)].")

The simulator's stand-in only does when one is aboard:

        // With a Quartermaster aboard the budget is counted: an order it cannot cover is not placed.
        const cost = [...wanted].reduce((total, [crate, count]) => total + COSTS[crate] * count, 0);
        if (quartermaster()) {
          if (budget < cost) { ... 'There is not enough money left in the cargo budget to order that.' }
          budget -= cost; spentOn.push({ at: clock, cost });
        }

And it starts the budget high:

    let budget = process.argv[3] === 'qmpoor' || process.argv[3] === 'qmgone' ? 500 : 2000;

The same 02:27 entry says what a real round has: "the budget is 500 to 1,000 credits then and a crate is 400."

Two ways the tests mislead:

1. Every scenario without a Quartermaster (`crew`, `nested`, `office`, `waiting`, `mixed`, `lost`, `orders` and the rest) can never meet "not enough money". `mixed` orders two kinds of crate in one breath (800 credits) a few minutes in; on a real station that is refused early on, and the path a head takes after a refused order is never walked by these runs.
2. With 2,000 credits, a one-crate order is well under half the budget, so in `qm`, `qmpaper`, `qmlost` and `qmwait` the Quartermaster clears it itself. The check "the Captain is not asked about a small order the budget covers twice over" passes there. In a real round, by the half rule the owner set, nearly every early order goes to the Captain. The commonest real path is only met in the scenarios built for it (`qmbig`, `qmpoor`).

## Where

`tools/llm_crew/sim.ts:651` and `:272`, quoted above. `code/modules/llm_crew/crew_npc_cargo.dm:352`, quoted above.

## How it was found

Read from `sim.ts` and `crew_npc_cargo.dm`, starting from the 02:27 entry's line. No run was made.

## How to fix it

1. In the `order` case of `sim.ts`, drop the `if (quartermaster())` around the budget check and the charge. Keep `budget` handed only to the Quartermaster's brain, as now (`budget: body.job === 'Quartermaster' ? budget : null`).
2. Start `budget` at what a real MetaStation round starts with. Read the figure from the game (the cargo account's starting money in `SSeconomy`) rather than guess, and write where it came from next to it.
3. Give the scenarios that rely on plenty of money a variant flag that raises it, as `qmpoor` lowers it now, and say in each why.
4. Run the whole table once after the change: some old scenarios may fail on money, and each failure is either a real gap in how a head deals with a refused order, or a scenario that needs the flag.

## How to test the fix

Run every scenario in quiet mode before and after. Expect `qm` to start asking the Captain about its first order; if the scenario's check that the Captain is not asked then fails, that check was testing the generous budget, not the rule.
