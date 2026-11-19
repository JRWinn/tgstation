---
id: SECT-09
title: A workmate's yes that has no or not anywhere in it, such as Yes I asked him in, no problem, is read as a no and the visitor is walked out
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: 31b4429a58b
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:50, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:309, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:785
fix: Take out set phrases such as no problem and not yet, read the answer from how it begins (no first), and only then look through the whole line
---

## What is wrong

When a guard asks a workmate "did you ask Tolly to come in here?", the answer is read by `yesOrNo`, which looks for a no-word anywhere in the line first and takes any one of them for a no. "No" in "no problem", "no worries", "no need to worry", and "not" in "he is not done yet" or "is that not allowed?" all make a yes into a no.

The workmate's answer is put in words by the model: `vouchStep` gives a plain line and `needs: has('Yes')`, but the step is not `exact`, so what is said, and what the guard hears and reads, is the model's line. A small model asked to say yes and to sound like a person will often add "no problem" or "he's not finished yet".

Concrete case. Donna Sholl asks her workmate Quin "Quin, did you ask Tolly to come in here?" Quin did, and the model says "Yes, Donna, I asked Tolly in to mop up. No need to worry." In Donna's `guardOverhears`, `yesOrNo` finds "no" and returns false. `settle(brain, 'Tolly Field', stranger, 'go')`. Donna is told that Quin did not send for Tolly, says "You have no business in here, Tolly. Out you go." and walks Tolly out. Every other workmate who heard it through `verifyHeard` reads the same line the same way (there a no is simply dropped, so they do not set 'stay').

How often the ask is put at all. A guard does not ask about someone its department let in or called by `act.person`: those go on the shared list (`cargo.ts:2000`, `2026`, `2048`) and `sentFor` is true for every workmate. The ask comes when only the voucher's own `brain.sentFor` has them: for one, a janitor other than the one called turns up while a call stands (`cargo.ts:771`). It also comes when the workmate asked is a player, whose own "yeah, no worries" is read the same way.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:50`:

    /** What a no and a yes sound like. A line with both in it is a no: "no, I did not". */
    const NO_WORDS = /\b(no|nope|not|never|didn'?t)\b/;
    const YES_WORDS = /\b(yes|yeah|yep|aye|i did|i have|correct)\b/;

`guarding.ts:309`:

    function yesOrNo(heard: string): boolean | null {
      if (NO_WORDS.test(heard)) {
        return false;
      }
      return YES_WORDS.test(heard) ? true : null;
    }

`guarding.ts:785`, in `guardOverhears`:

    const answer = yesOrNo(heard);
    if (answer !== null) {
      settle(brain, name, stranger, answer ? 'stay' : 'go');
    }

`guarding.ts:496`, in `vouchStep`, the line is the model's to word:

    say: did
      ? `Yes, ${firstName(asked.by)}, I asked ${firstName(asked.about)} to come in.`
      : `No, ${firstName(asked.by)}, I did not ask ${firstName(asked.about)} in here.`,
    needs: has(answer),

## How it was found

Read from the code. `yesOrNo("yes, donna, i asked tolly in to mop up. no need to worry.")` returns false by the regexes above (the line is lower-cased before it is read). Not run and not seen in a round.

## How to fix it

1. In `yesOrNo`, first take out the set phrases that carry a no-word and mean nothing of the kind: `\bno (?:problem|worries|need\b[^.]*|trouble|bother)\b`, `\bnot (?:yet|done|finished)\b`, `\bnot a problem\b`. Do this before both tests below, or "No problem, I asked him in." begins with "no".
2. Then look at how the answer begins, after an optional name and comma. Test the no first: `^\W*(?:\w+,\s*)?(?:no|nope|never|i did not|i didn'?t|not me)\b` is a no; then `^\W*(?:\w+,\s*)?(?:yes|yeah|yep|aye|i did|i have|correct|sure|of course)\b` is a yes. The order matters: "I did not ask him" begins with "i did", and the yes test alone would take it for a yes.
3. Only if it begins with neither, fall back to the whole-line test as now (no-words first), on the line with the phrases of step 1 taken out.
4. In `vouchStep`, make `needs` say the answer comes first: `needs: new RegExp(`^\\W*${answer}\\b`, 'i')` (a plain RegExp; `has()` checks for the word anywhere). The plain line already begins that way, so a model line that does not is dropped for it.
5. This also mends `verifyHeard` (`guarding.ts:799`), which uses the same `yesOrNo`.

## How to test the fix

Add cases for `yesOrNo` (export it, or test through `guardOverhears`): "Yes, Donna, I asked Tolly in. No need to worry." is true; "Yes, he's not done yet" is true; "No, I did not ask him" is false; "Not me, ask Quin" is false; "Hmm?" is null; "I did not ask him in." is false; "Donna, yes, I did." is true; "Yeah, no worries" is true. "No problem, I asked him in." comes out null by these steps, which is harmless: the guard asks once more and then takes the word (`syncGuarding`, the `stranger.voucher` branch). Run the `vouch` simulator scenario with a chatty LLM a few times and check the visitor stays, and with the voucher saying no that the visitor is still put out.

## Check

Read `NO_WORDS`, `YES_WORDS` and `yesOrNo` (`guarding.ts:50`, 309), the two places that read a yes or no in `guardOverhears` (785 and 799), `vouchStep` (486), `has` (108), the `exact` and `needs` fields in `types.ts:890` to 901 (a line without `exact` is the model's own, and is used if it passes `needs`), and the calls in `cargo.ts` that write `noteSentFor` and the shared list. The quotes match. A bun script in the scratchpad gave the current regexes false for "yes, donna, i asked tolly in to mop up. no need to worry." and for "yes, he's not done yet", true for the plain line. No entry in the change log or plans speaks of it. Confirmed, though the ask is put less often than the write-up implied (added under What is wrong). The proposed fix was wrong in two places, both mended and run in a script: testing the yes first reads "I did not ask him" as a yes, and "No problem, ..." at the start read as a no. Whether a model adds such words was not tried.
