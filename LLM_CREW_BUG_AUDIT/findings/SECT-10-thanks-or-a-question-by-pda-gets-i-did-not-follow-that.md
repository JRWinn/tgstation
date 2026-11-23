---
id: SECT-10
title: Any PDA message from the Captain or a head to security that is not an order, such as thanks or a question, is answered I did not follow that with the warrant wording
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: b611c84ed58
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:691, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:662, tgui/packages/tgui/interfaces/CrewBrain/jobs/headofsecurity.ts:244, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:933
fix: Send not followed only when the model gave no answer and the message has an order word in it, or the reading was a warrant or pardon that did not take; when the model says neither, send nothing or hand it to the voice
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

Already listed as known: `LLM_CREW_CHANGELOG.md` line 441, under "Known and not fixed": "A message to the Head of Security from the Captain that is only talk now gets 'I did not follow that'." It has no cause or fix there; this file adds both.

## How to fix it

0. Use what the model already said. `readReading` (`jobs/security.ts:864`) folds three things into one null: no answer or bad JSON, a name not in the message, and a plain `kind: "neither"`. Have it (or `readOrder` in `brain.ts:1082`) say which, and pass that to `deskRead`. A clear "neither" from the model is the model saying it was not an order: answer it as in step 2 or 3, never with "I did not follow that". The model call is already paid for, so this costs nothing more. The word test in step 1 is then only for when the model gave no usable answer.
1. With no usable answer from the model, decide by words. If the message has none of the order words in it (`KEY_WORDS` in `security.ts`, after `mendWords`, plus "lock", "jail", "brig", "cell", "free", "let go"), or it is a question (ends in "?"), it was not an order. Do not send "I did not follow that". Without the question test, "How many are in the cells?" still has "cell" in it and still gets the line.
2. For such a message, hand it to the voice: add a PDA case to `shouldWake` for a message from the Captain or a head that no job's reader took, and let the voice answer by PDA (the voice is already told the wanted list and the cells through `deskCues`, so "Where is Pun Pun now?" can be answered from what is true). The owner should say whether PDA replies from the voice are wanted at all; they cost a model call each.
3. With the model down, a message with no order words gets no answer, or one plain fixed line ("Captain, noted."), as the owner prefers. A dead model must not stall anything: no work waits on this answer, so nothing does.
4. Keep "I did not follow that" for a message that does have order words in it and still could not be read, and for a reading that came back as a warrant or pardon that `deskTakes` would not take.
5. Restore the once-a-minute limit in `deskRead` rather than clearing `notFollowedAt`, or keep the clearing only for step 4.

## How to test the fix

Change the case at `tools/llm_crew/security.ts:165`: "How are things over there today" with a null reading sends nothing; "arest the clown pls" with a null reading still gets the not-followed line. Add: "How many are in the cells?" with no reading sends nothing; any message with a reading of `{"kind":"neither"}` sends no not-followed line; "Warrant for Hale Stone" read as a warrant (refused, security) still gets the refusal. The same for the officer keeping the list itself (`jobs/officer.ts:449`, with no Head of Security in `pdaPeople`). In a round, send the Head of Security "Thanks" by PDA and check `pda.log` for no "I did not follow that", and the brain log's "READING (LLM)" record for what the model said.

## Check

Checked by Opus 5.5. Read `readsMessage` in `jobs/headofsecurity.ts:215` to `:245` and `jobs/officer.ts:435` to `:452`, `deskTakes`, `deskUnread`, `deskNotFollowed` and `deskRead` in `jobs/desk.ts`, `readReading` and `buildReading` in `jobs/security.ts`, `readOrder` and `shouldWake` in `brain.ts`, and the PDA path at `brain.ts:579` (`readSummons`, `readPickup`, `readWanted`, then the job's `readsMessage`). The quotes are what the code says today. Nothing before `deskUnread` takes "Good work, Joan.", "Where is Pun Pun now?", "How many are in the cells?" or "Thanks": none has a warrant, cancel, pardon, term, sighting with a place, meeting or notice word. `shouldWake` has no `pda_message` case, so the voice never answers a PDA.

Ran a throwaway bun script in the scratchpad (the `head()` fixture from `tools/llm_crew/security.ts`, a warrant on Pun Pun from the Captain, then each line through `HOS.readsMessage` and `deskRead(..., null)`). Each of the four printed "Not read. Zim Fire is told it was not followed." and the not-followed PDA. Two such messages in a row both queue the line (the second is only merged with the first by `reply` while the first is still waiting to be sent), so the once-a-minute limit does not hold, as the finding says.

The plan item behind the line (`LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, M3) was "the Captain should never be left guessing" about orders; it did not ask for talk to be answered so, and the change log lists this as known and not fixed. Confirmed. Severity medium is right: the Captain sees a wrong answer each time, and no work stops. Effort medium: `security.ts`, `desk.ts`, `brain.ts` and the tables. Whether the voice should answer PDAs at all (step 2) is the owner's question, and costs a model call per message; steps 0, 1, 3, 4 and 5 stand without it.

## Fix so far

Steps 0, 1, 3, 4 and 5 are built (branch m-secdesk). `readReading` keeps a plain "neither" as a reading of its own kind; `deskRead` sends nothing for it, nor for a message with no usable answer that asks a question or has no order word in it (`looksLikeOrder` in `jobs/security.ts`: the KEY_WORDS after `mendWords`, plus lock, jail, brig, cell, free, let go, cuffs and the like; "I wanted" does not count). `deskUnread` sends nothing for such a message when the reader is full or busy. "I did not follow that" is kept for a message that has order words in it and could not be read, and for a reading `deskTakes` would not take, and only that clears the once-a-minute limit. With the model down, talk gets no answer at all (step 3's first choice).

Left: step 2, the voice answering a PDA message no reader took (`shouldWake` in `brain.ts`, not this group's file), which is the owner's question whether it is wanted at all.

## Fix so far (step 2, owner's answer C)

Built on branch `a-secwin`: a PDA message from the Captain or a head to security that no reader takes and that is no order (the model reading it as "neither", or no answer and no order words in it, or too many waiting to be read and no order words) is answered in fixed words, "Captain, noted." (to a head, "<first name>, noted."), at most once a minute for each sender (`deskNoted` in `jobs/desk.ts`, `notedLine` in `jobs/security.ts`, the time kept per sender in `notedAt` on the desk). No model call. "I did not follow that" stays for a message with order words that could not be read. The cases in `tools/llm_crew/security.ts` that expected nothing sent now expect the "noted" line, with two more (once a minute per sender; a head by first name). Not played. Note: a keeper's "Did you send X to the Y?" (SECT-08) sent by a Quartermaster to the Head of Security would now get "Quin, noted." if no reader takes it.
