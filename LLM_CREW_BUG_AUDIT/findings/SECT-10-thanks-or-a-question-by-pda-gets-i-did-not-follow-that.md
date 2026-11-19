---
id: SECT-10
title: Any PDA message from the Captain or a head to security that is not an order, such as thanks or a question, is answered I did not follow that with the warrant wording
kind: bug
severity: medium
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:691, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:662, tgui/packages/tgui/interfaces/CrewBrain/jobs/headofsecurity.ts:244, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:933
fix: Send not followed only when the message has an order word in it or the reading was a warrant or pardon that did not take, and hand everything else to the voice as a PDA to answer
---

## What is wrong

Whatever the Captain or a head sends security by PDA that code cannot read goes to the LLM reader, and whatever the reader does not turn into a warrant or a pardon is answered "Captain, I did not follow that. To declare a warrant, say: Warrant for a name, for a reason. To pardon: Pardon a name." That includes everything that was never an order.

PDA messages do not wake the voice at all (`shouldWake` has no case for `pda_message`), so this fixed line is the only answer security ever gives to anything it is sent.

Concrete cases. The Captain sends the Head of Security, by PDA:

- "Good work, Joan." The reader says "neither". `deskRead` clears `notFollowedAt` and calls `deskNotFollowed`. The Captain is told he was not followed, and how to word a warrant.
- "Where is Pun Pun now?" The same. The Head of Security has the answer in `warrant.lastSeen` and never gives it.
- "How many are in the cells?" The same.

With the model down, every one of them gets the same line once the reading times out. Each message the reader sees gets its own answer, because `deskRead` sets `desk.notFollowedAt = 0` before calling `deskNotFollowed`, so the once-a-minute limit does not hold for them.

The tables in `tools/llm_crew/security.ts:165` test this as wanted ("How are things over there today" is answered with how a warrant is worded). The owner's brief for this audit asks about exactly this: "I did not follow that" sent in answer to things that were never orders.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/headofsecurity.ts:241`, in `readsMessage`:

    // Something from the Captain or a head that code can make nothing of goes to the LLM to
    // read, as the reader of last resort. If that comes to nothing it says so, with the words
    // that would have worked: nobody is left guessing.
    deskUnread(brain, from, job, text);

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:691`, in `deskRead`:

    if (reading) {
      const order = readingAsOrder(reading);
      if (deskTakes(brain, asked.from, asked.fromJob, order, false)) {
        return `Read as: "${order}" The body answers ${asked.from} in the fixed words.`;
      }
    }
    desk.notFollowedAt = 0;
    deskNotFollowed(brain, asked.from, asked.fromJob);

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:946`, in `shouldWake`: the cases are `person_in_view`, `knowledge` and `speech_heard`; a PDA message never wakes the voice.

The officer does the same when it keeps the list (`jobs/officer.ts:449`).

## How it was found

Read from the code, and the existing table in `tools/llm_crew/security.ts:165` to `:167` shows "How are things over there today" ending in the not-followed line. Not seen in a round.

## How to fix it

1. Split what comes back as "neither" in two. If the message has none of the order words in it (`KEY_WORDS` in `security.ts`, after `mendWords`, plus "lock", "jail", "brig", "cell", "free", "let go"), it was not an order. Do not send "I did not follow that".
2. For such a message, hand it to the voice: add a PDA case to `shouldWake` for a message from the Captain or a head that no job's reader took, and let the voice answer by PDA (the voice is already told the wanted list and the cells through `deskCues`, so "Where is Pun Pun now?" can be answered from what is true). The owner should say whether PDA replies from the voice are wanted at all; they cost a model call each.
3. With the model down, a message with no order words gets no answer, or one plain fixed line ("Captain, noted."), as the owner prefers. A dead model must not stall anything: no work waits on this answer, so nothing does.
4. Keep "I did not follow that" for a message that does have order words in it and still could not be read, and for a reading that came back as a warrant or pardon that `deskTakes` would not take.
5. Restore the once-a-minute limit in `deskRead` rather than clearing `notFollowedAt`, or keep the clearing only for step 4.

## How to test the fix

Change the case at `tools/llm_crew/security.ts:165`: "How are things over there today" with a null reading sends nothing; "arest the clown pls" with a null reading still gets the not-followed line. In a round, send the Head of Security "Thanks" by PDA and check `pda.log` for no "I did not follow that".
