---
id: KNA-21
title: The Captain pardoning someone to the officer's face, with the prisoner in sight, is told to take it to the Head of Security, and nothing is done
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:368, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:357, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:469
fix: Let an officer act on a pardon from the Captain itself, and pass it to the Head of Security as news, if the owner agrees that the Captain outranks the list
---

## What is wrong

Listed in the change log entry of 2026-11-18, 14:15, Known and not fixed: "A pardon said to the officer, with a Head of Security aboard, is sent on and not acted on." No later entry changes it, and the code is as it was.

With a Head of Security aboard, the officer takes a pardon, and anything else about who is wanted, from the Head of Security only. From anyone else, the Captain included, it answers with the line meant for someone bringing a warrant, and does nothing.

The case: Pun Pun is in Cell 1. The Captain walks into the Brig, where the officer is standing by the cell, and says to it "Hale, pardon Pun Pun, let him out." `overhears` finds the speaker is not the Head of Security, a Head of Security is aboard, and the line was said to the officer, so it calls `sendOn`. The Captain is a head by `isHead` (the Captain heads Command in `hierarchy.ts`), the line has "pardon" in it, so the officer queues, word for word: "Captain, warrants go to Joan, the Head of Security." The cell stays shut. The Captain has to send the Head of Security a PDA message, which sends the officer one back, which walks it to the cell it was standing at. With PDAs down (a Communications Blackout was seen in the 15:09 round) the pardon cannot be given at all, though the Captain is standing beside the officer.

Two smaller faults in the same place:

1. The answer talks of warrants when the Captain gave a pardon. "Warrants go to Joan" reads as if it was not understood.
2. "Release" and "let go" are sent on only when they name someone the officer has a warrant on (`beat.warrants`). Someone the officer has already put in a cell is no longer under a warrant in that list once served, so "release Pun Pun" said to the officer is not even answered: the voice answers, and may say it will.

This is not the same as TRB-11, which is the Head of Security failing to carry out a pardon it took. Here the pardon is never taken.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:459`, `overhears`:

    if (isHeadOfSecurity(job)) {
      takeWord(brain, speaker, heard, true);
      return;
    }
    if (!headAboard(brain)) {
      deskHears(brain, event);
      return;
    }
    if (event.details.said_to === 'me') {
      sendOn(brain, speaker, job, heard, true);
    }

`officer.ts:368`, `sendOn`:

    const head = headAboard(brain);
    if (
      !head ||
      !isHead(fromJob) ||
      !(
        readWarrant(text, []) ||
        CANCEL_WORDS.test(text) ||
        /\bpardon\b/i.test(text) ||
        (PARDON_WORDS.test(text) &&
          beatOf(brain).warrants.some((it) =>
            text.toLowerCase().includes(it.name.toLowerCase()),
          ))
      )
    ) {
      return;
    }
    const line = REFUSALS.toDesk(addressOf(from, fromJob), head.name);

`jobs/security.ts:469`:

    toDesk: (to: string, desk: string) =>
      `${to}, warrants go to ${desk}, the Head of Security.`,

The officer's own way of letting someone go, `dropWarrant`, is reached only from `takeWord` (`officer.ts:357`), which is only for the Head of Security.

## How it was found

Read from the code. Not seen in a round: no round log has the Captain pardoning anyone to the officer's face.

## How to fix it

The question for the owner: **does a pardon from the Captain, said to the officer's face or sent to it, free the prisoner there and then, or must it go through the Head of Security?** The project's rule is that the Captain decides pardons ("Only the Captain"), and nobody else's word is needed for one, so acting on it is what I would do.

If yes:

1. In `overhears` and `readsMessage` of `jobs/officer.ts`, before `sendOn`, when the speaker is the Captain (`isCaptain(job)` or the helper the desk uses) and the line is a pardon by the desk's own reading (`readPardon` or whatever `deskTakes` uses to find "pardon X", with `closeIn` for spelling), call `dropWarrant(brain, name, true)` as `takeWord` does for the Head of Security's let-go line.
2. Answer the Captain in fixed words: "Captain, I am letting X go." And queue a word to the Head of Security by the same path the officer's other words take (`beat.words`): "Joan, the Captain has pardoned X. I have let them go." so the list and `desk.held` are put right there. The desk must take that line as it takes "X is free" today (check `readOutcome` in `jobs/security.ts`; add the wording there if it does not).
3. Keep `sendOn` for warrants and for pardons from anyone but the Captain, and give it a second line for a pardon: "Captain, a pardon is the Captain's to give" is already there as `notPardoner` for the desk; for the officer use "X, a pardon goes to Joan, the Head of Security." so the words match what was brought.
4. Widen the "release / let go" test in `sendOn` to names in the officer's own record of whom it has jailed (`beat.jailed` or the cells in `brain.security`), not only `beat.warrants`.

If no: at least fix 3 and 4, so the answer says what to do.

## How to test the fix

Add cases to `tools/llm_crew/security.ts`: the Captain says "Hale, pardon Pun Pun" to the officer with a Head of Security aboard and Pun Pun in a cell, and the officer's next step is `free` on Pun Pun, with the line to the Head of Security queued. A head (not the Captain) saying the same gets the sent-on line. Simulator: extend `pardon` with the Captain saying it to the officer's face. Next round, `game.log`: grep "warrants go to" after any line from the Captain with "pardon" in it; there should be none.
