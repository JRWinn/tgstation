---
id: SECT-09
title: A workmate's yes that has no or not anywhere in it, such as Yes I asked him in, no problem, is read as a no and the visitor is walked out
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:50, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:309, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:785
fix: Read yes or no from how the answer begins, and only fall back to looking through the whole line when it begins with neither
---

## What is wrong

When a guard asks a workmate "did you ask Tolly to come in here?", the answer is read by `yesOrNo`, which looks for a no-word anywhere in the line first and takes any one of them for a no. "No" in "no problem", "no worries", "no need to worry", and "not" in "he is not done yet" or "is that not allowed?" all make a yes into a no.

The workmate's answer is put in words by the model: `vouchStep` gives a plain line and `needs: has('Yes')`, but the step is not `exact`, so what is said, and what the guard hears and reads, is the model's line. A small model asked to say yes and to sound like a person will often add "no problem" or "he's not finished yet".

Concrete case. Donna Sholl asks her workmate Quin "Quin, did you ask Tolly to come in here?" Quin did, and the model says "Yes, Donna, I asked Tolly in to mop up. No need to worry." In Donna's `guardOverhears`, `yesOrNo` finds "no" and returns false. `settle(brain, 'Tolly Field', stranger, 'go')`. Donna is told that Quin did not send for Tolly, says "You have no business in here, Tolly. Out you go." and walks Tolly out. Every other workmate who heard it through `verifyHeard` reads the same line the same way (there a no is simply dropped, so they do not set 'stay').

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

1. In `yesOrNo`, look first at how the answer begins, after an optional name and comma: `^\W*(?:\w+,\s*)?(yes|yeah|yep|aye|i did|i have|correct|sure|of course)\b` is a yes; `^\W*(?:\w+,\s*)?(no|nope|never|i did not|i didn'?t|not me)\b` is a no.
2. Only if it begins with neither, fall back to the whole-line test, and there take "no problem", "no worries", "no need" and "not yet" out before testing for `NO_WORDS`.
3. Since the line comes from `vouchStep` with "Yes" or "No" required at the start (`has(answer)` only checks it is somewhere), make the needs check `^\W*Yes\b` or `^\W*No\b` so the model's line always begins with the answer.

## How to test the fix

Add cases for `yesOrNo` (export it, or test through `guardOverhears`): "Yes, Donna, I asked Tolly in. No need to worry." is true; "Yes, he's not done yet" is true; "No, I did not ask him" is false; "Not me, ask Quin" is false; "Hmm?" is null. Run the `vouch` simulator scenario with a chatty LLM a few times and check the visitor stays.
