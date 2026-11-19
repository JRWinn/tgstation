---
id: QM-03
title: Two technicians with one first name both place every order given to either, and the meeting deals out their work for ever and never closes
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:684, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1634, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:144, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2142, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2111
fix: Address a technician by first name only when no other technician aboard shares it, else by full name, and read the full name back on both sides
---

## What is wrong

See also: HEAD-03 (the call-on at any head's meeting) and SECT-16 (warrants). Those are the same shape in the meeting turns and in security; this one is the Quartermaster's orders and duty split, where the cost is every order bought twice.

Everything the Quartermaster says to one technician begins with that technician's first name and nothing else: the order ("Sam, order 3: I need to order ..."), the standing work ("Sam, the counter is yours this shift."), being sent to see to something ("Sam, crate #12 ... See to it, please."). Every technician's window decides whether a line is meant for it by comparing that one word with its own first name. With two technicians called Sam (Sam Bell and Sam Cole) both take every such line as their own.

What follows:

1. **Every order is placed twice.** The Quartermaster gives order 3 to Sam Bell. In `cargo.ts` `overhears`, both Sams match `^Sam\b`, both set `brain.givenOrder`, both say "Order 3, right away." and both walk to the console. The Quartermaster accepts only the reply from `givenTo` (`order.givenTo === speaker`), but nothing stops the other placing it. Two crates are bought, the budget pays twice, and the second arrival is word about an order 3 the book already has as docked, so it is dropped by `noteDocked` (`order.state === 'docked'` returns) and that crate is never told to anyone.
2. **The staff meeting never ends of itself.** `dutiesFor(['Sam Bell', 'Sam Cole'])` gives Sam Bell the counter and Sam Cole the shuttle and the rooms. `dutyOwed` finds Sam Bell owed his, `dutyStep` says "Sam, the counter is yours this shift.", and `afterSaying` records it against `technicians(brain).find(first name is sam)`: whichever Sam is first in the list, say Sam Bell. Next step, Sam Cole is owed "Sam, the shuttle and the rooms are yours this shift." `afterSaying` again finds the first Sam, Sam Bell, and writes the shuttle and rooms against him. Now Sam Bell is owed the counter again. `dutyStep` is the meeting's `before` step, which comes ahead of the closing line, so it says the two lines in turn until `MEETING_MAX_DS` ends the meeting by time. The same happens at every meeting.
3. **On the technicians' side** (`cargo.ts:2111`), each Sam hears each duty line as its own and keeps whichever was said last, so after the meeting both have the same work and nobody has the other.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:684`, `giveLine`:

    return `${firstName(to)}, order ${order.n}: ${ORDERING} ${orderSpoken(order.items)}, for ${order.from}.`;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:144`, `dutyLine`:

    return `${name.split(' ')[0]}, ${said} ${duties.length === 1 ? 'is' : 'are'} yours this shift.`;

`quartermaster.ts:1634`, in `afterSaying`:

    const duty = dutiesIn(called);
    if (duty) {
      const name = technicians(brain).find(
        (it) => firstName(it).toLowerCase() === duty.first.toLowerCase(),
      );
      if (name) {
        ledger.duties[name] = duty.duties;
      }

`quartermaster.ts:752`, `dutyOwed`, which compares against what `afterSaying` wrote:

    if (duties && duties.join() !== (ledger.duties[name] ?? []).join()) {
      return { name, duties };
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2142`, the technician taking an order meant for it:

    given &&
    isQuartermaster(speakerJob) &&
    new RegExp(`^${firstName(brain.name)}\\b`, 'i').test(heard.trim())

and `cargo.ts:2111`, the duty line:

    firstName(brain.name).toLowerCase() === first
      ? brain.name

`seeToLine` and `tryAgainLine` (`supply.ts:229`, `:235`) and the check at `cargo.ts:2130` are the same.

## How it was found

Read from the code on both sides of the line, not run and not seen in a round. Confidence is "likely" and not "sure" only because the meeting loop was followed by hand through `dutyOwed`, `dutyStep` and `afterSaying`, not driven in a script. Random names in /tg/ come from long lists, so two technicians sharing a first name is not common; with three or four cargo staff over many rounds it will happen. The same shape (first name only) is in the security and engineering hand-offs; this write-up covers supply only.

## How to fix it

1. Add a helper in `supply.ts`, `calledBy(name, others)`: the first name if no other name in `others` has the same first name, otherwise the full name. `others` is `technicians(brain)` on the Quartermaster's side.
2. Use it in `giveLine`, `dutyLine` (pass the name it returns), `seeToLine` and `tryAgainLine` calls in `quartermaster.ts`, and in `heardIt` (the "Sam, I have that." line).
3. `dutiesIn` reads `^(\S+), the ...`: change it to read everything before ", the counter|shuttle|rooms", and in `afterSaying` match that against the full name first, then the first name. `SEE_TO_WORDS` the same.
4. On the technicians' side (`cargo.ts:2111`, `:2130`, `:2142`, and the `WORD_HEARD` check at `:2095`), take a line as its own when it begins with its full name, or with its first name alone (followed straight by the comma) and no other technician it knows of shares that first name. A line that begins with a full name that is not its own is never its own, even if the first word matches: the technician may not know of its namesake (it is not in view and not on the PDA list) when the Quartermaster does, and the present `^Sam\b` test would still match "Sam Cole, order 3". The duty line read back at `:2111` must also take the full name when one is given, so the duties go against the right workmate.
5. Keep the plain first name in the common case, so the lines read as now.

## How to test the fix

In `tools/llm_crew/book.ts`, add a Quartermaster with technicians Sam Bell and Sam Cole: the give line must start "Sam Bell," and two duty lines must leave `ledger.duties` with one entry each. In `tools/llm_crew/sim.ts`, a scenario with two cargo technicians given the same first name: one order, one crate bought (grep `game.log` for "order" lines from each body), and the meeting closes with "The meeting is over".

## Check

Checked by Opus 5.5. Every quote is what the code says today (`dutyLine` returns at `supply.ts:144`, not 138; the top block is mended). I followed both faults through the code:

- The order. `cargo.ts` `overhears` (line 2138 on) takes any Quartermaster line that matches `GIVEN_WORDS` and starts with its own first name, and sets `brain.givenOrder`. It does not look at `event.details.said_to` or at who the Quartermaster walked up to. `syncTasks` (`cargo.ts:740`) then makes a `GIVEN` task, and its step (`cargo.ts:993`) goes to the console and orders, held back only by `brain.orderPending`, which is that body's own order. Nothing on the server stops the second order. `noteDocked` (`quartermaster.ts:1371`) returns on an order already `docked`, so the second word of order 3 is dropped.
- The meeting. `dutiesFor` deals by sorted full name, `dutyOwed` compares by full name, and `afterSaying` (`quartermaster.ts:1634`) writes the line against the first technician in `technicians(brain)` whose first name matches. Whatever the order of that list, one Sam is always written to and the other never, so `dutyOwed` always finds the other owed. `dutyStep` is the meeting's `before` step (`head.ts:869`), which comes ahead of the closing line, so the meeting is ended only by `MEETING_MAX_DS` (4200 deciseconds, seven minutes, `head.ts:597`) or by everyone leaving the room. That is certain from the code, so I raised confidence to sure.

Not a duplicate: HEAD-03 is the call-on for reports at any head's meeting, SECT-16 is warrants. Not in the change log or plans. Severity medium stands: the case is uncommon (two cargo staff with one first name) but costs credits and a meeting each time. The fix works; I added to step 4 that a line starting with someone else's full name must never be taken as one's own, since the technician's list of workmates can be shorter than the Quartermaster's. Not run.
