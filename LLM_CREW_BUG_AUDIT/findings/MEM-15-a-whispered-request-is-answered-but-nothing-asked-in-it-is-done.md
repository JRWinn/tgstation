---
id: MEM-15
title: A whispered request is answered but nothing asked in it can be agreed to, because every reader looks for says
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: memory
files: tgui/packages/tgui/interfaces/CrewBrain/talk.ts:93, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:140, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:248, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1483, code/modules/llm_crew/crew_npc_senses.dm:450
fix: Match says or whispers wherever a report line is read for speech, through one helper, and keep whispered lines out of what is put back after a failed call
---

## What is wrong

The server writes heard speech as `Name says: "..."`, or `Name whispers: "..."` when it was whispered (`emit_sense(CREW_SENSE_SPEECH_HEARD, "[speaker_name] [whispered ? "whispers" : "says"]: ...")`). Every place the window reads speech back out of the report looks for `' says: '` only:

- `talk.ts` `wordsHeard` (what was said, for `whenAsked`, memory, notes, and whether it may go unanswered);
- `talk.ts:140`, what `availableOptions` is given (so a whispered "show me the way to the Bar" offers no lead);
- `tasks.ts:248` `workInWords`, the speaker's own lines (`] ${toldBy} says: `): with a whisper, `theirs` is empty and it falls back to **everyone's** quoted lines in the report;
- `brain.ts:1483` in `think()`, the lines a move must have been called for by: a whispered request matches none, so the move is refused with "[nothing said called for it: not done]";
- `brain.ts:1582`, the line the dead-model fallback reads a request from;
- `brain.ts:1455`, the meeting-order test;
- `brain.ts:1626`, which after a failed model call puts back every report line **not** containing `' says: '` "so the LLM still learns of it next time, but not what was said". A whispered line is put back, and is sent again as new in the next call.

The NPC is woken by a whisper (that goes by `said_to`, worked out from the message), and the model is told "Someone has just spoken to you". So it answers, often agreeing ("Sure, I'll order that"), and the body does nothing.

Concrete case: the Captain, beside a cargo technician, whispers "Order me a crate of soap." The technician is woken. The model replies `{"say": "Right away, Captain.", "move": {"tool": "order", ...}}`. In `think()`, `heardLines` is empty, `calledFor` is undefined, and the order is logged "[nothing said called for it: not done]". No order is placed.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:91`:

    function wordsHeard(report: string[]): string[] {
      return report
        .filter((line) => line.includes(' says: ') && line.includes('(person '))

`tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:246`:

    const theirs = toldBy
      ? spoken.filter((line) => line.includes(`] ${toldBy} says: `))
      : [];

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1482`:

    const heardLines = report.filter(
      (line) => line.includes('(person ') && line.includes(' says: '),
    );

`code/modules/llm_crew/crew_npc_senses.dm:450`, the server's text with "whispers".

## How it was found

Read from the code on both sides of the line. Not run, not seen in a round log.

## How to fix it

1. Add one exported helper, say `isSpeechLine(line)` and `speechBy(line, name)` in `talk.ts`, that match `/ (says|whispers): "/` and `] ${name} (says|whispers): `.
2. Use them in the seven places listed. Keep the `'(person '` test where it is used now.
3. Better still (and it would serve MEM-05 too): keep speech in the report as records with `speaker`, `message`, `saidTo` and `whispered`, and render them to text only when the prompt is built, so no reader has to parse text back.

## How to test the fix

- A table of cases: `buildTalk` with a whispered order from a superior makes out the order; `think()`'s `heardLines` (factor it out to test) finds the whispered line.
- Type check from `tgui/`.
- In a round: whisper an order to a technician; the order is placed.
