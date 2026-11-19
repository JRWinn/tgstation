---
id: QM-03
title: Two technicians with one first name both place every order given to either, and the meeting deals out their work for ever and never closes
kind: bug
severity: medium
effort: medium
confidence: likely
status: found
found_by: Opus 5.5
area: quartermaster
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:684, tgui/packages/tgui/interfaces/CrewBrain/jobs/quartermaster.ts:1634, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:138, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2142, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2111
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
4. On the technicians' side (`cargo.ts:2111`, `:2130`, `:2142`, and the `WORD_HEARD` check at `:2095`), take a line as its own when it begins with its full name, or with its first name and no other technician it knows of shares that first name.
5. Keep the plain first name in the common case, so the lines read as now.

## How to test the fix

In `tools/llm_crew/book.ts`, add a Quartermaster with technicians Sam Bell and Sam Cole: the give line must start "Sam Bell," and two duty lines must leave `ledger.duties` with one entry each. In `tools/llm_crew/sim.ts`, a scenario with two cargo technicians given the same first name: one order, one crate bought (grep `game.log` for "order" lines from each body), and the meeting closes with "The meeting is over".
