---
id: SECT-08
title: Someone in a locked room who answers that the Captain or their own head sent them is taken to have given no answer, and is walked out
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:760, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:294, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:476
fix: Let the answer name anyone the guard knows to be the Captain or a head as well as a workmate, ask them if they are in sight, and take the word otherwise, or ask the owner which
---

## What is wrong

A crew member guarding its post asks a stranger "why are you in here?". The stranger's answer is read only for the name of one of the guard's own workmates. Any other name, the Captain's included, is neither a reason nor an owning-up, so it counts as no answer. The stranger is asked once more, gives the same answer, and 30 seconds later is told "You have no business in here" and walked out by the arm.

A crew NPC that is asked always answers with the truth as its code knows it (`explainStep`): "Zim asked me to come in here, to clean the floor." When the one who sent it is the Captain or a head of another department, that is the answer the guard throws away.

Concrete case. The Captain, Zim Fire, tells the janitor Tolly Field to clean the Cargo Bay and opens the bay door for it with his own ID. Tolly's clean task has `askedBy: 'Zim Fire'`. The technician Donna Sholl sees a stranger in the post, waits, and asks "Tolly, why are you in here? This room is locked to the crew." Tolly says "Zim asked me to come in here, to clean the floor." In Donna's `guardOverhears`, `workmateNamedIn` looks only through `brain.workmates`: Zim is not one, so `voucher` is null; `NO_REASON_WORDS` does not match; nothing is settled. Donna asks again, Tolly answers the same, and after `ANSWER_WAIT_DS` the `waitedOut` test settles it `'go'`. Tolly is walked out of the room the Captain sent it to, and keeps out of it a while.

The same happens to a technician sent by the Quartermaster into another department's locked room, or to a player who says "the Captain sent me".

One thing softens it. `brain.workmates` is everyone the guard has ever seen in its post with `belongs` true, and `belongs` is true for anyone the post's doors open for (`belongs_in_post` in `crew_npc_guarding.dm`), which takes in the Captain and heads with wide access. So if the Captain has once stood in the Cargo Bay while this technician was there, he is a "workmate" and his name is taken and checked. A Captain the technician has never seen in the bay, and a head whose ID does not open the bay, are not.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:760`, in `guardOverhears`:

    const voucher = workmateNamedIn(brain, heard, [speaker]);
    if (voucher && voucher !== brain.name) {
      asked.voucher = voucher;
    } else if (voucher || NO_REASON_WORDS.test(heard)) {
      settle(brain, speaker, asked, 'go');
    }
    // Anything else is no answer yet. They are asked once more before it is taken for none.

`guarding.ts:294`, `workmateNamedIn`, looks only at workmates:

    const others = [...brain.workmates].filter(
      (name) => !except.includes(name) && name !== brain.name,
    );

`guarding.ts:401`, in `syncGuarding`, two asks with no answer it can use is a no:

    } else if (waitedOut(stranger.askedAt, stranger.asks)) {
      // Asked twice, and not a word.
      settle(brain, name, stranger, 'go');

`guarding.ts:476`, in `explainStep`, what a crew NPC answers:

    say: `${sender} asked me to come in here${why.what ? `, to ${why.what}` : ''}.`,

## How it was found

Read from the code, following the answer from `explainStep` to `guardOverhears` and `syncGuarding`. Not run, and not seen in a round. How often it comes up depends on how often anyone outside the department sends someone into a locked room, which the rounds so far have not done.

## How to fix it

1. In `guardOverhears`, after `workmateNamedIn` finds nobody, look for a name among everyone the guard knows (`peopleInView`, `pdaPeople`, `people`) whose job is the Captain or a head (`isHead`, or `command` from the server).
2. If that person is in sight, set `asked.voucher` to them and let the existing ask ("Zim, did you ask Tolly to come in here?") and answer run as for a workmate. Asking the Captain is not laying a hand on him.
3. If they are not in sight, the owner should choose: take their word (as `syncGuarding` already does when a named workmate is not there to ask), or send the Captain or head a PDA and wait for a yes. Taking the word is the smaller change and matches what is done for workmates today.
4. Leave the rest alone: no name at all, or owning up, still ends in "go".

## How to test the fix

Simulator: a scenario with a janitor whose clean task is `askedBy` the Captain, standing in the Cargo Bay with a technician. The technician asks, the janitor answers, and the technician leaves it to its work (`verdict: 'stay'`, no `throw_out` step). With the Captain in sight, the technician asks him "did you ask Tolly to come in here?" first. In a round, grep `game.log` for "asked me to come in here" followed by "You have no business in here".
