---
id: BRAIN-09
title: Someone who speaks to an NPC just as a word-for-word line is due gets that line and a remark, never an answer, and is not heard again
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1305, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:157, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1315, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1564
fix: When a word-for-word line goes out in a call that also had speakers, put the speakers and their lines back and wake the NPC again so the next call answers them, unless the line was said to one of them
---

## What is wrong

A line the work calls for "word for word" (`exact`, because it carries numbers or set words someone else's code listens for) is said as it stands, and the model is asked only for a short remark to follow it. That moment wins over everything else in `buildTalk`: the `if (moment.exact && mustSay !== null)` branch comes before `else if (spokenTo)`, and it tells the model "add one short remark ... No numbers or amounts, no questions, and nothing about what anyone needs."

When someone has also just spoken to the NPC, their words are in the same call (`speakers` is not empty), and `think` treats the call as having answered them:

- `brain.pendingSpeakers.clear()` before the call, so they no longer wake it;
- their heard lines are marked `reported` (`said.reported = true`), so they are history in the next prompt;
- after the line is said, `talk.replies++` for each speaker, so it counts as a reply to them (toward BRAIN-01's cap of 6, or 1 for a fellow NPC).

Nothing puts them back. The question is never put to the model as a question, and the NPC never answers it. The `order` move and others are still in the reply schema (the options come from `availableOptions(brain, spokenTo, ...)`), but the moment text tells the model there is nothing to take on, so a request in the same breath is very unlikely to be agreed to.

Word-for-word lines are common for cargo, the Quartermaster, the heads and security: 20 places in `jobs/` set `exact: true`, many of them `toTell` lines said "at once ... whatever it is doing" (`whileBusy`). So the timing is not rare: a line someone is waiting to hear is due exactly when people are standing at the NPC talking.

One concrete case:

1. A cargo technician, Sam, has word for the Quartermaster (`jobs/cargo.ts:377`): "Your body is telling them, in these words: ..." with `exact: true`. The Quartermaster is in view.
2. In the same update the Captain, at the counter, says "Sam, can you order me a toolbox?" `saidTo` gives `me`; `hearSpeaker` adds the Captain to `pendingSpeakers`; `drive` calls `speak(line, needs, undefined, true)`.
3. `think` runs with `speakers = [Captain]`, `mustSay = line`, `exact = true`. `buildTalk` takes the `aside` branch. The model adds "Busy morning!" or nothing.
4. Sam says the Quartermaster's line and the remark. The Captain's reply count goes up, their line is marked reported, `pendingSpeakers` is empty. Sam does not answer and does not order the toolbox. The Captain has to ask again.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:157`, in `buildTalk`:

      if (moment.exact && mustSay !== null) {
        // The line is the body's, and goes out as it stands. Nothing is asked of the LLM but a
        // remark, and nothing else it might be asked at this moment is put to it.
        about.push(MOMENTS.aside);
        sayIs = 'your own short remark, to follow the line your body is saying.';
        maySaySilent = true;
      } else if (spokenTo) {

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1311`, in `think`:

      for (const said of brain.talkLog) {
        said.reported = true;
      }
      brain.pendingSpeakers.clear();

`brain.ts:1563`:

      // Speaking after hearing someone counts as a reply to them.
      for (const speaker of speakers) {
        const talk = brain.talks.get(speaker);
        if (talk) {
          talk.replies++;
          talk.repliedAt = brain.now;
        }
      }

## How it was found

Read from the code. Not seen in a round: the brain log shows the aside prompt and the reply, and a lost question would only show as a speaker line in the report of an aside call. Not counted.

## How to fix it

1. In `think`, after the reply is handled in the `mustSay && exact` branch, if `speakers.length > 0` and the word-for-word line does not call on any of the speakers by name (use `callsOn` from `addressing.ts`, exported, against each speaker's name from `brain.peopleInView`), then:
   - put the speakers back: `for (const s of speakers) brain.pendingSpeakers.add(s)`;
   - put their heard lines back at the front of `brain.pending` (the report lines that include `' says: '` and `(person <handle>`);
   - set `brain.wake = true`;
   - skip the `talk.replies++` loop for them.
   The NPC is then queued again at the end of `think` (`if (brain.wake && brain.awake)`), waits out the 4.2-second say cooldown in `startTalk`, and the next call is an ordinary "someone has just spoken to you" call.
2. When the line is said to one of the speakers (a reading back of an order to whoever gave it, a report to the head who called for it), today's behaviour is right: that line is the answer. Keep it.
3. Do the same in the `catch` of `think` if the line was exact: the plain line was said, the speakers were not answered.
4. Owner's question: should a speaker's request instead be read in the same call (keep the `spokenTo` moment and say the exact line before the answer, as two lines 4 seconds apart)? That costs a longer prompt each time; the fix above costs one more call only when it happens.

## How to test the fix

A sim scenario in `tools/llm_crew/`: a technician with a word-for-word line due to the Quartermaster, and the Captain speaking to it in the same update. Before the fix `game.log` has one say (the line and a remark) and no answer; after it, a second say a few seconds later answering the Captain. Also the reverse: the Quartermaster gives an order and the technician's word-for-word "Order 3, I have that." must not be followed by a second answer. Run the type check.
