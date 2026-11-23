---
id: SECT-08
title: Someone in a locked room who answers that the Captain or their own head sent them is taken to have given no answer, and is walked out
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 2656f69bbf7, 45dd3f4bd75, 8b5cb8825b4, f45112ee66d
found_by: Opus 5.5
checked_by: Opus 5.5
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

A second thing narrows it. If a cargo body opened the door for the janitor, `noteLetIn` put it on the department's shared list (`cargo.ts:2000`, `2026`), so `sentFor` is true for every technician and nobody asks. The fault needs the janitor to have got in some other way: the Captain or a head opening the door, a door left open, or a player.

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

1. In `guardOverhears`, after `workmateNamedIn` finds nobody, look with `namesPerson` for a name among the people the guard knows the job of: `peopleInView` (`job`, and `command` from the server) and `pdaPeople` (`job`). `brain.people` has no jobs in it. Keep those whose job passes `isHead` (`hierarchy.ts:101`, which counts the Captain). Several job files keep a private `jobOf(brain, name)` that does this lookup (`desk.ts:132`); copy or share it.
2. If that person is in sight, set `asked.voucher` to them and let the existing ask ("Zim, did you ask Tolly to come in here?") and answer run as for a workmate. Asking the Captain is not laying a hand on him. Mind two things. A head NPC is only made to answer (`brain.vouchAsked`) if it has a post and the asker is among its workmates (`guarding.ts:703` and `810`); otherwise no answer comes and, after two asks, `syncGuarding` takes the word, which is the right end. And if one does answer, `vouchStep` says yes only if its own `sentFor` is true, which an order given by PDA or by word (a task's `askedBy` on the other body) does not set: a head NPC that sent the janitor would say "No" and the janitor would be put out. Either note the order in the head's `sentFor` when it gives one, or take the word of a head without asking.
3. If they are not in sight, the owner should choose: take their word (as `syncGuarding` already does when a named workmate is not there to ask), or send the Captain or head a PDA and wait for a yes. Taking the word is the smaller change and matches what is done for workmates today.
4. Leave the rest alone: no name at all, or owning up, still ends in "go".

## How to test the fix

Simulator: a scenario with a janitor whose clean task is `askedBy` the Captain, standing in the Cargo Bay with a technician. The technician asks, the janitor answers, and the technician leaves it to its work (`verdict: 'stay'`, no `throw_out` step). With the Captain in sight, the technician asks him "did you ask Tolly to come in here?" first. Make sure the janitor got in without a technician opening the door (no `noteLetIn`), or the shared list lets it stay and the scenario proves nothing. Add one where the head who sent it is an NPC in sight, to check it does not answer "No". Keep the old `vouch` scenario passing: a stranger who names nobody is still put out. In a round, grep `game.log` for "asked me to come in here" followed by "You have no business in here".

## Check

Read `guardOverhears` (`guarding.ts:663` to 830), `workmateNamedIn` (294), `syncGuarding` (343 to 405), `explainStep`, `vouchStep` and the stranger steps of `planGuarding` (466 to 610), `sentFor` and `expected.ts`, the cargo calls that write `noteSentFor` and `noteLetIn` (`cargo.ts:771`, 1976, 2000, 2026, 2046), and `belongs_in_post` (`crew_npc_guarding.dm:24`). The quotes match. Traced: a janitor told by the Captain gets a clean task with `askedBy` the Captain (`tasks.ts:218`, `janitor.ts:844`); asked why, `reasonToBeHere` finds it and `explainStep` names him; `workmateNamedIn` looks only at `brain.workmates`; `NO_REASON_WORDS` does not match the answer; after two asks `waitedOut` settles "go" and the guard says "You have no business in here" and uses `throw_out`. Nothing stops it unless the Captain is among the guard's workmates or a cargo body let the janitor in. No entry in the change log or plans chose this. Confirmed. Step 1 named `brain.people`, which holds no jobs, and step 2 missed that a head NPC asked would answer "No" by its own `sentFor`; both are mended. Not run.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: none.

- SECT-08: waits on the owner (QUESTIONS_FOR_OWNER.md). 

## Fix so far (round A1, owner's answer B)

Heads' side, group a-heads (2026-11-22): a head notes whom it sends where (`noteSending`, `noteSaidSending` in `jobs/head.ts`): any PDA message it sends someone, or line it says opening with someone's name in view, that names a room, kept an hour. Lines to someone it answers to are not noted. Asked "Did you send <name> to the <room>?" (`SENT_ASK_WORDS`), aloud to it or by PDA, it answers word for word "Yes, I sent <name>." or "No, I did not send <name>." (`answerSentAsk`, `sentAnswerLine`), by PDA if asked by PDA. With nothing noted, no. Wired into the Head of Personnel (`jobs/head.ts`) and the Chief Engineer (`jobs/chiefengineer.ts`). Held: the Quartermaster (`jobs/quartermaster.ts`) and the Head of Security (`jobs/headofsecurity.ts`) need the same four hooks. The keeper's side is a-cargo's (`jobs/guarding.ts`). Table `tools/llm_crew/head-sent.ts`.
