---
id: QM-08
title: With two orders waiting on the Captain, a plain yes or no is taken as the answer to the first ever asked, not to the question the Captain has just been sent
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:464, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:574
fix: In orderAnswered, with no order named, take the order asked about most recently, and when more than one is waiting and the answer names none, ask which one before acting
---

## What is wrong

`orderAnswered` decides which waiting order an answer from the Captain is about. If the answer names no order number it takes `asking[0]`: the first order in the book that is still waiting, which is the oldest. A human answering a PDA answers the message in front of them, which is the newest one.

Checked with a script (`two.ts` in the system temp folder): a budget of 700, so each 400 credit order is more than half and goes to the Captain. The Head of Personnel orders janitorial supplies (order 1); the Quartermaster asks the Captain, and asks again three minutes later. Then the Head of Security orders replacement lights (order 2), and the Quartermaster sends "Captain, order 2: the Head of Security Joan Marsh wants 1 Replacement Lights: 400 credits of 700 in the budget. Yes or no?" The Captain answers "Yes." The result:

    [ "1 Hop Kins new captain", "2 Joan Marsh asking null" ]

Order 1, which the Captain may never have meant to allow, is placed; order 2, the one said yes to, goes on waiting and is held after its second ask. A "No." the same way refuses the wrong order and tells the wrong head "The Captain has said no".

It is common once the budget is low: every order then counts as big (`order.cost > free / 2`), so several are waiting at once, and an order held after two unanswered asks stays first in the list for the rest of the round, so it takes every later bare yes or no.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:464`, `orderAnswered`:

    const asking = ledger.orders.filter(
      (order) => order.state === 'asking' && order.approved === null,
    );
    const named = [...text.matchAll(/\b(\d+)\b/g)].map((found) =>
      Number(found[1]),
    );
    return asking.find((order) => named.includes(order.n)) ?? asking[0];

`quartermaster.ts:574`, in `askCaptain`, which keeps the time of each ask:

    order.askedAt = brain.now;
    order.asks++;

`askWhatWasMeant` (`quartermaster.ts:521`) uses `orderAnswered` too, so its question names the oldest order as well.

## How it was found

Read from the code, then the script above, run with `tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe`. Not seen in a round. Not in the change log or the plans.

## How to fix it

1. In `orderAnswered`, with no order named, sort `asking` by `askedAt`, latest first, and take that one. Take a number as naming an order only after the word "order" (`/\border\s*#?(\d+)/gi`), so a count of crates or credits is not read as an order (see QM-01 step 5).
2. When more than one order is waiting and the answer names none, do not act on it at all: ask, the way `askWhatWasMeant` does, "Captain, is that order 2 (1 Replacement Lights) or order 1 (1 Janitorial Supplies Crate)?" Only with one waiting is a bare yes or no taken as it stands. The owner may prefer step 1 alone (answer the latest) as the simpler rule; either is better than today.
3. Make `askCaptain` put the number first so a reply quoting it is easy: it already does ("Captain, order 2: ...").

## How to test the fix

Add the case above to `tools/llm_crew/book.ts`: two orders waiting, a bare "Yes." must approve the one asked about last (or, with step 2, add a question to `toTell` and approve neither). A third case: "Yes to order 1" approves order 1. Type check and lint.
