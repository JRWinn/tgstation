---
id: SECT-14
title: A second stranger whose first name is inside the words said to the first, Ian beside Brian, is counted as asked and is put out without a question
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:852
fix: In guardAfterSaying match the first name as a whole word, and better still note which stranger the step was for instead of searching the line
---

## What is wrong

After a guard says one of its lines, `guardAfterSaying` decides which stranger it was said to by looking for each stranger's first name in the line as a substring. A stranger whose first name is part of another word in the line is taken to have been spoken to as well.

Concrete case. Two people are in the Cargo Bay with no business there: Brian Holt and Ian Moss. The technician asks "Brian, why are you in here? This room is locked to the crew." In `guardAfterSaying`, "brian, why are you in here?..." includes "ian", so Ian's record gets `askedAt = now` and `asks += 1` as well as Brian's. The technician then waits on Ian's answer (Ian was never asked), asks Brian a second time, and Ian's count goes to 2 again. Thirty seconds on, `waitedOut` is true for Ian: "Asked twice, and not a word." Ian is told "You have no business in here, Ian. Out you go." and walked out, never having been asked why they were there.

Other pairs that do the same: Ann and Joanna, Eli and Elizabeth, Al and Alan. The seeing-out line has "thank" and "wanted" in it, so a stranger called Han is marked as told to go (`toldOutAt`) when someone else is thanked and seen out; if Han is later settled "go", they are walked out without being told.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:852`, in `guardAfterSaying`:

    for (const [name, stranger] of Object.entries(brain.strangers)) {
      if (!said.includes(firstName(name).toLowerCase())) {
        continue;
      }
      if (said.includes(ASKING_WHY)) {
        stranger.askedAt = brain.now;
        stranger.asks++;

## How it was found

Read from the code. "brian, why are you in here?".includes("ian") is true. The names in `strings/names/` were checked against the fixed guard lines with a shell loop: "han" and "wan" from those lists turn up inside "thank" and "wanted". Not run through the brain, and not seen in a round.

## How to fix it

1. Best: have each guard step say whom it is for. `planGuarding` knows the stranger (`task.item`). Add the name to the plan (for example `about: name`), have the driver pass it to `afterSaying` with the line, and in `guardAfterSaying` change only that stranger's record.
2. Smaller: match the first name as a word, `new RegExp(`\\b${escape(first)}\\b`, 'i').test(called)`, and only at the start of the line or after "Thank you, ", which is where every guard line puts the name.

## How to test the fix

A case in a new guarding table: two strangers, Brian Holt and Ian Moss, in the post; `guardAfterSaying(b, 'Brian, why are you in here? This room is locked to the crew.')` leaves Ian's `asks` at 0.
