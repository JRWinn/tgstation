---
id: QM-10
title: A head or the Captain asking about an order, or saying to cancel one, has a new order placed for them, and there is no way to cancel an order at all
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:131, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1460, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1623, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:377
fix: Take a line as a new order only if it asks for something (no question about an order, no cancel or do not), answer questions from the book in code, and add a cancel that refuses an order not yet given
---

## What is wrong

Anything a head or the Captain sends the Quartermaster, or says to its face, with the word "order" (or "buy", "purchase", "requisition") in it, and a word for one of the crates cargo can get, is taken down as a new order and goes ahead. `ORDER_WORDS` matches the bare word "order" anywhere, and `takeOrder` takes whatever crate `itemsAskedFor` finds. Nothing looks for a question mark, "cancel", "don't", "has ... come", "why". The only guard is that the same items from the same person while one is open are not taken twice; a question about someone else's order is from a different person, so it is.

Checked with a script (`cancel.ts` in the system temp folder): the Head of Personnel has ordered a crate of replacement lights (order 1, cleared). The Captain then sends one message. In every case a second order is taken down for the Captain, already approved (the Captain's own), and the Captain is told "Noted, order 2: ..., 400 credits":

| The Captain sends | What the Quartermaster does |
| --- | --- |
| "Cancel the replacement lights order, we do not need it." | Orders another crate of replacement lights for the Captain. Order 1 goes ahead too |
| "Has the janitorial order come in yet?" | Orders a Janitorial Supplies Crate |
| "Why did you order janitorial supplies?" | Orders a Janitorial Supplies Crate |
| "Don't order any more lights." | Orders a crate of replacement lights |
| "Did order 1 for lights arrive?" | Orders a crate of replacement lights |

The same happens to a head's line said to its face (`overhears`), and to a human head of department. The Captain is the human player and will ask after orders in ordinary words. Each of these spends 400 to 640 credits from cargo's budget, and the reply ("Noted, order 2") reads to the Captain as if their question were not understood.

There is also no way to stop an order. No code reads "cancel" except `NO_WORDS` in `readAnswer`, which only works on an order waiting on the Captain's say (and then on the oldest one, QM-08). An order for 1,000 credits that went through below the line, or any order a head sent by mistake, cannot be called off.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:131`:

    const ORDER_WORDS =
      /\b(order|ordering|requisition|buy|purchase)\b|\b(need|want|get|send)\b[^.?!]*\bcrates?\b/i;

`quartermaster.ts:1460`, in `readsMessage`, and the same at `quartermaster.ts:1623` in `overhears`:

    if (isHead(job) && ORDER_WORDS.test(text)) {
      takeOrder(brain, from, job, text);
      return;
    }

`quartermaster.ts:384`, in `takeOrder`, which takes any crate named:

    const items = itemsAskedFor(said.toLowerCase(), brain.orderable);

`quartermaster.ts:420`, which clears it at once for the Captain:

    if (/captain/i.test(job)) {
      order.approved = 'captain';
    }

## How it was found

Read from the code, then the script above, run with `tools/bootstrap/.cache/bun-v1.3.5-x64/bun.exe`. Not seen in a round. CARGO-07 is the like fault on the technicians' side when the model is down; this one is the Quartermaster's and does not need the model to be down. The owner's wish for loose wording to be understood (memory "Loose wording for orders") cuts both ways: loose wording that is not an order must not become one.

## How to fix it

1. Before `takeOrder`, in both `readsMessage` and `overhears`, sort the line into one of four in code:
   - **cancel**: `/\b(cancel|call off|scrap|don'?t (order|need|want|bother)|do not (order|need|want)|no longer need|never ?mind)\b/i`;
   - **question about an order**: a question mark, or `/\b(has|have|did|is|are|where|when|why|what)\b[^.?!]*\b(order|crate)/i` without "can you", "could you", "please" or "I need";
   - **order**: what is left that `ORDER_WORDS` matches;
   - **talk**: anything else.
2. For a cancel: find the order meant (by number, else the latest open one from that person that names the same crate, else the latest from anyone that names it, if the speaker is the Captain). If it is `new`, `asking` or `cleared`, set it `refused`, write "Order N. Cancelled by NAME." in the book (and read that line in `readBook` as refused), tell whoever ordered if that is not the speaker, and answer "Order N is cancelled." If it is `given` already, say so: "Order N is with Sam to place; I will tell them." and have the Quartermaster tell the technician face to face a fixed line the technician reads to drop `givenOrder` if not yet placed. Whether an order placed at the console may be called back is a question for the owner (the console in the game can remove an order from the shopping list).
3. For a question: answer from the book, in code, by PDA or aloud as it came: "Order 1, 1 Replacement Lights for Hop Kins: given to Sam to place." using `standing()`. The model may add a remark; the facts are code's.
4. Only for an order: `takeOrder` as now.
5. Keep the dead-model rule: all of this is code, and the model is not needed for any of it. The approved last-resort reader (memory "Loose wording for orders") can be asked to sort a line that step 1 cannot.

## How to test the fix

Add the five lines in the table to `tools/llm_crew/book.ts`: none may add an order; the cancel must leave order 1 `refused` with a "Cancelled" line in `toWrite`; the questions must put an answer in `toTell` naming order 1. Keep the existing cases where a head's plain order is taken. Type check and lint. In a round, as Captain, send the Quartermaster "Has the janitorial order come in?" and check `pda.log` for no "Noted, order".
