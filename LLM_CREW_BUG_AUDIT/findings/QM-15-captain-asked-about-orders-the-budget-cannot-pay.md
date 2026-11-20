---
id: QM-15
title: The Captain is asked twice to approve every order that the budget cannot pay at all, which at the start of a round is every order, since cargo starts with nothing
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:643, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:656, code/controllers/subsystem/economy.dm:76
fix: In clearOrders test the money first, hold an order the budget cannot cover and tell whoever ordered, and put it to the Captain only once it can be paid and is still big
---

## What is wrong

`clearOrders` asks the Captain about an order before it looks at whether there is money for it. An order is big if it is over 1,000 credits or over half of what is free. With nothing free, every order is over half of nothing. So:

1. Cargo's account starts the round at 0 (`SSeconomy.Initialize`: "cargo starts with NOTHING"). The Head of Personnel's first order, one Janitorial Supplies Crate at 400 credits, is big.
2. The Captain is sent "Captain, order 1: the Head of Personnel Hop Kins wants 1 Janitorial Supplies Crate: 400 credits of 0 in the budget. Yes or no?", and again three minutes later.
3. If the Captain says yes, the order is then "held for money", which it would have been anyway. If the Captain says nothing, it is "held: no answer" and the head is told it waits on the Captain. When money does come in, the "no longer a big purchase" path clears it and sends the Captain a third message about it.

Every order in the first part of a round goes this way, so the human Captain's first PDA messages from the Quartermaster are a string of yes-or-no questions about orders nobody can pay for, each of which goes through the answer reading that QM-01 and QM-08 show is easily wrong.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:643`, in `clearOrders`:

    const free = moneyFree(brain, ledger);
    const big =
      order.cost > BIG_PURCHASE_CR || (free !== null && order.cost > free / 2);
    if (big && order.approved === null) {
      if (captain) {
        order.state = 'asking';
        ledger.toWrite.push(BOOK.asked(order));
        askCaptain(brain, order, captain);
        continue;
      }

and only after that, at `quartermaster.ts:656`:

    if (free !== null && order.cost > free) {

`code/controllers/subsystem/economy.dm:76`:

    if(dep_id == ACCOUNT_CAR) //cargo starts with NOTHING
    	new /datum/bank_account/department(dep_id, 0, player_account = FALSE)

## How it was found

Read from the code. Not run, not seen in a round. The plan (`LLM_CREW_PLAN_QUARTERMASTER.md`) set the rule for big purchases but says nothing on which test comes first; this is a gap in the rule, so the owner may want a say.

## How to fix it

1. In `clearOrders`, for an order in `new` with `approved === null`, test `free !== null && order.cost > free` first: hold it for money and tell whoever ordered, as now, and do not ask the Captain yet.
2. Once the money is there, test big as now (over 1,000, or over half of what is free) and ask the Captain only then. An order over 1,000 credits still always goes to the Captain.
3. The question to the owner: should an order over 1,000 credits be put to the Captain at once even when it cannot be paid yet, so that the Captain's say is in hand when the money comes? Step 2 as written waits; asking at once for those alone is the other choice.

## How to test the fix

In `tools/llm_crew/book.ts`: budget 0, one 400 credit order: no question to the Captain in `toTell`, the orderer told it is held for money. Raise the budget to 600: the order is now big (more than half) and the Captain is asked. Raise it to 2,000 instead: the order is cleared with no question. Type check and lint.
