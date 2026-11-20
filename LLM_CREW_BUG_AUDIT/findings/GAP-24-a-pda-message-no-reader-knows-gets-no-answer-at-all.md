---
id: GAP-24
title: A PDA message never wakes the voice, so anything sent by PDA that no job's reader knows gets no answer and no action, the Captain's orders to heads included
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:579, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:933, tgui/packages/tgui/interfaces/CrewBrain/jobs/head.ts:1213, tgui/packages/tgui/interfaces/CrewBrain/jobs/job.ts:1
fix: Have readsMessage say whether it used the message, and for one from a person that no reader used send a fixed acknowledgement by PDA, with the voice wording it when the model is up and GAP-15's reader trying it as an order
---

## What is wrong

A PDA message reaches an NPC's brain, is offered to four readers (`readSummons`, `readPickup`, `readWanted`, then the job's `readsMessage`), and is put on the list of things the voice will see next time it is woken. It never wakes the voice itself: `shouldWake` has a case for a person seen, for knowledge and for speech heard, and returns `false` for everything else, the PDA included. Its comment says so: "How the body's own actions went, and what its PDA says, is for the driver."

So a PDA message is either one of the fixed forms some reader knows, or nothing happens. No reply, no "I have your message", no "I did not follow that" (only the security desk has one of those, SECT-10). The sender cannot tell whether it was read. The owner plays the Captain and gives most orders by PDA.

Seen in rounds, in `pda.log`:

- `round-23.57.07`, 06:05:09: the Captain to the Head of Personnel, "Order a 2nd crate and let me know if they do it". The head's next PDA messages, from 06:05:51 on, are crate hand-outs to janitors. Nothing goes to the Captain, and no second crate is ordered. The owner's own notes on the staff meeting list this as "the Captain's PDA to the head ... produced no brain turn at all", under "Not fixed and not yet on the plan". No plan and no change log entry took it up.
- `round-14.28.06`, 20:44:52: the Captain to the Chief Engineer, "Check the power. Have a meeting". The meeting half is read (`isMeetingOrder`) and held within a second. "Check the power" is dropped without a word: the meeting report says only "The engine is lit. It is at 100 percent integrity." The Captain is never told that half was not understood.
- The change log's 16:50 entry: the Captain's "There is a firelockout in the kitchen that needs to be opened" to the Chief Engineer "got no answer at all". GAP-05 and GAP-19 write up why engineering cannot act on it. This finding is why it is not even answered.

What a head reads by PDA today (`readsMessage` in `jobs/head.ts`): "I am shut in the ...", word from cargo about its order, word that a crate is unpacked, an order to hold a meeting from whoever it answers to, "on my way", a report from its staff, and any line with need words in it. A Captain's request for anything else is lost.

This is not GAP-15. GAP-15 is about orders whose fixed words are misspelt or put loosely. This is about everything else sent by PDA: requests no job has words for, questions, news, half of a two-part order. And the first thing missing is not understanding but an answer.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:579`, where a PDA message is read:

    if (event.kind === 'pda_message') {
      ...
      if (
        !readSummons(brain, from, text, event.at, theirJob) &&
        !readPickup(brain, from, text, theirJob) &&
        // So is word of who security is looking for.
        !readWanted(brain, from, text, theirJob)
      ) {
        jobFor(brain.job).readsMessage?.(
          brain,
          from,
          text,
          event.at,
          theirJob,
        );
      }
    }

`readsMessage` returns nothing, so the brain cannot tell whether it used the message.

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:933`, `shouldWake`: cases `person_in_view`, `knowledge`, `speech_heard`, and

    default:
      return false;

## How it was found

Read from the code, then checked against `pda.log` and `game.log` of the two rounds named: the lines quoted are in them, and no reply follows either message.

## How to fix it

1. Make `readsMessage` (and the three shared readers) return `true` when it has used the message. Each job's reader has many branches that `return;` after acting: those become `return true;`. The NEED_WORDS fallthrough in `head.ts` also returns `true` when it notes an ask.
2. In `brain.ts`, when none of them used it, and the sender is a person (the server's PDA event carries a job, or the sender is on `pdaPeople`), and the sender is not a fellow NPC in this window (or, from a fellow, only if it holds a `?`, the same guard `hearSpeaker` uses, so two NPCs do not trade PDA messages for ever):
   - if the sender is the Captain or a superior, and GAP-15's shared last-resort reader exists, queue it there first;
   - otherwise put a `toTell` by PDA to the sender with a fixed line, `I have your message, but I do not know what to do about it.` or close, and let the voice word it (`withRemark`, not free words: a free-worded reply is where the model promises things code will not do, as in LOGB-01's "I'll see you to the Command Hallway").
   - At most one such reply per sender per two minutes.
3. A two-part order where one part was read (the Chief Engineer's case): the reader that used one part cannot tell that the rest went unread. Leave this to GAP-15's reader, or have `isMeetingOrder` note when the line has words left over after the meeting words and answer `I am holding the meeting. I did not follow the rest: "check the power".`
4. A dead model changes nothing: the fixed line is sent as it stands.

Question for the owner: should the reply to a PDA no code can read be the fixed "I do not know what to do about it" line only, or should the voice be woken to answer it freely, with the risk that it promises something? I would take the fixed line with a remark.

## How to test the fix

- A simulator scenario: the Captain PDAs the Head of Personnel "Order a 2nd crate and let me know", and a second one "Check the power. Have a meeting" to the Chief Engineer. Each should get one PDA reply, and the second should still hold the meeting. Run quiet, chatty and dead.
- A scenario with two NPCs who PDA each other a line neither reads: at most one reply each.
- Type check. In a round, every `PDA: Zim Fire to X` line in `pda.log` should be followed by a line from X to Zim Fire within a minute or so.
