---
id: QM-01
title: Any word like no in anything the Captain sends refuses the order waiting on them, and a new order sent with an ok or a no in it is thrown away
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:478, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:134, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1446, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1605
fix: Read a Captain's line as an answer only when it is short or names the order, weigh yes against no instead of no first, take a new order in the same line as well, and ask back when both or neither are found
---

## What is wrong

While an order is waiting on the Captain's say, every PDA message from the Captain, and every line the Captain says to the Quartermaster's face, goes first through `readAnswer`. `readAnswer` looks for any word from `NO_WORDS` anywhere in the text, and if it finds one the order is refused, written in the book as refused, and whoever ordered is told "The Captain has said no". The no list is tried first, so a yes and a no in one line is a no. If no no-word is there, any yes-word (`ok`, `fine`, `sure`, `get it`, `do it`) approves it. Either way `readsMessage` returns at once, so whatever else the line said is not read: a new order sent in the same message is thrown away with no word back.

The Captain is the human player, who words things loosely. Common ways of saying yes are refusals here, ordinary messages about other things refuse the order, and common ways of saying yes are not heard at all. A refusal cannot be undone: the order is `refused`, `isOpen` is false, nothing looks at it again, and the head has been told no.

Checked with a script that builds a Quartermaster from `tools/llm_crew/fixtures.ts` with a budget of 600, takes a 400 credit order from the Head of Personnel (more than half the budget, so it asks the Captain), and then hands `QUARTERMASTER.readsMessage` one message from the Captain:

| The Captain sends | What the Quartermaster does |
| --- | --- |
| "Sure, no worries." | Refuses order 1, tells Hop Kins "The Captain has said no to order 1" |
| "Approved, but don't spend more than that." | Refuses order 1 |
| "Yes, go for it. No need to ask again." | Refuses order 1 |
| "No one goes into the vault today." | Refuses order 1 |
| "No rush, but order me a crate of replacement lights." | Refuses order 1, and the Captain's own order for lights is never taken |
| "Ok, order me a crate of replacement lights." | Approves order 1, and the Captain's order for lights is never taken |
| "Go for it" / "Affirmative" | Nothing: not an answer, and `askWhatWasMeant` does not ask either, because neither line has a word from `ABOUT_ORDER_WORDS` |

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:134`, the word lists:

    const NO_WORDS =
      /\b(no|nope|nah|denied|deny|refused?|rejected?|not approved|do not|don'?t|negative|cancel)\b/i;
    const YES_WORDS =
      /\b(yes|yep|yeah|aye|approved?|granted|go ahead|go on|do it|buy it|get it|place it|places? (that|the|your) order|put it through|fine|ok|okay|sure|agreed|authori[sz]ed|no (objection|problem))\b/i;

`quartermaster.ts:478`, in `readAnswer`:

    const order = orderAnswered(ledger, text);
    const no = NO_WORDS.test(text) && !/\bno (objection|problem)\b/i.test(text);
    const yes = YES_WORDS.test(text);
    if (!order || (!no && !yes)) {
      return false;
    }
    if (no) {
      order.state = 'refused';

`quartermaster.ts:1446`, in `readsMessage`, which returns before the line is read as an order:

    if (/captain/i.test(job) && readAnswer(brain, text)) {
      return;
    }

and the same at `quartermaster.ts:1605` in `overhears`, for a line said to its face.

`orderAnswered` (`quartermaster.ts:464`) takes any number in the text as the order meant, so "Yes, 2 crates is fine" with orders 2 and 5 waiting answers order 2 whichever was asked about.

## How it was found

Read from the code, then a throwaway script (`cap.ts` in the system temp folder) importing `tools/llm_crew/fixtures.ts` and `jobs/quartermaster.ts`, run with `tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe`. Its output is the table above. Not seen in a round. Not in `LLM_CREW_CHANGELOG.md` or the plans as known; the 09:12 plan (`LLM_CREW_PLAN_ROUND_0912.md:102`) dealt only with the case where neither list matched.

## How to fix it

1. In `readAnswer`, treat a line as an answer only if it is short (say under 12 words) or names the order's number with the word "order", and it carries no order of its own (`itemsAskedFor` finds nothing in it). A longer line, or one that orders something, is not an answer.
2. Do not try no first. Count both: a line with a yes-word and no no-word is yes, the reverse is no. With both or neither, call `askWhatWasMeant` instead of guessing. Drop the bare `no` from being decisive when it is followed by a noun ("no one", "no rush", "no worries", "no need"): match `^\s*no\b` or `\bno[.!,]?\s*$` or "no to order N" for the bare word, and keep the plain refusal words (`denied`, `refused`, `rejected`, `not approved`, `cancel`).
3. Add common yes forms: `go for it`, `affirmative`, `absolutely`, `of course`, `yes please`, `approve`, `green light`, `sounds good`.
4. In `readsMessage` and `overhears`, after an answer is read, do not return: go on and read the same line as an order (`takeOrder`), so "Ok, and order me a crate of lights" does both.
5. In `orderAnswered`, take a number as naming an order only when it follows the word "order" (`/\border\s+(\d+)/`).
6. The owner asked for loose wording to be understood (memory "Loose wording for orders", the M5 item in `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`) and approved the model as a last-resort reader in its own small prompt. A line that step 2 cannot settle could go to that reader with "yes, no or neither?" and only after that to `askWhatWasMeant`. A dead model must still end in the plain question.

## How to test the fix

Add the lines in the table to `tools/llm_crew/book.ts` as cases: each with an order waiting, the state the order should be in afterwards, and for the two that order lights, that a second order is in the book. Type check and lint the window code. In the next round, as Captain, answer a big purchase with "Sure, no worries" and grep `game.log` for "wrote in its order book: Order" to see "The Captain said yes".
